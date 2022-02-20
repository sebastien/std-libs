@feature sugar 2
@module std.patterns.registry

@trait Instance

	@operation Get
		self Instance ?= new (self) ()
		return self Instance

@class Registry

	@property all = {}

	@method add key, value
		all [key] ?= []
		all [key] push (value)
		self ! "Add"    (self, key, value)
		self ! "Update" (self, key)
		return value

	@method set key, value
		if value != all[key]
			all [key] = value
			self ! "Set"     (self, key)
			self ! "Update"  (self, key, value)
		return value

	@method get key
		return all [key]

	@method has key
		return not (all[key] is? Undefined)

	@method walk callback=Undefined
		if not callback
			let r = []
			walk {r push (_)}
			return r
		else
			for l,g in all
				for v,i in l instances
					if callback (v,i,g) is False
						return False

# EOF
