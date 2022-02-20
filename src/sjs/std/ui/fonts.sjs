@feature sugar 2
@module std.ui.fonts
| Provides a high-level API to manage font information including metrics.

@import assert, error, warning   from std.errors
@import strip, unquote           from std.text
@import len, sprintf, list, cmp  from std.core
@import repeat, now              from std.io.time
@import future                   from std.io.async
@import std.text.layout as layout
@import std.formats.svg as svg
@import runtime.window as window

# TODO: Font detection (could use canvas for that)
# TODO: See if we really need a more precise font measurement API

# -----------------------------------------------------------------------------
#
# FONT
#
# -----------------------------------------------------------------------------

@class Font
| An abstraction over font information that normalizes its properties.

	@shared TIMEOUT            = 15s
	@shared FONT_SIZE          = 14
	@shared LINE_HEIGHT_FACTOR = 1.30
	@shared WEIGHTS = {
		100           : "ultra-thin"
		200           : "thin"
		300           : "light"
		400           : "normal"
		500           : "medium"
		600           : "semi-bold"
		700           : "bold"
		800           : "black"
		900           : "ultra-black"
		"ultra-thin"  : 100
		"thin"        : 200
		"light"       : 300
		"normal"      : 400
		"medium"      : 500
		"semi-bold"   : 600
		"bold"        : 700
		"black"       : 800
		"ultra-black" : 900
	}

	@property _family      = "Sans"
	@property _weight      = 400
	@property _style       = Undefined
	@property _size        = FONT_SIZE
	@property _lineHeight  = Math round (FONT_SIZE * LINE_HEIGHT_FACTOR)

	@operation Ensure font
		return font match
			is? Font → font
			else     → new Font (font)

	@operation Weight value
	| Normalizes the font weight
		if parseInt (value) == value
			return Math floor (parseInt (value) / 100) * 100
		else
			return Font WEIGHTS[value] or 400

	@constructor family=Undefined, size=Undefined, weight=undefined, style=Undefined, lineHeight=Undefined
		set (family, size, weight, style, lineHeight)

	@method copy
		return new Font (family, size, weight, style, lineHeight)

	@method set family=Undefined, size=Undefined, weight=undefined, style=Undefined, lineHeight=Undefined
		# We accept Font/Objects
		if family is? Object
			if family family
				self family     = family family
			if family size
				self size       = family size
				self lineHeight = Math round (family size * LINE_HEIGHT_FACTOR)
			if family style
				self style      = family style
			if family weight
				self weight     = family weight
			if family lineHeight
				self lineHeight = family lineHeight
		elif family
			self family = family
		# And now we proceed with regular attributes
		if size is not Undefined
			self size       = size
			self lineHeight = Math round (size * LINE_HEIGHT_FACTOR)
		if weight is not Undefined
			self weight = weight
		if style is not Undefined
			self style = style
		if lineHeight is not Undefined
			self lineHeight = lineHeight
		return self

	@getter family
		return _family

	@setter family value
	| Sets the family for this font. This will parse strings like
	| `"Font Family", alternate`, keeping only the first.
		value   = strip (strip ((value or "") split "," [0]), "\"'")
		if not value
			warning ("No value given to font.family", __scope__)
		_family = value or "sans"

	@getter size
		return _size

	@setter size value
		_size = value if value is? Number else DEFAULT_FONT_SIZE
		_lineHeight = Math round (_size * LINE_HEIGHT_FACTOR)

	@getter lineHeight
		return _lineHeight

	@setter lineHeight value
		_lineHeight = value if value is? Number else (size * LINE_HEIGHT_FACTOR)

	@setter weight value
	| Normalizes the given font weight,  returning a number for it
		_weight = Weight (value)

	@getter weight
		return _weight

	@setter style value
		_style value match
			== "italic" -> value
			else        -> None

	@getter style
		return _style

	@method getCanvasName
	| Returns the Canvas API compatible name of the given font
		return weight + " " + (style + " " if style else "") + size + "px \"" + family + '"'

	@method getKey
	| Returns a string key identifying this font.
		return family + "-" + weight + "-" + style + "-" + size + "-" + lineHeight

	@method getMetrics backend=Undefined
	| Returns the font metrics for this specific font.
		return Metrics Ensure (family, size, weight, style, lineHeight, backend)

	@method getDescription
		# FIXME
		return sprintf("\"%s\" %s %0.1px/%dpx %d", family or "", style or "", size, lineHeight , weight or 400)

	@method setNodeStyle node
		if node
			node style fontFamily = family
			node style fontSize   = size + "px"
			node style fontWeight = weight
			node style fontStyle  = style or "normal"
			node style lineHeight = lineHeight + "px"
		return self

	# @method join fonts, timeout=TIMEOUT
	# | Return a future that will be set when all the fonts are loaded. Only
	# | works in Chrome/FF though.
	# 	if document fonts
	# 		fonts = fonts ::= {
	# 			return weight(_ weight) + (style(_ style) + " " if _ style else "") + " " + _ size + "px " + _ family
	# 		}
	# 		return condition {return (fonts ::? {return not document fonts check (_)}) length == 0}
	# 	else
	# 		return future (False)

	# FIXME: Disabled for now, it's not reliable
	# @method on family, size, weight, dimension, timeout=TIMEOUT, text="Lorem ipsum dolor sit amet", error=0.5
	# | Returns a #Future that will be set when the dimension of the given font match the
	# | given #dimension.
	# 	let f       = future ()
	# 	let m       = new Metrics (family, size, weight)
	# 	var started = now ()
	# 	let p = {
	# 		let d  = m measure (text)
	# 		let bw = between (d width,  dimension[0] - error, dimension[0] + error)
	# 		let bh = between (d height, dimension[1] - error, dimension[1] + error)
	# 		if bw and bh
	# 			f set (d)
	# 		elif now () - started < timeout
	# 			let t = min (max(0, timeout - (now () - started)), 100)
	# 			window setTimeout (p, t)
	# 		else
	# 			f fail ()
	# 	}
	# 	p ()
	# 	return f

