@feature sugar 2
@module std.formats.svg
@import runtime.window as window
@import assert,error,warning from std.errors
@import TFlyweight from std.patterns.flyweight

@shared NS="http://www.w3.org/2000/svg"
@shared NAMESPACES = {
	svg   : "http://www.w3.org/2000/svg"
	xlink : "http://www.w3.org/1999/xlink"
	html  : "http://www.w3.org/1999/xhtml"
}

# -----------------------------------------------------------------------------
#
# PATH
#
# -----------------------------------------------------------------------------

@class Path: TFlyweight
| The path is a flyweight object that eases the creation of arbitrary
| SVG paths. The class also contains operation that make it easier to draw
| primitives and query/manipulate paths.

	@operation Donut startAngle, endAngle, radius, width, cx=radius, cy=radius
	| Creates a path data that draws a donut with the given properties. Angles
	| are in degrees. Radius is the *outer* radius, while `width` is the width
	| towards the center.
		startAngle      -= 90
		endAngle        -= 90
		var angle_delta  = Math abs (endAngle - startAngle)
		# SEE: http://stackoverflow.com/questions/5737975/circle-drawing-with-svgs-arc-path
		if angle_delta == 360
			endAngle -= 0.01
		var inner_radius = radius - width
		var sa           = Math PI * startAngle / 180.0
		var ea           = Math PI * endAngle   / 180.0
		# FIXME: We're rounding, but we should really be rounding at 0.000
		var a_x          = Math round (cx + (Math cos(sa) * radius))
		var a_y          = Math round (cy + (Math sin(sa) * radius))
		var b_x          = Math round (cx + (Math cos(ea) * radius))
		var b_y          = Math round (cy + (Math sin(ea) * radius))
		var c_x          = Math round (cx + (Math cos(ea) * inner_radius))
		var c_y          = Math round (cy + (Math sin(ea) * inner_radius))
		var d_x          = Math round (cx + (Math cos(sa) * inner_radius))
		var d_y          = Math round (cy + (Math sin(sa) * inner_radius))
		var a_span       = (((angle_delta > 180) and 1) or 0)
		inner_radius     = (inner_radius)
		radius           = (radius)
		var outer_arc    = "M" + a_x + "," + a_y + " A" + radius       + "," + radius       + " 0 " + a_span + ",1 " + b_x + "," + b_y
		var inner_arc    = "L" + c_x + "," + c_y + " A" + inner_radius + "," + inner_radius + " 0 " + a_span + ",0 " + d_x + "," + d_y
		if angle_delta == 360
			# We have to close the remaining gap to get a full circle
			outer_arc += " L" + a_x + "," + a_y
			inner_arc += " L" + c_x + "," + c_y
		if width == 0
			return outer_arc
		else
			return "M" + cx + "," + cy + outer_arc + inner_arc +" Z"

	@operation Triangle w,h
	| Creates a triangle with a base of `w` units and a height
	| of `h` units, with its center at (0,0).
		var p = Path Create ()
		var dx = w / 2
		var dy = w / 2
		p move (0, 0 -  dy)
		p move (dx,     dy)
		p move (0 - dx, dy)
		p close ()
		return p end ()

	@operation Line points
	| Returns a (poly) line from the given points `[(x,y)]` as an SVG
	| path that can be set as a `d` attribute.
		let res = []
		for p,i in points
			if i == 0
				res push "M"
			else
				res push "L"
			res push (p[0])
			res push (p[1])
		return res join " "

	@operation Length node
	| Returns the length of the given path node
		if not node
			return 0
		let name = node nodeName
		match name
			is "line"
				var x1 = parseFloat (node getAttribute "x1")
				var x2 = parseFloat (node getAttribute "x2")
				var y1 = parseFloat (node getAttribute "y1")
				var y2 = parseFloat (node getAttribute "y2")
				var dx = x2 - x1
				var dy = y2 - y1
				return Math sqrt ( (dx * dx) + (dy * dy) )
			is "path"
				return node getTotalLength () if node getTotalLength else 0
			is "polyline"
				if not node getTotalLength
					# Hello, Safari!
					# NOTE: This does not return exactly the same value
					# as getTotalLength, at least on FF
					let l = node points
					return l ::> {r=0,v,i|
						if i == 0
							return 0
						else
							let w = l[i - 1]
							let dx = v x - w x
							let dy = v y - w y
							return r + Math sqrt (dx * dx + dy * dy)
					}
				else
					return node getTotalLength ()
			else
				error ("Node should be `path`, `line` or `polyline`, got", node, __scope__)
				return Undefined

	@operation PartialStroke node, percent, reverse=False
	| Sets the node's dash-array so that only a subset of the node is drawn
		percent = percent if percent is? Array else [0, percent]
		let length        = Length (node)
		let stroke_start  = Math round (percent[0] * length)
		let stroke_end    = Math round (percent[1] * length)
		let stroke_length = stroke_end - stroke_start
		let skip_length   = length
		var stroke_offset = 0 - stroke_start
		if reverse
			stroke_offset += stroke_length - length
		node setAttribute ("stroke-dasharray" , stroke_length + " , " + skip_length)
		node setAttribute ("stroke-dashoffset", "" + stroke_offset)

	@operation PointAt node, percent, reverse=False
	| Returns the {x:float,y:float} position of the point at `percent` (from 0 to 1)
	| percent of the given path (path or line element)
		assert (node, "No given node", node)
		if percent < 0
			percent = Math abs (1.0 - percent) % 1
		if reverse
			percent = 1.0 - percent
		if node nodeName == "line"
			var x1 = parseFloat (node getAttribute "x1")
			var y1 = parseFloat (node getAttribute "y1")
			var x2 = parseFloat (node getAttribute "x2")
			var y2 = parseFloat (node getAttribute "y2")
			return {
				x : x1 + ((x2 - x1) * percent)
				y : y1 + ((y2 - y1) * percent)
			}
		else
			var offset = node getTotalLength () * percent
			return node getPointAtLength (offset)


	@property path   = []
	@property length = 0

	@method reset
		super reset ()
		path = []
		length = 0

	@method m x, y
		return move (x, y)

	@method l x, y
		return line (x, y)

	@method c x, y
		return curve (x, y)

	@method z
		return close ()

	@method move x, y
		path push "M"
		length += 1
		return _pushCoords (x,y)

	@method line x, y
		if length == 0
			path push "M"
		else
			path push " L"
		length += 1
		return _pushCoords (x,y)

	@method close
		path push " Z"
		return self

	@method curve cx1, cy1, cx2, cy2, dx, dy
		# SEE: http://www.w3.org/TR/SVG/paths.html#PathDataCurveCommands
		path push " C"
		length += 1
		if (not isDefined (cy2)) and (not isDefined (dx)) and (not isDefined (dy))
			_pushCoords (cx1)
			path push " "
			_pushCoords (cy1)
			path push " "
			return _pushCoords (cx2)
		else
			_pushCoords (cx1,cy1)
			path push " "
			_pushCoords (cx2,cy2)
			path push " "
			return _pushCoords (dx, dy)

	@method _pushCoords x, y
		if x is? Array
			path push (x[0])
			path push ","
			path push (x[1])
		else
			path push (x)
			path push ","
			path push (y)
		return self

	@method end
		var r = asString ()
		dispose ()
		return r

	@method asString
		return path join ""


