@feature sugar 2
@module std.ui.animation
| The animation module is a collection of low to high level primitives that
| support everything from intepolation to tweening and sequencing.

@import len, type, cmp, bool, copy, find   from std.core
@import  index, sorted, unique, merge, group, comparator, values from std.collections
@import lerp, scale, between         from std.math
@import now, Frame, TRunnable        from std.io.time
@import TList                        from std.patterns.tree
@import TSingleton                   from std.patterns.oo
@import assert, warning              from std.errors
@import Effects as DOMEffects        from std.api.dom
@import runtime.window as window

# -----------------------------------------------------------------------------
#
# EASING
#
# -----------------------------------------------------------------------------

@singleton Easing
| A collection of easing functions. Easing function take a `k` normalized factor
| and output the transformed `k`. See <http://easings.net/>

	@method get text
		if text is? Function
			return text
		var type,subtype = text toLowerCase () split ":"
		subtype = subtype match
			is    "in"    -> "in"
			is    "out"   -> "out"
			is    "inout" -> "inout"
			else          -> "inout"
		assert (self[type], "Easing[" + type + "] is undefined")
		assert (self[type][subtype], "Easing[" + type + "][" + subtype + "] is undefined")
		return self [type] [subtype]

	@property linear = {
		in    : {k|return k}
		out   : {k|return k}
		inout : {k|return k}
	}

	@property reverse = {
		in    : {k|return 1 - k}
		out   : {k|return 1 - k}
		inout : {k|return 1 - k}
	}

	@property quadratic = {
		in    : {k|return k * k}
		out   : {k|return k * ( 2 - k )}
		inout : {k|
			k = k * 2
			if k < 1
				return 0.5 * k * k
			else
				k -= 1
				return -0.5 * ( k * ( k - 2 ) - 1 )
		}
	}

	@property step = {
		in    : {k|return 0.0 if k <= 0.5 else 1.0}
		out   : {k|return 0.0 if k <= 0.5 else 1.0}
		inout : {k|
			return k match
				< 0.25
					0
				< 0.75
					1
				else
					0
		}
	}

	@property fade = {
		in    : {k| (Math sin (k * Math PI - (Math PI / 2)) + 1)  / 2 }
		out   : {k| k = 1.0 - k ; return 1 - ((Math sin (k * Math PI - (Math PI / 2)) + 1)  / 2) }
		inout : {k| (Math sin (k * 2 * Math PI - (Math PI / 2)) + 1)  / 2 }
	}

	@property quartic = {
		in    : {k|return k * k * k * k}
		out   : {k|
			k -= 1
			return 1 - ( k * k * k * k )
		}
		inout : {k|
			k = k * 2
			if k < 1
				return 0.5 * k * k * k * k
			else
				k -= 2
				return -0.5 * ( k * k * k * k - 2 )
		}
	}

	@property sine   = {
		in    : {k|return 0 - Math cos(k * Math PI/2) + 1}
		out   : {k|return Math  sin (k * Math PI/2)}
		inout : {k|return -0.5 * (Math cos (Math PI * k) - 1)}
	}

	@property exponential   = {
		in    : {k|
			if k == 0
				return 0
			else
				return Math pow (1024, k - 1)
		}
		out   : {k|
			if k == 1
				return 1
			else
				return 1  - Math pow (2, -10 * k)
		}
		inout : {k|
			if k == 0
				return 0
			elif k == 1
				return 1
			elif k < 0.5
				return 0.5 * Math pow (2, 10 * (k - 0.5))
			else
				# This is the symetric of the above, using
				# k = 1 - k
				return 1 - (0.5 * Math pow (2, 10 * (0.5 - k)))
		}
	}

	@property back = {
		in    : {k|
			# NOTE: Formula from: https://msdn.microsoft.com/en-gb/library/system.windows.media.animation.backease(v=vs.100).aspx?cs-save-lang=1&cs-lang=cpp#code-snippet-1
			return k*k*k - k * 0.8 * Math sin (k * Math PI)
		}
		out   : {k|
			k = 1 - k
			return 1 - (k*k*k - k * 0.8 * Math sin (k * Math PI))
		}
		inout : {k|
			# TODO:
			return k
		}
	}

	@property bounce   = {
		in    : {k|
			return 1 - self bounce out ( 1 - k )
		}
		out   : {k|
			if k < ( 1 / 2.75 )
				return 7.5625 * k * k
			elif k < ( 2 / 2.75 )
				k -= ( 1.5 / 2.75 )
				return 7.5625 * k * k + 0.75
			elif k < ( 2.5 / 2.75 )
				k -= ( 2.25 / 2.75 )
				return 7.5625 * k * k + 0.9375
			else
				k -= ( 2.625 / 2.75 )
				return 7.5625 * k * k + 0.984375
		}
		inout : {k|
			if k < 0.5
				return self bounce in ( k * 2 ) * 0.5
			else
				return self bounce out ( k * 2 - 1 ) * 0.5 + 0.5
		}
	}

	# TODO
	@property cubic   = {
		in    : {k|return k}
		out   : {k|return k}
		inout : {k|return k}
	}

	# TODO
	@property quintic   = {
		in    : {k|return k}
		out   : {k|return k}
		inout : {k|return k}
	}

	@property circular   = {
		in    : {k|return k}
		out   : {k|return k}
		inout : {k|return k}
	}

	@property elastic   = {
		in    : {k|return k}
		out   : {k|return k}
		inout : {k|return k}
	}


