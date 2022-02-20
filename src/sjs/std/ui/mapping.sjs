@feature sugar 2
@module std.ui.mapping
| Defines primitives to create map-like UI components. The basic premise of
| maps is that elements are made visible or not based on two criteria:
|
| - The current zoom level (or factor)
| - The current visible bounding box
|
| In essence, a map is structured like a simplified 2D scene graph.

@import len        from std.core
@import assert     from std.errors
@import vec        from std.math.geom.vector
@import Measure    from std.api.dom
@import TZoomable  from std.patterns.zoomable
@import TOptions   from std.patterns.options
@import draggable  from std.ui.interaction.drag
@import add,sub,mul,clamp,lerp    from std.math
@import runtime.window as window

# -----------------------------------------------------------------------------
# # MAPPABLE
#
# -----------------------------------------------------------------------------

@class Mappable
| Defines the abstract properties of any element that can be represented
| on a map. These elements have a `position`, a `dimension` and
| a visible zoom range `_visibleZoomRange`. The interpretation of the
| position and dimension vector is left to the mapping component.

	@property position  = vec (0,0,0)
	@property dimension = vec (0,0,0)
	@property levels = [0, 99999]

	@method setLevels value
		levels[0] = value[0]
		levels[1] = value[1]
		return self

	@property _visibleZoomRange = [0, Infinity]

	@method isVisibleAtLevel level
		return level >= levels[0] and level < levels[1]

	@method isVisibleInBounds
		return True

# -----------------------------------------------------------------------------
#
# LAYER
#
# -----------------------------------------------------------------------------

@class Layer: Mappable
| A layer is typically a mappable element that is a rectangle.

	@property _position = vec(0,0)
	@property _map

	@method _setMap map
	| A private method called by the map to bind the layer to the map.
		self _map = map
		onProjectionUpdated ()
		return self

	@getter map
		return _map

	@method onProjectionUpdated
		pass

	@getter transformSVG
		return _map and _map _transformSVG

# -----------------------------------------------------------------------------
#
# HTML LAYER
#
# -----------------------------------------------------------------------------

@class HTMLLayer: Layer

# -----------------------------------------------------------------------------
#
# SVG LAYER
#
# -----------------------------------------------------------------------------

@class SVGLayer: Layer

	@property _node

	@constructor node
		_node = node
	
	@getter node
		return _node

	@method onProjectionUpdated
		if _map _transformSVG
			_node setAttribute ("transform" , _map _transformSVG)
		if not isVisibleAtLevel (_map _zoomLevel)
			_node style visibility = "hidden"
		else
			_node style visibility = "visible"

# -----------------------------------------------------------------------------
#
# TILE LAYER
#
# -----------------------------------------------------------------------------

@class TileLayer: Layer

# -----------------------------------------------------------------------------
#
# GROUP LAYER
#
# -----------------------------------------------------------------------------

@class GroupLayer: Layer

# -----------------------------------------------------------------------------
#
# MARKERS
#
# -----------------------------------------------------------------------------

@class Markers: Layer, TOptions
| Markers is a layer and a collection of markers. A marker is usually and
| element that won't scale with the zoom and that is hidden when out of view.

	# NOTE: The markers class is designed so that the rendering behaviour
	# can be composed using options, similiarily to the interaction.drag
	# module.
	@shared OPTIONS = {
		visible   : Undefined
		hidden    : Undefined
		zoom      : Undefined
		translate : Undefined
		position  : Undefined
		transform : Undefined
	}

	@property _markers = []

	@constructor options=Undefined
		setOptions (options)

	@method set markers
		_markers = markers
		return self

	@method onProjectionUpdated changed
		if options zoom and changed z
			let z = _map scaling
			let f = options zoom
			_markers :: {f(z, _0, _1)}
		if options translate and (changed x or changed y)
			let f = options translate
			let xy = [_map translation[0], _map translation[1]]
			_markers :: {f(xy, _0, _1)}
		if options transform
			options transform (changed)
		# TODO: Implement visible/invisible

