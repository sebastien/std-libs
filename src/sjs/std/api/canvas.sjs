@feature sugar 2
@module  std.api.canvas
| Defines a scene graph to manage canvas-rendered objects. The rendered
| object support mouse and touch events proxied through the `Surface` class.
| Event handling is implemented using an hit buffer inspired from 3D picking
| techniques.
|
| Each object within the scene is expected to define a custom `render(main,hit)` function
| that updates the `main` and `hit` canvases with the corresponding shaped.
|
| For now, canvas rendering is a full-pass rendered: each frame needs  to be
| be fuly renderered.

@import TLeaf, TNode  from std.patterns.tree
@import now, repeat   from std.io.time
@import future        from std.io.async
@import Metrics, Font from std.ui.fonts
@import len,bool      from std.core
@import TOptions      from std.patterns.options
@import Traversal     from std.util.traversal
@import press, handle, position, Drag from  std.ui.interaction
@import assert, error, BadArgument, NotImplemented  from std.errors
@import rad from std.math
@import runtime.window as window

# FIXME: Lose std.ui.fonts dependency
# TODO: Fonts should be pre-declared in the canvas to be preloaded and
# stored for fast access.
# SEE: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Drawing_shapes

@shared DRAG = new Drag {threshold:0}

# TODO: Coor should always be the last argument for high-performance
# -----------------------------------------------------------------------------
#
# CANVAS
#
# -----------------------------------------------------------------------------

