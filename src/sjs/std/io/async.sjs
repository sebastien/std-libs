@feature sugar 2
@module  std.io.async
| A collection of classes to manage asynchronous programming.

@import bool,len,type,subtype,list,asNone from std.core
@import array,remove from std.collections
@import assert,warning,error, BadArgument, StateError from std.errors
@import now from std.io.time
@import min,max from std.math
@import runtime.window as window

# TODO: We should probably add TIMEOUTS
# TODO: When a future takes another future as argument
@enum  Status = NEW | WAITING | PARTIAL | SUCCESS | CANCELLED | FAILURE | TIMEOUT

# TODO: We might want to clean all the handlers from an object

# TODO: Add a Stream, which is an async that repeats it self and has
# multiple set(..)
# Stream.then()  -> returns a future for the next element on the stream
# Stream.ends()  -> return a future for the end of the stream
# Stream.does()  -> executes a callback invoked when a new value happens
# Stream.chain() -> returns a processed stream

# -----------------------------------------------------------------------------
#
# ASYNC
#
# -----------------------------------------------------------------------------

@class Async
| The base abstract building block for asynchronous constructs. An *async element*
| wraps a *status* that has the following lifecycle:
|
| ```
| NEW ----> WAITING -----> PARTIAL -----> SUCCESS
| |            |           |
| +------------+-----------+
|              |
|              +-----------> CANCELLED
|              |
|              +-----------> TIMEOUT
|              |
|              +-----------> FAILURE
| ```
|
| The typical usage scenario of an async is like this:
|
| ```sugar2
| aync then {console log ("Success:", _)} failed {console log "failed"}
| ```
|
| Note that if you're using directly the events binding, the events
| will only be triggered when they happen. For instance, binding
| to the @Success event of an async that *has already succeeded* will
| never trigger the callback, as opposed to using @then. This is a major
| difference compared to previous design found in `channels.Future`.

	@event Success
	| When the future succeeds

	@event Fail
	| When the future fails. Failures include timeout, in which case
	| the event value will be `TIMEOUT`

	@event Cancel
	| When the future is cancelled

	@event Partial
	| When the future is partially fullfilled

	@event Update

	@property _status = NEW

	@getter status
	| Returns the status of the async, as one of the @Status values.
		return _status

	@getter value
		return Undefined

	@method get
		return value

	@method then callback
	| Executes the given callback/future if this async succeeds. This
	| returns the current async. Note that this is different from
	| the @Promise.then which chains the asyncs.
		match callback
			is? Future
				then (callback.set)
			is? Function
				match _status
					< SUCCESS
						self !+ Success (callback)
					is SUCCESS
						callback (value, self)
			_
				error (BadArgument, "callback", [Async, Function])
		return self

	@method once callback
	| Like then, but only executes the callback once.
		match callback
			is? Future
				then (callback.set)
			is? Function
				match _status
					< SUCCESS
						self !! Success (callback)
					is SUCCESS
						callback (value, self)
			_
				error (BadArgument, "callback", [Async, Function])
		return self


	@method unbind callback, event=None
	| Unbinds the given callback (or future) from this future. Event
	| can be the event to unbind the callback, otherwise all events will
	| be unbound. This is a rarely used method, but is nonetheless useful.
		if event is None
			unbind (callback, Success)
			unbind (callback, Fail)
			unbind (callback, Cancel)
			unbind (callback, Partial)
			unbind (callback, Update)
		else
			match callback
				is? Future
					match event
						is Success
							unbind (callback.set, event)
						is Fail
							unbind (callback.fail, event)
						is Cancel
							unbind (callback.cancel, event)
						is Partial
							unbind (callback.partial, event)
						# TODO: Update
				is? Function
					self !- (event) (callback)
				_
					error (BadArgument, "callback", [Async, Function])
			return self

	@method setPartial value, strict=False
	| Sets the partial value. If strict is true and the async
	| is not waiting or partial, and error is produced.
		return self

	@method partial callback
		match callback
			is? Future
				partial (callback.setPartial)
			is? Function
				match _status
					< SUCCESS
						self !+ Partial (callback)
			_
				error (BadArgument, "callback", [Async, Function])
		return self

	@method failed callback
		match callback
			is? Future
				failed (callback.fail)
			is? Function
				match _status
					< SUCCESS
						self !+ Fail (callback)
					> SUCCESS
						callback (value, self)
			_
				error (BadArgument, "callback", [Async, Function])
		return self

	@method cancelled callback
		match callback
			is? Future
				cancelled (callback.cancelled)
			is? Function
				match _status
					< SUCCESS
						self !+ Cancel (callback)
					== CANCELLED
						callback (value, self)
			_
				error (BadArgument, "callback", [Async, Function])
		return self

	@method chain processor:Function, partialProcessor=False
	| Returns a new *future* that will contain this aysnc's value processed
	| by the given `processor` as a value. If the processor returns `null`,
	| `undefined` or `false`, then the returned future will fail.
	|
	| The processor can also return an @Async, in which case it will be joined
	| with the returned future.
		let r = new (type(self))() if subtype(type(self),Future) else new Future()
		if partialProcessor
			let p = partialProcessor if partialProcessor is? Function else processor
			partial {
				let v = p (_, self) if p else _
				r setPartial (v)
			}
		then {
			let v = processor (_, self) if processor else _
			match v
				is? Async
					# NOTE: We might want to always set partial join to True
					r join (v, bool(partialProcessor))
				is Undefined
					r fail {reason:"Chained processor returned undefined",value:v, processor}
				else
					r set (v)
		} failed {
			r fail (_)
		}
		return r
	@example
		future set (10) chain {_ * 2} then {output ("result=" + _)}
		expects "result=" + 10

	@method pipe processor
	| Chains both the value and the partial value.
		return chain (processor, processor)

	@method always processor=Undefined
	| Returns a Future that wraps this aysnc and that will be set wether
	| this async succeeds or not.
	|
	| ```
	| f always () then {f|<this will always  be executed> }
	| ```
		let f = new Future ()
		let c = {f set (processor(self))} if processor else {f set (self)} 
		self then      (c)
		self failed    (c)
		self cancelled (c)
		return f

	@method fail reason
	| Fails the async primitive, which only has an effect if the
	| `status <= Partial`.
		if _status <= PARTIAL
			_status = FAILURE
			self ! Fail (reason)
			self ! Update ()
			_onEnd ()
		return self

	@method timeout
	| Times out the async primitive, which only has an effect if the
	| `status <= Partial`.
		if _status <= PARTIAL
			_status = TIMEOUT
			self ! Fail   (TIMEOUT)
			self ! Update ()
			_onEnd ()
		return self

	@method cancel
	| Cancels the async primitive, which only has an effect if the
	| `status <= Partial`. This has the additional effect of
	| clearing the `Success`, `Fail` and `Timeout` event handlers.
		if _status <= PARTIAL
			_status = CANCELLED
			self ! Cancel ()
			self ! Update ()
			_onEnd ()

	@method _onEnd
	| When the future has ended, we free all the handlers
		Success !- "*"
		Fail    !- "*"
		Cancel  !- "*"
		Partial !- "*"
		Update  !- "*"

	@group Status

		@getter isNew
			return _status is NEW

		@getter isCancelled
			return _status is CANCELLED

		@getter isPartial
			return _status is PARTIAL

		@getter isSuccess
			return _status is SUCCESS

		@getter isFailure
			return _status is FAILURE

		@getter isFinished
			return isSuccess or isFailure or isCancelled