# -----------------------------------------------------------------------------
#
# LOADER
#
# -----------------------------------------------------------------------------

# NOTE: There's the fonts ready, but it's not guaranteed to work properly.
# TODO: The elements should be removed
@class Loader

	@shared   DEFAULT   = "10px sans-serif"
	@property _fonts    = None
	# NOTE: We probably don't really need three canvases, but we do that
	# to avoid copying arrays. It's convenient buy should maybe be
	# refactored later on.
	@property _nodeA    = document createElement "canvas"
	@property _nodeB    = document createElement "canvas"
	@property _nodeC    = document createElement "canvas"
	@property _wrapper  = document createElement "div"
	@property _contextA = _nodeA getContext "2d"
	@property _contextB = _nodeB getContext "2d"
	@property _contextC = _nodeC getContext "2d"

	@constructor fonts=Undefined
		_nodeA width  = 100
		_nodeA height = 100
		_nodeB width  = 100
		_nodeB height = 100
		_nodeC width  = 100
		_nodeC height = 100
		_wrapper appendChild (_nodeA)
		_wrapper appendChild (_nodeB)
		_wrapper appendChild (_nodeC)
		# DEBUG: You can comment this line to see the actual rendering
		_wrapper setAttribute ("style", "visibility:hidden;width:0px;height:0px;overflow:hidden;pointer-events:none;position:absolute;")
		document body appendChild (_wrapper)
		load (fonts)

	@method dispose
		if _wrapper parentNode
			_wrapper parentNode removeChild (_wrapper)

	@method load fonts
		_fonts = list(fonts) ::= {Font Ensure (_)}
		return self

	@method join every=100ms, timeout=10s
		let f = future ()
		let s = now ()
		repeat ({
			let l = _fonts ::? { not isFontReady (_) }
			let e = now () - s
			if len(l) == 0
				f set (_fonts)
				return False
			if e > timeout
				f fail ()
				return False
		}, every)
		return f

	@method isFontReady font
		return isFontAccepted (font) and isFontLoaded (font)

	@method isFontAccepted font, context=_contextA
	| Tells if the canvas accepts this font. If not, the font is probably still
	| loading.
		context font = font getCanvasName ()
		let a   = [font weight ,font size, font family]
		let b   = CanvasBackend ParseFont (context font)
		# Safari often discards the font weight, even though it's actually
		# effective. We only compare the size and the family to work.
		return a[1] == b[1] and a[2] == b[2]

	@method isFontLoaded font
		let f = font copy ()
		# NOTE: It's super important that the CSS sets the same default font,
		# otherwise it just won't work. The best way to do this is to
		# not set a font alternative in the CSS.
		f family = "defaultFontThatDoesNotExist"
		# NOTE: So here's the trick. Safari will render these weird
		# question marks while the font is being loaded. So we need to check
		# the following conditions:
		# 1) B has at least one red pixel
		# 2) B differs from A
		# 3) B differs from C
		let a = _drawText ("Test", f getCanvasName ()                     , _nodeA, _contextA)
		let b = _drawText ("Test", font getCanvasName () + ", " + f family, _nodeB, _contextB)
		let c = _drawText ("⍰⍰⍰⍰", font getCanvasName () + ", " + f family, _nodeC, _contextC)
		return _isDifferent (a, b) and _isDifferent (b, c)

	@method _isDifferent a, b
		let l = b length
		var i = 0
		var n_different = 0
		var n_drawn     = 0
		while i < l
			# We only test the red component
			if i % 4 == 0
				if a[i] != b[i] and b[i] > 0
					n_different += 1
				if b[i] > 0
					n_drawn += 1
				# If we have at least one different pixel and one drawn
				# pixel in B, then it means that it's a different font, and
				# the font is loaded.
				if n_different > 0 and n_drawn > 0
					return True
			i += 4
		return False

	@method _drawText text, fontName, node, context
	| Clears the canvas and draw the given text. Returns the origin
	| where the text was drawn.
		let w  = node width
		let h  = node height
		let ox = 0
		let oy = w / 2.0
		context font = fontName
		context clearRect (0, 0, w, h)
		context fillStyle = "#FF0000"
		context fillText (text, ox, oy)
		# DEBUG: Uncomment this to see the different rendered steps. This
		# is useful for debugging mobile browsers (Safari) where the
		# devtools are not accessible.
		# ---
		# let n = document createElement "canvas"
		# n width = w ; n height = h
		# let ctx = n getContext "2d"
		# ctx drawImage (node, 0, 0)
		# document body appendChild (n)
		# ---
		return context getImageData (0, 0, w, h) data

