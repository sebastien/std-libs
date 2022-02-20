@feature sugar 2
@module std.math.geom.bounds
@import TFlyweight from std.patterns.flyweight
@import type, sprintf from std.core
@import clamp, overlaps from std.math
@import error from std.errors
@import pt, TPoint from std.math.geom.point

# -----------------------------------------------------------------------------
#
# TBOUNDS
#
# -----------------------------------------------------------------------------

@trait TBounds
| An abstract trait that defines common operations and accessors for bounds.

	@property p0
	@property p1

	@getter isBounds
		return True

	@getter x0
		return p0 x

	@setter x0 value
		p0 x = value

	@getter y0
		return p0 y

	@setter y0 value
		p0 y = value

	@getter z0
		return p0 z

	@setter z0 value
		p0 z = value

	@getter x1
		return p1 x

	@setter x1 value
		p1 x = value

	@getter y1
		return p1 y

	@setter y1 value
		p1 y = value

	@getter z1
		return p1 z

	@setter z1 value
		p1 z = value
	
	@getter width
		return x1 - x0

	@setter width value
		p1 x = p0 x + value

	@getter height
		return y1 - y0

	@setter height value
		p1 y = p0 y + value

	@getter depth
		return z1 - z0

	@setter depth value
		p1 z = p0 z + value

	@method moveBy x=0, y=0, z=0
		p0 add (x, y, z)
		p1 add (x, y, z)
		return self
	
	@method moveTo x=x0, y=y0, z=z0
		let w = width
		let h = height
		let d = depth
		p0 set (x, y, z)
		p1 set (x + w, y + h, z + d)
		return self

	@method resize width=Undefined, height=Undefined, depth=Undefined
		if width is not Undefined
			p1 x = p0 x + width
		if height is not Undefined
			p1 y = p0 y + height
		if depth is not Undefined
			p1 z = p0 z + depth
		return self
	
	@method intersects bounds
		# Collision needs to happen on ALL axes.
		return overlaps(x0,x1,bounds x0, bounds x1) and overlaps(y0,y1,bounds y0,bounds y1) and overlaps(z0,z1,bounds z0,bounds z1)

	@method expand x=Undefined, y=Undefined, z=Undefined
		if x is not Undefined
			p0 x = Math min (x, p0 x)
			p1 x = Math max (x, p1 x)
		if y is not Undefined
			p0 y = Math min (y, p0 y)
			p1 y = Math max (y, p1 y)
		if z is not Undefined
			p0 z = Math min (z, p0 z)
			p1 z = Math max (z, p1 z)
			

	@method repr
	| Returns a nicely formatted representation of the point.
		return sprintf("bounds(%0.2f, %0.2f, %0.2f → %0.2f, %0.2f, %0.2f | %0.2f×%0.2f)", x0 or 0, y0 or 0, z0 or 0, x1 or 0, y1 or 0, z1 or 0, width or 0, height or 0)

# -----------------------------------------------------------------------------
#
# BOUNDS
#
# -----------------------------------------------------------------------------

@class Bounds: TFlyweight, TBounds
| A concrete implementation of bounds that uses `std.math.geom.point.Point` as
| the defualt point implementation.

	@property p0=Undefined
	@property p1=Undefined

	@constructor p0, p1
		init (p0, p1)

	@method init p0=Undefined, p1=Undefined
		self p0 = p0 if p0 is? TPoint else pt(p0)
		self p1 = p1 if p1 is? TPoint else pt(p1)
		return self

	@method copy
		return new (type(self)) (p0 copy (), p1 copy ())

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function bd p0=Undefined, p1=Undefined
	return new Bounds (p0, p1)

# EOF 