# -----------------------------------------------------------------------------
#
# FX
#
# -----------------------------------------------------------------------------

@singleton FX

	# =========================================================================
	# FUNCTORS
	# =========================================================================

	@method yoyo:Norm k:Number
	| Does `k % 2 ∈ [0,1] → [0,1]`, `k % 2 ∈ [0,1] → [1,0]`, effectively
	| looping an animation.
		k = k % 2
		return ((2 - k) if k > 1 else k)

	@method stagger index, total
	| Returns a factor representing the given `index` over the total. Used
	| to scale `k` based on the index of an element.
		return index / total

	# ==================================================================
	# COMBINATORS
	# =========================================================================

	@method scale:Function easing:Function, f:Number
	| Scales the given easing function by the factor `f` by doing `easing(_/f)*f`
		return {easing (_/f) * f}

# -----------------------------------------------------------------------------
#
# TIMED
#
# -----------------------------------------------------------------------------

@trait TTimed
| A timed object has a `duration` and a `delay`, which are all duals of
| `start`a and `end`. A timed object can tell you if it has `started`
| or `ended` for any point in time.

	@property _duration = 0s
	@property _delay    = 0s

	@getter starts
		return _delay

	@getter duration
		return _duration

	@getter ends
		return starts + duration

	@method getK elapsed
	| Returns the unclamped K factor
		return (elapsed - _delay) / (duration or 1)

	@method getKClamped elapsed
	| Returns the unclamped K factor
		return Math max (0, Math min (1, (elapsed - _delay) / (_duration or 1)))

	@method during duration
	| Sets the duration of
		_duration = Math max (0, duration)
		self ! "Update" ()
		return self

	@method after timed
		if timed is? TTimed
			delay (timed ends)
		else
			error ("Expecting TTimed, got:", timed, __scope__)
		return self

	@method delay delay, extra=0
	| Sets the delay (basicaly when it starts)
		_delay  = delay ends if delay is? TTimed else delay
		assert (_delay is? Number, "Delay is not a number", delay)
		_delay += extra
		self ! "Update" ()
		return self

	@method shift offset=0
	| Shifts the delay by the given @offset in ms.
		_delay += offset
		self ! "Update" ()
		return self

	@method hasStarted elapsed
	| Tells if the transition has started, which is when `elapsed >= delay`
		return elapsed >= _delay

	@method hasEnded elapsed
	| Tells if the transition is over, which is when `elapsed > delay + duration`
		return elapsed > (_delay + _duration)

