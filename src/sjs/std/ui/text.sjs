@feature sugar 2
@module std.ui.text
@import sprintf,str,isDefined         from std.core
@import merge                         from std.collections
@import Keyboard                      from std.ui.interaction
@import Update as DOMUpdate           from std.api.dom
@import NotImplemented,assert,error,warning from std.errors
@import letters,strip,stripstart,stripend,normstart,normend, SPACES from std.text

# NOTE: It's important to note that processing should only happen on
# Element and Text

# @enum Effect = INSERT | REPLACE | REMOVE | SELECT
@shared ZERO_SPACE = "​"
@shared EMPTY      = ""
@shared PLACEHOLDER = "░"

# TODO: Support deltas
# TODO: Manage empty state
# TODO: Have an option to select everything on focus, or position the cursor somewhere
# TODO: Ctrl-A and then does not work

# -----------------------------------------------------------------------------
#
# TRAVERSAL
#
# -----------------------------------------------------------------------------

@singleton Traversal
| A collection of tree traversal functions that are design for text-offset
| access of a DOM tree. These functions are the basic building blocks for
| the text package.

	@method run node, callback
	| Traverse the given node and its children, invoking
	| `callback(node, offset)` for found text and element nodes. If
	| @callback returns `False`, the the traversal is stopped.
	|
	| This returns the last offset reached.
		var o = 0
		var n = node
		while n
			match n
				is? Text
					let l = n textContent length
					if callback (n, o, o + l) is False
						n = None
					else
						o += l
						n = next (n, node)
				is? Element
					if callback (n, o, Undefined) is False
						n = None
					else
						n = n firstChild or next (n, node)
				else
					n = next (n, node)
		return o

	@method range node, start, end, callback
	| Traverses the node, calling back @callback only when the
	| offset is within **[start, end]**.
		return run (node, {n,o,e|
			if o > end
				return False
			elif o + (n textContent length if n is? Text else 0) < start
				return True
			else
				callback (n, o, e)
		})

	@method list node, start=Undefined, end=Undefined
	| Traverse the given @node using @run, returning the `(node, offset)`
	| couples in a list.
		let l = []
		let f = {a,b|l push [_0, _1, _2]}
		match start
			is? Undefined
				run (node, f)
			else
				range (node, start, end, f)
		return l

	@method next node, root=Undefined
	| Returns the next node in text-traversal (depth-first) order.
		if (not node) or (root and node is root)
			return None
		elif node nextSibling
			return node nextSibling
		elif node parentNode and node parentNode != root
			return next (node parentNode, root)
		else
			return None

	@method last node
	| Returns the last deepest child of the given node.
		if not node
			return None
		elif node firstChild
			node = node firstChild
			while node nextSibling
				node = node nextSibling
			return last (node)
		else
			return node

	@method text node, start=Undefined, end=Undefined
		return list (node, start, end) reduce ({r,e|
			let n = e[0]
			if n is? Text
				return r + n textContent
			else
				return r
		}, "")

	@method length node, start=Undefined, end=Undefined
		return list (node, start, end) reduce ({r,e|
			let n = e[0]
			if n is? Text
				return r + n textContent length
			else
				return r
		}, 0)

# -----------------------------------------------------------------------------
#
# OFFSET
#
# -----------------------------------------------------------------------------

@singleton Offset
| A collection of functions that help querying nodes on a text offset basis.

	@method extent node
	|Returns a @window.Range object that covers the extent of this object
		if not node
			return None
		# In IE11 we can't do new Range()
		let r = document createRange ()
		r setStart (node, 0)
		let l = Traversal last(node)
		r setEnd (l, l textContent length if l is? Text else 0)
		return r

	@method get node, root=None
	| Return the text offset of the given @node relative to the given @root
		if node == root or (not node)
			return 0
		var o = 0
		var n = node previousSibling
		while n
			# We only care about Element and Text nodes
			if n is? Element or n is? Text
				o += n textContent length
			n = n previousSibling
		if node parentNode and node parentNode != root
			return o + get (node parentNode, root)
		else
			return o

	@method length node, predicate=None
	| Returns the length of the text stored in the given node
		match node
			is? Text
				return node textContent length
			is? Element
				var o = 0
				var n = node firstChild
				while n
					if (not predicate) or predicate (n)
						o += length (n)
					n = n nextSibling
				return o
			else
				return 0

	@method at node, offset, rounding=-1
	| Returns `[node, position]` for the text @offset starting at
	| the given @node. If the offset is out of bounds, then it will be
	| clamped to `[0, max]`.
	|
	| When negative (default) the `rounding` will return the text node
	| that contains the offset, inclusively. So that means if the offset is 10
	| and the first node is a text of 10 characters, then the first node
	| will be returned. This is a sensible default for text editing, as you
	| pretty much always want to continue the current sentence.
		# FIXME: Rewrite using traverse
		var o  = 0
		var n  = node
		var nn = None
		while n and o <= offset
			match n
				is? Text
					# For text nodes, we return if the @offset
					# is within the rnage
					let l = n textContent length
					if offset >= o and offset < (o + l)
						return [n, offset - o]
					elif rounding < 0 and offset == (o + l)
						return [n, offset - o]
					else
						o += l
					nn = Traversal next (n, node)
				is? Element
					# For elements, we take the first child
					# or the next node
					nn = n firstChild or Traversal next (n, node)
				else
					# For anything else, we get the next one
					nn = Traversal next (n, node)
			if not nn
				# When there is no next node, we return the current
				# node and the highest offset.
				if n is? Comment
					# If we have a comment we try to find a nearby textnode,
					# or we default to the parent
					nn = n
					while nn previousSibling and not (nn previousSibling is? Text or nn previousSibling is? Element)
						nn = nn previousSibling
					if nn == n
						while nn nextSibling and not (nn nextSibling is? Text or nn nextSibling is? Element)
							nn = nn nextSibling
					if nn is? Comment
						nn = n parentNode
					return [nn, o]
				else
					return [n, o]
			else
				n = nn
		if offset <= 0
			return [node, 0]
		else
			return None

	@method fromRangeContainer node, index
	| Returns the offset (in characters) of the given index, as returned
	| by the DOM Range.{start|end}Offset. For a text node, this the index
	| is the offset, while for a Node it is the child node.
		# SEE: http://devdocs.io/dom/range/startoffset
		match node
			is? Text
				return index
			is? Node
				var i = 0
				var t = 0
				while i < index
					t += Offset length (node childNodes[i])
					i += 1
				return t

	@method fromRangeStartContainer range
		if not range
			warning ("No range given", range, __scope__)
			return None
		return fromRangeContainer (range startContainer, range startOffset)

	@method fromRangeEndContainer range
		if not range
			warning ("No range given", range, __scope__)
			return None
		return fromRangeContainer (range endContainer, range endOffset)

	@method fromRange range
	| Takes a DOM Range and returns range offset from the given range
		return [
			fromRangeStartContainer (range)
			fromRangeEndContained   (range)
		]

