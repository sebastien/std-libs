@feature sugar 2
@module  std.physics
@import pt from std.math.geom.point
@import vec from std.math.geom.vector

@class Particle

	@shared DEFAULT_RATE = 1s / 60

	@property p = pt  ()
	@property v = vec ()
	@property a = vec ()

	@method move dt, x=p x, y=p y, z=p z
		dt  = dt or DEFAULT_RATE
		v x = (x - p x) / dt
		v y = (y - p y) / dt
		v z = (z - p z) / dt
		p x = x
		p y = y
		p z = z
		# NOTE: We don't touch the acceleration for now
		return self

	@method update dt=0
		p x += v x * dt
		p y += v y * dt
		p z += v z * dt
		v x += a x * dt
		v y += a y * dt
		v z += a z * dt

@class Force

	@method apply point:Vector, velocity:Vector

	@method update t, dt

@class Gravity: Force

	@property strength = 50
	@property center   = pt()

	@method apply particle, dt
		let p  = particle p
		let dx = center x - p x
		let dy = center y - p y
		let dz = center z - p z
		let k  = dt * strength / Math sqrt (dx*dx + dy*dy + dz*dz)
		let v  = particle v
		# Gravity only affects the velocity
		v add (dx * k, dy * k, dz * k)


@class Friction: Force

	@property strength = 500

	@method apply p, dt
		let lv = p v length
		let la = p a length
		let kv = Math max (0, lv - strength * dt)
		let ka = Math max (0, la - strength * dt)
		# Friction reduces both velocity and acceleration
		p v div (lv) mul (kv) if lv
		p a div (la) mul (ka * ka) if la

@class Inertia: Force

# EOF
