@feature sugar 2
@module  std.math.projection
@import  sprintf from std.core
@import  abs,sin,cos,rad,TAU from std.math
@import  vec from std.math.geom.vector
@import  pt  from std.math.geom.point
@import  TUpdatable from std.patterns.updatable

# FIXME: We should have more projections in there or maybe move them
# as separate submodules with a common interface. 
# FIXME: It's not very clear how to use the Spherical class
@class Spherical: TUpdatable
| Wraps a point in a spherical coordinate point, and updates the point
| when the spherical coordinates have changed.

	@property position  = pt(0,0,1)
	@property up        = vec(0,1,0)
	@property projected = Undefined

	@operation ToCartesian theta, phi, radius=1.0, point=pt()
	| Projects (theta,phi,radius) from spherical to cartesian coordinates.
	| Note that `phi` is expected to be ∊ [-π/2,π/2]. Also, note that
	| the result is a right-handed 3D cartesian space.
		if theta is? Object
			return ToCartesian (theta x, theta y, theta z or 1.0, point)
		# This assumes Theta rotating aroud Y and Phi rotating around Z
		# phi should be restriced to [-90,+90] or [-PI/2,+PI/2]
		let rs = Math cos(phi)   * radius
		let x  = Math cos(theta) * rs
		let y  = Math sin(phi)   * radius
		let z  = Math sin(theta) * rs
		return point set (x,y,z)

	@operation FromCartesian x, y, z, point=pt()
	| Unprojects (x,y,z) from spherical to cartesian coordinates.
		if x is? Object
			return FromCartesian (x x, x y, x z, point)
		let r     = Math sqrt(x*x+y*y+z*z)
		let theta = Math atan2(z,x)
		let phi   = Math asin(y/r)
		return point set (theta, phi, r)

	@constructor projected=pt(), theta=0, phi=0, r=1
		self projected = projected
		position set (theta,phi,r)
		position !+ "Update" (doUpdate)
		inhibit ()
		doUpdate ()
		release (False)

	@method dispose
		position !- "Update" (doUpdate)
		
	@getter theta
		return position x

	@setter theta value
		position x = value

	@getter phi
		return position y

	@setter phi value
		position y = value

	@getter r
		return position z
	
	@setter r value
		position z = value

	@getter x
		return projected x

	@getter y
		return projected y

	@getter z
		return projected z

	@method set theta=Undefined, phi=Undefined, r=Undefined
	| Sets the `theta`, `phi` and `r` parameters, updating the
	| camera directly.
		inhibit ()
		if theta is not Undefined
			self theta = theta
		if phi is not Undefined
			self phi = phi
		if r is not Undefined
			self r = r
		release ()
		return self

	@method doUpdate
	| Updates the camera vectors based on the `theta`, `phi`
	| and `r` values.
		# We calculate the new position
		let t = rad(theta)
		let p = rad(phi)
		let r = Math abs(self r)
		ToCartesian (t,p,r, projected)
		# FIXME: Not sure about that
		up y  = cos(p) / abs(cos(p))
		super doUpdate ()
		return self

	@method unproject point=pt()
	| Returns the unprojected point corresponding to these coordinates.
		return pt set (x,y,z)

	@method repr
	| Returns a nicely formatted representation of the point.
		return sprintf("sph(θ %0.2f°, φ %0.2f°, %0.2f)→(%0.2f, %0.2f, %0.2f)", theta, phi, r, x, y, z or 0)

@function sphericalToCartesian theta=Undefined, phi=Undefined, r=Undefined, point=Undefined
| From spherical to cartesian
	return Spherical ToCartesian (theta,phi,r,point)

@function cartesianToSpherical x=Undefined, y=Undefined, z=Undefined, point=Undefined
| From cartesian to spherical
	return Spherical FromCartersian (x,y,z,point)
	
# EOF