# -----------------------------------------------------------------------------
#
# FUTURE
#
# -----------------------------------------------------------------------------

@class Future: Async
| A future is an *asynchronous value*, ie. a value that might be set
| at a later stage. It extends the *async primitive* with a value that
| can be partially set.

	@operation FromPromise promise
	| Returns a future that wraps the given promise
		assert (promise is? window.Promise)
		let f = new Future ()
		f context = promise
		promise then  {f set (_)}
		# NOTE: A catch here makes some minifiers fail
		promise ["catch"] {f fail (_)}
		return f

	@property context
	| The Future's context, usually set by the creator of the future to
	| store additional data about the Future's origin (like an HTTP request,
	| or some other process).

	@property _value
	| The value wrapped by the *future*.

	@constructor value
		super ()
		if value is not Undefined
			self value = value

	@method setPartial value, strict=False
	| Sets the partial @value of this future. This only works if the
	| future's status is `<= PARTIAL`.
		if _status <= PARTIAL
			_status = PARTIAL
			_value  = value
			self ! Partial (value)
			self ! Update (value)
		elif strict
			error (StateError, "Async: cannot set partial value", _status, [NEW, WAITING, PARTIAL])
		return self

	@getter value
	| Returns the final value of the future, which will return `undefined`
	| when the status is different from @`SUCCESS`.
		return _status match
			== SUCCESS → _value
			== PARTIAL → _value
			else       → Undefined

	@setter value value
	| Sets the final value for the future. This only works if the status
	| is `< Success` and can only be done once.
		match _status
			< SUCCESS
				_value  = value
				_status = SUCCESS
				self ! Success (value)
				self ! Update  (value)
			== SUCCESS
				warning (StateError, "async has already succeeded", _status, [NEW, WAITING, PARTIAL], __scope__)
			== CANCELLED
				# We silently absorb setting a value on a cancelled future
				pass
			else
				warning (StateError, "async has failed, cannot set value anymore", _status, [NEW, WAITING, PARTIAL], __scope__)
		return self

	@method setContext context
	| Sets the context attached to this future.
		self context = context
		return self

	@method set value
	| Sets the value, with the same semantics as the `value` setter.
		self value = value
		return self

	@method get
	| Returns the final value of the future. This does not return the
	| partial value.
		return value

	@method join async:Async, partial=False
	| The current future will succeed when the given *async* succeeds, and
	| will fail if the *async* fails.
	|
	| When `partial` is `True`, then partial updates to the given async
	| will be forwarded to this async.
		match async
			is? Async
				async then (self.set) failed (self.fail)
				if partial
					async partial (self.setPartial)
			_
				error (BadArgument, "async", [Async])
		return self