# -----------------------------------------------------------------------------
#
# SELECT
#
# -----------------------------------------------------------------------------

@singleton Select
| A collection fo functions to manipulate the current selection

	@property last = Undefined

	@method clear
		let s = window getSelection ()
		s removeAllRanges ()
		return self
		
	@method restore range=self last
	| Restores the last known selection, or sets the given selection
		if range
			let s = window getSelection ()
			s removeAllRanges ()
			s addRange (range)
		return range

	@method save 
		let r = Selection current
		_save (r) if r
		return self

	@method all node
	| Selects the whole content of the given node
		let s = window getSelection ()
		let r = Offset extent (node)
		if r
			s removeAllRanges ()
			s addRange (r)
		return _save(r)

	@method range node, start, end
	| Selects the given range in the given node
		# FIXME: Not sure what we should do here
		let s = Offset at (node, start)
		let e = Offset at (node, end)
		if not node
			warning ("Range without node", __scope__)
			return None
		elif s[0] == e[0]
			return _save(_range (s[0], s[1], e[1]))
		else
			warning ("Range where start and end not in the same node not supported yet", __scope__)
			return _save(_range (s[0], s[1]))

	@method end node, offset=0
	| Selects the end of the given node
		let l = Offset length (node)
		let o = Offset at (node, Math max (0, l - offset ))
		return _save(_range (o[0], o[1]))

	@method start node, offset=0
	| Selects the start of the given node
		let o = Offset at (node, offset)
		return _save(_range (o[0], o[1]))

	@method _range node, start, end=None, endNode=Undefined
	| Helper method to create a range in the given node and the given offset
		assert (node is? Node)
		assert (start is? Number)
		assert (end is None or end is? Number)
		assert (endNode is Undefined or endNode is? Node)
		let r = document createRange ()
		r setStart (node, start)
		if end is not None
			r setEnd (endNode or node, end)
		else
			r collapse ()
		return restore (r)
	
	@method _save range:Range
		last = range
		return range

# -----------------------------------------------------------------------------
#
# SELECTION
#
# -----------------------------------------------------------------------------

@singleton Selection

	@getter current
		let s = window getSelection ()
		return (s getRangeAt 0) if s rangeCount else None

# -----------------------------------------------------------------------------
#
# UPDATE
#
# -----------------------------------------------------------------------------

