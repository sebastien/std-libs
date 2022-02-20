@feature sugar 2
@module std.api.dom
| The DOM modules offers abstractions to efficiently create, update, query and
| manipulate the DOM.
|
| In particular, it offers:
|
| - @Create: a factory singleton to create DOM nodes
| - @Update: a singleton to update DOM nodes, supporting *virtual nodes* in comments
| - @Query:  a singleton that allow to query CSS and XPath selectors
| - @Style:  a class to query/update style asynchronously
| - @Selection: an abstraction over a set of DOM nodes
| - @Effects: a class to aggregate and defer application of DOM updates (as
|   defiend in @Update)

@import warning, error, assert, NotImplemented, BadArgument from std.errors
@import json, type, str, identity, len from std.core
@import prepend, concat, tail from std.collections
@import lerp from std.math
@import TFlyweight from std.patterns.flyweight
@import runtime.window as window

# TODO: Clean up this module. Effects and AsyncSelection are probably not
#       necessary anymore.
# TODO: Traversal might be updated as well with more stuff

@enum MeasureType  = POSITION | DIMENSION | BOUNDS
@enum Operation    = ADD | AFTER | BEFORE | SET | HTML | TEXT | VALUE | ATTR | SETATTR | ADDATTR | RMATTR | TOGGLEATTR | STYLE | REMOVE | CLEAR | PUSH | POP | SETREF | LOG | CALL

@shared NAMESPACES = {
	svg   : "http://www.w3.org/2000/svg"
	xlink : "http://www.w3.org/1999/xlink"
	html  : "http://www.w3.org/1999/xhtml"
	xsl   : "http://www.w3.org/1999/XSL/Transform"
}

@shared DEFAULT_UNIT = {
	width         : "px"
	height        : "px"
	paddingTop    : "px"
	paddingLeft   : "px"
	paddingRight  : "px"
	paddingBottom : "px"
	marginTop     : "px"
	marginLeft    : "px"
	marginRight   : "px"
	marginBottom  : "px"
	left          : "px"
	top           : "px"
	bottom        : "px"
	right         : "px"
}
| A collection of default units to be used as suffixes when setting
| CSS style properties.

# -----------------------------------------------------------------------------
#
# FACTORY
#
# -----------------------------------------------------------------------------

@singleton Create
| A collection of functions used to create DOM nodes.

	@method nodeNS ns, name, content...
		let node = document createElementNS (ns, name)
		content :: {Update append (node, _)}
		return node

	@method node name, content...
		let node = document createElement (name)
		content :: {Update append (node, _)}
		return node

	@method fragment
		return document createDocumentFragment ()

	@method text text
		return document createTextNode (text)

	@method comment text
		return document createComment (text)

# -----------------------------------------------------------------------------
#
# VIRTUAL
#
# -----------------------------------------------------------------------------

@singleton Virtual
| Operations that treat DOM comment nodes as virtual elements. Content
| is stored in the monkey-patched `_virtualContent` property.

	@method isVirtual node
		return node is? Comment and node _virtualContent

	@method set node, value
	| Removes existing children of the virtual node and sets the new value
		# FIXME: Must be optimized -- that's what causes the slow rendering
		clear (node)
		return append (node, value)

	@method setdefault node, value, defaultValue
		return set (node, value) if value else set (node, defaultValue)

	@method last node
		# NOTE: Access is resilient to undefined
		let l = node _virtualContent [-1]
		return last (l) if isVirtual (l) else l

	@method append node, value
		let tail   = self last (node)
		let next   = tail nextSibling if tail else node nextSibling
		let parent = tail parentNode if tail  else node parentNode
		node _virtualContent = node _virtualContent or []
		# In this algorithm, we need to make sure
		# that the ordering of nodes in _virtualContent is always
		# preserved and reflected in the DOM as-is.
		if next
			# CASE 1) Virtual node is mounted and is not the last one
			# We start adding the new nodes after the tail, and we know
			# that the tail has a next sibling, so we can use insertBefore.
			var head = tail or node
			for v in _ensureNodes (value)
				# NOTE: We don't use `before` here as we want to
				# preserve the nodes as-is.
				if isVirtual (v)
					for c in select (v)
						if c previousSibling != head
							head parentNode insertBefore (c, head nextSibling)
						head = c
				else
					head parentNode insertBefore (v, head nextSibling)
					head = v
				if v not in node _virtualContent
					node _virtualContent push (v)
				else
					node _virtualContent = node _virtualContent ::? {_ is not v}
					node _virtualContent push (v)

		elif parent
			# CASE 2) Virtual node is mounted and is the last node
			# There's no node after the tail, but there is a parent
			for v in _ensureNodes (value)
				if isVirtual (v)
					# If value node is virtual, we select it and append
					# each selected node to the parent
					for c in select (v)
						if c parentNode != parent
							parent appendChild (c)
				else
					# Otherwise we add the node to the parent
					if v parentNode != parent
						parent appendChild (v)
				if v not in node _virtualContent
					node _virtualContent push (v)
		else
			# CASE 2) Virtual node is not mounted and has no next element
			# There's no parent, so we simply expand the content
			for v in _ensureNodes (value)
				if v not in node _virtualContent
					node _virtualContent push (v)

	@method clear node
	| Removes the children from their parents and clear the contents.
		node _virtualContent :: {
			if _ parentNode
				_ parentNode removeChild (_)
		}
		node _virtualContent = []

	@method remove node
	| Dataches the virtual node and its children
		select (node) :: {
			if _ parentNode
				_ parentNode removeChild (_)
		}

	@method content node
		return node _virtualContent

	@method select node
	| Returns *all* the virtual children of this virtual nodes, expanding
	| virtual nodes to their selection.
		var res = [node]
		for _ in node _virtualContent
			if isVirtual (_)
				res = res concat (select (_))
			else
				res push (_)
		return res

	@method _ensureNodes value
	| Ensures that the given value is a list of nodes.
		match value
			is? None
				return []
			is? Undefined
				return []
			is? String
				return [Create text (value)]
			is? Number
				return [Create text ("" + value)]
			is? Node
				return [value]
			is? Array
				# FIXME: this should be ensure node
				return value
			else
				error (BadArgument, "value", value, [None, Undefined, String, Number, Node], __scope__)

