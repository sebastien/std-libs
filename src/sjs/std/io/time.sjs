@feature sugar 2
@module std.io.time
@import bool, len from std.core
@import NotImplemented, error from std.errors
@import runtime.window as window

# NOTE: Safari mobile does not have window.performance
# TODO: Include t,dt,t0 for periodic/repeat
# TODO: Periodic should probably use setInterval

@shared HAS_PERFORMANCE = bool(window performance)
@enum   Status = NEW | RUNNING | STOPPED

# -----------------------------------------------------------------------------
#
# RUNNABLE
#
# -----------------------------------------------------------------------------

@trait TRunnable
| A runnable object is an object that supports start/stop and keeps
| track of the elapsed time, which corresponds to the total amount
| of time the runnable was running.

	@property _started = Undefined
	@property _stopped = Undefined
	@property _offset  = 0
	@property _status  = NEW

	@event    Start
	@event    Stop

	@setter status value
	| Sets wether the runnable is `NEW`, `RUNNING` or `STOPPED`
		if self _status != value
			match value
				is RUNNING
					self ! Start (True)
				is STOPPED
					self ! Stop (False)
			self _status = value
		return self

	@getter status
	| Tells wether the runnable is `NEW`, `RUNNING` or `STOPPED`
		return self _status

	@getter elapsed
	| Returns the elapsed time, which takes into account the moments
	| where the runnable was stopped.
		match status
			is NEW
				return 0
			is RUNNING
				return _started match
					is Undefined → 0
					else         → now () - _started - _offset
			else
				return _stopped - _started - _offset

	@getter isRunning
		return self _status is RUNNING

	@method reset
		_started = now ()
		_stopped = _started
		_offset  = 0
		return self

	@method start value=True
	| Starts the runnable if it is not already started.
		if not value
			return stop ()
		match status
			is NEW
				_started = now ()
				status   = RUNNING
				_start ()
			is STOPPED
				# The offset is the total amount of time the runnable
				# was stopped, so we need to substract this from the
				# any delta.
				if _stopped
					_offset += now () - _stopped
				_stopped = Undefined
				status   = RUNNING
				_start ()
		return self

	@method stop
	| Starts the runnable if it is running.
		match status
			is RUNNING
				status   = STOPPED
				_stopped = now ()
				_stop ()
		return self

	@method toggle
	| Toggles the state of the runnable.
		return stop () if status is RUNNING else start ()

	@method _start
		error (NotImplemented)

	@method _stop
		error (NotImplemented)
	
	@method bind callback
		self !+ Start (callback)
		self !+ Stop  (callback)
		return self

	@method unbind callback
		self !- Start (callback)
		self !- Stop  (callback)
		return self

# -----------------------------------------------------------------------------
#
# PERIODIC
#
# -----------------------------------------------------------------------------

@trait TPeriodic

	@property callback   = Undefined
	| The callback executed when `_tick` is invoked.

	@property _iteration = 0
	| The counter of iteration.

	@property _period    = Undefined
	| The period (in ms)

	@property _timeout   = None
	| The DOM timeout object

	@property _isRunning = Undefined
	| Tells if the periodic timer is running

	@property _ticked    = 0
	| The time of the last tick.

	@property _origin = Undefined
	| The time when it was started

	@getter period
		return _period

	@getter iteration
		return _iteration

	@getter sinceTick
	| Returns the number of milliseconds since the last tick.
		return now () - _ticked

	@getter isRunning
		return _timeout is not None

	@method cancel
		_unschedule ()
		return self

	@method _schedule period=_period
	| Schedule a tick to be run asynchronously after
	| period if the period is `> 0`, otherwise execute the tick
	| synchronously.
		if _timeout is None
			_origin ?= now ()
			_timeout = window setTimeout (self . _tick, Math max (0, period))

	@method _unschedule
		_ticked = Undefined
		if _timeout is not None
			window clearTimeout (_timeout)
			_timeout = None
			return True
		else
			return False

	@method _reschedule
		_unschedule ()
		_schedule ()
		return self

	@method _tick force=False
		if force is True or isRunning
			_reschedule   ()
			let res = False if callback and _runCallback () is False else True
			_ticked    = now ()
			_iteration += 1
			return res

	@method _runCallback
	| If the callback returns False, we stop the iteration
		let t   = now () - _origin
		let t0  = _origin
		let dt  = t - (_ticked or t)
		_ticked = t
		if callback (t,dt,t0,self) is False
			_unschedule ()

# -----------------------------------------------------------------------------
#
# REPEAT
#
# -----------------------------------------------------------------------------

@class Repeat: TPeriodic, TRunnable
| A periodic event is produced in on a recurrent basis.

	@constructor callback, period=1000ms
		self _period  = period
		self callback = callback

	@method _start
		_tick (True)
		return self

	@method _stop
		_unschedule ()
		return self

# -----------------------------------------------------------------------------
#
# DELAYED
#
# -----------------------------------------------------------------------------