@singleton Update
| A collection of functions to update text content in a DOM tree. This primarily
| works with a root node and an offset (in charcters) from that node.

	@method isEmptyNode node
	| Tells if the given node is an empty node taht
		return node and node nodeName in (["BR"])

	@method isGarbageNode node
	| Tells if the node should be removed
		return node and node nodeName is "BR"

	@method append node, value
		return insert (node, Offset length (node) - 1, value)

	@method insert node, offset, value
	| Inserts the given @value at the given @offset in the given @node,
	| returning `[node, offset]` indicating where to place the cursor next.
		# FIXME: Very similar to Offset.at -- should we refactor?
		match node
			is? Text
				if offset < node textContent length
					let prefix = node textContent [0:offset]
					let suffix = node textContent [offset:]
					match value
						is? String or value is? Number
							node textContent = prefix + value + suffix
							return [node, prefix length]
						is? Text
							node textContent = prefix + value textContent + suffix
							return [node, prefix length]
						is? Node
							assert (node parentNode)
							node textContent = prefix
							DOMUpdate after (node, suffix)
							DOMUpdate after (node, value)
							return Offset at (value, Offset length (value))
						_
							error (NotImplemented)
						else
							return Offset at (node, offset)
				else
					# Here we detect a special case where we're at end of
					# our boundary, in which case we simply append.
					let o = Offset at (node, offset)
					let nn, no = o
					if nn is node and no >= node textContent length
						DOMUpdate append (node, value)
					else
						return insert (nn, no, value)
					return o
			else
				# We insert on an element node
				let o = Offset at (node, offset)
				if node != o[0] or o[1] != offset
					return insert (o[0], o[1], value)
				elif node is? Element
					if isEmptyNode (node)
						# If the element is not meant to have an content
						# (like BR), then we insert the text after th
						if not node nextSibling
							DOMUpdate append (node parentNode, value)
							return Offset at (node, Offset length (value))
						else
							error ("Unsupported case: insert after BR/empty node", __scope__)
							return None
					else
						# We have an empty element (no text node), so we
						# safely add stuff
						DOMUpdate append (node, value)
						return Offset at (node, Offset length (value))
				else
					error ("Unexpected case", __scope__)

	@method remove node, start, end
	| Removes the content within @start and @end offsets starting from node
		if not node
			return None
		start = Math max (0, start)
		end   = Math max (start, end)
		let s = Offset at (node, start)
		let e = Offset at (node, end)
		if s[0] is e[0]
			# We are within the same node
			let n = s[0]
			if s[1] == e [1]
				# If we have the same offset, the we don't have to do
				# anything.
				return Offset at (n, s[1])
			else
				match n
					is? Text
						# FIXME: Shouldn't it be end+1?
						let prefix = n textContent [0:s[1]]
						let suffix = n textContent [e[1]:]
						n textContent = prefix + suffix
						return Offset at (n, s[1])
					is? Element
						# TODO: We would need to remove the text content
						# or nodes there.
						error ("Node type", n, "not supported", __scope__)
					else
						return None
		else
			let node_offsets = Traversal list (node, start, end)
			# We get the nodes (and their offsets) of all the interesecting
			# nodes.
			for _ in node_offsets
				let n,o,e = _
				if n is? Text
					if o >= start and e <= end
						# If the text node is fully contained, we can
						# safely remove it
						var p = n parentNode
						n parentNode removeChild (n)
						# And also we can clear any ancestor that becomes
						# empty as a result of that.
						# NOTE: It's super important to not remove the
						# current node her.
						while p and p is not node and p childNodes length == 0
							n = p
							p = p parentNode
							if p and n != node
								p removeChild (n)
					elif o < start
						# We cut anything after the start
						let c = start - o
						n textContent = n textContent [:c]
						assert (n textContent length == c)
					elif e > end
						# We keep c characters
						let c  = end - o
						let tl = n textContent length
						n textContent = n textContent [c:]
						assert (tl - n textContent length == c)
				elif n is? Element
					# The empty nodes (like BR) are inserted by the browser and
					# are a real pain. We remove them.
					if isGarbageNode (n)
						n parentNode removeChild (n)
			# This last phase collapses text nodes together, reducing
			# the fragmentation of the DOM tree.
			for offset in node_offsets
				let n = offset[0]
				if n is? Text and n parentNode
					while n nextSibling is? Text
						n textContent += n nextSibling textContent
						# NOTE: This should be equivalent to n parentNode
						n nextSibling parentNode removeChild (n nextSibling)
			return Offset at (node, Math max (0, start))

	@method replace node, start, end, value
	| Replaces the content of @node within @start and @end by @value
		let o = remove (node, start, end)
		let r = insert (o[0], o[1], value)
		return r

	@method normalize node, introspectStyle=True, strip=True
	| Normalizes all the spaces in the given node. Two consecutive spaces
	| will be swallowed unless `white-space` (or `style.whiteSpace`) is `pre` or `pre-line`.
		var context   = {last:False}
		var to_remove = []
		Traversal run (node, {n, o, e|
			if n is? Text
				let l = context last
				let h = n textContent [0]
				let t = n textContent [-1]
				context last = SPACES indexOf (t) >= 0
				if (n parentNode style whiteSpace or "") indexOf "pre" != 0
					# We make sure the style is not inherited
					let s = (window getComputedStyle (n parentNode) whiteSpace indexOf "pre" != 0) if introspectStyle else True
					if s
						let tt = n textContent
						let nt = normend (stripstart (n textContent))  if l else normend (normstart (n textContent))
						let st = stripstart (stripend (n textContent)) if strip else nt
						if strip and st length == 0
							to_remove push (n)
						else
							n textContent = nt
		})
		to_remove :: {_ parentNode removeChild (_)}
		return node

# -----------------------------------------------------------------------------
#
# EDITABLE TRAIT
#
# -----------------------------------------------------------------------------

