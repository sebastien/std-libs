@module std.ui.interaction.scroll
| The scroll module implements tracks the position of nodes relative
| to the viewport. Each time the scroll offset is updated, each parallax
| item is updated accordingly and returns a normalized visibilty factor
| along with a `k` factor that interpolates between the element being
| invisible at the top (-1) to the element being invisible at the bottom (+1).

@import remove as coll_remove    from std.collections
@import assert                   from std.errors
@import clamp, sign, multiscale  from std.math
@import frame                    from std.io.time
@import Measure                  from std.api.dom
@import handle, unhandle         from std.ui.interaction
@import TFlyweight               from std.patterns.flyweight
@import TOptions                 from std.patterns.options
@import TSingleton               from std.patterns.oo
@import runtime.window as window

# SEE: https://getuikit.com/v2/docs/parallax.html
# SEE: https://developers.google.com/web/updates/2016/04/intersectionobserver?hl=en
# ----------------------------------------------------------------------------
#
# SCROLLED
#
# ----------------------------------------------------------------------------

@class Scrolled: TOptions, TSingleton
| The scrolled object manages a set of nodes that have a measured region
| and updates their visibility and offset factor when the scroll is updated.

	@shared OPTIONS = {
		horizontal : False
		vertical   : False
	}

	@property _node    = Undefined
	@property _items   = []
	@property _viewport:Rect
	@property _previousViewport:Rect = Undefined
	@property _offsetX = 0
	@property _offsetY = 0
	@property _isBound = False
	@property _willMeasure = False

	@constructor node
		bind (node) if node

	@method bind node=_node
		# NOTE: All this is to ensure lazy binding of the event
		# handlers. It makes it slightly more complicated than
		# necessary.
		# --
		# If it's the very first time we're binding this scrolled and
		# node is Undefined, then we're setting the node to the window
		if node is Undefined and _isBound is False
			node = window
		if node is _node 
			return self
		elif _node
			unbind ()
		_node = node
		if not _isBound
			_isBound = {
				scroll:onScroll
				resize:onResize
			}
			handle (_node, _isBound, False, True)
			measure       ()
			updateOffsets ()
		return self
	
	@method unbind
		if _isBound
			if _node
				unhandle (_node, _isBound)
			_isBound = False
		_node = Undefined
		return self

	@method remeasure
		if not _willMeasure
			_willMeasure = True
			frame {measure()}

	@method add:Scrollable node:Node, callback:Function
	| Adds a new parllax item wrapping the given `node` and 
	| update `callback`.
		let res = node if node is? Scrollable else Scrollable Create (node, callback)
		_items push (res)
		remeasure ()
		return res

	@method remove node:Node
	| Removes the parallax item attached to the given node.
		let scrollable = node if node is? Scrollable else None
		_items = coll_remove (_items, {
			if (_ _node is not node) and (_ is not scrollable)
				return True
			else
				_ dispose ()
				return False
		})
		remeasure ()
		return self

	@method onScroll event
		return updateOffsets ()

	@method updateOffsets
	| Updates the (x,y) offsets based on the current node
		if _node is window
			_setOffset (window pageXOffset, window pageYOffset)
		elif _node
			_setOffset (_node scrollLeft, _node scrollTop)
		else
			#_setOffset (0, 0)
			pass
		return self

	@method _setOffset x, y
	| Sets the `x,y` offset
		if _viewport is Undefined
			measure ()
		# Neither x or y should be undefined
		_viewport[0] = x
		_viewport[1] = y
		_offsetX     = x
		_offsetY     = y
		_items :: {_ update (_viewport)}
		return self
	
	@method onResize event
		measure ()

	@method measure
	| Measures the bounds of all the items registered in this
	| parallax object.
		if _node
			let size =Measure bounds (_node)
			_viewport ?= [0,0,0,0]
			_viewport[2] = size[2]
			_viewport[3] = size[3]
			# We measure AND update the scrollables, because if the view has
			# been resized, their offsets are going to change as well.
			_items :: {
				_ measure ()
				_ update  (_viewport)
			}

# ----------------------------------------------------------------------------
#
# SCROLLABLE ITEM
#
# ----------------------------------------------------------------------------