# -----------------------------------------------------------------------------
#
# UPDATE
#
# -----------------------------------------------------------------------------

# TODO: Test for virtual nodes

@singleton Update
| Manages updates tot DOM nodes. It works with Elements, Text and Comment nodes
| with the following semantics:
|
| - Element: just like the DOM
| - Text: text might be modified or value appended after
|
| ======================================================================
| NODE              || VALUE           || Action              || Result
| ======================================================================
| TEXT              || None            || N/A                 || @node
| ----------------------------------------------------------------------
|                   || Undefined       || N/A                 || @node
| ----------------------------------------------------------------------
|                   || Number          || to string, insert   || @node
| ----------------------------------------------------------------------
|                   || String          || insert/set          || @node
| ----------------------------------------------------------------------
|                   || Text            || append/set          || @node
| ----------------------------------------------------------------------
|                   || Node            || append after        || new Node
| ----------------------------------------------------------------------
|                   || String|Text     || recurse             || @node
| ----------------------------------------------------------------------
|                   || []              || recurse             || [new Node]
| ----------------------------------------------------------------------
| ELEMENT           || None            || N/A                 || @node
| ----------------------------------------------------------------------
|                   || Undefined       || N/A                 || @node
| ----------------------------------------------------------------------
|                   || Number          || to string, insert   || new Text
| ----------------------------------------------------------------------
|                   || String          || insert/set          || new Text
| ----------------------------------------------------------------------
|                   || Text            || append/set          || @value
| ----------------------------------------------------------------------
|                   || Node            || append after        || @value
| ----------------------------------------------------------------------
|                   || []              || recurse             || [new Node|Text]
| ----------------------------------------------------------------------
| COMMENT           || None            || N/A                 || @node

	@method set node:Node, value:Node
	| Sets the @value as the contents of @node, returning a single node
	| or an array of node corresponding to the addition of @value
	| into @node.
		if not node
			node = document createDocumentFragment ()
			return append (node, value)
		elif node is? Comment
			# A set on a comment is automatically considered as virtual
			Virtual set (node, value)
			return Virtual content (node)
		elif node is? Text
			if value and value is? Object
				if Virtual isVirtual (value)
					return replace (node, Virtual select (value))
				else
					return replace (node, value)
			else
				node textContent = "" + value
				return node
		match value
			is? Node
				if Virtual isVirtual (value)
					return set (node, Virtual select (value))
				else
					while node firstChild
						node removeChild (node firstChild)
					node appendChild (value)
					return node
			is? Array
				if value length == 0
					while node firstChild
						node removeChild (node firstChild)
					return node
				else
					# NOTE: This implements an efficient replacement of
					# all the nodes, leaving the ones that are at the right
					# place.
					var i = 0 ; let c = node childNodes ; let l = value length ; let cl = c length
					while i < l
						if i >= cl
							node appendChild (value[i])
						elif c[i] != value[i]
							node replaceChild (value[i], c[i])
						i += 1
					while i < c length
						node removeChild (node lastChild)
					return node
			is? Object
				return attributes (node, value)
			is? String
				node textContent = value
				return node
			is? None
				while node firstChild
					node removeChild (node firstChild)
				return node
			is? Undefined
				return node
			else
				node textContent = str (value)
				return node

	@method setdefault node, value, defaultValue
		return set (node, value) if value else set (node, defaultValue)

	@method append:Node node:Node, value:Any, soft=False
	| Appends the given @value to the given @node, where value can be:
	|
	| - `null` or `undefined`, in which case nothing happens
	| - a `number`, in which is wrapped and added to a new text node
	| - a `string`, in which is wrapped in a new text node
	| - a `Node`, in which case it is appended as-is
	| - an `array`, in which case its content is recurively @`append`ed
	| - an `object` map, which is then considered as *attributes*
	|   and sent to the @attributes method.
	|
	| When @soft is `true`, then the @value node will only be
	| appended if they have a different parent than @node.
	|
	| This returns the node that was modified or the list of nodes
	| that were added, depending on @value.
		if not node
			return append (document createDocumentFragment (), value)
		# FIXME: Should we support other node types?
		match node
			is? Comment
				# We conside a comment node to be virtual
				Virtual append (node, value)
				return Virtual content (node)
			is? Text
				match value
					is? Undefined
						return node
					is? None
						return node
					is? Number
						node textContent += value
						return node
					is? String
						node textContent += value
						return node
					is? Text
						node textContent += value
						return node
					is? Comment and Virtual isVirtual (value)
						after (node, value)
						return value
					is? Node
						if (not soft) or (value parentNode != node parentNode)
							if node nextSibling
								node parentNode insertBefore (value, node nextSibling)
							else
								node parentNode appendChild (value)
						return value
					is? Array
						let res  = []
						var t   = node
						for v in value
							# NOTE: This *must* be after and not append
							let n = after (t, v)
							match n
								is? Array
									res = res concat (n)
									t = res [-1]
								is not t
									res push (n)
									t = n
						return res
					else
						error ("Append to text node not supported for the given value:", value , __scope__)
			else
				match value
					is? Undefined
						return value
					is? None
						return value
					is? Number
						return append (node, node ownerDocument createTextNode ("" + value))
					is? String
						return append (node, node ownerDocument createTextNode (value))
					is? Comment and Virtual isVirtual (value)
						for _ in Virtual select (value)
							if (not soft) or (_ parentNode !=  node)
								node appendChild (_)
						return value
					is? Node
						if (not soft) or (value parentNode !=  node)
							node appendChild (value)
						return value
					is? Array
						return value ::> {r,v|concat (r or [], append (node, v))}
					else
						if not attributes (node, value)
							error ("Append to node",  node, "not supported for the given value:", value , __scope__)
						else
							return node

	@method before:Node node:Node, value:Any
	| Inserts the nodes described by @value before the given @node. This
	| returns either a single node or an array of nodes depending on the case.
		# Generate a document fragment if detached
		if not node
			node = document createDocumentFragment ()
			append (node, value)
			return node
		elif not node parentNode
			let n = document createDocumentFragment ()
			let r = append (n, value)
			append (n, node)
			return r
		match value
			is? Undefined
				return None
			is? None
				return None
			is? Number
				return before (node, node ownerDocument createTextNode ("" + value))
			is? String
				return before (node, node ownerDocument createTextNode (value))
			is? Comment and Virtual isVirtual (value)
				return before (node, Virtual select (value))
			is? Node
				node parentNode insertBefore (value, node)
				return value
			is? Array
				return value ::> {r,v|concat (r or [], before (node, v))}
			else
				error (BadArgument, "value", value, [Undefined, None, Number, String, Node, Array], __scope__)

	@method after:Node node:Node, value:Any
		# Generate a document fragment if detached
		if not node
			node = document createDocumentFragment ()
			return append (node, value)
		elif not node parentNode
			let n = document createDocumentFragment ()
			append (n, node)
			return append (n, value)
		if node nextSibling
			return before (node nextSibling, value)
		else
			return append (node parentNode, value)

	@method replace node:Node, value
		if not node or not node parentNode
			return value
		else
			let res = before (node, value)
			remove (node)
			return res

	@method remove node, context=Undefined
		match node
			is? String or node is? Number
				assert (context, "Context is required", __scope__)
				let s = "" + node
				var t = context textContent
				let i = t indexOf (s)
				if i >= 0
					context textContent = t[0:i] + t[i+(s length):]
				return node
			is? Comment and Virtual isVirtual (node)
				Virtual remove (node)
				return node
			is? Node
				node parentNode removeChild (node) if node parentNode
				return node
			is? Array
				node :: {remove (_)}
				return node
			else
				error (BadArgument, "value", value, [Undefined, None, Number, String, Node, Array], __scope__)

	@method clear node:Node
	| Clears the given @node from any child node, returning the node itself
		if not node
			return None
		match node
			is? Text
				node textContent = ""
			is? Comment and Virtual isVirtual (node)
				Virtual clear (node)
			is? Node
				while node and node firstChild
					node removeChild (node firstChild)
		return node

	@method html node:Node, value:Object
	| Sets the HTML content for the given node
		if not node
			error (NotImplemented, __scope__)
		if node nodeType == Node COMMENT_NODE
			error (NotImplemented, __scope__)
		elif not (node innerHTML is? Undefined)
			match value
				is? None
					node innerHTML = ""
				is? String
					node innerHTML = value
				else
					error (NotImplemented, _scope__)
		else
			error (NotImplemented, __scope__)
		return node

	@method text node:Node, value:Object
	| Sets the text content for the given node
		if not node
			error (NotImplemented, __scope__)
		if node nodeType == Node COMMENT_NODE
			error (NotImplemented, __scope__)
		elif not (node textContent is? Undefined)
			match value
				is? None
					node textContent = ""
				is? String
					node textContent = value
				is? Number
					node textContent = "" + value
				else
					error (NotImplemented, __scope__)
		else
			error (NotImplemented, __scope__)
		return node

	@method value node:Node, value:Object
		if not node
			error (NotImplemented, __scope__)
		if node nodeType == Node COMMENT_NODE
			error (NotImplemented, __scope__)
		elif not (node value is? Undefined)
			node value = value
		else
			setattr (node, "data-value", json (value))
		return node

	# TODO: Should we support NS?
	@method setattr node:Node, name:String, value=None
		match node
			is? Array
				return node ::= {setattr (_, name, value)}
			is? Element
				if value is None
					node removeAttribute (name)
				else
					node setAttribute (name, value)

	@method addattr node:Node, name:String, value=None
		return _attrop(0, node, name, value)

	@method rmattr node:Node, name:String, value=None
		return _attrop(1, node, name, value)

	@method toggleattr node:Node, name:String, value=None
		return _attrop(2, node, name, value)

	@method _attrop op, node:Node, name:String, value=None
	| A utility function that implements add/remove/toggle operations for the
	| attributes.
		match node
			is? Array
				return node ::= {_attrop (op, _, name, value)}
			is? Element
				if value is None
					node removeAttribute (name)
				else
					value  = "" + value
					let v  = node getAttribute (name)
					let va = v split " " if v else []
					if op == 0
						# Add
						if value not in va
							if v
								node setAttribute (name, v + " " + value)
							else
								node setAttribute (name, value)
					elif op == 1
						# Remove
						if value in va
							if va length > 1
								node setAttribute (name, (va ::? {_ != value}) join " ")
							else
								node removeAttribute (name)
					else
						# Toggle
						if value in va
							_attrop (1, value)
						else
							_attrop (0, value)
				return node

	@method attributes node:Node, value:Object
	| Sets the given attributes @value to the given @node. The @value
	| is expected to be an object and has the following special handling
	| of keys:
	|
	| - `class`, `className` and `_` keys are equivalent and will
	|   set the class.
	|
	| - `style` and `data` keys supports a map as value, which will
	|    then be *merged* (not replacing) the `node.style` or `node.dataset`
	|    properties.
	|
	| - `#html` and `#text` are special attributes that will respectively
	|   set the node's `innerHTML` and `textContent`.
		match node
			is? Array
				return node ::= {attributes (_, value)}
			is? Element
				# We have an object, and this object is going to be mapped to
				# attributes
				var has_properties = False
				for v,k in value
					var ns  = Undefined
					var dot = k lastIndexOf ":"
					if dot >= 0
						ns = k substr (0, dot)
						ns = NAMESPACES[ns] or ns
						k  = k substr (dot + 1, k length)
					k = "class" if k == "_" or k == "className" else k
					if k == "#html"
						# TODO: We should make sure the contents is OK
						node innerHTML = v
					elif k == "#text"
						# TODO: We should make sure the contents is OK
						node textContent = v
					elif v is? Object
						# If the value is an object, then we will handle both the
						# style and dataset specific cases
						if k == "style"
							let style = node style
							for pv, pn in v
								style [pn] = pv
						elif k == "data" and node dataset
							node dataset [k substr (5)] = v
						if v is None
							node removeAttributeNS (ns, k) if ns else node removeAttribute (k)
						else
							node setAttributeNS (ns, k, v) if ns else node setAttribute (k, v)
					elif v is? Undefined
						pass
					elif v is None
						node removeAttributeNS (ns, k) if ns else node removeAttribute (k)
					else
						node setAttributeNS (ns, k, "" + v) if ns else node setAttribute (k, "" + v)
					has_properties = True
				return has_properties

	@method style node:Node, value:Map
		match node
			is? Array
				return node ::= {style (_, value)}
			is? Node
				for pv, pn in value
					if pn == "transform"
						# Transform is expected to be like {scale:‥,rotate:‥}
						if pv is? Object
							let r = []
							for v,k in pv
								r push (k)
								r push "("
								if v is? Array
									r = r concat (v)
								else
									r push (v)
								r push ") "
							pv = r join ""
					else
						match pv
							is? Array
								if pv length == 4
									pv = "rgba(" + Math floor (pv[0] or 0) + "," + Math floor (pv[1] or 0) + "," + Math floor (pv[2] or 0) + "," + (pv[3] or 0.0) + ")"
								elif pv length == 3
									pv = "rgb(" + Math floor (pv[0] or 0) + "," + Math floor (pv[1] or 0) + "," + Math floor (pv[2] or 0) + ")"
								elif pv length == 2
									pv = pv[0] + pv[1]
								elif pv length == 1
									pv = pv[0]
								elif pv length == 0
									pass
								else
									warning ("Too many values passed to propert", pn, "=", pv, __scope__)
							is? Number
								let unit = DEFAULT_UNIT[pn]
								pv = pv + unit if unit else pv
							is? String
								pass
							is None
								pass
							_
								warning ("Unsupported style value type", pv, "for style", pn, __scope__)
					# TODO: Shouldn't we remove the style if it's None?
					node style [pn] = pv
		return node