# TODO: Clarify the roles and process between editable and input filter.
@class TEditable
| Trait that implements most of the behaviour required to manage
| a rich input field.

	@property _node         = None
	@property inputFilter   = None
	@property lastSelection = None
	@property keymap        = Undefined
	@property enabled       = True
	@property isInhibited   = 0
	# NOTE: [MUTATION_OBSERVER] We're listening to the mutations
	# directly.
	@property _observer     = new MutationObserver (onMutation)

	@getter text
		return Traversal text (node)

	@getter length
		return Traversal length (node)

	@getter node
		return _node

	@setter node value
		if value is not _node
			if _node
				_observer disconnect ()
			if keymap
				keymap unbind (_node)
				keymap bind (value)
			if inputFilter
				inputFilter unbind (_node)
				inputFilter bind (value)
			_node = value
			# TODO: We (theoreticlly) only need to observe when there's no input filter, as
			# otherwise the Update will be fired by the
			if _node
				_observer observe (node, {childList:True, subtree:True,  characterData:True})
	
	@method onMutation mutations
		normalizeContent ()
		if isInhibited > 0 and isInhibited % 2 == 0
			isInhibited += 1
		if enabled and not isInhibited
			self ! "Update" ()

	@method inhibit
		isInhibited += 10
		return self

	@method release
		isInhibited -= 10
		if isInhibited == 1
			if enabled
				self ! "Update" ()
			isInhibited = 0
		return self

	@method enable
		enabled = True
		return self

	@method disable
		enabled = False
		return self

	@group State

		@method get
			if inputFilter
				return inputFilter get ()
			else
				# FIXME: What about when the content is nodes
				return  getText ()

		@method getText start=0, end=-1
			let res = []
			var o   = 0
			Traversal run (node, {n|
				if n is? Text
					let nt = n textContent
					let nl = nt length
					let no = o + nl
					let ns = Math max (start, o) - o
					let ne = Math min (end,  no) - o if end >= 0 else nl
					if ns > nl
						pass
					elif ns is 0 and ne is nl
						res push (nt)
					else
						res push (nt[ns:ne])
					o = no
			})
			return res join ""

		@method isEmpty
			if not node
				return True
			else
				# We need to traverse the node -- or we could use
				# innerText but it's likely too slow.
				var is_empty = True
				Traversal run (node, {n, s, e|
					if s > 0 or (e and e > 0)
						is_empty = False
						return False
				})
				return is_empty

		@method setKeymap keymap
			if keymap == self keymap
				return self
			if self keymap
				if node
					self keymap unbind (node)
			self keymap = keymap
			if keymap
				if node
					keymap bind (node)
			return self

		@method setInputFilter input
			if input == inputFilter
				return self
			elif inputFilter
				inputFilter unbind (node)
			inputFilter = input
			if input
				input bind (node, self)
			return self

	@group Querying

		@method at position, rounding=Undefined
			return Offset at (node, position, rounding)

		@method getExtent
		| Returns a `Range` object covering the extent of this element
			return Offset extent (node)

		@method isSelected
		| Tells if the given editable is selected, ie. is contained
		| within one of the current selection range
			return True if getSelectedDOMRange () else False

		@method getSelectedDOMRange selection=(window getSelection ())
		| Returns the range from the `window.getSelection()` that first
		| intersects with this editable.
			if selection and selection is? Range
				return selection
			let s = selection
			var i = 0
			let e = getExtent ()
			if e
				while i < s rangeCount
					var r = s getRangeAt (i)
					if r intersectsNode (e startContainer) or r intersectsNode (e endContainer)
						return r
					i += 1
			return False

		@method getSelectedOffsets selection=Undefined
			let r = getSelectedDOMRange (selection)
			if r
				let s = Offset get (r startContainer, node) + Offset fromRangeStartContainer (r)
				let e = Offset get (r endContainer,   node) + Offset fromRangeEndContainer   (r)
				return [s,e]
			else
				return None

		@method updateSelection
		| Updates the `lastSelection` with the current offset
			lastSelection = getSelectedOffsets ()
			return lastSelection

		@method restoreSelection sel=lastSelection
		| Restores the `lastSelection`, if any.
			# FIXME: It was like that 2019-03-06, but I think the other version is right
			# if sel
			# 	let s, e = _normalizeInclusiveBounds (sel[0], sel[1], node)
			# 	Select range (node, s, e)
			# return sel
			if sel and enabled
				select (sel[0], sel[1])
				return True
			else
				return False

	@group Query

		@method _normalizeInclusiveBounds start, end, node
			return _normalizeBounds (start, end, node)

		@method _normalizeBounds start=0, end=-1, node=self node, endInclusive=False
		| Returns the extend of the given range, normalizing
		| `start` and `end` when relative.
			let l = Offset length (node)
			if start < 0
				start += l
			if end < 0
				end += l
			if end is None
				end = start
			# NOTE: The problem is that if we have something like
			#start=0 and end=1, we'll select nothing, while msot
			# of the time we do want to select UP UNTIL the end
			let o = 1 if endInclusive else 0
			return (start, end + o)

	@group Selection

		@method move offset, node=self node
		| Moves the selection to the given offset in the given node
			if not enabled
				return self
			return select (offset, None, node)

		# TODO: Manage last selection
		@method select start=0, end=-1, node=self node
		| Selects the start→end range
			if not enabled
				return self
			let s, e = _normalizeInclusiveBounds (start, end, node)
			let res = Select range (node, s, e)
			self ! "Select" (s, e, res)
			# FIXME: Does this has a performance penalty?
			lastSelection = getSelectedOffsets ()
			return res

		@method selectAfter start, node=self node
			return select (start + 1, start + 1, node)

		@method selectAll node=self node
			if not enabled
				return self
			let res = Select all (node)
			let s   = Offset fromRangeStartContainer (res)
			let e   = Offset fromRangeEndContainer   (res)
			self ! "Select" (s, e, res)
			# FIXME: Does this has a performance penalty?
			lastSelection = getSelectedOffsets ()
			return res

		@method selectEnd node=self node
			if not enabled
				return self
			let res = Select end (node)
			self ! "Select" (res[1], res[1] + 1, res)
			# FIXME: Does this has a performance penalty?
			lastSelection = getSelectedOffsets ()
			return res

		@method selectStart node=self node
			if not enabled
				return self
			let res = Select start (node)
			self ! "Select" (res[0], res[0] + 1, res)
			# FIXME: Does this has a performance penalty?
			lastSelection = getSelectedOffsets ()
			return res

		@method focus node=self node
		| Focuses on the given node
			if not enabled
				return self
			node focus ()

	@group Update

		@method set value, node=self node
		| Sets the content of this editable to the given value. If there
		| is an input filter, the value will be passed to the input filter.
			if inputFilter
				return inputFilter set (value)
			else
				return setText (value, node)

		# TODO: The content could be nodes
		@method setText value, node=self node
		| Sets the content of this editable. This **does not** pass the
		| value through the *input filter*.
			# TODO: Shouldn't we use input filter here if available?
			# value = isDefined(value) and str(value) or ""
			if not node
				return [None, 0,0]
			let s  = 0
			let e  = Offset length (node)
			var res = Update replace (node, s, e, value)
			self ! "Replace" (s, e, res)
			# NOTE: Don't know why this was commented out
			# NOTE: We don't necessarily want to select after
			# calling setText(), for instance when we're dragging
			# a number input and the dragging actuates the value.
			# let r  = getSelectedOffsets ()
			# res = select (r[0], r[1]) if r else res
			# self ! "Update"
			return res

		@method clear node=self node
		| Clears the content of this editable
			# FIXME: Note how node is last here
			return remove (0, Offset length (node), node)

		@method remove start, end, node=self node
		| Removes the content defined by the given range in this editable
			if not node
				return [None, 0,0]
			let s, e = _normalizeBounds (start, end, node)
			let res = Update remove (node, s, e)
			self ! "Remove" (s, e, res)
			# NOTE: Disable as we're using MUTATION_OBSERVER
			# self ! "Update"
			return res

		@method replace start=0, end=-1, value, node=self node
		| Replaces the content defined by the given range with the given
		| value.
			if not node
				return [None, 0,0]
			let s, e = _normalizeBounds (start, end, node)
			let res = Update replace (node, s, e, value)
			self ! "Replace" (node, start, end, value)
			# NOTE: Disable as we're using MUTATION_OBSERVER
			# self ! "Update"
			return res

		@method insert offset, value, node=self node
			if not node
				return [None, 0,0]
			let res = Update insert (node, offset, value)
			self ! "Insert" (node, offset, value, res)
			# NOTE: Disable as we're using MUTATION_OBSERVER
			# self ! "Update"
			return res

		@method append text
			return insert (length, text)

		@method after position, text
			return insert (position, text)

		@method before position, text
			return insert (position - 1, text)

		@method normalizeContent
			var child = node firstChild
			# We clear the nasty <BR> left out by the browser when
			# we're not controlling the input
			while child and child parentNode and child nodeName == "BR"
				child parentNode removeChild (child)
			
	@group Helpers

		@method _hasNode node
			while node and node is not self node
				node = node parentNode
			return node is self node

