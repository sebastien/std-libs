@feature sugar 2
@module  std.ui.text.engine
| Implements a micro-architecture to manipulate a tree as text document. It
| is meant to accomodate different types of data structures (tree, lists,
| etc) as the original data type, and then present that data structure
| (the model) as tree structure that can be interacted with programmatically
| using the node adapters, the text document, and interactively using the
| input filter.

@import len,list,sprintf from std.core
@import assert,error,warning from std.errors
@import insert,remove,reverse,remap,first,head,tail from std.collections
@import clamp from std.math
@import now from std.io.time
@import TSingleton from std.patterns.oo
@import InputFilter from std.ui.text
@import hash from std.util.hashing

# -----------------------------------------------------------------------------
#
# TEXT NODE EFFECTOR
#
# -----------------------------------------------------------------------------

# TODO: We might considere mergingi this with the patterns.tree module
# and maybe reusing the utils.traversal. It's quite hard to find abstractions
# that work in all the situations, though.

# TODO: We should also do the children and traversal. The data could
# very well be a list or some other data structure.

@class TextNodeEffector: TSingleton
| The effector acts as the *interface* between the text node adapters
| and their wrapped values, it specifies type, text, attributes and 
| content are managed.
|
| By default, the wrapped value are expected to be like `{type,value,…attributes}`
| where `type` is the node type, with `#text` for pure text nodes and the
| value is either nothging, a string (a text node) or a list of nodes (for a node
| with children).

	@method getType wrapped
		return wrapped type

	@group Timestamp
		
		@method getUpdated wrapped
		| Returns the updated timestamp of the given wrapepd data.
			return wrapped _updated or 0

	@group Text

		@method clearText wrapped
			wrapped value = Undefined

		@method setText wrapped, text
			wrapped value = text

		@method getText wrapped
			return wrapped value if wrapped value is? String else None

		@method getTextLength wrapped
			return len(getText(wrapped))

		@method appendText wrapped, text
			if not wrapped value is? String
				wrapped value = text
			else
				wrapped value += text
		
		@method insertTextAt wrapped, offset, text
			if not wrapped value is? String
				error ("Inserting text in a non-text node:", wrapped, "with", {text,offset}, __scope__)
			else
				let t = getText (wrapped)
				setText (wrapped, t[0:offset] + text + t[offset:])

		@method removeText wrapped, offset, length
			let text = getText (wrapped) or ""
			let o    = Math max (0, offset)
			let l    = Math min (length, len(text))
			let res  = text[:o] + text[l:]
			setText (wrapped, res)

	@group Node
		
		@method cloneNode wrapped, depth=-1
		| Returns a clone of the given wrapped node value, with the given depth.
			let res = {}
			for v,k in wrapped
				if k is "value"
					if depth != 0
						if v is? Array
							res[k] = v :: {cloneNode (_, depth - 1)}
						else
							res[k] = v
				else
					res[k] = v
			return res


				
	@group Children

		@method clearChildren wrapped
			wrapped value = None

		@method hasChildren wrapped
			return wrapped value is? Array

		@method getChildren wrapped
			return wrapped value if wrapped value is? Array else None

		@method setChildren wrapped, children
			wrapped value = children

		@method appendChild wrapped, wrappedChild
			if not (wrapped value is? Array)
				wrapped value = []
			wrapped value push (wrappedChild)

		@method insertChild wrapped, index, wrappedChild
			if not (wrapped value is? Array)
				wrapped value = []
			wrapped value = insert (wrapped value, index, wrappedChild)

		@method removeChild wrapped, wrappedChild
			if not (wrapped value is? Array)
				wrapped value = []
			wrapped value = remove (wrapped value, wrappedChild)

# -----------------------------------------------------------------------------
#
# TEXT NODE ADAPTER
#
# -----------------------------------------------------------------------------