# -----------------------------------------------------------------------------
#
# TRAVERSAL
#
# -----------------------------------------------------------------------------

@singleton Traversal
| Functions to traverse/walk the DOM.

	@method ancestorsOrSelf node, callback, index=0
		if (not callback) or (not node)
			return None
		callback (node, 0)
		return ancestors (node, callback, index + 1)

	@method ancestors node, callback, index=0
		if (not callback) or (node is None or node is Undefined)
			return None
		if node parentNode and (node parentNode is not document)
			if callback (node parentNode) is not False
				ancestors (node parentNode, callback, index + 1)

	@method first node, axis, predicate
		var n = None
		let a = self axis (axis)
		if a
			a (node, {
				if predicate (_)
					n = _
					return False
			})
		return n

	@method walk node, callback
		if node is? Array
			for n in node
				if walk (n, callback) is False
					return False
		elif node
			if callback (node) is False
				return False
			var c = node firstChild
			while c
				if walk (c, callback) is False
					return False
				c = c nextSibling
		return node

	@method axis name
		return name match
			is "ancestors"       -> (self . ancestors)
			is "<<"              -> (self . ancestors)
			is "ancestorsOrSelf" -> (self . ancestorsOrSelf)
			is "<<="             -> (self . ancestorsOrSelf)
			else                 -> None