# -----------------------------------------------------------------------------
#
# EDITABLE CLASS
#
# -----------------------------------------------------------------------------

@class Editable: TEditable
| An implementation of @TEditable using the HTML `contenteditable`
| attribute.

	@property cache = {}

	@constructor node, input=(new InputFilter ())
		super ()
		bind (node) if node
		setInputFilter (input)
		self !+ "Update" (self. onUpdate)

	@method bind node, normalize=False
		if node == self node
			return self
		if self node
			if inputFilter
				inputFilter unbind (self node)
			if keymap
				keymap unbind (self node)
		self node = node
		if node
			if keymap
				keymap bind (node)
			if not node firstChild
				# This is a zero-width space
				node appendChild ((node ownerDocument or window document) createTextNode (EMPTY))
			# The normalization step might alter the content. If the algorithm
			# is buggy, then it will show.
			# TODO: We need preserve the offsets of the selection
			if normalize
				Update normalize (node)
			# NOTE: We have to set the spellcheck=false at the body level if
			# the node is not a regular input/textarea field
			# https://stackoverflow.com/questions/5601431/spellcheck-false-on-contenteditable-elements
			if document body
				document body setAttribute ("spellcheck", "false")
			node setAttribute ("spellcheck", "false")
			node setAttribute ("contenteditable", "true")
		if inputFilter
			inputFilter bind (node, self)
		onUpdate ()
		return self

	@method enable
		super enable ()
		node setAttribute ("contenteditable", "true")
		return self

	@method disable
		super disable ()
		node removeAttribute "contenteditable"
		return self


	@method unbind node
		if node == self node and node
			if inputFilter
				inputFilter unbind (node)
			if keymap
				keymap unbind (node)
			self node = Undefined
		return self

	@method onUpdate
		let empty = isEmpty ()
		if cache empty != empty
			if empty
				DOMUpdate addattr (node, "data-state", "empty")
			else
				DOMUpdate addattr (node, "data-state", "empty")
				DOMUpdate rmattr  (node, "data-state", "empty")
			cache empty = empty

# -----------------------------------------------------------------------------
#
# INPUT FILTER
#
# -----------------------------------------------------------------------------