@class Canvas
| Provides an abstraction over the Canvas API

	@shared   FONTS            = {}
	@shared   FONTS_NODE       = window document createElement "div"

	@property node
	@property context
	# TODO: Refactor to size
	# FIXME: Rework to be a Font
	@property size             = [0,0]
	@property fontFamily       = "sans"
	@property fontSize         = 14
	@property fontWeight       = "normal"
	@property fontStyle        = None
	@property fontMetrics      = Metrics Ensure (fontFamily, fontSize, fontWeight, fontStyle)
	@property lineHeightFactor = 1.45
	@property strokeWidth      = 1.0
	@property clearColor       = None
	@property _isHitCanvas     = False
	| A flag that can be set to indicate that this canvas is really meant to be a hit canvas.
	@property _fonts           = {}
	@property _patterns        = {}

	@operation PreloadFont key, fontMetrics
	| Preloads a font so that it is available (at some later point) in Canvas
	| by adding styled hidden nodes to the DOM tree.
		if not FONTS[key]
			# NOTE: We might want to add the font loader instead
			font ?= key
			let n = window document createElement "span"
			n textContent = key
			n style fontFamily = fontMetrics family
			n style fontSize   = fontMetrics size
			n style fontWeight = fontMetrics weight
			n style fontStyle  = fontMetrics style
			FONTS_NODE appendChild (n)
			FONTS[key] = n

	@constructor canvas=None
		if canvas is? String
			let name = canvas
			canvas = window document getElementById (canvas)
			assert (canvas, "Canonot find canvas element", name)
		if not canvas
			canvas = window document createElement "canvas"
		node = canvas
		if not (canvas is? window.Node)
			error (BadArgument, "canvas", canvas, [TNode], __scope__)
		elif not (canvas getContext)
			error ("Canvas node does not define `getContext` method", __scope__)
		context = canvas getContext "2d"
		size[0] = canvas width
		size[1] = canvas height
		if not FONTS_NODE parentNode
			FONTS_NODE style display = "none"
			window document body appendChild (FONTS_NODE)

	@getter isHitCanvas
		return _isHitCanvas
	
	@setter isHitCanvas value 
		value = bool(value)
		context imageSmoothingEnabled = not value
		_isHitCanvas = value

	@getter width
		return size[0]
	
	@setter width value
		size[0] = value

	@getter height
		return size[1]

	@setter height value
		size[1] = value
	
	@method asHitCanvas
	| Sets this canvas to be a hit canvas, which disables smoothing and 
	| sets the `isHitCanvas` flag.
		isHitCanvas = True
		return self

	@method fonts fontList
	| Declares the given fonts as `{family,weight,size}` to be used by this
	| renderer, returning the quick-access keys to be used with the @font
	| directive.
	|
	| It's important to declare your fonts before using them as it will
	| make sure they are preloaded while also giving you a faster access.
		match fontList
			is? Array
				let c = context font
				let r = fontList ::= {
					let ff = _ family or fontFamily
					let fw = _ weight or fontWeight
					let fs = _ size   or fontSize
					let fv = _ style  or ""
					let fm = Metrics Ensure (ff, fs, fw, fv)
					context font = fm getCanvasName ()
					if context font indexOf (fm family) == -1
						error ("Invalid font", _,"=`" + fc + "` gets normalized to `" +  context font + "`", __scope__)
						return None
					else
						_fonts[fc] = fm
						PreloadFont (fc, fm)
						return r
				}
				context font = c
				return r
			_
				return fonts([fontList])[0]
			else
				return None

	@method pattern name, value=Undefined
		if value is Undefined
			return _patterns[name]
		else
			if value complete
				_patterns[name] = context createPattern (value, "repeat")
			else
				value addEventListener ("load", {pattern (name, value)})
			return self

	# TODO: Gradients should be recreated on resize
	@method gradient startColor, endColor, angle=90
		# TODO: Support angle
		let g = context createLinearGradient (0,0, 0,height)
		g addColorStop (0, startColor)
		g addColorStop (1, endColor)
		return g

	@method resize width, height
		var changed = False
		if width is? Array
			height = width[1]
			width  = width[0]
		# NOTE: We don't set the DOM attribute, but the JavaScript
		# object property directly.
		if width != self width
			node width = width
			self width = width
			changed    = True
		if height != self height
			node height = height
			self height = height
			changed    = True
		return changed

	@method fit node=Undefined
		if node is Undefined and self node
			node = self node parentNode
		if node
			let b = node getBoundingClientRect ()
			return resize (b width, b height)
		else
			return False

	@method autofit node=Undefined
		fit (node)
		window addEventListener ("resize", {fit (node)})

	@getter ratio
		return width / (height or 1)

	@method clear color=clearColor
		if color
			context rect (0, 0, width, height)
			let f = context fillStyle
			context fillStyle = color
			context fill ()
			context fillStyle = f
		else
			context clearRect(0, 0, width, height)
		clearColor = color
		# NOTE: It's important to clear the path, as otherwise we're going
		# to have artifacts on the next iteration.
		context beginPath ()
		return self

	@method clipRect x,y,w,h
		context save      ()
		context beginPath ()
		context rect      (x,y,w,h)
		context clip      ()

	@method unclip
		context restore ()

	@method font size=fontSize, family=fontFamily, weight=fontWeight
	| Sets the font to be used for further text renderings.
		if _fonts[size]
			size = _fonts[size]
		if size is? Object
			# The font was already defined
			let f        = size
			fontSize     = f size   or fontSize
			fontWeight   = f weight or fontWeight
			fontFamily   = f family or fontFamily
			_updateFontMetrics()
		elif (size != fontSize) or (family != fontFamily) or (weight != fontWeight)
			fontSize     = size
			fontWeight   = weight
			fontFamily   = family
			_updateFontMetrics()
		return self

	@method _updateFontMetrics
	| Updates the font metrics, including the context's font name.
		fontMetrics = Metrics Ensure (fontFamily, fontSize, fontWeight, fontStyle)
		context font = getExpectedFontString ()
		return self

	@method getExpectedFontString
	| Returns the expected font string as defined by the font metrics.
		return fontMetrics font getCanvasName ()
	
	@method getActualFontString
	| Returns the actual font string as defined in the canvas's 2d context.
		return context font
	
	@method isFontAvailable:Bool
	| Tells if the current font is available to the canvas
		# NOTE: Browsers normalize the Canvas font name in many different
		# ways. Firefox will always convert weight to a number and will
		# quote the font name. Chrome sometimes keep the string font weight
		# and does not always quote the font name. As a result, we revert
		# to looking for the family name in the font string.
		return getActualFontString () indexOf (fontMetrics font family) >= 0
	
	@method whenFontAvailable:Future frequency=100ms
	| Returns a future that is set w
		let f = future ()
		repeat ({
			context font = getExpectedFontString ()
			if isFontAvailable ()
				f set (True)
				return False
		}, frequency)
		return f

	@method disc color, x, y, r
		context beginPath()
		context arc (x,y,r,0,2 * Math PI)
		if color is not Undefined
			context fillStyle = color
		context fill ()

	@method diamond color, x, y, r
		context beginPath()
		if color is not Undefined
			context strokeStyle = color
		context : 
			beginPath ()
			moveTo   (x    , y - r)
			lineTo   (x + r, y    )
			lineTo   (x    , y + r)
			lineTo   (x - r, y)
			closePath  ()
			stroke ()
		return self

	@method circle color, x, y, r, w=Undefined
		if x is? Array
			w = r
			r = y
			y = x[1]
			x = x[0]
		context beginPath()
		context arc (x,y,r,0,2 * Math PI)
		stroke (color, w)

	@method arc x, y, r, start=0, end=360
		context arc (x,y,r,rad(start),rad(end))
		return self

	@method rect color, x0,y0, x1,y1
		if x0 is? Array
			y1 = y0[1]
			x1 = y0[0]
			y0 = x0[1]
			x0 = x0[0]
		if color is not Undefined
			context fillStyle = color
		context fillRect  (x0, y0, x1 - x0, y1 - y0)

	@method roundrect color, p0, p1, nw=0, ne=0, se=0, sw=0
		context fillStyle = color
		roundrectP (p0, p1, nw, ne, se, sw)
		context fill ()

	@method stroke color=Undefined, width=1
		if color
			context strokeStyle = color
		if width
			context lineWidth = width
		context stroke ()
		context beginPath ()

	@method fill color=Undefined
		if color
			context fillStyle = color
		context fill ()

	@method roundrectP p0, p1, nw, ne, se, sw
		# FROM <http://stackoverflow.com/questions/1255512/how-to-draw-a-rounded-rectangle-on-html-canvas#3368118>
		let x,y = p0
		let w   = p1[0] - x
		let h   = p1[1] - y
		context beginPath        ()
		context moveTo           (x + nw        , y)
		context lineTo           (x + w - ne    , y)
		context quadraticCurveTo (x + w         , y       , x + w      , y + ne)
		context lineTo           (x + w         , y + h - se)
		context quadraticCurveTo (x + w         , y + h   , x + w - se , y + h)
		context lineTo           (x + sw        , y + h)
		context quadraticCurveTo (x             , y + h, x, y + h - sw)
		context lineTo           (x             , y + nw)
		context quadraticCurveTo (x             , y      , x + nw, y)
		context closePath        ()

	@method moveP  x, y=Undefined, width=strokeWidth
		if x is? Array
			y = x[1]
			x = x[0]
			width = y or 0.0
		let w = width / 2
		context beginPath ()
		context moveTo (x + w , y + w)

	@method lineP  x, y=Undefined, width=strokeWidth
		if x is? Array
			y = x[1]
			x = x[0]
			width = y or 0.0
		let w = width / 2
		context lineTo (x + w, y + w)

	@method dot color, position, radius=3
		context beginPath ()
		context arc (position[0], position[1], radius, 0, 2 * Math.PI, False)
		context fillStyle = color
		context fill ()

	@method grid color, origin, spacing
		let xmin = 0
		let xmax = width
		let ymin = 0
		let ymax = height
		let xd   = origin[0] % spacing[0]
		let yd   = origin[1] % spacing[1]
		var x    = xd
		var y    = yd
		while x < xmax
			line (color, [x, 0], [x, ymax])
			x += spacing[0]
		while y < ymax
			line (color, [0, y], [xmax, y])
			y += spacing[1]

	@method line color, p0, p1, width=strokeWidth
		context strokeStyle = color
		context lineWidth = width
		context beginPath ()
		let w = width / 2
		context moveTo  (p0[0] + w, p0[1] + w)
		context lineTo  (p1[0] + w, p1[1] + w)
		context stroke  ()
		return self

	@method strokewidth width=strokeWidth
		context lineWidth = width
		strokeWidth = width
		return self

	@method poly color, points...
		context strokeStyle = color
		context beginPath ()
		if len (points) == 1 and points is? Array and points[0] is? Array
			points = points[0]
		let w = context lineWidth / 2
		for p,i in points
			p = points[p] if p is? Number else p
			if i == 0
				context moveTo  (p[0] + w, p[1] + w)
			else
				context lineTo  (p[0] + w, p[1] + w)
		context stroke ()
		return self
	
	@method image image, x, y
		context drawImage (image, x, y)
		return self

	@method text color, text, p, anchor=Undefined
		var w = None
		if anchor and (anchor[0] !=0 or anchor[1] != 0)
			# FIXME: Good lord
			# http://stackoverflow.com/questions/1134586/how-can-you-find-the-height-of-text-on-an-html-canvas#9847841
			#let m = fontMetrics measure (text)
			# let h = m height
			let h = fontSize * lineHeightFactor
			w     = context measureText (text) width
			# NOTE: Text origin is the lower-left corner
			p     = [
				p[0] - (anchor[0] * w)
				p[1] + ((1.0 - anchor[1]) * h)
			]
		else
			w = context measureText (text) width
		if color
			context fillStyle = color
		context fillText (text, p[0], p[1])
		return w

	@method pixel x, y=Undefined
	| Returns the pixel value at `(x,y)`.
		if x is? Array
			y = x[1]
			x = x[0]
		return context getImageData (x,y,1,1) data