# -----------------------------------------------------------------------------
#
# QUERY
#
# -----------------------------------------------------------------------------

@singleton Query
| A collection of operations to query DOM nodes, implemented with performance
| in mind.

	@method _endsWidth string, text
		if string endsWith
			return string endsWith (text)
		else
			let i = string lastIndexOf (text)
			return i >= 0 and i == string length - len(text)

	@method css selector:String, scope:Node=Undefined
	| Executes the given @selector (CSS-style query) on the given @scope
	| and returns an array of matching elements.
		if not selector or selector length == 0
			return [scope] if scope else None
		elif selector[0] == ">"
			error (NotImplemented, __scope__)
		else
			# We normalize the selector
			var index = Undefined
			if _endsWidth (selector, ":first")
				selector = selector[:-6]
				index    = 0
			if _endsWidth (selector, ":first")
				selector = selector[:-5]
				index    = -1
			# We not the query
			let result = []
			let nodes  = (scope or window document) querySelectorAll (selector)
			var count  = 0
			# For each of the matching node‥
			for node in nodes
				match node
					# ‥we only keep element nodes
					. nodeType == Node ELEMENT_NODE
						match index
							# Adding them all if the index is undefined or
							# negative
							is Undefined or index < 0
								result push (node)
								count += 1
							== count
								result push (node)
								break
							else
								count += 1
			return result[index] if index else result

	@method ancestors:Array node, roots:Undefined|Node|Array=Undefined
	| Returns the list of ancestor nodes (bottom-up) for the given @node, until
	| the parent is one of the @roots, the given @node will be returned
	| as first element of the array.
		var parent = node
		let res    = [parent]
		match roots
			is? Array
				while parent and not (parent in roots)
					parent = parent parentNode
					if parent
						res push (parent)
			is? Node
				while parent and not (parent is roots)
					parent = parent parentNode
					if parent
						res push (parent)
			else
				error (new BadArgument (roots, [Array, Node]))
		return res

	@method index child:Node, parent:Node
	| Returns the index of the given @child in the @parent return `-1`
	| if not found.
	|
	| Note that the index is only valid in `parent.childNodes`, not
	| in `parent.children` (the latter skips non-`Element` nodes)
		# parent = child parentNode if (not parent and child)
		if not parent or not child
			return -1
		var c = parent firstChild
		var i = 0
		while c and not c is child
			c = c nextSibling
			i += 1
		return i if c is child else -1
	@where
		# We create two nodes
		let parent = document createElement "div"
		let child  = document createElement "div"
		Query index (child, parent) == -1
		# and add the child to the parent
		parent appendChild (child)
		Query index (child, parent) == 0
		# Edge cases
		Query index (Undefined, parent)    == -1
		Query index (child, Undefined)     == -1
		Query index (Undefined, Undefined) == -1
		Query index (parent, child)

	@method ancestorWithClass node, class, limit=document
	| Returns the first element that contains the
	| given class (restricting the search to the limit).
	| If no ancestor is found None is Returned
		var t = node
		if not class
			return node
		else
			while node and node != limit
				# NOTE: We might need to trim the `c_list` elements
				var c_list = node getAttribute "class"
				if c_list
					c_list = c_list split " "
				if c_list and (c_list indexOf (class) != -1)
					return node
				node = node parentNode
		if node == limit
			return None
		return node