@class Scrollable: TFlyweight
| A flyweight item that wraps a node/callback registered in a parallax
| object.
|
| The parallax item maintains the following state:
|
| - `v` for its **visibility ratio** (between 0 and 1), defining how much
|   of the item's area is currently visible.
|
| - `k` which interpolates from -1 (fully hidden at the top), to 0 (full
|   centered on the viewport) to 1 (fully hiddent at the bottom)
|
| Each parallax item has a `processor` and a `callback`. When the parallax
| item is updated (the `Parallax.setOffset` calls `Parallax.setItem`)
| the processor will compute a value based on `(v,k,self)`. If that calue
| changes, it the callback will be executed. Without a processor function,
| the callback will be executed whenever `v` or `k` changes.

	@property _node      = Undefined
	@property _callback  = Undefined
	@property _always    = Undefined
	@property _processor = Undefined
	@property _bounds    = Undefined
	@property _scrolled  = Undefined
	@property k          = Undefined
	@property v          = Undefined
	@property w          = Undefined

	@getter scrolledNode
		return _scrolled _node if _scrolled else None

	@method init node:Node, callback:Function=Undefined, processor:Function=Undefined, scrolled=Undefined
		_node     = node
		_callback = callback
		_processor = processor
		_scrolled  = _scrolled

	@method scrolled scrolled
		if _scrolled != scrolled
			_scrolled = scrolled
		return self

	@method bind node
		_node = node
		if not _scrolled
			_scrolled ?= Scrolled Get () 
		if _scrolled
			_scrolled add  (self)
			_scrolled bind ()
		return self
	
	@method unbind node
		_node = Undefined
		if _scrolled
			_scrolled remove (self)
		return self

	@method process callback:Function
		_processor = callback
		return self
	
	@method does callback:Function
		_callback = callback
		return self
	
	@method always callback:Function
		_always = callback
		return self
	
	@method measure
	| Updates the measured bounds of this parallax object.
		let parent = _scrolled _node
		if _node
			_bounds = Measure bounds (_node, parent)
			if _bounds[0] == 0 and _bounds[1] == 0 and _bounds[2] == 0 and _bounds[3] == 0
				_bounds = Undefined
			elif parent is not window
				# FIXME: This seems fishy, especially if the parent has a change in scroll
				# We need to add the scroll offset here, but only if the parent
				# node is not the window.
				_bounds[0] = _bounds[0] + parent scrollLeft
				_bounds[1] = _bounds[1] + parent scrollTop
		else
			_bounds = Undefined
		return self
	
	@method update viewport:Rect=_scrolled and _scrolled _viewport
	| Updates the position of this parallax item relative to the viewport.
	| The following chart illustrates the `k` values for the current
	| item (small rectangle).
	|
	| ```
	|        +----------------+         -- k = -2         (A)
	|        |                |
	|        |                |
	|        |                |
	|        +----------------+        
	| +-------------------------------+ -- k = -1         (B)
	| |      +----------------+       |
	| |      |                |       |
	| |      |                |       |
	| |      |                |       |
	| |      +----------------+       |
	| |                               |
	| |                               |
	| |      +----------------+       |
	| |      |                |       |
	| |      |                |       | -- k = 0          (C)
	| |      |                |       |
	| |      +----------------+       |
	| |                               |
	| |      +----------------+       |
	| |      |                |       |
	| |      |                |       |
	| |      |                |       |
	| |      +----------------+       |
	| +-------------------------------+ -- k = +1         (D)
	|        +----------------+        
	|        |                |
	|        |                |
	|        |                |
	|        +----------------+         -- k = +2         (E)

	| ```
		if not _node or not viewport
			return None
		# FIXME: We should try to avoid measuring all the time
		if True or not _bounds
			measure ()
		let b          = _bounds
		if not b
			return None
		# V is the visibility factor, ie. how much of the current parllax item
		# is visible.
		let v_before   = clamp ((b[1] + b[3] - viewport[1]) / b[3], 0, 1)
		let v_after    = clamp ((b[1] + b[3] - viewport[1] - viewport[3]) / b[3], 0, 1)
		let r_v          = v_before - v_after
		let y          = b[1]
		# We calculate the Y offsets of points A, B, C, D, E
		let y_a        = viewport[1] - b[3]
		let y_b        = viewport[1]
		let y_c        = viewport[1] + viewport[3]/2 - b[3]/2
		let y_d        = viewport[1] + viewport[3] - b[3]
		let y_e        = viewport[1] + viewport[3]
		let r_k        = multiscale (y, 
			[y_a, y_b, y_c, y_d, y_e]
			[ -2,  -1,   0,   1,   2]
		)
		var has_changed = False
		if _processor
			let r_w = _processor (r_v,r_k,self)
			has_changed = w != r_w
			w = r_w
		else
			has_changed = k != r_k or v != r_v
			w = Undefined
		k = r_k
		v = r_v
		if has_changed and _callback
			_callback (r_v, r_k, w, self)
		if _always
			_always   (r_v, r_k, w, self)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function scrolled:Scroll
| Returns the global `Scroll` instance
	return Scrolled Get ()

@function scrollable:Scrollable callback:Function, processor:Function=Undefined
| Returns a new `Scrollable` instance
	return Scrollable Create (Undefined, callback, processor)

# EOF
