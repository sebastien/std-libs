@feature sugar 2
@module std.math.geom.point
| Implements an API to work with points that is compatible with the
| geometry primitives encoding (`std.math.geom.data`)

@import TFlyweight from std.patterns.flyweight
@import TUpdatable from std.patterns.updatable
@import type, sprintf from std.core
@import clamp, round as math_round, lerp as math_lerp from std.math
@import error from std.errors

# -----------------------------------------------------------------------------
#
# TPOINT
#
# -----------------------------------------------------------------------------

@trait TPoint
| An abstract trait that defines common mutating point operations.

	@property x
	@property y
	@property z

	@getter w
		# We don't support setting w yet
		return 1.0

	@getter xy
		return [x, y]

	@getter xz
		return [x, z]

	@getter yz
		return [y, z]

	@getter xyz
		return [x, y, z]

	@getter xyzw
		return [x, y, z, w]

	# FIXME: This should be abstract, or it's going to override the base class
	# @method copy
	# 	error (NotImplemented, __scope__)

	@method set x=Undefined, y=Undefined, z=Undefined
		inhibit ()
		match x
			is? Array
				let l = x length
				if l >= 1
					self x = x [0]
				if l >= 2
					self y = x [1]
				if l >= 3
					self z = x [2]
			is? Object
				self x = x x
				self y = x y
				self z = x z
			else
				if x is not Undefined
					self x = x
				if y is not Undefined
					self y = y
				if z is not Undefined
					self z = z
		release ()
		return self

	@group Operators

		@method lerp a, b, k
		| Linerarly interpolates between `a` and `b` using the `k` factor,
		| which can actually also be a point.
			inhibit ()
			if k is? Number
				x = math_lerp (a x, b x, k)
				y = math_lerp (a y, b y, k)
				z = math_lerp (a z, b z, k)
			else
				x = math_lerp (a x, b x, k x)
				y = math_lerp (a y, b y, k y)
				z = math_lerp (a z, b z, k z)
			release ()
			return self

		@method add ax, ay=Undefined, az=Undefined
			inhibit ()
			if ax is? Number
				ay ?= ax
				az ?= ay
				x = x + ax
				y = y + ay
				z = z + az
			else
				let a = ax
				x = x + a x
				y = y + a y
				z = z + a z
			release ()
			return self

		@method sub ax, ay=Undefined, az=Undefined
			inhibit ()
			if ax is? Number
				ay ?= ax
				az ?= ay
				x = x - ax
				y = y - ay
				z = z - az
			else
				let a = ax
				x = x - a x
				y = y - a y
				z = z - a z
			release ()
			return self

		@method mul  ax, ay=Undefined, az=Undefined
			inhibit ()
			if ax is? Number
				ay ?= ax
				az ?= ay
				x = x * ax
				y = y * ay
				z = z * az
			else
				let a = ax
				x = x * a x
				y = y * a y
				z = z * a z
			release ()
			return self

		@method div  ax, ay=Undefined, az=Undefined
			inhibit ()
			if ax is? Number
				ay ?= ax
				az ?= ay
				x = x / (ax or 1.0)
				y = y / (ay or 1.0)
				z = z / (az or 1.0)
			else
				let a = ax
				x = x / (a x or 1.0)
				y = y / (a y or 1.0)
				z = z / (a z or 1.0)
			release ()
			return self

		@method min  ax, ay=Undefined, az=Undefined
			inhibit ()
			if ax is? Number
				ay ?= ax
				az ?= ay
				x = Math min (x, ax)
				y = Math min (y, ay)
				z = Math min (z, az)
			else
				let a = ax
				x = Math min (x, a x)
				y = Math min (y, a y)
				z = Math min (z, a z)
			release ()
			return self

		@method max  ax, ay=Undefined, az=Undefined
			inhibit ()
			if ax is? Number
				ay ?= ax
				az ?= ay
				x = Math max (x, ax)
				y = Math max (y, ay)
				z = Math max (z, az)
			else
				let a = ax
				x = Math max (x, a x)
				y = Math max (y, a y)
				z = Math max (z, a z)
			release ()
			return self

		@method clamp min:TPoint, max:TPoint
		| Clamps this point with the given `min` and `max` points.
			if not min and not max
				return self
			min ?= self
			max ?= min
			inhibit ()
			x = Math min (Math max (x, min x), max x)
			y = Math min (Math max (y, min y), max y)
			z = Math min (Math max (z, min z), max z)
			release ()
			return self

		@method centroid points
			return average (points)

		@method average points
		| Updates this points's coordinates so that it is the average of the
		| given points.
			let n = points length or 1
			var nx = 0
			var ny = 0
			var nz = 0
			for v in points
				nx += v x
				ny += v y
				nz += v z
			inhibit ()
			x = nx / n
			y = ny / n
			z = nz / n
			release ()
			return self

	@group Matrices

		@method matmul m
		| Multiplies this vector by the given matrix. Sizes 9, 12, and 16 are
		| supported.
			let v0 = x
			let v1 = y 
			let v2 = z 
			let v3 = w
			match m length
				is 16
					# NOTE: I think this matrix is in column-major
					# FROM: https://github.com/greggman/twgl.js/blob/master/src/m4.js
					let d  =  v0 * m[0 * 4 + 3] + v1 * m[1 * 4 + 3] + v2 * m[2 * 4 + 3] + m[3 * 4 + 3]
					inhibit ()
					self x = (v0 * m[0 * 4 + 0] + v1 * m[1 * 4 + 0] + v2 * m[2 * 4 + 0] + m[3 * 4 + 0]) / d
					self y = (v0 * m[0 * 4 + 1] + v1 * m[1 * 4 + 1] + v2 * m[2 * 4 + 1] + m[3 * 4 + 1]) / d
					self z = (v0 * m[0 * 4 + 2] + v1 * m[1 * 4 + 2] + v2 * m[2 * 4 + 2] + m[3 * 4 + 2]) / d
					release ()
				else
					error ("Unsupported matrix size", m length, "expecting 9, 12, or 16")
			return self

	@group Numeric

		@method dist2 v
		| The square distance is `dx*dx + dy*dy + dz*dz` where `d{x,y,z}` is `b.{x,y,z}-a.{x,y,z}`.
		| You probably want to use `distance` instead, but `distancesq` is here /sd
			let dx = x - v x if v else x
			let dy = y - v y if v else y
			let dz = z - v z if v else z
			return dx * dx + dy * dy + dz * dz

		@method dist v
		| Distance is `sqrt(dx*dx + dy*dy + dz*dz)` where `d{x,y,z}` is `b.{x,y,z}-a.{x,y,z}`.
			return Math sqrt (dist2 (v))

	@group Transforms

		@method abs
			inhibit ()
			x = Math abs (x)
			y = Math abs (y)
			z = Math abs (z)
			release ()
			return self

		@method round roundBy=Undefined, bound=Undefined
			inhibit ()
			x = math_round (x, roundBy, bound)
			y = math_round (y, roundBy, bound)
			z = math_round (z, roundBy, bound)
			release ()
			return self

	@group State

		@method zero
			return clear ()

		@method clear
			inhibit ()
			x = 0
			y = 0
			x = 0
			release ()
			return self

		@method make x, y, z
			return new (type (self)) (x, y, z)

	@group Update

		@method inhibit
			return self

		@method release
			return self

	@group Helpers

		@method hasChanged x, y, z
			if self x != x or self y != y or self z != z
				return True
			else
				return False

		@method repr
		| Returns a nicely formatted representation of the point.
			return sprintf("pt(%0.2f, %0.2f, %0.2f)", x, y, z or 0)