# -----------------------------------------------------------------------------
#
# MEASURE
#
# -----------------------------------------------------------------------------

@singleton Measure
	
	@property ANCHORS = {
		N : [0.5,   0]
		S : [0.5,   1]
		C : [0.5, 0.5]
		E : [1.0, 0.5]
		W : [0.0, 0.5]

		NE : [1.0,   0]
		E  : [1.0, 0.5]
		SE : [1.0, 1.0]

		NW : [0.0,   0]
		W  : [0.0, 0.5]
		SW : [0.0, 1.0]
	}

	@method x element, relative=None
		return position(element, relative)[0]

	@method y element, relative=None
		return position(element, relative)[1]

	@method position element, relative=None
		return _measure (element, relative, POSITION)

	@method anchor anchor, element, relative=None
		anchor = (ANCHORS[anchor] or [0,0]) if anchor is? String else anchor 
		let b = bounds(element, relative)
		return (
			b[0] + b[2] * anchor[0]
			b[1] + b[3] * anchor[1]
		)

	@method relanchor anchor, element
		anchor = (ANCHORS[anchor] or [0,0]) if anchor is? String else anchor 
		let b = size(element)
		return (
			b[0] * anchor[0]
			b[1] * anchor[1]
		)

	@method bounds element, relative=None
		if element is? Array
			if element length >= 4
				return element
			else
				let r = [] concat (element)
				while r length < 4
					r push (0)
				return r
		else
			return _measure (element, relative, BOUNDS)

	@method dimension element, relative=None
		return _measure (element, relative, DIMENSION)

	@method size element, relative=None
	| Alias to dimension
		return dimension (element, relative)

	@method width element, relative=None
	| Alias to dimension[0]
		return dimension (element, relative) [0]

	@method height element, relative=None
	| Alias to dimension[1]
		return dimension (element, relative) [1]

	@method center element, relative=None
		let b = bounds (element, relative)
		return [b[0] + b[2]/2, b[1] + b[3]/2]

	@method point px, py, element, relative=None
	| Measures a point `(px,py)` given in normalized coordinated within
	| the element's bounds. North is `(0.5,0)`, south is `(0.5,1.0)` and
	| so forth.
		let b = bounds (element, relative)
		return [
			b[0] + lerp(0,b[2],px)
			b[1] + lerp(0,b[3],py)
		]

	@method _measure element, relative=None, type=DIMENSION, visible=False
		# FIXME: Should probably be
		# 	var x = rect left + (window pageXOffset) - ( document clientLeft or 0 )
		# 	var y = rect top  + (window pageYOffset) - ( document clientTop  or 0 )
		var x = Undefined
		var y = Undefined
		var w = 0
		var h = 0
		# TODO: Support scroll offsets properly
		match element
			is window
				x = 0
				y = 0
				w = window innerWidth
				h = window innerHeight
			is? CustomEvent
				return _measure (element detail original, relative, type)
			is? Event
				if len (element changedTouches) > 0
					element = element changedTouches [0]
					# NOTE: IE does not support window scrollX or scrollY, so we have
					# to use pageXOffset or pageYOffset instead (see
					# https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollY
					# https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX)
					x = element clientX + (window scrollX or window pageXOffset or 0)
					y = element clientY + (window scrollY or window pageYOffset or 0)
				else
					x = element clientX + (window scrollX or window pageXOffset or 0)
					y = element clientY + (window scrollY or window pageYOffset or 0)
			is? Node or element is? Range
				# NOTE: Before we were using the offset information, but this
				# doesn't take `transform` into account.
				var b = element getBoundingClientRect ()
				x     = b left + (window pageXOffset or 0)
				y     = b top  + (window pageYOffset or 0)
				w     = b width
				h     = b height
			_
				error (BadArgument, "element", element, [Event, Node, window], __scope__)
		if relative and relative != document and relative != document body
			let p = position (relative)
			x -= p[0]
			y -= p[1]
		return type match
			is DIMENSION
				(w,h)
			is BOUNDS
				(x,y,w,h)
			else
				(x,y)
	

