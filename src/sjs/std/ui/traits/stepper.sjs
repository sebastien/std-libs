@feature sugar 2
@module  std.ui.traits.stepper
@import  head, keys,index from std.collections
@import  warning  from std.errors
@import  delayed  from std.io.time
@import  animator, step, sequence, tween, Easing from std.ui.animation

@trait TStepper
| Weaving a `TStepper` in a component makes it controllable by the `step`
| cell. The `steps` property defines a simple DSL that controls what
| happens when a specific step is set.
|
| The `steps` property is mapping of `{STEP_NAME:STEP_DESCRIPTION}`, where
| the *step description* is a map with the following possible keys:
|
| - `does`: a callback that will be executed when the step is set.
|
| - `next`: the name of the next step to transition to
|
| - `duration`: the duration of this step. If it is step, then the step
|   will transition to the next step after the duration. If `next` is not
|   specified, this will default to the actual next step.

	@property network
	| The network is expected to be defined

	@property state
	| The stete is also expected to be defined

	@property steps = {}

	@property _animator           = animator ()
	| The animator used to animate step transitions.

	@property _nextStep           = Undefined
	| An internal variable to keep track of the scheduled next step.

	@property _nextStepDelayed    = delayed ({
		onStepTransition ()
	}, 0s)
	| A delayed that will wait some time before the next
	| step transition is triggered.

	@property _nextStepTransition = sequence (
		tween () from 0 to 1 during 0.25s
		step (onStepTransitionEnd)
	)
	| Stores the transition that is used to go from one step to the 
	| other.

	# =========================================================================
	# COMPONENT
	# =========================================================================

	@method bindNetwork network, render, locale
		# We define the step by default
		if not network has "step"
			network value (head(keys(steps))) as "step" does (onStep)
		# The step phase is will add `A waiting-A` and `A out-A in-B B` when transitions
		# are scheduled
		if not network has "stepPhase"
			network value "" as "stepPhase"

	# =========================================================================
	# HANDLERS & TRANSITIONS
	# =========================================================================

	@method onStep  cell=state step
	| Default handler for a change in the step. This will schedule the
	| transitions to the next step.
		# We clear any pending transition.
		_nextStepDelayed cancel ()
		_animator remove (_nextStepTransition)
		# We get the information for the next step
		let step = cell value
		let desc = steps[step]
		if not desc
			return warning ("Step '" + step + "' not defined in '" + name + "': choose one of", keys(steps), __scope__)
		if desc does
			desc does (desc, step)
		if desc duration or desc next
			# NOTE: Shouldn't we put the duration to 0.0s by default?
			state stepPhase set (step + " waiting-" + step)
			_nextStepDelayed set (desc duration or 0.25s) push ()
		else
			state stepPhase set (step)
	
	@method onStepTransition cell=state step
	| Default handler for the 
		let step = cell value
		let desc = steps[step]
		if not desc
			return warning ("Step not defined in '" + name + "' : '" + step + "' choose one of", keys(steps), __scope__)
		if desc transition
			# We update the sequence accordingly
			let t = _nextStepTransition children [0]
			t _context = desc
			let f = {v,c,t,e|desc transition does(v,c,t,e);return Undefined}
			t during (desc transition duration or 0.25s)
			t ease   (Easing get (desc transition easing or "quartic:inout"))
			t does   (f) if desc transition does
			_nextStepTransition children[1] after (t)
			# NOTE: This might interfere with other animations, so we have to 
			# be careful about that
			let next = _getNextStep (step)
			state stepPhase set (step + " out-" + step + " in-" + next)
			_animator reset () add (_nextStepTransition) start ()
		else
			state set {
				stepPhase : step
				step      : step
			}
	
	@method onStepTransitionEnd
		let step = state step value
		let next_step = _getNextStep (step)
		state stepPhase set (step)
		if next_step is not Undefined and next_step is not None
			state step set (next_step)

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _getNextStep step
	| Returns the name of the step right after the given `step`, or
	| `None` if the step has no next step, or `Undefined` if the
	| step is not found.
		var found = False
		for s,k in steps
			if found
				return k
			if k == step
				# If the step definition has a `next` field, we return it
				# otherwise we'll return the next key.
				if s and s next
					if not steps[s next]
						warning ("Successor step of '" + k + "':'" + s next + "' does not exist, pick one of", keys(steps), __scope__)
					return s next
				else
					found = True
		return None if found else Undefined

# EOF - vim: ts=4 sw=4 noet
