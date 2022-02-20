@feature sugar 2
@module std.math.geom.line
@import Point, TPoint   from std.math.geom.point
@import Vector, TVector from std.math.geom.vector
@import lerp            from std.math

@class Line
| Represents a line between point `A` and point `B`.

	@property a:TPoint
	@property u:TVector

	@getter b
		return o copy () add (u)

	@constructor a=Undefined, b=Undefined, u=Undefined
		return set (a, b, u)

	@method set a=Undefined, b=Undefined, u=Undefined
	| Sets this line to be
		if a is not Undefined
			self a = a
		if b is not Undefined
			# TODO: We might want to use a factory  there
			self u = Vector Create (v x - a x, v y - a y, v z - a z)
		elif u is not Undefined
			self u = u
		return self

	@group Creators

		@method orthogonal plane:TVector=Undefined
		| Returns a line that is orthogonal to the given line on the given plane,
		| which is XY by default.

		@method middle
		| Returns the point that is the middle of this line
			return at 0.5

		@method at offset=0.5
		| Returns the point at the given offset
			return Point Create (
				lerp (a x, b x, offset)
				lerp (a y, b y, offset)
				lerp (a z, b z, offset)
			)

		@method intersection line:TLine, plane:TVector=Undefined
		| Returns the point that corresponds to the 2D interaction of the
		| given line when projected onto the given plance (XY by default).

		@method project plane:TVector
		| Returns a 2D line corresponding to the projection of this line
		| on the given vector plane.

	@group Numeric

		@method slope plane:TVector=Undefined
		| Returns the slope of this line on the given vector plance (XY by default).
			return (b y - a y) / (b x - a x)


@function line a, b=Undefined, u=Undefined
	return new Line (a, b, u)

# EOF