# -----------------------------------------------------------------------------
#
# EFFECTS
#
# -----------------------------------------------------------------------------

@class Effects: TFlyweight
| Represents a sequence of DOM effects that can be applied in batch. Effects
| are meant to be used to aggregate DOM updates and execute them at once
| for each frame, minimizing layout thrashing.

	@operation Style node, value
	| An effector function that returns a @STYLE triple
		return (STYLE, node, value)

	@operation Render step, node
		match step
			is? Array and (step length == 3) and (not (step[0] is? Array))
				let e = Effects Create ([step])
				e render  (node)
				e dispose ()
			is? Array
				let e = Effects Create (step)
				e render  (node)
				e dispose ()
			_
				error (BadArgument, "step", step, [Array], __scope__)

	@property _all    = []
	@property _scope  = None
	@property refs    = {}

	@method init all=[]
		_all = all _all if all is? Effects else all
		refs = {}

	@method detach threshold=0
	| Detaches (ie. removes) any node that is directly added/set
	| in this effect, returning a new effect that detaches these nodes. This
	| is useful if you want to create the inverse of an effect.
		var level = 0
		let res = new Effects ()
		for op in _all
			let t = op[0]
			match t
				is PUSH
					level += 1
				is POP
					level -= 1
				is SET and level <= threshold
					res remove (op [2])
				is ADD and level <=threshold
					res remove (op [2])
		return res

	@group Operations

		@method log message

		@method log message
			return _add (LOG, message)

		@method push node
			return _add (PUSH, node)

		@method pop
			return _add (POP)

		@method add value, node
			return _add (ADD, node , value)

		@method append value, node
			return _add (ADD, node , value)

		@method setref name
			return _add (SETREF, None, name)

		@method html value, node
			return _add (HTML, node , value)

		@method text value, node
			return _add (TEXT, node , value)

		@method value value, node
			return _add (VALUE, node , value)

		@method addattr name, value
			return _add (ADDATTR, name , value)

		@method setattr name, value
			return _add (SETATTR, name , value)

		@method rmattr name, value
			return _add (RMATTR, name , value)

		@method toggleattr name, value
			return _add (TOGGLEATTR, name , value)

		@method remove node
			return _add (REMOVE, node)

		@method after value, node
			return _add (AFTER, node , value)

		@method before value, node
			return _add (BEFORE, node , value)

		@method set value, node
			return _add (SET, node , value)

		@method clear node
			return _add (CLEAR, node)

		@method attr value, node
			return _add (ATTR, node , value)

		@method style value, node
			return _add (STYLE, node , value)

		@method call callback
			return _add (CALL, callback)

	@group Management

		@method _clear
			_all = []

		@method merge effects
		| Merges the given effects
			match effects
				is? Effects
					_all = _all concat (effects _all)
				is? Undefined
					pass
				else
					set (effects)
			return effects

		@method _add operation, value, node
			_all push [operation, value, node]

		@method render node:Node, all=_all, callback=None
		| Applies the effects on the given node.
			# FIXME: I think node and scope should be swapped
			if not node
				node = document createDocumentFragment ()
			var stack = []
			for a,i in all
				let op, n, value     = a
				let scope            = n or node
				# NOTE: Leaving this as it's useful for debugging
				# console log ("Effect #" + i, op __name__, [a[0],a[1]], "→", [scope, value])
				match op
					is ADD
						Update append (scope, value, True)
					is SET
						Update set (scope, value)
					is REMOVE
						match scope
							is? String or scope is? Number
								# What does this mean?
								Update remove (scope, node)
							is? window.Node
								Update remove (scope)
							else
								error (BadArgument, "scope", scope, [String, Node], __scope__)
						if Virtual isVirtual (node)
							node _virtualContent = node _virtualContent ::? {_ != scope}
					is AFTER
						Update after (scope)
					is BEFORE
						Update before (scope)
					is CLEAR
						Update clear (scope)
					is HTML
						Update html (scope, value)
					is TEXT
						Update text (scope, value)
					is VALUE
						Update value (scope, value)
					is ATTR
						Update attributes (scope, value)
					is SETATTR
						Update setattr (node, n, value)
					is ADDATTR
						if n != "#html"
							Update addattr (node, n, value)
					is RMATTR
						if n != "#html"
							Update rmattr (node, n, value)
					is TOGGLEATTR
						if n != "#html"
							Update toggleattr (node, n, value)
					is STYLE
						Update style (scope, value)
					is PUSH
						stack push (node)
						node = scope
					is POP
						node = stack pop ()
					is SETREF
						refs [value] = node
					is LOG
						console log ("Effects: ", a[1])
					is CALL
						a[1] (node, value, self)
					else
						error (new BadArgument("operation", op, [Operation]), __scope__)
			if callback
				callback (node, self)
			return node