# -----------------------------------------------------------------------------
#
# MARKUP
#
# -----------------------------------------------------------------------------

@function __node name:String, content
	let node = window document createElementNS (NS, name) if NS else window document createElement (name)
	content :: {__append (node, _)}
	return node

@function __append:Node node:Node, value:Any
	match value
		is? Undefined
			pass
		is? Number
			node appendChild (window document createTextNode ("" + value))
		is? String
			node appendChild (window document createTextNode (value))
		is? Array
			0..(value length) :: {__append (node, value[_])}
		is? Object and not (value jquery is? Undefined)
			0..(value length) :: {__append (node, value[_])}
		is? Object and not (value nodeType is? Undefined)
			node appendChild (value)
		else
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
				# If the value is an object, then we will handle both the
				# style and dataset specific cases
				if v is? Object
					if k == "style"
						let style = node style
						for pv, pn in v
							style [pn] = pv
					elif k == "data" and node dataset
						node dataset [k substr (5)] = v
					else
						node setAttributeNS (ns, k, v) if ns else node setAttribute (k, v)
				else
					node setAttributeNS (ns, k, v) if ns else node setAttribute (k, v)
				has_properties = True
			if not has_properties
				node appendChild (window document createTextNode("" + value))

@function a:Node content...
	return __node( "a", content )

@function altglyph:Node content...
	return __node( "altGlyph", content )

@function altglyphdef:Node content...
	return __node( "altGlyphDef", content )

@function altglyphitem:Node content...
	return __node( "altGlyphItem", content )

@function animate:Node content...
	return __node( "animate", content )

@function animatecolor:Node content...
	return __node( "animateColor", content )

@function animatemotion:Node content...
	return __node( "animateMotion", content )

@function animatetransform:Node content...
	return __node( "animateTransform", content )

@function circle:Node content...
	return __node( "circle", content )

@function clippath:Node content...
	return __node( "clipPath", content )

@function colorProfile:Node content...
	return __node( "color-profile", content )