# -----------------------------------------------------------------------------
#
# METRICS
#
# -----------------------------------------------------------------------------

@class Metrics
| Provides a font metrics interface with pluggable backends. A metrics
| instance is defined for a specific `(family,size,weight,style,lineHeight,backend)`
| tuple.

	@shared All          = {}

	@property _backend   = Undefined
	@property _size      = Undefined
	@property _width     = Undefined
	@property _height    = Undefined
	@property _font      = Undefined

	# =========================================================================
	# API
	# =========================================================================

	@operation Measure text, family, size, weight="normal", style=None, lineHeight=Undefined, backend=Undefined
	| Returns the metrics object that correponds to the given arguments. The same arguments will
	| return the same result.
		return Ensure (family, size, weight, style, lineHeight, backend) measure (text)

	@operation Ensure family, size, weight="normal", style=None, lineHeight=Undefined, backend=Undefined
	| Ensures that there is a metrics object defined for hthe given attributes.
		backend     = MetricsBackend Ensure (backend)
		# We normalize the arguments
		let font = new Font () set {
			family     : family
			size       : size
			weight     : weight
			style      : style
			lineHeight : lineHeight
		}
		if font lineHeight < font size
			# FIXME: Should be description
			warning ("Font has a line height smaller than its size", font getKey ())
		let key = font getKey ()
		if not All[key]
			All[key] = new Metrics (font, backend)
		return All[key]

	# =========================================================================
	# CONSTRUCTOR
	# =========================================================================

	@constructor font, backend=Undefined
		setFont (font)
		setBackend (MetricsBackend Ensure (backend))

	@getter font
		return _font

	# =========================================================================
	# PROPERTIES
	# =========================================================================

	@method setBackend backend
		if backend is _backend
			pass
		else
			if _backend
				_backend dispose ()
			_backend = backend
			if backend
				backend init ()
				backend setFont (_font)
		return self

	@method setFont font
		assert (font, "No font given to the metrics")
		_font = font
		if _backend
			_backend setFont (_font)
		return self

	# =========================================================================
	# API
	# =========================================================================

	@getter lineHeight
		return _font lineHeight

	@getter fontSize
		return _font size

	@method wrap text, width
	| Returns an array of text lines of maximum `width` pixels.
		return layout wrap (text, width, self . measureWidth)

	@method wrapDY text, width
		let lh = _font lineHeight
		return wrap (text, width) ::= {{text:_,dy:lh if _1 > 0 else 0}}

	@method wrapcut text, size
	| Returns an array of text lines of maximum `size` pixels.
		return layout wrapcut (text, size, _font lineHeight, self . measureWidth)

	@method wrapcutDY text, width
		let lh = _font lineHeight
		return wrapcut (text, width) ::= {{text:_,dy:lh if _1 > 0 else 0}}

	@method cut text, width, ellipsis="‥"
	| Returns an array of text lines of maximum `width` pixels.
		return layout cut (text, width, self . measureWidth, ellipsis)

	@method fit text, size
	| Returns a scaling factor to resize the text so that it fits
	| within the given `size`.
		return layout fit (text, size, self . measure)

	@method measure text
		return _backend measure (text)

	@method measureWidth text
		return _backend measureWidth (text)

	@method baseline base="o"
	| Returns the measurement for the basline (using the **o** letter)
		return measure (base)