@class InputFilter
| The input filter acts as a middleman between the keyboard and an editable
| node. The input filter can intercept, prevent and modify incoming key
| events according to custom logic (ie. masked input, auto-correction, etc).
|
| The input filter keeps track of the last selection offsets within
| the editable after each keypress. This makes it easy to restore a selection/
| cursor.

	@property node
	@property editable
	@property lastSelection = None
	| The last selection property stores the (start, end) offsets within
	| the editable of the last selection that happened. This basically
	| stores the last cursor position resulting from a change.

	@method get
	| Returns the value of wrapped editable
		return editable getText () if editable else None

	@method set value, force=True
	| Sets the filter's value to the given `value`, only if it is valid.
	| Returns `true` when valid, `false` otherwise.
		if editable
			editable setText (value)

	# FIXME: No idea why it's node/editable and not just editable
	@method bind node, editable
		# It is good to know that not all key events will generate a
		# keypress. In fact, many keys such as ARROW keys will only
		# generate a keyup, as the keypress is handled by the browser
		# and hence prevent bubbling.
		if node != self node
			unbind ()
			if node
				node addEventListener ("keydown",  self . onDown,  True)
				node addEventListener ("keyup",    self . onUp,    True)
				node addEventListener ("keypress", self . onPress, True)
				node addEventListener ("focus",    self . onFocus, True)
				# TODO: This does not seem to work
				# node addEventListener ("paste",    self . onPaste, True)
			self node = node
		self editable = editable
		return self

	@method unbind node=Undefined
		if self node and ((not node) or (node == self node))
			self node removeEventListener ("keydown",  self . onDown,  True)
			self node removeEventListener ("keyup",    self . onUp,    True)
			self node removeEventListener ("keypress", self . onPress, True)
			self node removeEventListener ("focus",    self . onFocus, True)
			# TODO: This does not seem to work
			# self node removeEventListener ("paste",    self . onPaste, True)
			self node = None
		return self

	@method isSwallowed event
		return False

	@method allowEvent event
		return True

	@method swallowEvent event
		event preventDefault ()
		# NOTE: We used to prevent propagation, but that's more matter
		# of keymap than input filter.

	@method canInsert text, start
		return True

	@method canReplace text, start, end
		return True

	@method canRemove start, end
		return True

	@method onPress event
		var swallow = False
		let key = Keyboard key (event)
		var rng = Undefined
		if  (not (Keyboard isControl (event) or Keyboard hasModifier (event))) or key is "Enter"
			let c = Keyboard char (event)
			let r = editable getSelectedDOMRange ()
			let s = Offset get (r startContainer, node) + Offset fromRangeStartContainer (r)
			let e = Offset get (r endContainer,   node) + Offset fromRangeEndContainer   (r)
			if r collapsed
				if canInsert (c, s, event)
					swallow = True
					let n = editable insert (s, c, r startContainer)
					rng = editable select (n[1] + 1, None, n[0])
				else
					swallow = True
			elif r startContainer is r endContainer
				if canReplace (c, s, e, event)
					swallow = True
					let n = editable replace (s, e, c, r startContainer)
					rng = editable select (n[1] + 1, None, n[0])
				else
					swallow = True
			else
				if canReplace (c, s, e, event)
					swallow = True
					let n = editable replace (s, e, c, node)
					rng = editable select (n[1] + 1, None, n[0])
				else
					swallow = True
			swallow = swallow or isSwallowed (event)
		elif not allowEvent (event)
			swallow = True
		if swallow
			swallowEvent (event)
		# This stored the new range
		saveRangeToSelection (rng)
		# REF:SAFARI_NBSP
		# NOTE: On Safari, if we compare `editable getSelectionOffsets ()
		# with `editable getSelectionOffsets(rng)`, we will get a delta
		# if the selection contains a leading or trailing whitespace.
		# Safari expects the fields to be white-space:pre or to
		# use NBSP (00A0) as a space character.

	@method onDown event
	| Some key events are better handled on the key down, as otherwise the
	| browser might execut its default behaviour. That is the case
	| of the BACKSPACE key.
		var rng = Undefined
		match event keyCode
			is Keyboard codes BACKSPACE
				# We prevent the default so that we control what actually
				# gets removed.
				event preventDefault ()
				let r = editable getSelectedDOMRange ()
				if r collapsed
					let s = Offset get (r startContainer, node) + Offset fromRangeStartContainer (r)
					# If the offset is 0, then we have nothing to remove (collapsed only)
					if canRemove (s - 1, s) and s > 0
						let n = editable remove (s - 1, s, node)
						rng = editable select (n[1], None, n[0])
				else
					let s = Offset get (r startContainer, node) + Offset fromRangeStartContainer (r)
					let e = Offset get (r endContainer,   node) + Offset fromRangeEndContainer   (r)
					if canRemove (s, e)
						let n = editable remove (s, e, node)
						rng = editable select (n[1], None, n[0])
			else
				if isSwallowed (event)
					swallowEvent (event)
		# SEE:SAFARI_NBSP
		saveRangeToSelection (rng)

	@method onPaste event
		# TODO: We should have better strategies
		# We prevent paste by default
		event preventDefault ()
		event stopPropagation ()

	@method onUp event
		pass

	@method onFocus event
		pass
	
	@method saveRangeToSelection range
		lastSelection = editable getSelectedOffsets (range)
		return lastSelection

# -----------------------------------------------------------------------------
#
# MASK INPUT FILTER
#
# -----------------------------------------------------------------------------

@class MaskInputFilter: InputFilter
| Defines an input filter that takes a `mask` expression where editable
| characters can be `WILDCARD`.

	@shared WILDCARDS = {
		"A" : "abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ"
		"N" : "0123456789"
	}

	@property mask  = None
	@property text  = None
	@property value = None

	@constructor mask=Undefined
		if mask
			self mask = mask
		assert (self mask, "No mask given to mask input", __scope__)
		text = (letters (self mask) ::= {
			return PLACEHOLDER if WILDCARDS[_] else _
		}) join ""
		value = text

	@method bind node, editable
		DOMUpdate set (node, value)
		return super bind (node, editable)

	@method validate text
		return True

	@method getNextInputOffset offset
		while offset < mask length and (WILDCARDS[mask[offset]] is Undefined)
			offset += 1
		return offset

	@method getPreviousInputOffset offset
		while offset > 0 and (WILDCARDS[mask[offset - 1]] is Undefined)
			offset -= 1
		return offset

	@method canInsert text, start
		if not WILDCARDS[c]
			start = getNextInputOffset (start)
		# This hijacks the insertion
		var c = mask[start]
		if WILDCARDS[c]
			if WILDCARDS[c] indexOf (text) >= 0
				let v = value[0:start] + text + value[start+1:]
				if validate (v)
					value = v
				else
					return False
			else
				return False
		DOMUpdate set (editable node, value)
		saveRangeToSelection (editable select (getNextInputOffset (start + 1), None))
		# Select range (editable node, getNextInputOffset (start + 1))
		return False

	@method canReplace text, start, end
		# Disabled for now
		return False

	@method canRemove start, end
		start = Math max (0, start)
		end   = Math max (start, end)
		var c = mask[start]
		if WILDCARDS[c]
			let v = value[0:start] + PLACEHOLDER + value[start+1:]
			if validate (v)
				value = v
			else
				return False
		DOMUpdate set (editable node, value)
		# Select range (editable node, getPreviousInputOffset (start))
		saveRangeToSelection (editable select (getPreviousInputOffset(start), None))
		return False
	
# -----------------------------------------------------------------------------
#
# VALUE INPUT FILTERS
#
# -----------------------------------------------------------------------------

