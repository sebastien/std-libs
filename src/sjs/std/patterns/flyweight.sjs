@feature sugar 2
@module std.patterns.flyweight
@import typename, list, len from std.core
@import assert from std.errors

# -----------------------------------------------------------------------------
#
# POOL
#
# -----------------------------------------------------------------------------

@class Pool

	@property values    = None
	@property capacity  = 512
	@property prealloc  = 0

	@constructor capacity=Undefined
		if capacity is? Number
			self capacity = capacity
		clear ()

	@method clear
		values    =  0..prealloc ::= {create()} or []
		return self

	@method produce
		if values length > 0
			return values pop ()
		else
			return create ()

	@method create
		return None

	@method dispose value:Any
		if value is? TFlyweight
			value reset ()
		values push (value)
		return self

# -----------------------------------------------------------------------------
#
# FLYWEIGHT
#
# -----------------------------------------------------------------------------

@trait TFlyweight

	@shared POOL

	@operation Map values, creator, existing=None, updater=Undefined, remover=Undefined
	| Generates an array with the same number of elements as `values`
	| initialized with `creator(index, values, result)` when the do not already exist.
	| This ensures that existing flyweights are re-used.
		assert ( (not values) or (values is? Array), "Array expected, got:", values)
		let e = list(existing or [])
		let n = len (values)
		# If there are existing elements and an updater function, we trigger it.
		if updater and e length > 0
			let j = Math min (n, e length)
			var i = 0
			while i < j
				updater (e[i], i, values, existing)
				i += 1
		# We remove excess elements
		while e length > n
			let d = e pop () dispose (e)
			if remover
				remover (d)
		# We we create new elements
		while e length < n
			e push (creator (e length, values, e))
		return e

	@operation Create args...
		if not POOL
			POOL = new Pool (self)
		let r = POOL produce ()
		if r
			r init (...args)
			return r
		else
			# We expect the constructor to do the same as init
			return new self (...args)

	@constructor
		init apply (self, arguments)

	@method init
		pass

	@method reset

	@method dispose
		reset ()
		POOL dispose (self) if POOL
		return self

# EOF