# -----------------------------------------------------------------------------
#
# TEASED
#
# -----------------------------------------------------------------------------

@trait TEased
| A trait that weaves an easing function and provides accessor and setter
| method.

	@property _easing        = Undefined
	| Exponential is the one that gives the best overall results

	@getter easing
		return _easing

	@method ease easing
	| Sets the `easing(k)` function
		_easing = easing match
			is? String   → Easing get (easing)
			is? Function → easing
			else         → Easing exponential out
		return self

# -----------------------------------------------------------------------------
#
# INTERPOLATION
#
# -----------------------------------------------------------------------------

@class Interpolation: TEased
| Interpolates a `source` value to a `destination` value using an optional
| `easing` function.

	@property source       = None
	@property destination  = None
	@property _easing      = Easing exponential out

	@property interpolator = lerp
	| The interpolator, lerp by default.

	@constructor source, destination, easing=Undefined
		self source      = source
		self destination = destination
		if easing
			ease (easing)

	@method from source
	| Sets the `source` of the interpolation
		self source = source
		return self

	@method to destination
	| Sets the `destination` of the interpolation
		self destination = destination
		return self

	@method interpolate interpolator=lerp
	| Sets the `interpolate(a,b,k)` function
		self interpolator = interpolator
		return self

	@method get k
	| Computes the interpolated value for a given k where k ∈ 0‥1. The `k`
	| value is *clamped* to the input interval.
		k = Math min (1, Math max (0, k))
		# NOTE: We don't want to clamp the eased k, as it would
		# prevent spring-like effects
		let ke = _easing (k) if _easing else k
		let s = getDefault (source,      destination)
		let d = getDefault (destination, destination)
		let v = interpolator (s, d, ke)
		# DEBUG
		# console log ("Interpolation.lerp k=", k, "k'=", ke, ":", s opacity, "->", d opacity, "=", v opacity)
		return v

	@method getDefault source, destination
		if source is Undefined
			return destination or 0
		else
			return source

# -----------------------------------------------------------------------------
#
# TRANSITION
#
# -----------------------------------------------------------------------------

@class Transition: Interpolation, TTimed
| A transition is an interpolation over a specific period of time. It can
| be `start`ed and `stop`ed at will.

	# TODO:
	# A delay could be implemented as
	# duration = _delay + _duration
	#
	# and basically nothing happens while progress is
	# less than _delay / duration, and then we need to rescale
	# the progress to _duration / duration.

	@method render elapsed=0, last=Undefined
	| Renders this transition for the given `elapsed` time offset (in ms). The
	| `k` interpolation factor equals `max(0,elapsed - delay) / _duration`
		# TODO: Should detect wether the progress has changed
		let k = Math min (1, Math max (0, elapsed - _delay) / (_duration or 1))
		let v = get (k)
		# TODO: Should we send events?
		return v

	@method getK elapsed
	| Returns the non-clamped K factor for the given elapsed value
		return (elapsed - _delay) / (_duration or 1)

	@method copy
		return new (type(self)) (source, destination, _easing)

	@method reverse
	| Returns a copy of the tween where source and destination are reversed.
	| and the progress will be reversed.
		let res         = copy ()
		res source      = destination
		res destination = source
		return res

# -----------------------------------------------------------------------------
#
# TWEEN
#
# -----------------------------------------------------------------------------