@class ValueInputFilter: InputFilter
| Wraps a value (usually a number or some non-string value), parsing
| input text to generate a value and allowing to validate the value and refuse
| text that would lead to an invalid value.

	@shared OPTIONS = {}

	@property value   = Undefined
	@property options = merge ({}, OPTIONS)

	@constructor options
		super ()
		configure (options) if options

	@method configure options
	| Configures this input filter with the given options, merging in
	| the class default `OPTIONS`
		self options = merge (merge ({}, options), OPTIONS)
		return self

	@method get
	| Returns the current value
		return value

	@method getText
	| Returns a formatted version of the current value.
		return format (value)

	@method setFromText text, offsets=Undefined
	| Tries to set the value of based on the given text. The text needs
	| to be accepted, and is then parsed into a value that is set and
	| formatted back. The selector position is updated accordingly.
		if accepts (text)
			# FIXME: The parsing would be made twice, one for accept then
			# for setting the value
			let v = parse (text)
			offsets ?= editable getSelectedOffsets ()
			if set (v, True)
				if offsets is? Array
					if o length == 1
						lastSelection = editable selectAfter (offsets[0])
					elif o length >= 2
						lastSelection = editable select (offsets[0], offsets[1])
				elif offsets is not None or offsets is not Undefined
					lastSelection = editable selectAfter (offsets)
			return True
		else
			return False

	@method set value, force=True
	| Sets the filter's value to the given `value`, only if it is valid.
	| Returns `true` when valid, `false` otherwise.
		value = normalize (value)
		if not force and not hasChanged(value)
			return True
		elif validate (value)
			self value = value
			let text = format (value)
			if editable
				editable setText (text)
			return True
		else
			return False

	@method normalize value
		return value

	@method accepts text
	| Returns true if the given text is an acceptable input, by default
	| it means parsing the value yields a good result
		return validate (normalize(parse (text)))

	@method format value
	| Returns a text-formattted version of the value. The formatted version
	| is the one that should be displayed.
		return "" + value

	@method parse text
	| Parses the given text, returning the corresponding value. The returning
	| value might not be valid.
		error (NotImplemented)

	@method validate value
	| Returns `true` if the given value is valid
		return True

	@method hasChanged value
	| Tells if the given value has changed. Used to guard from setting
	| a value that has not changed.
		return value != self value

# -----------------------------------------------------------------------------
#
# NUMERIC INPUT FILTERS
#
# -----------------------------------------------------------------------------

@class NumericInputFilter: ValueInputFilter
| An value input filter designed to edit numbers

	@shared RE_NATURAL = new RegExp "^[\+\-]?\d+$"
	@shared RE_FLOAT   = new RegExp "^[\+\-]?(\d+|\d*[\.\,]\d+)$"

	@shared OPTIONS = {
		natural   : True
		min       : None
		max       : None
		format    : None
		minDigits : None
		maxDigits : None
		step      : 1
	}

	@property value = 0

	# =========================================================================
	# VALUE
	# =========================================================================

	@method accepts text
		text = strip (str (text))
		if text length == 0
			return True
		elif options natural
			return RE_NATURAL test (text) and validate (normalize(parse (text)))
		else
			return (RE_NATURAL test (text) or RE_FLOAT test (text)) and validate (normalize(parse (text)))

	@method normalize value
		var res = value
		if not (value is? Number)
			return value
		if options natural
			res = Math round (res)
		if options min is not Undefined
			res = Math max (options min, res)
		if options max is not Undefined
			res = Math min (options max, res)
		return res

	@method parse text
	| Parses the given text into a value.
		let r = (parseInt if options natural else parseFloat) (text or 0)
		return r

	@method format value
	| Formats the given value into the canonical text representation.
		return sprintf (options format or ("%d" if options natural else "%f"), value or 0)

	@method validate value=self value
	| Validates the given `value`. The value is expected to be
	| a number.
		# Now we check the min-max number of digits
		let d = ("" + value) length
		# NOTE: The min digits should be part of the formatting
		# if (options minDigits is not None) and (Math max (1,d) < options minDigits)
		# 	return False
		# if (options maxDigits is not None) and (d > options maxDigits)
		# 	return False
		# Now we check the min-max value
		if isNaN(value)
			return False
		if isDefined (options min) and value < options min
			return False
		if isDefined (options max) and value > options max
			return False
		return True

	# =========================================================================
	# HIGH-LEVEL
	# =========================================================================

	@method increase step=options step
		let v = value + step
		return set (v)

	@method decrease step=options step
		let v = value - step
		return set (v)

	# =========================================================================
	# EVENTS
	# =========================================================================

	@method onFocus
		editable selectAll ()

	@method onDown event
		var v = value
		let k = Keyboard code (event)
		var rng = Undefined
		# FIXME: The select all here does not work, it seems to be
		# erased/forgotten.
		if   k == Keyboard codes UP
			increase ()
			rng = editable selectAll ()
		elif k == Keyboard codes DOWN
			decrease ()
			rng = editable selectAll ()
		if rng
			lastSelection = editable getSelectedOffsets (rng)
		else
			return super onDown (event)

	@method onPress event
	| Handles UP/DOWN keys to increase/decrease the values, otherwise
	| delegates to the default behaviour.
		var v = value
		let k = Keyboard code (event)
		if k == Keyboard codes ENTER
			editable selectAll ()
		else
			return super onPress (event)
		swallowEvent (event)
		return False

	@method canInsert text, start
	| Intercepts insertions
		let t = editable getText ()
		let r = t[0:start] + text + t[start:]
		let o = editable getSelectedOffsets ()
		# NOTE: The right part of the OR makes this work properly
		# with limited digits (like months, hours, etc)
		setFromText (r, o[0]) or setFromText (text, text length - 1)

	@method canReplace text, start, end
	| Intercepts replace
		let t = editable getText ()
		let r = t[0:start] + text + t[end:]
		let o = start + text length
		setFromText (r, o)

	@method canRemove start, end
	| Intercepts remove
		let t = editable getText ()
		let r = t[0:start] + t[end:]
		setFromText (r, start)

	@method setFromText text, offsets=Undefined
		let v   = normalize (parse (text))
		let res = super setFromText (text, offsets)
		# We select the text if we reach the numeric bounds
		if v is options min or v is options max
			saveRangeToSelection (editable selectAll ())
		return res

# -----------------------------------------------------------------------------
#
# OPTIONS INPUT FILTERS
#
# -----------------------------------------------------------------------------