# -----------------------------------------------------------------------------
#
# METRICS BACKEND
#
# -----------------------------------------------------------------------------

# TODO: We could have different ways of measuring
#
# - precise: takes longer, but
# - approximate: uses lookups from the symbols table
#
@class MetricsBackend
| The abstract interface for a metrics backend.

	@shared NAME    = "N/A"

	# A list of symbols/letters comonly found in text.
	@shared SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567890éèëê{}'\"{}()[]|,;:$%_.\\/ "

	@operation Ensure backend
		return backend match
			is? MetricsBackend → backend
			else               → new CanvasBackend ()

	@property _font = Undefined
	@property _symbolsMetrics = Undefined

	@method init
	| Called by the `Metrics` class when the backend is set.
		return self

	@method dispose
	| Called by the `Metrics` class when the backend is unset.
		pass

	@method setFont font
	| Sets the font in this backend.
		_font = font
		_symbolsMetrics = Undefined
		return self

	@method getName
		return NAME

	@method measure text
		return error (NotImplemented, __scope__)

	@method measureWidth text
		return measure (text) [0]

	@method measureHeight text
		return measure (text) [1]

	@method _updateSymbolMetrics
	| Updates the symbol metrics mapping.
		_symbolsMetrics = SYMBOLS ::= {measure (_)}
		return _symbolsMetrics

# -----------------------------------------------------------------------------
#
# CANVAS BACKEND
#
# -----------------------------------------------------------------------------