# -----------------------------------------------------------------------------
#
# SEMAPHORE
#
# -----------------------------------------------------------------------------

@class Semaphore: Async
| A semaphore is an async primitive that can be joined and left. A semaphore
| has a capacity (@expected) and a number of @joined values. A value
| can @join or @leave the semaphore, and the semaphore will succeed when
| full and be partial otherwise.
|
| A failed or cancelled semaphore won't accept @join/@leave anymore.

	@property expected  = 1
	@property joined    = []

	@constructor expected=1
		super ()
		self expected = expected

	@method leave value=Undefined
	| Makes the given @value leave the semaphore (it will only remove
	| one instance of the value if the value was joined more than once)
	|
	| @Partial will be triggered when the the value is effectively
	| removed from the @joined list and return `true`, otherwise
	| the method returns `false`.
		if _status < CANCELLED
			let l = joined length
			remove (joined, value)
			if joined length < l
				_status = PARTIAL
				self ! Partial (expected)
				self ! Update  (expected)
				return True
			else
				return False
		else
			return error (StateError, "Semaphore already finished:", _status, [NEW,  WAITING])

	@method join value=Undefined
	| Makes the given @value join the semaphore (the same value can be joined
	| multiple times).
	|
	| @Success will be triggered when the @expected capacity is reached,
	| @Partial otherwise and the method will return `true`.
	|
	| If the capacity has already been reached, then the method will
	| return `false`.
		if _status < SUCCESS
			joined push (value)
			if joined length < expected
				_status = PARTIAL
				self ! Partial (expected)
				self ! Update  (expected)
			else
				_status = SUCCESS
				self ! Success (expected)
				self ! Update  (expected)
			return True
		else
			return False

# -----------------------------------------------------------------------------
#
# CONDITION
#
# -----------------------------------------------------------------------------

@class Condition: Async
| A condition will poll the given #condition for at maximum
| #timeout duration with a delay of #delay ms.

	@property timeout   = 15s
	@property delay     = 100ms
	@property condition = Undefined
	@property _started  = Undefined

	@constructor condition, timeout=15s, delay=100ms
		super ()
		self condition = condition
		self timeout   = timeout
		self delay     = delay
		_run           ()

	@method _run
		_started ?= now ()
		if _status < SUCCESS
			if condition ()
				_status = SUCCESS
				self ! Success ()
				self ! Update  ()
			elif now () - _started < timeout
				let d = min (max(0, timeout - (now () - _started)), delay)
				window setTimeout (self . _run, d)
			else
				_status = FAILURE
				self ! Fail ()
				self ! Update  ()

# -----------------------------------------------------------------------------
#
# RENDEZ-VOUS
#
# -----------------------------------------------------------------------------

# TODO: We might want to set RDV to fail when there is one element that does
# not resolve. Maybe we should have a strict mode