# TODO: Should we use a tree adapter instead?
# TODO: Manage children as well
@class TextNodeAdapter
| Wraps a value (`_wrapped`) so that it becomes a node in the structured
| document tree. The node's document defines an `effector` that does the 
| querying and mutation operations on the wrapped value.
|
| As a result, you only need to sublcass the `TextNodeEffector` class to
| turn your custom data structure into an editable tree that can be manipulated
| by the text engine.

	@shared IDS            = 0
	@property id           = 0
	@property meta         = Undefined
	@property _document    = Undefined
	@property _wrapped     = Undefined
	@property _attributes  = Undefined
	@property _parent      = None
	@property _children    = Undefined

	# TODO: We might want to distinguish an update to this lement vs an 
	# update from the wrapped element.
	@property _updated     = -1

	# These are cached values for the start and end offsets. They can
	# be easily re-calculated, but as they're frequently used an udpated
	# they need to be stored here.
	@property _startOffset = -1
	@property _endOffset   = -1

	@constructor document, wrapped
		assert (document, "A text node adapter must always be attached to a document")
		id        = TextNodeAdapter IDS ; TextNodeAdapter IDS += 1
		_document = document
		_wrap (wrapped)

	# =========================================================================
	# GETTERS
	# =========================================================================

	@group Getters

		@getter text
			return _document effector getText (_wrapped)

		@getter content
		| Returns the text if it's a text node, otherwise returns the children.
			return text if isText else children

		@getter textLength
			return _document effector getTextLength (_wrapped)

		@getter children
			_remapChildren () if hasIncomingChanges
			return _children

		@method _remapChildren
		| Children are lazily remapped when there is an incoming change. This
		| ensures that the children of this node are in sync with the model's
			let create_child = {_ensureNode(_) _setParent (self)}
			let update_child = {v,n|n _wrap (v) _setParent (self)}
			let l            = _document effector getChildren (_wrapped)
			_children        = remap (l, _children, create_child, update_child)
			_updated         = now ()
			_document touch ()
			return _children

		@getter startOffset
			_document updateOffsets ()
			return _startOffset

		@getter endOffset
			_document updateOffsets ()
			return _endOffset

		@getter contentLength
			_document updateOffsets ()
			return _endOffset - _startOffset

		@getter parent
			return _parent

		@getter isRoot
			return _parent is None

		@getter isText
			return text is? String

		@getter isEmpty
			return not hasChildren

		@getter hasChildren
			return len(children) > 0
			
		@getter type
			return _document effector getType (_wrapped)

		@getter hasIncomingChanges
		| Tells if the wrapped element has changed, in which case changes might
		| need to happen.
			return _document effector getUpdated (_wrapped) > _updated

	@group Offsets

		@method isWithin start, end
			# NOTE: We have an inclusive end as otherwise we wouldn't have
			# node isWithin (node startOffset, node endOffset)
			return startOffset >= start and endOffset <= end

		@method contains start, end
			return startOffset <= start and end < endOffset

		@method startsWithin start, end
			return startOffset >= start and startOffset < end

		@method startsBefore offset
			return startOffset < offset

		@method startsAfter offset
			return startOffset >= offset

		@method endsWithin start, end
			return endOffset >= start and endOffset < end

		@method endsBefore offset
			return endOffset < offset

		@method endsAfter offset
			return endOffset >= offset

		@method getContentLength
			if isText
				return textLength
			else
				var l = 0
				for child in chilren
					l += child getContentLength ()
				return l

	# =========================================================================
	# CHILDREN 
	# =========================================================================

	@group Node

		@method detach
			_parent = Undefined
			return self

		@method clone depth=1
			return _document createNode (_document effector cloneNode (_wrapped, depth))

		@method getAncestors withSelf=False
			var node = self
			var res  = [node] if withSelf else []
			while node and node parent
				node = node parent
				res push (node)
			return res

		@method getAncestorsOrSelf
			return getAncestors (True)

		@method clearChildren
			_children = Undefined
			_document effector clearChildren (_wrapped)
			_updated = now ()
			_document touch ()
			return self

		@method setChildren children
		| Sets the children of this node. 
			assert (not isText, "Cannote add children to a text node:", self)
			let v = _ensureNode (children)
			if not v
				clearChildren ()
			else
				# We need to detach the existing children
				_children :: {_ detach ()}
				let l     = list (v)
				_children = l
				# NOTE: It's super important to set the parent here
				_document effector setChildren (_wrapped, l ::= {_ _setParent (self) _wrapped})
				_updated = now ()
				_document touch ()
			return self

		@method indexOfChild child
		| Returns the numerical index of the the given child (node)
		| within that node, or `-1` if not found.
			let l = children
			return l indexOf (child) if l else -1

		@method insertChildAfter previous, child
			let i = indexOfChild (previous)
			if i == -1
				return appendChild (child)
			else
				return _insertChild (i + 1, child)

		@method prependChild child
			if len(children) == 0
				return appendChild (child)
			else
				return _insertChild (0, child)

		@method appendChild child
			assert (child, "Trying to append a node, but no child given:", child)
			assert (child is? TextNodeAdapter, "Given node is not a TextNodeAdapter:", child)
			assert (not child _parent, "Given node alrady has a parent:", child)
			child _setParent (self)
			_children ?= []
			_children push (child)
			_document effector appendChild (_wrapped, child _wrapped)
			_document touch ()

		@method removeChild child
			assert (child, "Trying to append a node, but no child given:", child)
			assert (child is? TextNodeAdapter, "Given node is not a TextNodeAdapter:", child)
			assert (child _parent is self)
			_children = _children ::? {_ is not child}
			_document effector removeChild (_wrapped, child _wrapped)
			child detach ()
			_document touch ()
			return self

		@method remove
		| Removes this node from the parent (if any).
			if _parent
				_parent removeChild (self)
			return self

		# NOTE: We don't want indexes as part of the public API as it would
		# be confusing with offsets.
		@method _insertChild index, child
			assert (child, "Trying to append a node, but no child given:", child)
			assert (child is? TextNodeAdapter, "Given node is not a TextNodeAdapter:", child)
			let l = len(_children)
			assert (child _parent is None)
			if index >= l
				return appendChild (child)
			elif index >= 0
				child _setParent (self)
				_children splice (index, 0, child)
				_document effector insertChild (_wrapped, index, child _wrapped)
				_document touch ()
			else
				error ("Trying to insert child with < 0 index", index, child, __scope__)
			return self

	@group NodeByOffset

		@method insertNodeAt offset, child, pick:Function=tail, affinity=0
		| Inserts the given node at the given offset, relative to this node.
		|
		| The `pick` functor makes it possible to specify where
		| the node will be inserted in case more than one node are at the same
		| offset. For instance in  `<doc><list><item>…` we have
		| `[<doc>,<list>,<item>]` at offset 0. 
			child = _ensureNode (child)
			assert (child, "Trying to append a node, but no child given:", child)
			assert (child is? TextNodeAdapter, "Given node is not a TextNodeAdapter:", child)
			# NOTE: The `pick` functor make it possible to implement custom
			# strategies on where to mount the node. See #FLATTEN_PICK
			var node        = pick(getNodesAt (offset))
			# If we have a negative affinity (ie. we prefer to insert after to the
			# previous node) and the picked node starts JUST at the given offset,
			# then we'll pick the deepest previous node instead.
			if affinity < 0 and offset > 0 and (node startOffset - startOffset) == offset
				node = getNodeAt (offset - 1)
			# NOTE: Remember, the offsets in this method are relative to the
			# current node, not absolute.
			let start = node startOffset - self startOffset
			assert (start >= 0, "Node cannot start after the offset")
			_document atomic {
				if node isText
					# If the given node is a text node, we'll need to split the node
					# based on this offset
					let o = offset - start
					let t = node text
					let t_before = t[:o]
					let t_after  = t[o:]
					# If the node is a root, we need to create a text node
					if node isRoot
						assert (node isEmpty, "If the root node is text, it has to be empty")
						node clearText ()
						node appendChild (_document createTextNode (t_before))
						node appendChild (child)
						node appendChild (_document createTextNode (t_after))
					else
						# If there is no before text, it means that the start
						# offset is right at the start of a node, but also 
						# potentially at the end of another node as well
						if t_before length == 0
							node parent insertChildAfter (node, child)
							if t_after
								node parent insertChildAfter (child, _document createTextNodeLike (t_after, node))
							node remove ()
						else
							node setText (t_before)
							node parent insertChildAfter (node, child)
							# TODO: Here we should detect if node after the new node is 
							# a text node, in which case we should prepend the text
							if t_after
								node parent insertChildAfter (child, _document createTextNodeLike (t_after, node))
				else
					# If it's a non-text node, we simply append
					# FIXME: Might not be the best strategy
					node prependChild (child)
			}
			return child

	# =========================================================================
	# TEXT MANIPULATION
	# =========================================================================

	@group Text

		@method appendText text
		| Appends the given text to thi
			_document touch ()
			if isText
				_document effector appendText (_wrapped, text)
				return self
			elif isEmpty
				return appendChild (_document createTextNode (text))
			else
				let node = getLastNode ()
				assert (node, "A document must always have a last/end node" )
				if node isText
					node appendText (text)
					return node
				else
					let n = _document createTextNode (text)
					if node isRoot
						node appendChild (n)
					else
						node parent insertChildAfter (node, n)
					return n

		@method insertTextAt offset, text
			assert (text is? String, "Expected string, got:", text)
			_document touch ()
			if isText
				_document effector insertTextAt (_wrapped, offset, text)
				return self
			else
				let node, start = getNodeAndOffsetAt (offset)
				# TODO: We might want to handle the case with root
				if node isText
					node insertTextAt (offset - start, text)
					return node
				elif node isEmpty
					assert (offset == start, "If the node is empty, both offsets have to match:", offset, "!=", start)
					node setText (text)
				else
					# TODO: We should probably look for the first text node (if any)
					# and insert. Instead, here, we're going to append a text node
					assert (offset == start, "If there is no text node, then", offset, "==", start)
					let n = createTextNode (text)
					node appendChild (n)
					return n

		# NOTE: It's actually better to have offset,length as it's easier to
		# check if the range goes in the right direction.
		@method removeTextAt offset, length
		| Removes the text at the given offset for the given length.
			let start     = offset
			let end       = offset + length
			let to_remove = []
			let removed   = []
			# NOTE: It's important to inhibit the document during the
			# traversal as we're mutating the nodes in place.
			let walk      = {node|
				if node isWithin (start, end)
					if node isRoot
						# If the range is the whole document, then we remove
						# the children.
						node children :: {removed push (_)}
						node clearChildren ()
					else
						to_remove push (node)
						removed push (node)
				elif node endsBefore (start)
					# This is one completely out of scope, so we
					# don't need to recurse.
					pass
				elif node startsAfter (end)
					# This is the end, so we can stop walking from
					# now one.
					return False
				else
					let cut_end   = node startsBefore (start)
					let cut_start = node endsAfter    (end)
					let cut_middle = cut_start and cut_end
					if node isText
						let t        = node text
						var cut_text = ""
						var new_text = ""
						if cut_middle
							let n    = (start - node startOffset)
							let m    = (end   - node startOffset)
							new_text = t[:n] + t[m:]
							cut_text = t[n:m]
						elif cut_start
							let n    = (end - node startOffset)
							new_text = t[n:]
							cut_text = t[:n]
						else
							assert (cut_end, "Cutting neither at start,middle or end in range:", [start, end],"for node range:", [node startOffset, node endOffset])
							let n    = (start - node startOffset)
							new_text = t[:n]
							cut_text = t[n:]
						if new_text length == 0
							to_remove push (node)
							removed push   (node)
						elif t != new_text
							if cut_text length > 0
								removed push (node clone 0 setText (cut_text))
							node setText (new_text)
					else
						for child in node children
							if walk (child) is False
								return False
			}
			_document atomic {
				walk (self)
				while to_remove length > 0
					to_remove pop () remove ()
			}
			# TODO: We might want to create a delta for the change
			return removed

		@method setText text
			_document effector setText (_wrapped, text)
			_document touch ()
			return self

		@method clearText
			_document effector clearText (_wrapped)
			_document touch ()
			return self

	# =========================================================================
	# TRAVERSAL
	# =========================================================================

	@group Traversal

		# TODO: Deprecate (nodes have their offset)
		@method getNodeAndOffsetAt offset
		| Returns the `(node,offset)` pair for the node at the given
		| offset.
			var res       = None
			var pre       = self
			var pre_start = 0
			walkNodes {n,o,i|
				if o > offset
					return False
				elif o == pre_start
					pre       = n
					pre_start = o
				else
					pre       = n
					pre_start = o
			}
			return [pre, pre_start]

		@method getNodeAt offset
			return getNodeAndOffsetAt (offset) [0]

		@method getNodesAt offset
		| Returns ALL the nodes that start at the given offset.
			var res = []
			var pre_start = 0
			walkNodes {n,o,i|
				if o > offset
					return False
				elif o == pre_start and o == offset
					# If the current node's offset is the same as the previous
					# one and it is the same as the expected offset, then
					# we add the node. This means that if we're requesting
					# offset=0 of `<doc><ul><li>TEXT…` we'll get `<doc><ul><li>`
					# but if we're request offset=1, we'll only get `<li>` (or
					# its child text node containing offset 1).
					res push (n)
				else
					res splice (0,res length)
					pre_start = o
					res push (n)
			}
			return res

		# FIXME: Deprecating
		# @method walkNodesBetween start, end, callback
		# 	var pre_n = self
		# 	var pre_o = 0
		# 	var index = 0
		# 	walkNodes {n,o|
		# 		if o >= start and o <= end
		# 			if index == 0 and o > start
		# 				callback (pre_n, pre_o, index)
		# 				index += 1
		# 			callback (n, o)
		# 			index += 1
		# 		pre_n = n
		# 		pre_o = o
		# 	}

		@method walkNodes callback, root=self, offset=0, index=0
		| Walks the document using the given `callback` and optionally
			var to_visit = list (root)
			# We use an iterative approach for speed.
			while to_visit length > 0
				let node = to_visit shift ()
				let res  = callback (node, offset, index) if callback
				if res is False
					# We do an early exist if we got a `False`
					return offset
				else
					index += 1
					if node isText
						offset += node textLength
					else
						if len(node children) > 0
							to_visit = node children concat (to_visit)
			return offset


	# =========================================================================
	# UTILITIES
	# =========================================================================

	@group Utilities
		
		@method _ensureNode value
		| Ensures that the given `value` is a `TextNodeAdapter`
			return value match
				is? TextNodeAdapter
					value
				is? String
					_document createTextNode (value)
				is? Array
					value ::= {_ensureNode(_)}
				is? Object
					_document createNode (value)
				else
					None

		@method _setParent node
		| Sets the parent for this node, this is really meant to be
		| only used internally.
			_parent = node
			return self

		@method _wrap wrapped
		| An internal method to set the wrapped value. This is not the same
		| as wrapNodes.
			_wrapped = wrapped
			return self

	# =========================================================================
	# ACCESS
	# =========================================================================

	@group Access
		
		@method getLastNode
			if isText or (not hasChildren)
				return self
			else
				return _children[-1] getLastNode ()

	@group Formatting

		@method toChunks
			let r = []
			walkNodes { r push (_ text) if _ isText }
			return r

		@method toString
			return toChunks () join ""

		@method toXML
			let typ = type or "node"
			let atr = list(_attributes ::= {v,k|return k + '="' + v + '"'}) join " "
			let chl = list(children ::= {_ toXML ()}) join ""
			let txt = text or ""
			if isText 
				if len(atr) == 0 and typ is "#text"
					return txt
				elif atr
					return sprintf ("<%s %s>%s</%s>", typ, atr, txt or "", typ)
				else
					return sprintf ("<%s>%s</%s>", typ, txt or "", typ)
			elif atr
				return sprintf ("<%s %s>%s</%s>", typ, atr, chl or "", typ)
			else
				return sprintf ("<%s>%s</%s>", typ, chl or "", typ)

		@method toJSON
			let res = {}
			# We conditionally set the properties as we want a compact
			# json, so we don't set any key that has an empty value
			let typ = type
			let atr = _attributes
			let txt = text
			let chl = children
			if typ
				res type = typ
			if atr
				res attributes = atr
			if txt
				res text = txt
			if len(chl) > 0
				res children = chl ::= {_ toJSON ()}
			return res