# -----------------------------------------------------------------------------
#
# SELECTION
#
# -----------------------------------------------------------------------------

@class Selection
| An OO, jQuery-like wrapper around an array of nodes.

	@property nodes = []

	@getter length
		return nodes length

	@getter node
		if nodes length >= 1
			return nodes[0]
		else
			return None

	@operation SetCSS node, style:Object
	| Sets the given @style (as a map) to the given @node (or list or nodes).
		match node
			is? Node
				style :: {v,k|
					node style [k] = v match
						is? Array
							v[0] + v[1]
						is? String
							v
						is? Number
							v + DEFAULT_UNIT[k]
						else
							"" + v
				}
			is? Array or node is? Object
				node :: {SetCSS (_, style)}
		return node

	@constructor nodes=Undefined, context=Undefined
		# TODO: Support context
		if context
			nodes = Query css (nodes, context)
		match nodes
			is? Array
				nodes :: add
			_
				add (nodes)

	@group Accessors

		@method attr name, value=Undefined
			if value is Undefined
				if nodes length == 0
					return Undefined
				else
					return nodes[0] getAttribute (name)
			else
				value = str(value)
				for n in nodes
					n setAttribute (name, value)
				return self

		@method value value=Undefined
		| When `value` is not specified ,retrieves the first non-null
		| value for the given input fields. If value is specified, then
		| the value will be set in all fields.
			match value
				is? Undefined
					for _ in nodes
						if not (_ value is? Undefined)
							return _ value
						elif _ hasAttribute "contenteditable"
							return _ textContent
					return None
				else
					for _ in nodes
						if not (_ value is? Undefined)
							_ value = value
						elif _ hasAttribute "contenteditable"
							_ textContent = value
					return self

		@method each callback:Callback
		| Iterates on each node that is part of this selection
			nodes :: {n,k|callback(_subselection(n),k,self)}
			return self

		@method isEmpty
		| Tells if this selection is empty (ie. has no node)
			return nodes length == 0

	@group Mutators

		@method add:self node:Element|String|DocumentFragment
		| Adds the @node to this selection. Note that this *does not
		| append the node* to any parent.
			match node
				is? String
					nodes = nodes concat (Query css (node))
				is? Element
					nodes push (node)
				is? DocumentFragment
					nodes push (node)
				is? Selection
					nodes = nodes concat (node nodes)
				else
					error (BadArgument, [String, Element, DocumentFragment])
			return self

		@method find query
			return _subselection (nodes ::> {r,v|(r or []) concat (Query css (query, v))})

		@method text value
			value = str(value)
			nodes :: {Update set (_, value)}
			return self

		@method set value
			nodes :: {Update set (_, value)}
			return self

		@method append node:Selectable
		| Appends the given @node to all the nodes within this selection,
		| deeply cloning the node if necessary.
			if nodes length == 0
				return self
			match node
				is? Node
					match nodes length
						>  1
							nodes :: {n,i|n appendChild (node cloneNode (True) if i > 0 else node)}
						== 1
							nodes[0] appendChild (node)
				is? Selection
					node nodes :: append
				is? Array
					node :: append
				_
					append (nodes[0] ownerDocument createTextNode ("" + node))
			return self

		@method clear
		| Removes all the children from all the nodes in the selection
			for _ in nodes
				while _ firstChild
					_ removeChild (_ firstChild)
			return self

		@method css:self style, callback=None
		| Queries/sets the property/properties for this node.
			let node = nodes [0]
			if node is? Undefined
				return Undefined
			let value = style match
				is? String
					node style [style]
				is? Array
					style ::= {node style [_]}
				is? Object
					SetCSS (nodes, style)
			if callback
				callback (value, self)
			return self

		@method toggleClass name, predicate=Undefined
			if predicate
				nodes :: {_ classList add (name) if predicate (_) else _ classList remove (name)}
			else
				nodes :: {_ classList toggle (name)}
			return self

	@group Events

		@method bind event, callback, capture=False
			nodes :: {_ addEventListener (event, callback, capture and True)}
			return self

		@method unbind event, callback
			nodes :: {_ removeEventListener (event, callback, capture and True)}
			return self

		@method trigger name, detail
			for _ in nodes
				_ dispatchEvent (new CustomEvent (name, {detail:detail}))
			return self

	@group Creators

		@method parent
			return new Selection (nodes ::> {r=[],v|
				if v and v parentNode
					r push (v parentNode)
				return r
			})

		@method get:Node index:Integer
		| Returns the node at the given @index, this includes negative
		| indexes.
			return index match
				>= 0
					_subselection (nodes[index])
				<= 0
					_subselection (nodes[nodes length + index])
				else
					Undefined

		@method clone:Selection deep=False
		| Returns a deep or shallow (defaul) clone of this selections'
		| nodes.
			let n = nodes ::= {_ cloneNode (True)}
			let s = new (type(self)) (n)
			return s

		@method toAsync:AsyncSelection
		| Returns a new asynchronous selection of the given nodes.
			return new AsyncSelection (self)

	@group Helpers

		@method _subselection node
		| Returns a new subselection for the given node.
			return new (type(self)) (node)

