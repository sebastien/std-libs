@feature  sugar 2
@module   std.ui.color
| Defines primitives to manipulate, parse and format colors.
|
| Here are a few useful links related to color:
|
| - [Color space converter](http://rgb.to)
| - [Adobe's Color Wheel](https://color.adobe.com/create/color-wheel/)
|   to study color pairs.
| - [Color Brewer](https://bl.ocks.org/mbostock/5577023), a set of
|   perceptual shades.
| - [Name that color](http://chir.ag/projects/name-that-color), an
|   attempt at finding the nearest named color.

@import lerp from std.math

#@type  RGBA  = (r:Float, g:Float, b:Float, a:Float)

@class Color
| Color objects wrap an `(r,g,b,a)` normalized 4D vector and
| offer a set of useful operations to manipulate it.

	@operation Gradient model
	| Interpolates the given color model, which is an array of
	| `[step, [R, G, B, A?]]`, where step is in increasing order.
	|
	| For instance:
	|
	| >    interpolate [ [0, [255,255,255]], [3, [0,0,0]]]
	|
	|
	| Will create a gradient of 4 colors from white to black.
		var values = [{isKey:True, color:model[0][1]}]
		model ::> {a,b|
			var interpolation_steps = (b[0] - a[0])
			var interpolation_step  = 1 / interpolation_steps
			var i = 0
			if interpolation_steps > 0
				while i < interpolation_steps
					var t = interpolation_step * i
					if i > 0
						values push {
							isKey : False
							color : lerp (a[1], b[1], t)
						}
					i += 1
			values push {isKey:True, color:b[1]}
			return b
		}
		return values

	@operation FromHSL h, s, l
	| Returns the `[r,g,b]` triple for the given `h,s,l` triple
		# SEE: https://raw.githubusercontent.com/bgrins/TinyColor/master/tinycolor.js
		if isList (h)
			l = h[2] ; s = h[1] ; h = h[0]
		h = h / 360
		s = s / 100
		l = l / 100
		var r = l ; var g = l ; var b = l
		if s != 0
			var q = 0
			if  l < 0.5
				q = l * (1 + s)
			else
				q = l + s - (l * s)
			var p = 2 * l - q
			r = Hue (p, q, h + 1/3)
			g = Hue (p, q, h)
			b = Hue (p, q, h - 1/3)
		return [r * 255, g * 255, b * 255]

	@operation Hue p, q, t
		if t < 0
			t += 1
		if t > 1
			t -= 1
		if   t < 1/6
			return p + (q - p) * 6 * t
		elif t < 1/2
			return q
		elif t < 2/3
			return p + (q - p) * (2/3 - t) * 6
		else
			return p

	@operation FromHex value
	| Returns the `rgb` triple from the given hex value
		if not value
			return None
		if value[0] == "#"
			value = value[1:]
		var r = value[0:2] ; r = parseInt (r, 16)
		var g = value[2:4] ; g = parseInt (g, 16)
		var b = value[4:6] ; b = parseInt (b, 16)
		return [r, g, b]

	@operation FromRGB r, g, b
		return [r, g, b]

	@operation Pad text, length=2, pad="0"
		while text length < length
			text = pad + text
		return text

	@operation ToHex value
	| Returns the hex value from the given `rgb` triple
		var res = "#" + Pad (parseInt (value[0]) toString 16, 2)
		res    +=       Pad (parseInt (value[1]) toString 16, 2)
		res    +=       Pad (parseInt (value[2]) toString 16, 2)
		res     = res toUpperCase ()
		return res

	@operation ToHSL r, g, b
	| Returns the HSL value from the given `rgb` triple. HSL
	| is scaled to `[255,100,100]`
		# SEE: https://github.com/bgrins/TinyColor/blob/master/tinycolor.js
		if r is? List
			b = r[2] ; g = r[1] ; r = r[0]
		r = r / 255
		g = g / 255
		b = b / 255
		var max = Math max (Math max (r, g), b)
		var min = Math min (Math min (r, g), b)
		var h   = (max + min) / 2
		var s   = h
		var l   = h
		if max == min
			h = 0 ; s = 0
		else
			var d = max - min
			if l > 0.5
				s = d / (2 - max - min)
			else
				s = d / (max + min)
			if   max == r
				h = (g - b) / d
				if g < b
					h += 6
			elif max == g
				h = ((b - r) / d) + 2
			elif max == b
				h = ((r - g) / d) + 4
			h = h / 6
		return [parseInt(h * 360), s * 100, l * 100]

	@property value = None

	@constructor value=[0,0,0]
		self value = value

	@method fromHex value
		self value = FromHex (value)

	@method toHex
		return ToHex (value)

# -----------------------------------------------------------------------------
#
# FUNCTIONS
#
# -----------------------------------------------------------------------------

@function fromHex:Color text:String
| Returns a color {3,4}-uple based on the given hex RGB(A) representation
| of the color.
	return Color FromHex (text)

@function hex:String c:Color
| Returns the RGB(A) hex representation of the given `(r,g,b,a?)` tuple
| of the color.
	return Color ToHex (c)

@function gradient g
| Syntax sugar for @Color.Gradient, returns an array of offsets
| and colors.
	return Color Gradient (g)

# EOF - vim: ts=4 sw=4 noet