# -----------------------------------------------------------------------------
#
# SELECTION
#
# -----------------------------------------------------------------------------

@class Selection

	@property start       = 0
	@property end         = 0
	@property isCollapsed = False
	@property document    = Undefined

	@constructor document, start=0, end=0, isCollapsed=False
		self start       = start
		self end         = end
		self isCollapsed = isCollapsed

# -----------------------------------------------------------------------------
#
# STRUCTURED DOCUMENT
#
# -----------------------------------------------------------------------------

# TODO: Search operations
# TODO: Extract text operations
# TODO: Normalization
# TODO: Schema

# NOTE: The document delegates pretty much all the traversal methods to the
# node, as one of the requirement
@class TextDocument
| A document that wraps a tree-like structure with `TextNodeAdapter`, and
| offers an API that allows for the querying and manipulation of the
| nodes as a text or as a tree, interchangingly.

	@operation Make description
		let doc = new TextDocument ()
		doc root setChildren (description)
		return doc
	
	@property effector        = TextNodeEffector Get ()
	@property _offsetsUpdated = -1
	@property _updated        = 0
	@property _isInhibited    = 0
	@property root            = Undefined

	@constructor root=createDocumentNode ()
		self root = root

	@method touch
		if _isInhibited > 0
			# If the inhibited counter is even, we make it odd, but
			# only when the counter is different than 0
			if _isInhibited % 10 == 0
				_isInhibited += 1
		else
			_updated = now ()
		return self
	
	# NOTE: We have to be careful when using inhibit/release as
	# we don't want to accidentally forget to call a release.

	@method inhibit
		# Each inhibit increases the count by 10
		_isInhibited += 10
		return self

	@method release
		# Each release decreases the count by 10
		_isInhibited -= 10
		# If we have 1 residual, it means the document
		# was touched, so we set the inhivited counter
		# to 0 and call touch
		if _isInhibited == 1
			_isInhibited = 0
			touch ()
		return self

	@method atomic callback
		inhibit ()
		let res = callback () if callback
		release ()
		return res

	@group Text

		@method appendText text
			return root appendText (text)

		@method insertTextAt offset, text
			return root insertTextAt (offset, text)

		@method replaceTextAt offset, length, text

		@method removeTextAt offset, length
			return root removeTextAt (offset, length)

		@method cut startOffset, endOffset
		| Cuts the region between the given offsets, returning the
		| cut nodes.
			return removeTextAt (startOffset, endOffset - startOffset)

		@method replace startOffset, endOffset, value
		| Cuts the region between the given offsets, returning the
			return atomic {
				let l = cut (startOffset, endOffset)
				let r = value match
					is? String
						insertTextAt (startOffset, value)
					else
						insertNodeAt (startOffset, value)
				return r
			}

		@method wrap startOffset, endOffset, value
		| Cuts the content within the given offsets and wraps it in a node
		| defined by the given `value`.
			return atomic {
				let l = cut (startOffset, endOffset)
				let n = createNode (value)
				n setChildren (l)
				# TODO: We set a -1 affinity as we want to insert the node in the
				# start node's parent, if possible
				insertNodeAt (startOffset, n)
			}

		@method flatten startOffset, endOffset, value=Undefined
		| Cuts the content within the given offsets and returns it as a text
		| string that is then inserted at the given offset.
			# We get the node at the given offset before we do any
			# cutting. This node might be a text node or a regular node,
			# and it might be cut during this operation, so we 
			# hold a reference to the parent.
			let origin   = getNodeAt (startOffset)
			if origin isText and origin contains (startOffset, endOffset)
				return None
			else
				# We need to capture the node hierachy at the given offset, as
				# if we're removing parts of the node and the start offset
				# falls within the node, the next node might be returned
				# at the given offset after we've cut the text.
				let nodes_at  = root getNodesAt (startOffset)
				let anchors_a = reverse (reverse(nodes_at[0] getAncestors ()) concat (nodes_at))
				let l         = cut (startOffset, endOffset)
				let t         = list(l ::= {_ toString ()}) join ""
				let n         = createTextNodeLike (t,value)
				# We now have all the nodes that were previously at the
				# the given offset, and we get the list of nodes that 
				# are at the given offset after the cut. We take the deepest
				# node that is common to both.
				#nodes_at reverse ()
				#new_nodes_at reverse ()
				# However, it's possible that there is no common node, in
				# which case it means we're adding through the document.
				# FIXME: I'm not sure this is the best logic, as it doesn't
				# take ancestors into account
				let new_nodes_at = root getNodesAt (startOffset)
				let anchors_b    = reverse (reverse(new_nodes_at[0] getAncestors ()) concat (new_nodes_at))
				let anchor       = first (anchors_b, {_ in anchors_a}) 
				let offset       = startOffset - anchor startOffset
				# @FLATTEN_PICK
				# In case the anchor starts right at the offset, we want to pick
				# the outermost node at hte given location, otherwise the take
				# the deepest mode.
				# FIXME: Not sure again if it's the best logic.
				let pick         = head if offset == 0 else tail
				anchor insertNodeAt (offset, n, pick, -1)
				return n

	@group Node
		
		@method insertNodeAt offset, node
			return root insertNodeAt (offset, node)

	@group Creator
		
		@method createDocumentNode value=Undefined
			# TODO: The effector should verify the wrapped
			return new TextNodeAdapter (self, {type:"document",value})

		@method createNode wrapped
			assert (wrapped, "A generic node must have a wrapped value, got:", wrapped)
			# TODO: The effector should verify the wrapped
			return new TextNodeAdapter (self, wrapped)

		@method createTextNode text
			assert (text is? String)
			# TODO: The effector should create the default wrapped
			return new TextNodeAdapter (self, {type:"#text", value:text})

		@method createTextNodeLike text, node
			assert (text is? String, "Expected a string, got", text)
			return node match
				is? TextNodeAdapter
					new TextNodeAdapter (self, {type:node type, value:text})
				is? String
					new TextNodeAdapter (self, {type:node, value:text})
				is? Object
					new TextNodeAdapter (self, node) setText (text)
				else
					createTextNode (text)

	@group NodeText
	
		@method getLastNode
			return root getLastNode ()

		@method getNodeAt offset
			return root getNodeAt (offset)

		@method walkNodes callback, root=self root, offset=0, index=0
		| Walks the document using the given `callback` and optionally
			return root walkNodes (callback)

	@group Offsets
		
		@method updateOffsets force=False, root=self root, offset=0
		| Recalculates the offsets of the document starting from the given root
		| and offset.
			if force or (_updated > _offsetsUpdated)
				_offsetsUpdated = _updated
				let walk_offsets = {node,offset|
					node _startOffset = offset
					if node isText
						offset += node textLength or 0
					elif node hasChildren
						for child in node children
							offset = walk_offsets (child, offset)
					node _endOffset = offset
					return offset
				}
				walk_offsets (root, offset)
			return self
			
	@group Formatting

		@method toChunks
			return root toChunks ()

		@method toString
			return root toString ()

		@method toXML
			return root toXML ()
			
		@method toJSON
			return root toJSON ()