# -----------------------------------------------------------------------------
#
# ASYNC SELECTION
#
# -----------------------------------------------------------------------------

@class AsyncSelection: Selection

	@property _measures = Undefined
	@property _updates  = Undefined

	@constructor nodes, measures=[], updates=[]
		super (nodes)
		self _measures = measures
		self _updates  = updates

	@method css style, callback=None
		match style
			is? String or style is? Array
				_measure (CSS, style, callback)
			is? Object
				_update (CSS, style, callback)
			else
				error (BadArgument)

	@method flush
		_doMeasures ()
		_doUpdates  ()

	@group Helpers

		@method _measure type, value, callback
			_measures ~prepend [nodes, type, value, callback]

		@method _update type, value, callback
			_updates ~prepend [nodes, type, value, callback]

		@method _doMeasures
			# FIXME: We should managethe nodes
			# let nodes, type, value, callback = m
			# match type
			# 	is? CSS
			# 		super css (value, callback)
			# 	else
			# 		error "Unsupported type"

		@method _doUpdates
			# We make sure to clear the updates
			let l = _updates ; _updates = []
			# We start by applying the changes all at once
			for _ in l
				let nodes, type, value, callback = _
				match type
					is? CSS
						SetCSS (nodes, value)
					else
						error "Unsupported type"
			# And we notify the callbacks if necessary
			# NOTE: Would it be faster to create another
			# array?
			for _ in l
				let nodes, type, value, callback = _
				if callback
					callback (nodes, type, value)

		@method _subselection node
		| Returns a new subselection for the given node, this will share
		| the @_measures and @_updates queues with the current selection.
			return new (type(self)) (node, _measures, _updates)

@function select:Selection selector:String, context:Node=Undefined
| Creates a new `Selection` object from the given CSS `selector` string
| and using the optional `context` node.
	return new Selection (selector, context)

# EOF