# -----------------------------------------------------------------------------
#
# SCENE
#
# -----------------------------------------------------------------------------

@class Scene: TNode

	@property canvas:Canvas
	@property hit:Canvas
	@property index        = []
	@property _indexDirty  = False
	@property _renderDirty = False
	@property _bounds      = [0, 0, 0, 0]
	@property _traversal   = Traversal Get ()

	@constructor canvasNode, hitNode
		super ()
		canvas  = canvas if canvasNode is? Canvas else new Canvas (canvasNode)
		if not hitNode
			hitNode = window document createElement "canvas"
			hitNode setAttribute ("width",  canvasNode getAttribute "width")
			hitNode setAttribute ("height", canvasNode getAttribute "height")
			hitNode style display = "none"
			if canvas parentNode
				canvasNode parentNode insertBefore (hitNode, canvasNode)
				canvasNode parentNode insertBefore (canvasNode, hitNode)
		# We don't want smoothing on the hit canvas
		hit     = new Canvas (hitNode) asHitCanvas ()
		# We make sure the canvases are resized and the bounds are measured
		measure ()

	@group Events

		@method bindEvents
			window   addEventListener ("resize", self . onResize)
			window document addEventListener ("ready",  self . onReady)

		@method unbindEvents
			window   removeEventListener ("resize", self . onResize)
			window document removeEventListener ("ready",  self . onReady)

	@group Accessors

		@getter bounds
			return _bounds

		@getter width
			return canvas width if canvas else 0

		@getter height
			return canvas height if canvas else 0

		@getter size
			return  [width, height]

	@method reindex
		_indexDirty = True

	@method _reindex
		let res = []
		walk {element|
			# FIXME: We should filter out non-interactives, but subtype
			# does not work yet
			if True or element is? TInteractive
				element id = res length
				res push (element)
		}
		_indexDirty = False
		index       = res
		return res

	@method update force=False, deferred=True
		if force or not _renderDirty
			_renderDirty = True
			# if deferred
			# 	window requestAnimationFrame (self . render)
			# else
			render (force)

	@method render force=False
		if _indexDirty or force
			if _indexDirty
				_reindex ()
		if _renderDirty or force
			_renderDirty = False
			canvas clear ()
			hit    clear ()
			walk {
				_ render (canvas, hit, self)
			}
			return True
		else
			return False

	@method walk callback
		return _traversal walk (self, callback)

	@method resize width, height
	| Resizes the canvases of this scene.
		if _bounds[2] != width or _bounds[3] != height
			canvas resize (width, height)
			hit    resize (width, height)
			_bounds[2] = width
			_bounds[3] = height
			measure ()
			update  ()
		return self

	@method measure
		let r = canvas node getBoundingClientRect ()
		let y = Math max (window document body scrollTop  or 0, window document documentElement scrollTop  or 0)
		let x = Math max (window document body scrollLeft or 0, window document documentElement scrollLeft or 0)
		_bounds = [
			r left + x
			r top  + y
			r width
			r height
		]
		return self