@class CanvasBackend: MetricsBackend
| Implementation of font metrics using the Canvas API.

	@shared NAME        = "canvas"
	@shared BLANK       = "#000000"
	@shared INK         = "#FF0000"

	@property _node     = Undefined
	@property _context  = Undefined

	@operation ParseFont text
	| Parses back the `context.font` and returns a `(weight ,size, family)`
	| for the given text.
		# This is where it gets a little bit hairy. In Chrome and Safari, if your
		# font is new Font ("Anonymous Pro", 40, "bold"), you might only
		# get "40px \"Anonymous Pro\" as a result. Also, in some browsers
		# bold is spelled out bold, not 400, or the other way around, hence
		# the need for parsing and normalizing that.
		let n = strip ("" + text)
		let i = n indexOf " "
		let r = [400, Undefined, Undefined]
		if i == -1
			return False
		if (n[i + 1] == '"') or (n[i + 1] == "'")
			# We're in the form of "
			let j = n indexOf (n[i + 1], i + 2)
			r[1] = parseInt(n[:i])
			r[2] = n[i+2:j]
		elif n[i + 1] == "\\"
			# The family is like \"FAMILY\"
			# NOTE: I don't think this case would actually happen, but
			# who knows.
			let j = n indexOf ("\\", i + 2)
			r[1] = parseInt(n[:i])
			r[2] = n[i+2:j-1]
		else
			let j = n indexOf (" ", i + 1)
			if j > 0
				r[0] = Font Weight (n[:i])
				r[1] = parseInt (n[i+1:j])
				r[2] = unquote (n[j+1:])
			else
				r[1] = parseInt(n[0:i])
				r[2] = unquote (n[i+1:])
		# We remove any trailing alternative font
		let k = r[2] indexOf ","
		if k > 0
			r[2] = strip(r[2][0:k])
		if r[2][0] == "\\"
			r[2] = r[2][2:-2]
		return r

	# =========================================================================
	# OVERRIDES
	# =========================================================================

	@method init
		_node    = window document createElement "canvas"
		_context = _node getContext "2d"
		return self

	@method setFont font
		super setFont (font)
		let fn          = font getCanvasName ()
		# NOTE: We need to reset the font after a resize as it's going to
		# be erased.
		_node height    = font size * 2
		_node width     = 50 * font size
		_context font   = fn
		_node style family = font family
		let an = ParseFont (_context font)
		# We need to loosen the criteria
		if an[1] != font size or an[2] != font family
			warning ("Canvas backend does not accept font `" + fn + "` converted to `" + _context font + "`", __scope__)
		# We clear the symbol metrics as they're only relevant to the
		# current font.
		_symbolsMetrics = None
		return self

	@method measure text
	| Does a precise measuring of the width and approximates the height.
		let m = _context measureText (text)
		return [m width, _font lineHeight]

	@method measureWidth text
	| Measure width is the fastest as it can call directly the API
		# NOTE: Width is pretty much the only thing supported here
		return _context measureText (text) width

	# =========================================================================
	# CANVAS SPECIFIC
	# =========================================================================
	# SEE: https://jsfiddle.net/sorryimfrench/hh41br29/3/

	@method drawText text, fontName=Undefined
	| Clears the canvas and draw the given text. Returns the origin
	| where the text was drawn.
		# We resize the canvas if necessary
		let nw = _node width
		let tw = len(text) * _font size / 2
		if tw > nw
			_node width   = tw
			_context font = fontName or _font getCanvasName ()
		# Now we clear it
		let w  = _node width
		let h  = _node height
		let ox = 0
		let oy = h / 2
		_context fillStyle = BLANK
		_context fillRect (0, 0, w, h)
		_context fillStyle = INK
		_context fillText (text, ox, oy)
		return [ox, oy]

	@method _findTextBoundingBox origin
	| Returns `[x,y,width,height]` for the given letter relative to the origin
	| where the text is drawn. This is useful when requiring an extra-precise
	| measue of the font.
		# We add the underscore to get the baseline
		var left     = _node width
		var top      = _node height
		var bottom   = 0
		var right    = 0
		var baseline = 0
		# OK, so here we get the bitmap data and look for any
		# non-0 RGB pixel. This means that there's some text
		# there. Once we have it, we count how many non-zero
		# pixel follow, and that will be our height.
		let data = context getImageData (0,0,width,height) data
		var x    = 0
		while x < width
			var t = 0
			while t < height
				var i = (x * 4) + (t * width * 4)
				if (data[i] + data[i+1] + data[i+2]) != 0
					left  = Math min (x, left)
					right = x
					break
				t += 1
			var h = 0
			while (t + h) < height
				var i = (x * 4) + ((t + h) * width * 4)
				if (data[i] + data[i+1] + data[i+2]) == 0
					break
				h += 1
			if h == 0 and ((top != height) or (bottom != 0))
				break
			if h > 0
				top    = Math min (t, top)
				bottom = Math max (t + h, top)
			x += 1
		# We return the calculated bounding.
		let res = [
			left   - origin[0]
			top    - origin[1]
			right  - left
			bottom - top
		]
		return res

# -----------------------------------------------------------------------------
#
# SVG BACKEND
#
# -----------------------------------------------------------------------------

@class SVGBackend: MetricsBackend
| A backend that uses SVG nodes to measure the text. The nodes are mounted
| in a global SVG node.

	@shared NAME = "svg"
	@shared NODE = svg svg {
		width:  0
		height: 0
		style:  "visibility:hidden;width:0px;height;0px;overflow:hidden;"
	}

	@property _node = svg text ()

	@method init
		if not NODE parentNode
			window document body appendChild (NODE)
		NODE appendChild (_node)
		return self

	@method dispose
		NODE removeChild (_node)

	@method setFont font
		super setFont (font)
		font setNodeStyle (_node)
		return self

	@method measure text
		_node textContent = text
		try
			let r = _node getBBox ()
			return [r width, r height]
		catch
			warning ("SVG node not mounted yet", __scope__)
			return [0, 0]

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function metrics family, size=Undefined, weight=Undefined, style=Undefined, backend=Undefined
| Returns a metrics instance that can return sizing informatino about the given font.
	return Metrics Ensure (family, size, weight, style, backend)

@function measure text, family, size=Undefined, weight=Undefined, style=Undefined, backend=Undefined
| Returns the measure of the given text in the given font
	return Metrics Ensure (family, size, weight, style, backend) measure (text)

@function load fonts
	fonts = list (fonts)
	let loader = new Loader (fonts)
	# DEBUG: The following line will prevent disposing the loader, use
	# it to keep the debugging information visible.
	# return loader join ()
	return loader join () then {loader dispose ()}

# EOF
