@feature sugar 2
@module  std.ui.interaction.inertia
@import pt from std.math.geom.point
@import vec from std.math.geom.vector
@import logn from std.math
@import Frame,now from std.io.time
@import TFlyweight from std.patterns.flyweight
@import Particle, Friction from std.physics

# TODO: This utility class should probably be moved out
@class Samples
	
	@property samples   = []

	@method sample value
		let t = now ()
		if samples length > 100
			flush (t)
		samples push {t,value}
		return self

	@method flush duration, t=now()
		var i = 0
		let n = samples length
		while i < n and (t - samples[i] t) > duration
			i += 1
		if i >= 0
			samples = samples [i:]
		return samples length > 0

@class Inertia: Particle, TFlyweight

	@shared EPSILON = 0.1

	@property friction  = new Friction ()
	@property isRunning = True
	@property _samples  = new Samples ()
	@property magnitude = 5.0
	@property maximum   = 500

	@method init x=0, y=0, z=0
		p  set (x, y, z)
		v zero ()
		return self

	@method reset
		init(0,0,0)
		return self

	@method sample x=0, y=0, z=0
		_samples sample {x,y,z}
		p set (x,y,z)
		return self

	@method release callback
		# NOTE: That's av ery basic way to calculate the velocity. The main
		# problem is that only the oldest and newest values contribute. We should
		# probably see how the values evolve, ie. study the variations.
		if _samples flush (0.5s)
			let o = _samples samples[0]  value
			let p = _samples samples[-1] value
			# We can increase the magnitude of the velocity by
			# the magnitude factor.
			v set (p x - o x, p y - o y, p z - o z) mul (magnitude) cap (maximum)
		else
			v set (0,0,0)
		if callback
			animate (callback)
		return self
	
	@method animate callback=Undefined
		isRunning = True
		Frame until {t,dt|
			if isRunning
				dt = dt / 1s
				p x += v x * dt
				p y += v y * dt
				p z += v z * dt
				callback (self) if callback
				friction apply (self, dt)
			if v length < EPSILON or not isRunning
				return False
		}
	
	@method stop
		isRunning = False
		return self

# EOF - vim: ts=4 sw=4 noet
