@module std.ui.adapters
| Adapters are objects that wrap arbitrary object/data and present
| a consistent interface. The UI adapters all provide a consistent model/API
| to access and modify common user interface elements, while allowing to use
| specific encodings and decodings of the data. Adapters are intended to be
| re-used and re-mapped to different data throughout the life of an application
| or component.
|
| Architecturally speaking, adapters allow you to use data objects coming from
| your application data layer directly in the interface, without having to
| convert them to an object format that is compatible with the components'
| model.
@import TFlyweight  from std.patterns.flyweight
@import bool, copy, merge, len, find from std.core
@import sorted from std.collections
@import assert from std.errors

# TODO: We should try to cache/memoize formatted values, as some might
# be expensive to compute (ie. when formatting happens)

@class IAdapter: TFlyweight
| This abstract class defines the generic properties of an adapter: it wraps
| an `element` referenced by `index` in a given `collection`.

	@shared   EXTRACTORS = {}
	@shared   DEFAULTS   = {}

	@operation Remap values, existing, component, extractors=Undefined
		let creator = {i,l|Create(l,i,component,extractors)}
		return Map (
			values,  creator
			existing, {v,i,l|v wrap (l,i,component,extractors)}
		)

	@property _collection
	@property index
	@property _component
	@property extractors
	@property defaults

	@getter data
		return _collection [index]

	@getter id
		if not data
			return index
		elif extractors and extractors id
			return extractors id (data, index)
		else
			return data match
				is? String → data
				else       → data id

	@method init collection, index, component, extractors=Undefined
		# NOTE: We support data being null
		self _collection = collection
		self index       = index
		self _component  = component
		self extractors  = extractors
	
	@method wrap collection, index=self index, component=_component, extractors=self extractors
		self _collection = collection
		self _component  = component
		self extractors  = extractors
		self index       = index
		return self

	@method _extract name
		var res = Undefined
		if data and extractors and extractors [name]
			res = extractors [name] (data, index, _component)
		elif data and EXTRACTORS and EXTRACTORS [name]
			res = EXTRACTORS [name] (data, index, _component)
		res ?= defaults[name]
		res ?= DEFAULTS[name]
		return res

# -----------------------------------------------------------------------------
#
# ITEM ADAPTER
#
# -----------------------------------------------------------------------------

@class ItemAdapter: IAdapter
| Default adapter for a list item. An item has a lavel, value and icon and
| can be selected.

	@shared EXTRACTORS = {
		label    : {_ label}
		value    : {_ value}
		icon     : {_ icon}
		detail   : {_ detail}
		shortcut : {_ shortcut}
		style    : {_ style}
		type     : {_ type}
		view     : {_ view}
		action   : {_ action}
		css      : {_ css}
		menu     : {return None}
		focused  : {d,i,c|return i is c state focus value}
		selected : {d,i,c|
			# We use the selection index first, and then the selection
			# value.
			let sel_i = c state selectionIndex
			let sel_v = c state selection
			if sel_i
				return i in sel_i value
			else
				return d in sel_v value
		}
	}

	@shared DEFAULTS = {
		label    : "???"
	}

	@getter type
		return _extract "type"

	@getter label
		return _extract "label"

	@getter icon
		return _extract "icon"

	@getter detail
		return _extract "detail"

	@getter shortcut
		return _extract "shortcut"

	@getter action
		return _extract "action"

	@getter menu
		return _extract "menu"

	@getter meta
		return _extract "meta"

	@getter style
		return _extract "style"

	@getter value
		return _extract "value"

	@getter view
		return _extract "view"

	@getter css
		return _extract "css"

	@getter isSelected
		return bool(_extract ("selected"))

	@getter isFocused
		return bool(_extract ("focused"))

# -----------------------------------------------------------------------------
#
# NODE ADAPTER
#
# -----------------------------------------------------------------------------

# TODO: We should have two derivative adatpers to enable visible and all
# traversal.

