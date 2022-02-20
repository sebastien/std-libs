@feature sugar 2
@module std.math.geom.vector
| Implements an API to work with vectors that is compatible with the
| geometry primitives encoding (`std.math.geom.data`).
|
| Vectors specialize points, as they share the same structure, but
| have more specific operations.

@import TPoint, Point from std.math.geom.point
@import type, sprintf from std.core
@import clamp from std.math
@import error from std.errors

# NOTE: These are going to be initialized once the module is loaded
@shared O
@shared X
@shared XY
@shared Y
@shared YZ
@shared Z
@shared XYZ

# -----------------------------------------------------------------------------
#
# TVECTOR
#
# -----------------------------------------------------------------------------

@trait TVector: TPoint
| An abstract trait that defines common mutating vector operations.

	@getter w
		return x

	@getter h
		return y

	@getter d
		return z

	@getter length2
	| Returns the squared _length_ (or _magnitude_) of the vector.
	| This is the same as `dotself`
		let a = x ; let b = y ; let c = z
		return a * a + b * b + c * c

	@getter length
	| Returns the _length_ (or _magnitude_) of the vector.
		return Math sqrt (length2)

	@group Numeric

		@method dotself 
		| This is the same as `length2`
			return dot (self)

		@method dot b
		| Returns the dot product of this vector with the other one. A dot product
		| of (or near) 1 indicates that the vectors are colinear (ie. parallel),
		| while near 0 indicates that the vectors are orthogonal (ie. perpendicular).
		|
		| Aditionnally, if `1 - v∙w ` is close to 0, they point in the same direction,
		| if `1 + v∙w ` is close to 0, then they point in opposite directions. This
		| assumes that the vectors are normalized, though. In general if v∙w is > 0,
		| it means that they have the same direction.
			# SEE: https://www.mathsisfun.com/algebra/vectors-dot-product.html
			return (x * b x) + (y * b y) + (z * b z)

		@method dotunit v
		| Like dot, but normalizes the coordinates of both vectors first.
			let ax =   x ; let ay =   y ; let az =   z
			let bx = v x ; let by = v y ; let bz = c z
			let al = Math sqrt (ax * ax + ay * ay + az * az) or 1.0
			let bl = Math sqrt (bx * bx + by * by + bz * bz) or 1.0
			let nax = ax/al ; let nay = ay/al ; let naz = ay/al
			let nbx = bx/bl ; let nby = by/bl ; let nbz = by/bl
			return (nax * nbx) + (nay * nby) + (naz * nbz)

		@method angle vector, reference=None
		| Returns the angle (in radians) between this vector and the other
		| one.
		|
		| This is calculated using the dot product and lengths of both
		| vectors using `v∙w = ∥v∥∥w∥ cos 𝛉`, as well as the cross
		| product using `∥v⨯w∥ = ∥v∥∥w∥ sin 𝛉`.
			let d = dot (vector)
			let n = Math sqrt (length2 () * vector length2 ())
			let a = Math acos (clamp (d / n, -1, 1))
			# FIXME: Here the problem is that acos only covers the [0-180deg] range
			if reference
				let c  = copy () cross (vector)
				let cd = c dot (reference)
				if cd < 0
					return 0 - a
			return a

	@group Creators

		@method cross v
		| Returns a new vector that is the cross product of this vector
		| and the given one. The cross product vector is normal to the plane
		| formed by both vectors.
			let ax = x   ; let ay = y   ; let az = z
			let bx = v x ; let by = v y ; let bz = v z
			return make (
				ay * bz - az * by
				az * bx - ax * bz
				ax * by - ay * bx
			)
			return self

	@group Transforms

		@method unit
		| _Normalizes_  this vector so that its length is 1 (_unit vector_). This
		| is equivalent to `v.divide(v.length())`
			return div (length)

		@method cap maximum
		| Changes the length of this vector so that it is at most the
		| given value.
			let l = length
			if l > maximum
				return mul (maximum/length)
			else
				return self

		@method invert
		| Makes the vector point in the opposite direction, equivalent
		| to `v.multiply(-1)`
			return mul (-1)

		@method shift vector
		| Shifts this vector by the given proportion of itself. This is
		| equivalent to.
		|
		| ```
		| v.shift(-0.5) == v.add(v.copy().multiply(-0.5))
		| ```
		|
		| This can be useful if you'd like to get the position of a point
		| on the vector given an offset proportional to its length, or if you'd like
		| to generate a translation vector to center the vector on one of its point.
			let ax = x ; let ay = y ; let az = z
			x = ax + ax * vector x
			y = ay + ay * vector y
			z = az + az * vector z
			return self

	@group Rotation

		@method rotateZ theta
		| Rotation against a primitive axis. This is a simple case of 2D rotation.
			let cos_theta = Math cos (theta)
			let sin_theta = Math sin (theta)
			let ax        = x
			let ay        = y
			let nx        = ax * cos_theta - ay * sin_theta
			let ny        = ax * sin_theta + ay * cos_theta
			x             = nx
			y             = ny
			return self


	@group Projection

		@method projectPoint point
			# SEE: https://gamedev.stackexchange.com/questions/72528/how-can-i-project-a-3d-point-onto-a-3d-line#72529
			# Projecting point P onto line AB
			# SEE: https://en.wikipedia.org/wiki/Vector_projection#Vector_projection_2
			# --> A + dot(AP,AB) / dot(AB,AB) * AB

	@group Helpers

		@method repr
		| Returns a nicely formatted representation of the vector.
			return sprintf("vec(%0.2f, %0.2f, %0.2f)", x, y, z or 0)

# -----------------------------------------------------------------------------
#
# VECTOR
#
# -----------------------------------------------------------------------------

@class Vector: Point, TVector
| Default implementation of the `TVector` trait. It works fine when you don't
| have to do many operations on an vector data. If you do, you should use
| the primitives defined in `std.math.geom.data`

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function vec x=Undefined, y=Undefined, z=Undefined
| Creates a vector using the default vector implementation.
	return new Vector (x, y, z)

# -----------------------------------------------------------------------------
#
# INIT
#
# -----------------------------------------------------------------------------
# Init
O   = vec(0,0,0)
X   = vec(1,0,0)
XY  = vec(1,1,0)
Y   = vec(0,1,0)
YZ  = vec(0,1,1)
Z   = vec(0,0,1)
XYZ = vec(1,1,1)

# EOF