# TODO: Tweens should compose one or more transitions
@class Tween: Transition
| A tween is a contextualized transition, keeping track of the last
| interpolated value and invoking an effector for each render.
|
| Tweens are basically transitions with enough information to make
| them useful in a UI context.

	@property _context:Any
	@property _effector:Any
	@property _processor:Any
	@property _lastValue = Undefined

	@method bind context
	| Binds the tween to the given context. This does not do anything
	| to the context besides assigning it.
		_context = context
		return self

	@getter lastValue
	| Returns the last interpolated value
		return _lastValue

	@method does effector
	| Convenient alias to `effector`
		return self effector (effector)

	@method effector effector
	| Sets the effector for this tween. The effector is invoked on
	| every render with the interpolated value.
		_effector = effector
		return self

	@method process processor
	| Setsh the processor function used to process the interpolated value
		_processor = processor
		return self

	@method update destination
	| Sets the new destination for this tween. This will update the `source`,
	| to the `lastValue`.
		if _lastValue is Undefined
			# It's the first time so we just set the destination
			self destination = destination
		else
			# Otherwuse the source becomes the last rendered value
			self source      = _lastValue
			self destination = destination
		return self

	@method swap
		return update (self source)

	@method render elapsed=0, last=Undefined
	| Renders the tween for the `elapsed` moment in time.
		let v = super render (elapsed)
		let k = getKClamped (elapsed) if _processor else 0
		let w = _processor(v, source , destination, k) if _processor else v
		# NOTE: Tweens are stateful transitions, they keep track
		# of their last value.
		# TODO: If possible, we should put elapsed second.
		let r  = _effector (w, _context, self, elapsed) if _effector else w
		# We don't store `w` as _lastValue, as we want the unprocessed one.
		_lastValue = v
		# We test if we need to trigger the end callback
		# TODO: Should do start as well
		let e = ends
		if elapsed >= ends and last < ends
			# TODO: Should we move this to transition?
			self ! "End" (elapsed)
		return r

	@method copy context=_context
	| Returns a copy of this tween with the given context as the new
	| context.
		let res         = new (type (self)) ()
		res _context    = context
		res _effector   = _effector
		res _processor  = _processor
		res _duration   = _duration
		res _delay      = _delay
		res _easing     = _easing
		res source      = source
		res destination = destination
		return res

# -----------------------------------------------------------------------------
#
# MOMENTS
#
# -----------------------------------------------------------------------------

@class Moments: TTimed
| A moment is a group of timed element where only the child that is active
| at rendered time is rendered. This means that *at most ONE* child will
| be rendered at any time.
|
| Moments are useful when you want to group sequences or tweens that are
| *mutually exclusive*, such as multiple changes over time to the same
| property of the same object.

	@property children = []
	@property _moments = []
	@property context  = Undefined

	@constructor elements‥
		if elements
			add (‥elements)

	@method add elements‥
		for _ in elements
			assert (_ is? TTimed)
			children push (_)
		_onChildrenUpdated ()
		return self

	@method render elapsed=self elapsed, last=Undefined
		let i = getChildIndexAt (elapsed, last)
		var t = elapsed - starts
		var to = (last or elapsed) - starts
		if i >= 0
			return children[i] render (t, to)
		else
			return None

	@method getChildIndexAt elapsed=self elapsed, last=Undefined
		var i = 0
		let n = _moments length
		var t = elapsed - starts
		while i < n
			if t < _moments[i]
				return Math max (i - 1, 0)
			elif _moments[i] == t
				return i
			i += 1
		return i - 1

	@method at elapsed=self elapsed, last=Undefined
		let i = getChildIndexAt (elapsed, last)
		return children[i]

	@method _onChildrenUpdated
		children = sorted (children, {a,b|cmp(a starts, b starts)})
		var m = []
		let b = children ::> {r,v,i|
			m push (v starts)
			if i == 0
				return [v starts, v ends]
			else
				r[0] = Math min (v starts, r[0])
				r[1] = Math max (v ends  , r[1])
				return r
		}
		_duration = b[1]
		_moments  = m
		return self


# -----------------------------------------------------------------------------
#
# STEP
#
# -----------------------------------------------------------------------------