# -----------------------------------------------------------------------------
#
# SURFACE
#
# -----------------------------------------------------------------------------

@class Surface: TOptions
| The canvas *surface* acts as a proxy to DOM events, forwarding them to
| corresponding @TInteractive elements.

	@shared OPTIONS = {
		press : True
		drag  : True
	}

	@property scene   = None
	@property focused = None
	@property dragged = None
	@property cache   = {}

	@constructor scene:Scene
		self scene = scene
		_bind ()

	@method _bind
		scene canvas node addEventListener ("mousemove", {
			let f = get (_)
			if focused and focused != f
				focused ! "Blur" ()
				scene   ! "Blur" (focused)
			if f and focused != f
				f     ! "Focus" ()
				scene ! "Focus" (f)
			f     ! "Move" (_)
			scene ! "Move" (_)
			focused = f
		})
		# TODO: We use a zero-threshold drag here
		DRAG  bind (scene canvas node)
		press bind (scene canvas node)
		# NOTE: The Press/Drag* events will both be sent to the
		# event handler and to teh scene
		handle (scene canvas node, {
			Press     : {
				if options press
					let p = project ([_ detail original x, _ detail original y])
					let pressed = get (p)
					pressed ! "Press" (p)
					scene   ! "Press" (p)
			}
			DragStart : {
				if options drag
					let p = project (_ detail origin)
					cache dragOrigin = p
					dragged = get (p)
					dragged ! "DragStart" (p)
					scene   ! "DragStart" (p)
			}
			Drag      : {
				if options drag
					let p = project (_ detail position)
					_ detail localPosition = p
					dragged ! "Drag" (p, cache dragOrigin)
					scene   ! "Drag" (p, cache dragOrigin)
			}
			DragStop   : {
				if options drag
					let p = project (_ detail position)
					dragged ! "DragStop" (p, cache dragOrigin)
					scene   ! "DragStop" (p, cache dragOrigin)
					dragged = None
			}

		})

	@method get p
		let i = hit (p)
		if i >= 0
			return scene index[i]
		else
			return None

	@method hit p
	| Returns the hit color for the point at position (p)
		var x = 0
		var y = 0
		if not p
			return None
		if not (p is? Array)
			# FIXME: Should use project
			p = position (p)
			x  = p[0] - scene bounds[0]
			y  = p[1] - scene bounds[1]
		else
			x = p[0]
			y = p[1]
		let h = scene hit pixel (x, y)
		if h[3] == 255
			# We filter out pixels not at 100% opacity
			let i = h[0] * 255 * 255 + h[1] * 255 + h[2]
			return i
		else
			return -1

	@method project p
		if not (p is? Array)
			p = position (p)
		let x  = Math floor (p[0] - scene bounds[0])
		let y  = Math floor (p[1] - scene bounds[1])
		return [x, y]