# -----------------------------------------------------------------------------
#
# POINT
#
# -----------------------------------------------------------------------------

# FIXME: The order seems a bit off here, it should be the other way around.
# If I don't then; pt() ; pt.inhibit() ; console.log(pt.isInhibited," == 0")

@class Point: TFlyweight, TUpdatable, TPoint
| Default implementation of the `TPoint` trait. It works fine when you don't
| have to do many operations on an point data. If you do, you should use
| the primitives defined in `std.math.geom.data`

	@property _x = 0
	@property _y = 0
	@property _z = 0

	@constructor x=Undefined, y=Undefined, z=Undefined
		init (x, y, z)

	@getter x
		return _x 

	@getter y
		return _y

	@getter z
		return _z

	@setter x value
		if value != _x
			let v = _x
			_x = value
			doUpdate ()

	@setter y value
		if value != _y
			let v = _y
			_y = value
			doUpdate ()

	@setter z value
		if value != _z
			let v = _z
			_z = value
			doUpdate ()

	@method init x=Undefined, y=Undefined, z=Undefined
		if x is? Array
			return init (x[0], x[1], x[2])
		elif x is? Object
			return init (x x, x y, x z)
		else
			inhibit ()
			self x = x or 0
			self y = y or 0
			self z = z or 0
			release ()
		return self

	@method copy
		return new (type(self)) (x,y,z)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function pt x=Undefined, y=Undefined, z=Undefined
| Creates a point using the default point implementation, this supports
| `x=[x,y,z]`, `x={x,y,z}` and `x=x,y=y,z=z`.
	return new Point (x, y, z)

# EOF