@class OptionsInputFilter: InputFilter
| An input filter that allows to select different options

	@property values = ["AM", "PM"]
	@property index  = 0
	@property value  = None

	@method onPress event
		let c = Keyboard char (event)
		let k = Keyboard code (event)
		var f = False
		let j = matchValue (c)
		if   k == Keyboard codes UP or k == Keyboard codes SPACE or k == Keyboard codes ENTER
			index = (index + 1) % (values length)
		elif k == Keyboard codes DOWN
			index = (index + 1) % (values length)
		elif j >= 0
			index = j
		elif Keyboard isControl (event)
			return True
		# TODO: Abstract
		let v = values[index]
		if v != value
			value = v
			DOMUpdate set (node, value)
		swallowEvent (event)
		editable selectAll ()
		return False

	@method onFocus
		editable selectAll ()

# -----------------------------------------------------------------------------
#
# LABEL INPUT FILTER
#
# -----------------------------------------------------------------------------

@class LabelInputFilter: InputFilter
| An input filter that only allows for a single line of text with
| non duplicated spaces.

	@property index  = 0
	@property value  = None

	@method canInsert text, start
	| Intercepts insertions
		let c  = " " if text is "\n" else text
		let t = editable getText ()
		let e = t length
		if text is "\n"
			return False
		elif c != " "
			return True
		elif start == 0
			return False
		elif start == e
			return t[start - 1] != " "
		else
			return t[start] != " " and t[start + 1] != " "

# -----------------------------------------------------------------------------
#
# INPUT FIELD
#
# -----------------------------------------------------------------------------

# TODO: There might a problem when the input field is tied to the rendering engine
# through an output cell, as there are situations where the output cell might
# be out of sync with the editable. This might be more of a problem with
# input filters.

@class InputField
| Wraps an editable field and a cell value, making sure that the field
| updates the cell and the cell updates the field, while taking care of managing
| aspects such as cursor preservation across updates. This class is meant to
| be used by components and help manage the data binding of editables.

	@property _editable
	@property _inputCell
	@property _outputCell
	@property _keymap
	@property _inputFilter
	@property shouldUpdateSelection = False

	@getter editable
		return _editable

	@constructor keymap, inputFilter
		self _keymap = keymap
		self _inputFilter = inputFilter

	@method bind node, inputCell=Undefined, outputCell=None
		if not node
			return warning ("Trying to bind InputField without a node", node, __scope__)
		if not _editable
			setEditable (new Editable ())
		_editable bind (node)
		if inputCell or outputCell
			setCells (inputCell, outputCell)
		return self
	
	@method setInputFilter inputFilter
		_inputFilter = inputFilter
		if _editable
			_editable setInputFilter (_inputFilter)
		if inputFilter and _editable
			assert (inputFilter node, "InputFilter is expected to have a node:", inputFilter)
		return self
	
	@method setKeymap keymap
		# NOTE: We might have to unbind the previous keymap?
		_keymap = keymap
		if _editable
			_editable setKeymap (keymap)
		return self

	@method unbind node
		if _editable
			_editable unbind (node)
		# TODO: We should unbind the cells
		return self

	@method enable
		_editable enable ()
		return self

	@method disable
		_editable disable ()
		return self

	@method setCells input, output=None
	| Sets the input and output cells. If you'd like a direct rendering of
	| changes then you might want to specify both and input and output. If
	| the rendering is made through the view, then no output cell should
	| be given -- and the content of the editable won't be updated by
	| the input field.
		if _inputCell
			_inputCell !- "Update" (self . onInputCellUpdate)
		_inputCell  = input
		_outputCell = output
		if _inputCell
			_inputCell !+ "Update" (self . onInputCellUpdate)
			if _editable
				_editable set (_inputCell value)
		return self

	@method setEditable editable
	| Sets the editable wrapped by this input field. The editable can have
	| an input filter, which will then be used to process the input
	| and output.
		if editable == _editable
			return self
		let node = _editable node if _editable else None
		if _editable
			_editable !- "Update" (onEditableUpdate)
		_editable = editable
		if _editable
			if _inputCell
				_editable set (_inputCell value)
			_editable !+ "Update" (onEditableUpdate)
			_editable bind (node)
		if _keymap
			_editable setKeymap (_keymap)
		if _inputFilter
			_editable setInputFilter (_inputFilter)
		if _inputCell
			_editable set (_inputCell value)

	# =========================================================================
	# HANLDERS
	# =========================================================================

	@method onInputCellUpdate
	| When the input cell is updated, we update the editable
	| (input filter) and make sure that we'll preserve the cursor position
		let input_value = _inputCell value
		# If input and output are in sync, we exit early. This prevents
		# some loops.
		if _outputCell
			let output_value = _outputCell value
			if input_value == output_value
				return self
		shouldUpdateSelection = True
		# NOTE: We do get throught the input filter as it's the one
		# that is going to normalize the input value.
		if _inputFilter
			_inputFilter set (_inputCell value)
		else
			_editable set (_inputCell value)

	@method onEditableUpdate
	| When the editable is udpdated, the output cell is updated
	| with the editable's (input filter) value and we need to
	| reposition the selection accordingly as the display
	| value might change. 
		shouldUpdateSelection = True
		if _outputCell
			let v = _editable get ()
			_outputCell set (v)

	@method focus
		if _editable
			let r = _editable lastSelection or [0,0]
			_editable select (r[0], r[1])
		return self

	@method selectAll
		if _editable
			_editable selectAll ()
		return self

	@method update force=False
		# The selection should be updated when the state value cell
		# was updated, otherwise the cursor might be reset as the
		# content is overriden by the rendering.
		if shouldUpdateSelection or force
			let r = _editable lastSelection
			if _editable enabled
				if r and _editable
					_editable select (r[0], r[1])
				# NOTE:Should we move this out of the branch
				shouldUpdateSelection = False

# EOF