# -----------------------------------------------------------------------------
#
# INTERACTIVE
#
# -----------------------------------------------------------------------------

@trait TInteractive
| And interactive canvas element has a unique per-scene identifier and
| can react to ev

	@property _hitColor
	@property id

	@getter hitColor
	| Returns the hit color for the given element, as a canvas-ready
	| string.
		if not _hitColor
			_hitColor = hitcolor (id)
		return _hitColor

# -----------------------------------------------------------------------------
#
# SCENE ELEMENT
#
# -----------------------------------------------------------------------------

@class SceneElement
| The base class for a renderable canvas element

	@property _scene = None

	@method render canvas, hit, context
		error (NotImplemented, __scope__)

	@method update
		if scene != self
			scene update ()

	@getter scene
		if _scene is None
			_scene = self getRoot ()
		return _scene

# -----------------------------------------------------------------------------
#
# LEAF
#
# -----------------------------------------------------------------------------

@class SceneLeaf: SceneElement, TLeaf
| A canvas element that has no children

# -----------------------------------------------------------------------------
#
# NODE
#
# -----------------------------------------------------------------------------

@class SceneNode: SceneElement, TNode
| A canvas element that may have children

	@constructor
		self !+ Add    {element|scene reindex ()}
		self !+ Remove {element|scene reindex ()}


# -----------------------------------------------------------------------------
#
# HIGH LEVEL
#
# -----------------------------------------------------------------------------

@function hitcolor id
| Returns the hit color for a given nubmerical id.
	let r = Math floor (id / (255 * 255)) ; id -= r * (255 * 255)
	let g = Math floor (id / 255)         ; id -= g * 255
	let b = id
	return "rgb(" + r + "," + g  + "," + b + ")"

@function colorhit pixel
| The inverse function fo `hitcolor`
	return (pixel[0] * 255 * 255 + pixel[1] * 255 + pixel[2]) if pixel[3] > 0 else -1

@function canvas width, height, scope
	let c = new Canvas (scope) 
	c resize (width, height)
	return c

# EOF