@function cursor:Node content...
	return __node( "cursor", content )

@function defs:Node content...
	return __node( "defs", content )

@function desc:Node content...
	return __node( "desc", content )

@function ellipse:Node content...
	return __node( "ellipse", content )

@function feblend:Node content...
	return __node( "feBlend", content )

@function fecolormatrix:Node content...
	return __node( "feColorMatrix", content )

@function fecomponenttransfer:Node content...
	return __node( "feComponentTransfer", content )

@function fecomposite:Node content...
	return __node( "feComposite", content )

@function feconvolvematrix:Node content...
	return __node( "feConvolveMatrix", content )

@function fediffuselighting:Node content...
	return __node( "feDiffuseLighting", content )

@function fedisplacementmap:Node content...
	return __node( "feDisplacementMap", content )

@function fedistantlight:Node content...
	return __node( "feDistantLight", content )

@function feflood:Node content...
	return __node( "feFlood", content )

@function fefunca:Node content...
	return __node( "feFuncA", content )

@function fefuncb:Node content...
	return __node( "feFuncB", content )

@function fefuncg:Node content...
	return __node( "feFuncG", content )

@function fefuncr:Node content...
	return __node( "feFuncR", content )

@function fegaussianblur:Node content...
	return __node( "feGaussianBlur", content )

@function feimage:Node content...
	return __node( "feImage", content )

@function femerge:Node content...
	return __node( "feMerge", content )

@function femergenode:Node content...
	return __node( "feMergeNode", content )

@function femorphology:Node content...
	return __node( "feMorphology", content )

@function feoffset:Node content...
	return __node( "feOffset", content )

@function fepointlight:Node content...
	return __node( "fePointLight", content )

@function fespecularlighting:Node content...
	return __node( "feSpecularLighting", content )

@function fespotlight:Node content...
	return __node( "feSpotLight", content )

@function fetile:Node content...
	return __node( "feTile", content )

@function feturbulence:Node content...
	return __node( "feTurbulence", content )

@function filter:Node content...
	return __node( "filter", content )

@function font:Node content...
	return __node( "font", content )

@function fontFace:Node content...
	return __node( "font-face", content )

@function fontFaceFormat:Node content...
	return __node( "font-face-format", content )

@function fontFaceName:Node content...
	return __node( "font-face-name", content )

@function fontFaceSrc:Node content...
	return __node( "font-face-src", content )

@function fontFaceUri:Node content...
	return __node( "font-face-uri", content )

@function foreignobject:Node content...
	return __node( "foreignObject", content )

@function g:Node content...
	return __node( "g", content )

@function glyph:Node content...
	return __node( "glyph", content )

@function glyphref:Node content...
	return __node( "glyphRef", content )

@function hkern:Node content...
	return __node( "hkern", content )

@function image:Node content...
	return __node( "image", content )

@function line:Node content...
	return __node( "line", content )

@function lineargradient:Node content...
	return __node( "linearGradient", content )

@function marker:Node content...
	return __node( "marker", content )

@function mask:Node content...
	return __node( "mask", content )

@function metadata:Node content...
	return __node( "metadata", content )

@function missingGlyph:Node content...
	return __node( "missing-glyph", content )

@function mpath:Node content...
	return __node( "mpath", content )

@function path:Node content...
	return __node( "path", content )

@function pattern:Node content...
	return __node( "pattern", content )

@function polygon:Node content...
	return __node( "polygon", content )

@function polyline:Node content...
	return __node( "polyline", content )

@function radialgradient:Node content...
	return __node( "radialGradient", content )

@function rect:Node content...
	return __node( "rect", content )

@function script:Node content...
	return __node( "script", content )

@function set:Node content...
	return __node( "set", content )

@function stop:Node content...
	return __node( "stop", content )

@function style:Node content...
	return __node( "style", content )

@function svg:Node content...
	return __node( "svg", content )

@function _switch:Node content...
	return __node( "switch", content )

@function symbol:Node content...
	return __node( "symbol", content )

@function text:Node content...
	return __node( "text", content )

@function textpath:Node content...
	return __node( "textPath", content )

@function title:Node content...
	return __node( "title", content )

@function tref:Node content...
	return __node( "tref", content )

@function tspan:Node content...
	return __node( "tspan", content )

@function use:Node content...
	return __node( "use", content )

@function view:Node content...
	return __node( "view", content )

@function vkern:Node content...
	return __node( "vkern", content )

@function inject node, parent=window document
	if not node
		warning ("Missing SVG svg node ", __scope__)
		return None
	else
		node style display    = "none"
		node style visibility = "hidden"
		if document body
			document body appendChild (node)
		else
			warning ("Document has no body", __scope__)
		return node

# EOF