# -----------------------------------------------------------------------------
#
# STRUCURED INPUT FILTER
#
# -----------------------------------------------------------------------------

# TODO: Does the selection span one or more elements?
# TODO: If the selections spans more than one, then we split the events
#       across all of them.
@class TextInputFilter: InputFilter
| An input filter that translates input from an editable field into
| changes to the underlying structured document.
|
| This is a better approach than directly editing the DOM node as this does
| not bypass the rendering engine, thus ensuring consistency of model
| and view -- and also preventing any browser editing quirks, like
| inserting random garbage tags such as `<BR>`.

	@property _document
	@property _effector

	@constructor document
		super ()
		lastSelection = [0,0]
		setDocument (document)

	@method setDocument document
		_document = document
		return self
	
	@method does effector
		_effector = effector
		return self

	# =========================================================================
	# TEXT DOCUMENT
	# =========================================================================

	@method flatten start=Undefined, end=Undefined
		let s = editable getSelectedOffsets ()
		start ?= s[0]
		end   ?= s[1]
		let res = _document flatten (start, end)
		_select (start, end)
		_doChange ()
		return res

	# NOTE: Type is swapped
	@method wrap type, start=Undefined, end=Undefined
		let s = editable getSelectedOffsets ()
		start ?= s[0]
		end   ?= s[1]
		let res = _document wrap (start, end, type)
		_select (res startOffset, res endOffset)
		_doChange ()
		return res

	# =========================================================================
	# USER INPUT MANAGEMENT
	# =========================================================================

	@method canInsert text, start
		#let node = _document getNodeAt (start)
		# TODO: We should check the schema
		_document insertTextAt (start, text)
		_moveTo (start + text length)
		_doChange ()
		return False

	@method canRemove start, end
		let l = _document cut (start, end)
		_moveTo (start)
		_doChange ()
		return False

	@method canReplace text, start, end
		let n = _document replace (start, end, text)
		# TODO: Move to the end of the node
		let m = len(text) if text is? String else n getContentLength ()
		_moveTo (start + m)
		_doChange ()
		return False

	# =========================================================================
	# SELECTION
	# =========================================================================

	@method getSelectedRange
	| Returns the selected extent
		let o = editable getSelectedOffsets ()
		let sm, si = _getModelAt (o[0])
		let em, ei = _getModelAt (o[1])
		return {start:[sm,si], end:[em,ei]}

	# =========================================================================
	# UTILITES
	# =========================================================================

	@method _doChange
		if _effector
			_effector (self)

	@method _moveTo offset
		lastSelection = [offset,offset]
		return self
	
	# FIXME: Might be rendundant with std.ui.text
	@method _select start, end
		lastSelection = [start,end]
		return self

# EOF - vim: ts=4 sw=4 noet