@class NodeAdapter: ItemAdapter
| Default adapter for a node. A node is an item that has children and parents.

	@shared EXTRACTORS = merge ({
		parent   : {_ parent}
		children : {_ children}
	}, ItemAdapter EXTRACTORS)

	@property limit               = 3
	| The depth limit after which a node is not displayed anymore

	@property _parent             = Undefined
	| A reference to the parent node

	@property _children           = Undefined
	| A reference to the list of children. Will be dynamically updated
	| if the filtering or ordering changes.

	@property _visibleChildren    = Undefined
	| The list of visible children, depending on the list of children.

	@property _filtering          = Undefined
	| Defines a filter that can be used to filter out children, unless they
	| are explicitely set as visible or invisible.

	@property _ordering           = Undefined
	| Defines an ordering criteria for children.

	@property _orderingDescending = Undefined
	| Defines whether the ordering is ascending or not

	@property _isVisible          = Undefined
	| Tells wether this node is explicitely visible or not

	@property _isExpanded         = Undefined
	| Tells wether this node is explicitely expanded or not

	# TODO: Cache me
	@getter path
		var n = self
		var r = []
		while n
			r splice (0, 0, n id)
			n = n parent
		return r

	# TODO: Cache me
	@getter depth
		var i = 0
		var n = self parent
		while n
			n = n parent
			i += 1
		return i

	@getter children
		if not data
			return []
		elif _children is Undefined
			var data_children = _extract "children"
			_children = TFlyweight Map (
				data_children, {i,l  |NodeAdapter Create (l,i,_component,extractors) setParent (self)}
				_children,     {v,i,l|v wrap(l,i) setParent (self)}
			)
			_children = _children if len(_children) > 0 else None
			return _children
		else
			return _children

	@getter visibleChildren
		if not data or isLimit or isCollapsed
			return []
		elif _visibleChildren is Undefined or _children is Undefined
			var l = children ::? {
				if _ isVisible is False
					return False
				else
					return (not _filtering) or _filtering(_)
			}
			if _ordering
				l = sorted (l, _ordering, _orderingDescending)
			_visibleChildren = l if len(l) > 0 else None
			return _visibleChildren
		else
			return _visibleChildren
	
	@getter descendantsCount
		# FIXME: Somehow, I can't get a reducer version working
		let l = children
		var n = len(l)
		l :: {n += _ descendantsCount}
		return n

	@getter visibleDescendantsCount
		let l = visibleChildren
		var n = len(l)
		l :: {n += _ descendantsCount}
		return n

	@getter childrenCount
		return len(children)

	@getter visibleChildrenCount
		return len(visibleChildren)

	@getter parent
		return _parent

	@getter isLimit
		return limit >=0 and depth >= limit

	@getter isCollapsed
		return not isExpanded

	@getter isExpanded
		if _isExpanded is Undefined
			return bool(_extract ("expanded"))
		else
			return _isExpanded

	@getter isVisible
		if _isVisible is Undefined
			return True
		else
			return _isVisible

	@getter isLeaf
		return childrenCount is 0

	@getter isFilteredIn
		return _filtering (self) if _filtering else True

	@getter nextVisibleSibling
		let p = parent
		if not parent
			return None
		else
			let l = parent visibleChildren
			let i = find (i, self)
			return i match
				== l - 1 → None
				== -1    → None
				else     → l [i + 1]

	@getter previousVisibleSibling
		let p = parent
		if not parent
			return None
		else
			let l = parent visibleChildren
			let i = find (i, self)
			return i match
				<= 0     → None
				else     → l [i + 1]

	@group Lifecycle

		@method wrap list, index
			super wrap (list, index)
			_children        = Undefined
			_visibleChildren = Undefined
			return self

	@group Visibility

		@method show
			if _isVisible is not True
				_isVisible = True
				if parent
					parent _visibleChildren = Undefined
			return self

		@method hide
			if _isVisible is not False
				_isVisible = False
				if parent
					parent _visibleChildren = Undefined
			return self

		@method defaultVisible
			if _isVisible is not Undefined
				_isVisible = Undefined
				if parent
					parent _visibleChildren = Undefined
			return self

		@method toggle
			if isExpanded
				collapse ()
			else
				expand ()
			return self

		@method expand
			_isExpanded = True
			return self

		@method collapse
			_isExpanded = False
			return self

		@method defaultExpanded
			_isExpanded = Undefined
			return self

	@group Tree

		@method setParent adapter:NodeAdapter
			if adapter
				assert (adapter is? NodeAdapter, "NodeAdapter expected")
				_parent = adapter
			else
				_parent = None
			return self

		@method walk callback
			_walk (callback, "children")
			return self

		@method walkVisible callback
			_walk (callback, "visibleChildren")
			return self
	
		@method _walk callback, collection
			if callback (self) is False
				return False
			self [collection] :: {
				if _ _walk (callback, collection) is False
					return False
			}

		@method first callback, collection="children"
			let res = callback (self)
			if res is not Undefined
				return res
			else
				for c in self[collection]
					let r = callback (c)
					if r is not Undefined
						return r
				return Undefined

		@method firstVisible callback
			return first (callback, "visibleChildren")

	@group Children

		@method setFilter filtering:Predicate
		| Sets hte filtering criteria used to filter the children.
			_filtering        = filtering
			_children         = Undefined
			_visibleChildren  = Undefined
			return self

		@method setOrdering ordering:Predicate, descending=False
		| Sets the ordering criteria used to order the children of this node
			_ordering           = ordering
			_orderingDescending = descending
			_children           = Undefined
			_visibleChildren    = Undefined
			return self

# EOF