# FIXME: The rendez-vous logic does not really work properly when 
# you set a number of expected values and join
@class RendezVous: Async
| A rendez-vous is an *asynchronous primitive*, that succeeds when the
| expected amount of @Async objects succeed.

	@property expected = Undefined
	@property limit    = -1
	@property joined   = Undefined
	@property _left    = 0

	@getter value
		return joined ::= {return _}

	@method expects value:Any
		if _status <= WAITING
			_status = WAITING
			# TODO: _left should be 0
			match value
				is? Async
					# FIXME: This does not make any sense if expected
					# is already defined
					expected  = value
					_left    += 1
					value then {join (_, _left)}
				is? Function
					expected  = value
					_left    += 1
					join (value (), value)
				is? Object
					expected = value
					joined   = expected ::= asNone
					_left   += len (joined)
					expected :: {v,k|
						match v
							is? Async
								v then {join (_,k)}
							else
								join (v,k)
					}
				is? Number
					expected = array (value)
					_left   += len(expected)
				else
					# Otherwise we join the value right away
					expected = array (value)
					_left    = len(expected)
					join (value, 0)
		else
			error (StateError, "RendezVous: cannot set partial value", _status, [NEW, WAITING], __scope__)
		return self

	@method join value:Any, index:Any
		if _status < WAITING
			warning (StateError, "RendezVous: cannot join when the rendez vous is not waiting", _status, [ WAITING, PARTIAL], __scope__)
		elif _status == CANCELLED
			pass
		elif _status > PARTIAL
			warning (StateError, "RendezVous: rendez-vous already finished/expired", _status, [WAITING, PARTIAL], __scope__)
		else
			if index is expected
				_left -= 1
			else
				joined       ?= []
				joined[index] = value
				_left -= 1
			if _left == 0
				_status = SUCCESS
				self ! Success (joined)
				self ! Update  ()
			else
				_status = PARTIAL
				self ! Partial (joined)
				self ! Update  ()

# -----------------------------------------------------------------------------
#
# RETRY
#
# -----------------------------------------------------------------------------

@class Retry: Async
| Abstracts an async-producing function in an async object that will
| retry production if the produced future fails. The producer function
| is expected to return `{value,delay}`

	@operation Times delays, producer
		delays = list (delays)
		return new Retry {i|
			if i < delays length
				return {value:producer(i), delay:delays[i]}
			else
				return False
		} start ()

	@property producer = Undefined
	| The producer function, which should return `{future,delay}`

	@property iteration       = 0
	@property _timeout        = Undefined
	@property _value          = Undefined
	@property _trying:Async   = Undefined

	@constructor producer
		self producer = producer

	@getter value 
		return _value

	@method start
		step ()
		return self
	
	@method cancel
		if _trying
			_trying cancel ()
		return self

	@method step
	| Steps the retry
		if _status >= SUCCESS
			return False
		else
			let res = producer (iteration) if producer else False
			# We cancel any trying async in case we do an early step
			if _trying and _trying status <= SUCCESS
				_trying cancel ()
			# Now we reasign the _trying async/future from the result
			_trying = res value if res and res value is? Async else None
			if _trying
				let do_retry = {_doRetry (res delay)}
				_trying failed (do_retry) cancelled (do_retry) then {_doSuccess (_ value)}
				return Undefined
			elif res is False
				_status = FAILURE
					_clearTimeout ()
				self ! Fail    ()
				self ! Update  ()
				return False
			else
				_doSuccess (res)
				return True
	
	@method _doRetry delay=0
	| Schedules a retry, will run `step()` after `delay`
		iteration += 1
		if _timeout is not Undefined
			_clearTimeout ()
		window setTimeout ({step()}, delay or 0s)

	@method _doSuccess value
		_value = value
		_clearTimeout ()
		_status = SUCCESS
		self ! Success (value)
		self ! Update  (value)

	@method _clearTimeout
	| Clears the timeout that might have been scheduled after a failure.
		if _timeout is not Undefined
			window clearTimeout (_timeout)
			_timeout = Undefined

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function condition predicate
	return new Condition (predicate)

@function future value=Undefined
	return value match
		is? Future
			value
		is? window.Promise and window.Promise
			Future FromPromise (value)
		else
			new Future (value)

@function rdv expects=Undefined
	let r = new RendezVous ()
	if expects is not Undefined
		r expects (expects)
	return r

@function join async‥
	return new RendezVous () expects (async[0] if async length == 1 else async)

@function chain async, callback
	if async is? Async
		if async isFinished
			return callback (async value)
		else
			return async chain (callback)
	else
		return callback (async)

@function unwrap value
	if value is? Async
		return value value
	else
		return value

# EOF