@class Delayed: TPeriodic
| A delayed event is produced in after a given delay. You can `push` the delayed
| to delay it further.

	@property value = None

	@constructor callback, delay=100ms
		self callback = callback
		self _period  = delay

	@getter delay
		return _period

	@getter canTick
	| Tells if this delayed can tick at this specific moment
		return (sinceTick > _period)

	@method set delay
	| Updates the delay/period for this delayed. This will unschedule
	| any existing trigger and reschedule it considering the existing
	| elapsed time.
		if _period != delay
			let d   = delay - sinceTick
			_period = delay
			# We don't want to reschedule if it was not started in the first place.
			if _unschedule ()
				_schedule (d)
		return self

	@method push delay=_period
		_unschedule ()
		_schedule   ()
		return self

	@method trigger value=self value
		self value = value
		push ()
		return self

	@method _reschedule
		_unschedule ()

# -----------------------------------------------------------------------------
#
# THROTTLED
#
# -----------------------------------------------------------------------------

@class Throttled: TPeriodic
| A throttled event can only occur a given number of times per second based
| on its delay.

	@property value        = None

	# NOTE: There used to be an _initial value (pre 2019-09-24), but I removed
	# it as the implemented did not make sense.

	@constructor callback, delay=100ms
		self callback = callback
		self _period  = delay

	@getter delay
		return _period

	@method set delay
	| Sets the delay for the throttled.
		if delay is? Array
			if delay length == 0
				return self
			elif delay length == 1
				# NOTE: _initial was assigned here
				_period  = delay[1]
			else
				# NOTE: _initial was assigned here too
				_period  = delay[1]
		else
			_period  = delay or 0
		return self

	@getter canTick
	| Tells if this throttle can tick at this specific moment
			return (not _ticked) or (sinceTick > _period)

	@method trigger value=self value
		self value = value
		# If the throttled timer is not already scheduled, we schedule it
		if not isRunning
			let ela = sinceTick
			if not _ticked
				# We tick right away in an initial throttle
				_tick (True)
			elif ela > self _period
				# We tick right away if the last tick is after the period, which
				# is the case the first time
				_tick (True)
			else
				# Otherwise we schedule it for the next period
				_schedule (self _period)
		return self
	
	@method push
		return trigger ()

	@method _reschedule
	| Throttled are never rescheduled. Instead they are scheduled on each trigger.
		_unschedule ()

# -----------------------------------------------------------------------------
#
# SCHEDULER
#
# -----------------------------------------------------------------------------
# @class Scheduler
#
# 	@property status
#
# 	@property events = []
#
# 	@method   tick
#
# 	#TODO :Implement multiple schedule runnners
#
# 	@method schedule delay, callback
# 		events push {callback,delay}
# 		return self
#
# 	@method unschedule callback
# 		events = events ::? (_ callback != callback)
# 		return self


# -----------------------------------------------------------------------------
#
# BEAT
#
# -----------------------------------------------------------------------------

@class Beat
| A beat

	@property _bound  = []
	@property _ticked = Undefined
	@property _origin = Undefined

	#TODO: Should rewrite using Tick !?

	@method until callback, duration=Undefined
	| Executes the given callback on each tick until it returns false or the
	| given (optional) duration happens.
		let to = now ()
		let f  = {t,dt,t0|
			let r = callback(t,dt,t0)
			if r is False or (duration is not Undefined and ((t - to) >= duration))
				unbind (f)
		}
		return bind (f)

	@method bind element
		_origin ?= now ()
		if element not in _bound
			_bind (element)
		return self

	@method unbind element
		if element in _bound
			_unbind (element)
		return self

	@method _bind element
		_bound push (element)
		if _bound length == 1
			_ticked = Undefined
			_bindBeat ()

	@method _unbind element
		# NOTE: Filtering is better than a splice as we're creating
		# a new array (we might unbind while iterating)
		_bound = _bound ::? {_ is not element}
		if _bound length == 0
			_unbindBeat ()
			_ticked = Undefined

	@method _bindBeat
		error (NotImplemented, __scope__)

	@method _unbindBeat
		pass

	@method _beat
		let t   = now () - _origin
		let t0  = _origin
		let dt  = t - (_ticked or t)
		_ticked = t
		self ! "Tick" (t,dt,t0)
		_bound :: {_(t,dt,t0)}

# -----------------------------------------------------------------------------
#
# FRAME
#
# -----------------------------------------------------------------------------

@singleton Frame: Beat

	@method _bindBeat
		# NOTE: Could this trigger two beat at once when starting?
		window requestAnimationFrame (self._beat)

	@method _beat
		super _beat ()
		if _bound length > 0
			window requestAnimationFrame (self._beat)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function now
| Shorthand to `window.performance.now`, returns the time in ms with
| ns precision.
	return (window performance now ()) if HAS_PERFORMANCE else (new Date () getTime ())

@function timestamp
| Returns a high-precision timestamp
	if HAS_PERFORMANCE
		return ((window performance timeOrigin or 0) + window performance now()) * 1000
	else
		return now () * 1000

@function defer callback, duration=0
	# FIXME: This should be a Deferred that we can cancel
	window setTimeout (callback, duration)

@function frame callback
	window requestAnimationFrame (callback)

@function repeat callback, duration, start=True
	return new Repeat (callback, duration) start (start)

@function delayed callback, duration=Undefined
	return new Delayed (callback, duration)

@function throttled callback, duration=Undefined
	return new Throttled (callback, duration)

# EOF