# -----------------------------------------------------------------------------
#
# MAP
#
# -----------------------------------------------------------------------------

@class Map: TZoomable, TOptions

	@shared OPTIONS           = {
		draggable : True
		zoomable  : True
		level     : [0, 7]
	}

	@property _layers         = []
	| The list of layers in this map

	@property _zoomBasis = 2
	| The base number for computing the zoom factor based on the zoom level.

	@property _zoomLevelStep = 0.25
	| The step to increase the zoom level

	@property _zoomLevel = 0
	| The current zoom level

	@property _translation    = [0,0]
	| The translation in SCREEN SPACE.

	@property _scaling     = 1
	| The scaling represents how many pixels in SCREEN SPACE there is per
	| MAP SPACE pixel. If it's < 1, then it's zoomed out, if it's > 1 then
	| it's zoomed in. In other words it's the ratio `SCREEN PIXEL/MAP PIXEL`

	@property _viewSize       = [0,0]
	| The size of the view, in SCREEN SPACE pixels, used to adjust the translation after
	| zooming.

	@property _bounds         = None
	| Bounds is either None or `[x1,y1,x2,y2]`

	@property _transformSVG   = Undefined
	| An internal attribute that is recalculated on projection changes,
	| storing the SVG transform string corresponding to this map's projection.

	@property _draggable = draggable {
		start : {e,n,o,d,p,c|
			e preventDefault ()
			if options draggable
				self ! "DragStart" (_)
				return True
			else
				return False
		}
		end   : {self ! "DragEnd" (_)}
		ox    : {_translation [0]}
		oy    : {_translation [1]}
		xy    : {e,n,o,d|translate (add(o,d))}
		z     : {e,n,o,d,p|
			if options zoomable
				p = Measure position (e, e currentTarget)
				if d[1] < 0
					zoomIn (p)
				elif d[1] > 0
					zoomOut (p)
		}
	}

	@constructor options=Undefined
		updateOptions (options)

	# =========================================================================
	# ACCESSORS
	# =========================================================================

	@getter translation
	| Returns the current translation in VIEW SPACE.
		return _translation

	@getter scaling
	| Returns the scaling factor for the map.
		return _scaling

	# =========================================================================
	# INTERACTORS
	# =========================================================================

	@method bind node
		_draggable bind (node)

	@method unbind node
		_draggable unbind (node)

	# =========================================================================
	# CONFIGURATION
	# =========================================================================

	@method setBounds bounds
	| The the map bounds as `[x1,y1,x2,y2]` in MAP SPACE.
		assert ((bounds is None) or (bounds is? Array and len(bounds) >= 4))
		_bounds = bounds
		return self

	@method clearBounds
	| Clears the map bounds.
		return setBounds (None)

	@method setViewSize size
	| The the view `[width,height]` in VIEW SPACE.
		assert ((size is None) or (size is? Array and len(size) >= 2))
		if size[0] != _viewSize[0] or size[1] != _viewSize[1]
			# FIXME: This should be done using the following approach. But
			# it does not work.
			# let p = project (_viewSize[0]/2, _viewSize[1]/2)
			# _viewSize = size
			# focus (p[0], p[1])
			_translation[0] += (size[0] - _viewSize[0])/2
			_translation[1] += (size[1] - _viewSize[1])/2
			_viewSize = size
			onProjectionUpdated ({x:True, y:True})
		return self

	@method clearViewSize
	| Clears the view size, resetting it to 0.
		return setViewSize [0,0]

	# =========================================================================
	# PROJECTION
	# =========================================================================

	# FIXME: Might want to deprecate that
	@method project x, y=Undefined
	| Projects `x,y` from VIEW SPACE to MAP SPACE.
		if x is? Array
			y = x[1]
			x = x[0]
		return [
			(x - _translation[0]) / _scaling
			(y - _translation[1]) / _scaling
		]

	# FIXME: Might want to deprecate that
	@method unproject x, y=Undefined
	| Projects `mx,my` from MAP SPACE to VIEW SPACE.
		if x is? Array
			y = x[1]
			x = x[0]
		return [
			x * scaling + _translation[0]
			y * scaling + _translation[1]
		]

	# FIXME: The names are confusing
	@method mapToView mapx, mapy=Undefined
	| Returns the coordinates of `(mapx, mapy)` in the untransalted
	| view.
		let v = mapx if mapx is? Array else [mapx, mapy]
		return mul (v, scaling)
	
	@method mapToViewport mapx, mapy=Undefined
	| Returns the coordinates of `(mapx,mapy)` in the translated
	| view (the viewport).
		let v = mapToView (mapx, mapy)
		return add (v, _translation)

	# =========================================================================
	# ZOOMING AND PANING
	# =========================================================================

	@method translate x, y
	| **Translates** the map *to* `(x,y)` VIEW SPACE.
		if x is? Array
			y = x[1]
			x = x[0]
		_setTranslation (x, y)
		return self

	@method getFocusTranslation mapx, mapy, center=[0.5, 0.5]
	| Returns the translation vector for the map to be 
	| positioned at [mapx,mapy] on the view's `center`.
		let p = mapToView (mapx, mapy)
		let f = mul (_viewSize, center)
		return (mul (sub(p,f), -1))

	@method focus mapx, mapy, center=[0.5, 0.5]
	| Focuses the MAP coordinates `(mapx,mapy)` so that
	| they appear on the given focus center, given in normalized
	| screen coordinates.
		_setTranslation (getFocusTranslation(mapx, mapy, center))
		return self
	
	@method getFitVector bounds, center=[0.5, 0.5]
		let l  = getBoundsIdealLevel (bounds)
		let cx = lerp(bounds[0], bounds[2], center[0])
		let cy = lerp(bounds[1], bounds[3], center[1])
		return [cx, cy, l]

	@method fit bounds, center=[0.5, 0.5]
	| Fits the given MAP coordinates bounds `(x0,y0,x1,y1)` in the
	| given view, adapting the zoom level accordingly.
		let v = getFitVector (bounds, center)
		focus (v[0], v[1])
		zoom  (v[2])
		return self

	@method zoom level, position=([_viewSize[0]/2, _viewSize[1]/2])
	| Zooms the map to the given zoom level (the scaling factor will be derived
	| from the zoom level). The SCREEN SPACE `position` is by default the view's center
	| (ie. the `viewSize` / 2).
		let l = clamp (level, options level[0], options level[1])
		let f = getScalingFactor (l)
		if f != _scaling
			# We want to make sure that the given position is going to be stable
			# after being projected. If we take the X component, we have
			# the following equation:
			#
			# px = (x - tx) / f      # px is the projected x with the current transform
			#  x = px * f' + tx'     # x  is the unprojected px with the new transform
			#
			# And we're looking to solve for tx', which gives
			#
			# x   = ((x - tx)/f)*f' + tx'
			# tx' = x - (((x - tx)/f)*f')
			let x,y   = position
			let tx,ty = translation
			let txn   = x - (((x - tx)/_scaling) * f)
			let tyn   = y - (((y - ty)/_scaling) * f)
			let change = {
				x : _translation[0] != txn
				y : _translation[1] != tyn
				z : _scaling        != f
			}
			_translation[0] = txn
			_translation[1] = tyn
			_scaling        = f
			_zoomLevel      = l
			onProjectionUpdated (change)
		return self

	# TODO: We should have a nicer zoom easing/step
	@method zoomIn position=Undefined, step=_zoomLevelStep
		return zoom (getZoomLevel () + step, position)

	@method zoomOut position=Undefined, step=_zoomLevelStep
		return zoom (Math max (0, getZoomLevel () - step), position)

	# TODO
	##@method getFocus
	##| Returns the current focus point.

	@method getZoomLevel factor=_scaling, step=_zoomBasis
	| Returns the zoom level. The zoom level is used to calculate the scaling
	| factor.
		return _zoomLevel

	@method getScalingLevel factor, step=_zoomBasis
	| Returns the zoom level for the given scaling factor.
		return Math log (factor) / Math log (_zoomBasis)

	@method getScalingFactor level=_zoomLevel, step=_zoomBasis
	| Returns the zoom factor based on the given zoom level. By default, this
	| is equivalent `step=2 ^ level`.
		return Math pow (step, level)

	@method getBoundsIdealScaling bounds, margin=[0,0,0,0]
	| Returns the ideal scaling factor (which you should then convert to
	| a zoom level using `getScalingFactor`
		# We remove the margin fromt he view
		let vw = _viewSize[0] - margin[0] - margin[2]
		let vh = _viewSize[1] - margin[1] - margin[3]
		# We return the scaling factor that will make the width
		# and height of the bouding box fit in the view
		let mw = bounds[2] - bounds[0]
		let mh = bounds[3] - bounds[1]
		return Math min (
			vw / mw
			vh / mh
		)

	@method getBoundsIdealLevel bounds, margin=[0,0,0,0]
		return getScalingLevel (getBoundsIdealScaling (bounds, margin))

	# =========================================================================
	# LAYER CREATION
	# =========================================================================

	@method createSVGLayer node
		return new SVGLayer (node)

	@method addSVGLayer node
		match node
			is? SVGLayer
				return addLayer (node)
			is? window.Node
				return addLayer (createSVGLayer (node))
			else
				return None

	@method addLayer layer
		assert (layer is? Layer)
		if layer not in _layers
			layer _setMap (self)
			_layers push (layer)
		return layer

	# =========================================================================
	# EVENTS
	# =========================================================================

	@method onProjectionUpdated change
		let s  = _scaling
		let t  = _translation
		let tx = t[0] / s
		let ty = t[1] / s
		# The scale+transform order in SVG actually means that we're NOT
		# scaling the translate (ie. translate is in SCREEN SPACE).
		_transformSVG = "scale(" + s + "," + s + ") translate ("+ tx + "," + ty + ")"
		_layers :: {_ onProjectionUpdated (change)}
		self ! "ProjectionUpdate" (change)
	
	@method update
	| Forces an update of the projection.
		onProjectionUpdated {x:True, y:True}

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _setTranslation x, y
	| Sets the absolute translation vector `(x,y)` in VIEW SPACE,
	| adjusting it so that the map boundaries are respected.
		#       <------- VW ------>
		#
		#       +-----------------+-------------------+
		#    ^  |                 |                   |  ^
		#    V  |                 |                   |  |
		#    H  |                 |                   |  |
		#    v  |                 |                   |  M
		#       +-----------------+                   |  H
		#       |                                     |  |
		#       |                                     |  |
		#       |                                     |  |
		#       |                                     |  v
		#       +-------------------------------------+
		#
		#       <-----------------MW------------------>
		#
		# VW = [V]iew [W]idth         MW = [M]ap [W]idth
		# VH = [V]iew [H]idth         MH = [M]ap [H]eight
		if x is? Array
			y = x[1]
			x = x[0]
		if _bounds
			# We temporarily project in map space to do our 
			# computation, as the bounds are expressed in map space
			var mx = x * _scaling
			var my = y * _scaling
			# If the map is BOUNDED, we want the upper-left
			# corner of the view to not go past the upper-left
			# corner of the map. Which is basically
			# We can,t translate more than the upper-left
			# corner of the map
			mx = Math min (0 - _bounds[0], mx)
			my = Math min (0 - _bounds[1], my)
			# We can't translate past the lower-right corner
			# of the map minus the screen size
			mx = Math max (0 - (_bounds[2] - _viewSize[0] * _scaling), mx)
			my = Math max (0 - (_bounds[3] - _viewSize[1] * _scaling), my)
			x  = mx / _scaling
			y  = my / _scaling
		if x != _translation[0] or y!= _translation[1]
			let change = {
				x : _translation[0] != x
				y : _translation[0] != y
			}
			_translation[0] = x
			_translation[1] = y
			onProjectionUpdated (change)

# EOF - vim: ts=4 sw=4 noet