@class Step: TTimed
| Steps are one-shot events that can trigger a side effect. They're useful
| for resetting properties.

	@property _duration = 0
	@property _action   = None

	@method does action
		_action = action
		return self

	@method render elapsed=0, last=Undefined
	| Here it's super important to have `elapsed` and `last`, as there's
	| very little chance that an event is going to actually be triggered
	| if the render doesn't happen at that exact moment.
		# If we have a last step it must be different from the _delay
		# or we're going to execute the step twice.
		if (last is Undefined or last < _delay) and elapsed >= _delay
			if _action
				_action ()

# -----------------------------------------------------------------------------
#
# SEQUENCE
#
# -----------------------------------------------------------------------------

@class Sequence: TList, TTimed
| A sequence wraps a set of timed elements and organizes them relatively
| to the sequence's start. Sequences are basically like groups of timed
| elements.
|
| Note that a sequence is stateless and will render all of its children in
| the order in which they are registered. The children will be sorted
| by ascending start order so as to minimize overlap.
|
| The advantage is that you'll always get a consistent state when rendering,
| the disadvantage is that you're going to apply more operations than
| actually necessary.

	@property _isAdding = False
	@property isComposite = True

	@constructor children‥
		super ()
		self !+ Add    (self._updateBounds)
		self !+ Remove (self._updateBounds)
		if len(children) > 0
			add (‥children)

	# =========================================================================
	# CHILDREN
	# =========================================================================

	@method add children‥
	| Adds the given children so that each child is delayed after the other.
	| If a child is an array, then they will be executed in parallel.
	|
	| ```
	| add(a,b)     # A and then B
	|              # |--- A -------->|
	|              #                 |--- B -------->|
	| add([a,b])   # A and B at the same time
	|              # |--- A -------->|
	|              # |--- B -------->|
		var offset = 0
		_isAdding = True
		for child,i in children
			if child is? Array
				for c in child
					assert (c is? TTimed)
					if i > 0
						c delay (offset)
					offset = Math max (offset, c ends)
					addChild (c)
			else
				assert (child is? TTimed)
				if i > 0
					child delay (offset)
				offset = Math max (offset, child ends)
				addChild (child)
		_isAdding = False
		_updateBounds ()
		return self

	@method push child, delay=0
		let e = ends + delay
		_isAdding = True
		if child is? Array
			child :: {_ delay (e);addChild(_)}
		else
			child delay (e)
			addChild (child)
		_isAdding = False
		_updateBounds ()
		return self


	@method addChild value
	| We make sure to update the end when we re-add a child.
		if hasChild (value)
			_updateBounds ()
		else
			super addChild (value)
		return value

	# =========================================================================
	# API
	# =========================================================================

	@method shift offset=0
	| Shifts the sequence by the given @offset in ms.
		children :: {_ shift (_)}
		_updateBounds ()
		return self

	@method copy
	| Returns a copy of this sequence
		let s = new Sequence ()
		s _isAdding = True
		children :: {s addChild (_)}
		s _isAdding = False
		s _updateBounds ()
		return s

	@method reverse
	| Returns a copy of this sequence that plays in reverse.
		let res = copy ()
		let d   = duration
		let se  = [starts, ends]
		let es  = [ends,   starts]
		res children = children ::= {
			let c  = _ reverse ()
			let cs = scale (c ends,   se, es)
			let ce = scale (c starts, se, es)
			c delay  (cs)
			c during (ce - cs)
			return c
		}
		res _updateBounds ()
		return res

	# =========================================================================
	# RENDERING
	# =========================================================================

	# TODO: Add a partial render that prunes any child that is out of the
	# boundaries.
	@method render elapsed=self elapsed, last=Undefined
	| Renders the children in this sequence after easing the elapsed time, this
	| returns the mapping of the children to their rendering output, flattening
	| sequences.
		var t   = elapsed - starts
		let to = (last or elapsed) - starts
		let res =  children ::> {r,e,i|
			r = r or []
			let v = e render (t, to)
			if v
				if e isComposite
					r = r concat (v)
				else
					r push (v)
			return r
		}
		return res

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method onChildUpdated
		_updateBounds ()

	@method _updateBounds
	| Updates the moment the sequence should end.
		if _isAdding
			return self
		_duration = children ::> {r=0,v|Math max (r,v ends)}
		# We sort the children by start order so that we minimize overlap.
		children = sorted (children, {a,b|cmp(a starts, b starts)})
		self ! "Update" ()
		return self

# -----------------------------------------------------------------------------
#
# TIMELINE
#
# -----------------------------------------------------------------------------

@class Timeline: TTimed
| A timeline groups a set of interpolations by target and target property, allowing
| for the computation of the state of all the targets and their interpolated
| properties at any point in time.

	@shared TIMESTAMP   = 0
	@shared TARGET      = 1
	@shared STATE       = 2
	@shared EASING      = 3
	@shared DURATION    = 4

	@property _sequence = Undefined
	@property _context:Any
	@property _effector:Any
	@property isComposite = True

	@operation Parse description
	| The description is a structure like this:
	|
	| ```
	| [
	|    [<TIMESTAMP>, <TARGET>, {<PROPERTY>:<VALUE>}, <EASING>?, <DURATION>?]
	|    ‥
	| ]
	| ```
		# A step is
		# TIMESTAMP[0]    TARGET[1]     STATE[2]       DURATION[3]?
		let steps     = sorted(description, {a,b|cmp(a[TIMESTAMP], b[TIMESTAMP])})
		let max_t     = steps[-1][TIMESTAMP]
		# NOTE: The by_target is a key intermediate result. If you have
		# trouble creating a timeline, it will be useful to output
		# the value of `by_target`.
		let targets   = unique (steps ::= {_[1]})
		let by_target = group (steps, {find(targets, _[TARGET])}) ::= ExtractTimeline
		let res     = new Sequence ()
		# We iterate on all the targets
		for properties, i in by_target
			# We iterate on all the properties of this target.
			for steps, name in properties
				let m = new Moments ()
				m context = targets[parseInt(i)]
				var prev = Undefined
				# If there is just one step, we ducplicate it, so that
				# we have one transition.
				if steps length == 1
					steps push (steps [0])
				for step, j in steps
					if j > 0
						let t = new Transition ()
						# We set the FROM and TO state of the transition
						t from (prev[STATE]) to (step[STATE])
						# The transition duration is the elapsed time between
						# the previous step and the current step
						# FIXME: What about duration?
						t during ((step[TIMESTAMP] - prev[TIMESTAMP]) or 0)
						# The delay is the offset of the previous step
						t delay  (prev[TIMESTAMP] or 0)
						if step[EASING]
							t ease (step[EASING])
						# We add the TRANSITION to the MOMENT
						m add (t)
					prev = step
				# We add the MOMENT to the SEQUENCE
				res add (m)
		# We return all the SEQUENCES (one per TARGET x PROPERTY)
		return res

	@operation ExtractTimeline steps, origin=Undefined
	| Takes a list of steps all related to the the same target and decomposes
	| them by property.
	|
	| This returns a {<PROPERTY>:[STEP,…]} map where the steps are all
	| in ascending chronological order.
		let state = {}
		for step in steps
			let t = step[TIMESTAMP]
			# We break down each property in the tweened state
			for value, name in step[STATE]
				state[name] ?= {}
				let s = state[name]
				if s[t]
					warning ("Duplicate time entry for state property", name, "of", origin, "at", t, __scope__)
				s[t] = [t, step[TARGET], {(name):value}, step[EASING], step[DURATION]]
		return state ::= {sorted(values(_), comparator {_[TIMESTAMP]})}

	@constructor steps
		_sequence = Parse(steps)

	@getter duration
		return _sequence duration

	@getter starts
		return _sequence _delay

	@method during duration
	| Sets the duration of
		_sequence during (duration)
		return self

	@method delay delay, extra=0
	| Sets the delay (basicaly when it starts)
		_sequence delay (delay, extra)
		return self

	@method shift offset=0
	| Shifts the delay by the given @offset in ms.
		_sequence shift (delay, extra)
		return self

	@method bind context
	| Binds the timeline to the given context. This does not do anything
	| to the context besides assigning it.
		_context = context
		return self

	@method effector effector
	| Sets the effector for this timeline. The effector is invoked on
	| every render with the interpolated value.
		_effector = effector
		return self

	@method render elapsed=0
	| Renders timeline for the `elapsed` moment in time. This returns
	| a structure like `[{target,state:{<PROPERTY>:<VALUE>}}]` representing
	| the rendering of the timeline's elements the specific elapsed moment.
	|
	| If there is an effector, the returned value will be the one returned
	| by the effector itself.
		let v  = _sequence render (elapsed)
		# The values `v` are mapped for each MOMENT of the sequence. Each
		# moment is a sequence of TRANSITION for a single PROPERTY of
		# a TARGET (node). The TARGET is stored in the MOMENT's context.
		let w = v ::= {value,i|
			var c = _sequence children[i] context
			c = _context[c] if _context else c
			return [c, value]
		}
		# The effector is meant to either render `{STYLE:VALUE}` or
		# `[CONTEXT, {STYLE:VALUE}]`
		let r = _effector (w, _context) if _effector else w
		return r


# -----------------------------------------------------------------------------
#
# ANIMATOR
#
# -----------------------------------------------------------------------------

# TODO: It should be specified that animators are not meant to play backwards,
# in the sense that the children can be removed once ended.
# FIXME: It should not be a sequence at all
@class Animator: TRunnable, TTimed, TList, TEased
| An animator is a hierarchy of animators and `render`-able objects

	@property _beat           = Frame
	@property _effector       = DOMEffects Render
	@property _lastRenderTime = -1
	@property _loopCount      = 0
	@property isSelfCleaning  = True

	@constructor effector=DOMEffects Render
		super ()
		self _effector = effector
		# NOTE: We don't update the bound on Add/Remove

	# =========================================================================
	# CHILDREN
	# =========================================================================

	@method add element, delay=Undefined
	| Adds an element to the animator. If @delay is given then
	| it will be applied to the element (@delay accepts a function
	| that takes `(elapsed, children length)`). Otherwise, the delay
	| will be set to the current @elapsed if the animator is running.
		assert (element, "No element given to animator", element, __scope__)
		match delay
			is? Function
				element delay (delay (elapsed, children length))
			is? Number
				element delay (delay)
		if not hasChild (element)
			addChild (element)
		_updateBounds ()
		return self

	@method remove element
		assert (element, "No element given to animator", element, __scope__)
		removeChild (element)
		_updateBounds ()
		return self

	@method schedule element, delay=0
	| Reschedules the given element to be played at the given delay relative
	| to the animator's current elapsed.
	|
	| Note that this *returns the animator, not the scheduled element*.
		add (element, elapsed + delay)
		return self

	@method push element, delay=0
	| Scehdules the given element at the end of the previous elements.
		return add (element, end + delay)

	# =========================================================================
	# API
	# =========================================================================

	@method restart
	| Restarts the animator
		reset ()
		return start ()

	@method loop count=-1
		_loopCount     = count
		isSelfCleaning = False
		return self

	@method clean elapsed=self elapsed
	| Removes all the children that have ended at the current elapsed value.
		children = children ::? {not _ hasEnded (elapsed)}
		_updateBounds ()
		return self
	
	@method clear
		children = []
		_updateBounds ()
		return self

	@method setSelfCleaning value
		isSelfCleaning = bool (value)
		return self

	@method stateless
		return setSelfCleaning (False)

	@method stateful
		return setSelfCleaning (True)

	# =========================================================================
	# RUNNABLE
	# =========================================================================

	@method _start
		if _beat
			_beat bind (self . onBeat)

	@method _stop
		if _beat
			_beat unbind (self . onBeat)

	@method onBeat
	| When we receveive a beat, we calculate the elasped and stop the beat
	| once elapsed >= ends.
		let e = elapsed
		render (e)
		# If the animator is self cleaning, it's going to stop once there's
		# no more children.
		if (isSelfCleaning and children length == 0) or (e >= ends)
			if _loopCount == 0
				stop ()
			elif _loopCount > 0
				_loopCount -= 1
				reset ()
			else
				reset ()

	# =========================================================================
	# RENDER
	# =========================================================================

	@method render elapsed=self elapsed
	| Renders the animator, using the at the eased `elapsed` value.
		# FIXME: This type of rendering is different from the sequence. In
		# that case, the animator removes the children once they're finished,
		# while a sequence can be played back no problem.
		var res = Undefined
		let eased_elapsed = _easing (elapsed) if _easing else elapsed
		if isSelfCleaning
			res = []
			children = children ::> {r=[],e,i|
				if e starts > eased_elapsed
					# The child element does not start yet, so we push
					# it for later
					r push (e)
				else
					# We make sure we render the very last value.
					let v = e render (eased_elapsed, _lastRenderTime)
					let w = _effector (v) if _effector else v
					if w
						res push (w)
					if e ends > eased_elapsed
						# If it has not ended yet, we keep it
						r push (e)
				return r
			}
		else
			res = children ::> {r=[],e|
				let v = e render (eased_elapsed, _lastRenderTime)
				let w = _effector (v) if _effector else v
				if w
					r push (w)
			}
		self ! "Render" (eased_elapsed, _lastRenderTime)
		_lastRenderTime = elapsed
		return res

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _updateBounds
	| Updates the moment the start and end bounds of the animator.
		var s = 0
		var e = 0
		for _, i in children
			if i == 0
				s = _ starts
				e = _ ends
			else
				s = Math min(s, _ starts)
				e = Math max(e, _ ends)
		_delay    = s
		_duration = e - s
		return self

	@method reset
		super reset ()
		_lastRenderTime = -1
		return self

# -----------------------------------------------------------------------------
#
# FACTORY
#
# -----------------------------------------------------------------------------

@class Factory: TSingleton

	@shared EFFECTOR        = {value,context|DOMEffects Style (context, value)}
	@shared EFFECTOR_LIST   = {return _ ::= {DOMEffects Style (_[0], _[1])}}
	@shared EFFECTOR_RENDER = DOMEffects . Render

	@property _effector       = EFFECTOR
	@property _effectorList   = EFFECTOR_LIST
	@property _effectorRender = EFFECTOR_RENDER

	@method animator
		return new Animator (_effectorRender)

	@method tween scope, source=Undefined, destination=Undefined, duration=Undefined, easing=Undefined
		let t = new Tween ()
		t bind     (scope)
		t effector (_effector)
		t from     (source)      if source      is not Undefined
		t to       (destination) if destination is not Undefined
		t during   (duration)    if duration    is not Undefined
		t ease     (easing)      if easing      is not Undefined
		return t

	@method timeline steps
		let t = new Timeline (steps)
		t effector (_effectorList)
		return t

	@method render values
		return _effectorRender (values)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function render v
	return Factory Get () render (v)

@function animator children...
	let a =  Factory Get () animator ()
	children :: {a add (_)}
	return a

@function timeline description
	return Factory Get () timeline (description)

@function step action=Undefined
	return new Step () does (action)

@function sequence children‥
	return new Sequence (‥children)

@function tween scope, source=Undefined, destination=Undefined, duration=Undefined, easing=Undefined
	return Factory Get () tween (scope, source, destination, duration, easing)

@function moments children‥
	return new Moments (‥children)

@function run children‥
	let a = animator ()
	children :: {a add (_)}
	return a start ()

@function loop children‥
	let a = animator ()
	children :: {a add (_)}
	a loop ()
	return a start ()

# EOF
