@feature sugar 2
@module std.util.testing
| Defines primitives to run tests and benchmarks easily. It offers
| the following features:
|
| - Testing predicates with failure descriptions
| - Support for exception testing
| - Support for asynchronous operations, with timeouts
| - Support for benchmarks
| - JSON and XML exports

@import bool, cmp, len, type as core_type, typename      from std.core
@import first, merge                  from std.collections
@import max                           from std.math
@import now                           from std.io.time
@import error, BadArgument, NotImplemented            from std.errors
@import Future, RendezVous            from std.io.async
@import TNode, TLeaf                  from std.patterns.tree
@import TIdentified, TNamed, TDescribed  from std.patterns.ids
@import runtime.window as window

@enum EventStatus = WAITING | SUCCESS | FAILURE
@type Value       = {value:Any}

# -----------------------------------------------------------------------------
#
# EVENT
#
# -----------------------------------------------------------------------------

@class Event
| Represents a test event, with a status of either @SUCCESS, @FAILURE
| or @WAITING.

	@property _status:Object
	@property name:String
	@property timestamp:Number
	@property description:String
	@property message:Array
	@property code:String
	@property id:String = Undefined

	@constructor status=WAITING, timestamp=Undefined, message=None
		self _status   = status
		self timestamp = timestamp or now ()
		self message   = message

	@getter status
		return _status

	@method wait
		_status = WAITING
		return self

	@method succeed message=Undefined
	| Sets the event @status to @SUCCESS if its status is @WAITING
		if _status is WAITING
			_status = SUCCESS
			if message
				self message = message
			self ! "Finish"
		return self

	@method fail
	| Sets the event @status to @FAILURE if its status is @WAITING
		if _status is WAITING
			_status = FAILURE
			self ! "Finish"
		return self

	@method not
	| Negates the event @status if it @SUCCESS or @FAILURE
		match _status
			is SUCCESS
				message = ["[negated]"] concat (message)
				_status = FAILURE
			is FAILURE
				message = ["[negated]"] concat (message)
				_status = SUCCESS
		return self

	@method setID id
	| Ids are optional but can be useful in some cases where events
	| are created by non testing classes.
		self id = id
		return self

	@method setCode code
	| Attaches the given code to this event, which is useful
	| for debugging purposes.
		self code = code
		return self

	@method join rdv=new RendezVous ()
		self !+ "Finish" {rdv join (self)}
		return rdv

	@method as name
		self name = name
		return self

	@method describe description
		self description = description
		return self

	@method report logger=console, index=Undefined
		var prefix = [status __name__]
		if index is not Undefined
			prefix = ["#" + index] concat (prefix)
		if description
			prefix push (description)
		logger log apply (logger, prefix concat (message or []))

	@method reportJSON
		return {
			type      : "Event"
			status    : _status __name__
			timestamp : timestamp
			messae    : message
		}


# -----------------------------------------------------------------------------
#
# RUN
#
# -----------------------------------------------------------------------------

@class Run: Event
| A subclass of event which represents a test run, which includes a duration
| and a number of cycles. Runs are used for benchmarks.

	@property cycles
	@property operation
	# FIXME: This is not good, we should have a run that is either sync or async
	@property runs
	@property _duration

	@constructor operation, cycles, runs=[], duration=Undefined
		super (WAITING, Undefined, operation message)
		self operation = operation
		self cycles    = cycles
		self runs      = runs
		_duration      = duration

	@setter duration duration
		_duration = duration

	@getter duration
		if _duration is Undefined
			if runs[0] is? Future
				var d = 0
				for _ in runs
					if _ ended
						d += _ ended - _ started
					else
						return Undefined
				_duration = d
				return _duration
		return _duration

	@getter status
		for _ in runs
			if (_ is? Future) and (_ isPartial or _ isNew)
				return WAITING
		return SUCCESS if runs length > 0 else WAITING

	@method join rdv=new RendezVous ()
		for _ in runs
			if (_ is? Future) and (_ isPartial or _ isNew)
				rdv expects (_)
		return rdv

	@method reportJSON
		let res      = super reportJSON ()
		res cycles   = cycles
		res runs     = runs
		res duration = _duration
		res type     = "Run"
		return res

# -----------------------------------------------------------------------------
#
# WITH SUMMARY
#
# -----------------------------------------------------------------------------

@trait TWithSummary
| Provides generic summary information that allow to get information about
| the test.

	@method getSummary
		error (NotImplemented)

	@getter status
		let s = getSummary ()
		if s failure > 0
			return FAILURE
		elif s waiting > 0
			return WAITING
		else
			return SUCCESS

	@getter isFailure
		return status == FAILURE

	@getter isSuccess
		return status == SUCCESS

	@getter isWaiting
		return status == WAITING

	@getter isFinished
		return status != WAITING

	@getter statusName
		return status match
			is FAILURE -> FAILURE __name__
			is SUCCESS -> SUCCESS __name__
			is WAITING -> WAITING __name__
			else       -> None

	@method getSuccessRate
		let s = getSummary ()
		return s success / s total

	@method getFailureRate
		let s = getSummary ()
		return s failure / s total

	@method getFinishedRate
		let s = getSummary ()
		return (s total - s waiting) / s total

# -----------------------------------------------------------------------------
#
# GROUP
#
# -----------------------------------------------------------------------------

@class Group: TNode, TWithSummary, TIdentified, TNamed, TDescribed
| A *group* is a collection of tests.

	@constructor name, description, bind=True
		self name        = name
		self description = description
		if bind and All
			All addChild (self)

	@method addChild child
		let res = super addChild (child)
		child !+ "Update" (self . onChildUpdated)
		return res

	@method removeChild child
		let res = super removeChild (child)
		child !- "Update" (self . onChildUpdated)
		return res

	@method removeAllChildren
		children :: {_ !- "Update" (self. onChildUpdated)}
		return super removeAllChildren ()

	@method group name, description
		return addChild (new Group (name, description))

	@method benchmark name, description
		return addChild (new Benchmark (name, description))

	@method unit name, description
		return addChild (new Unit (name, description))

	@method getSummary
		let res = {
			failure  : 0
			waiting  : 0
			success  : 0
			total    : 0
		}
		walk {test|
			match test
				is? Test
					test getSummary () :: {v,k|res[k] += v}
		}
		return res

	@method getLike t
		let res = []
		walk {test|
			match test
				is? Unit
					res = res concat (test getLike (t))
		}
		return res

	@method join rdv=new RendezVous ()
	| Returns a Rendez-Vous that will be set when all the tests are not waiting
	| anymore
		if rdv is? String
			let f = new Future ()
			let t = get(rdv)
			if t
				return f set (t)
			else
				let on_add = {
					if _ name is rdv
						self !- "Add" (on_add)
						f set (_)
				}
				self !+ "Add" (on_add)
			return f
		else
			for _ in children
				_ join (rdv)
		return rdv

	@method get test
		return test match
			is? Number
				children[test]
			is? String
				first(children, {_ name == test})
			else
				error (BadArgument, "test", test, [Number, String])

	@method getWaiting
		return getLike (WAITING)

	@method getFailure
		return getLike (FAILURE)

	@method getSuccess
		return getLike (SUCCESS)

	@method onFinish callback
		let t = getWaiting () reduce ({r,e,i|max(e timestamp, r)}, 0)
		let n = now ()
		match t
			is? Number and t > n
				# We add +1ms for safety, as rounding errors can
				# schedule the timeout before
				window setTimeout ({callback(_)}, 1 + t - n)
			else
				callback (_)
		return self

	@method report logger=console
		logger group (typename(core_type(self)) + " " + name)
		logger log   ("===", description) if description
		for _, i in children
			_ report (logger, i)
		logger groupEnd ()

	@method list
	| Returns a list of all the tests registered
		var res = []
		for _, i in children
			if _ is? Group
				res = res concat (_ list ())
			else
				res push (_)
		return res

	@method listNames
	| Returns a list of all the tests registered
		return list() ::= {_ name}

	@method reportJSON
		let res      = {
			type        : "Group"
			name        : name
			id          : id
			description : description
			summary     : getSummary ()
			children    : children ::= {return _ reportJSON ()}
		}
		return res

# -----------------------------------------------------------------------------
#
# ALL
#
# -----------------------------------------------------------------------------


@singleton All: Group
| The *all* singleton is the default parent for any newly created test
| or benchmark.

	@constructor name, description
		super (name, description, False)
	
# -----------------------------------------------------------------------------
#
# TEST
#
# -----------------------------------------------------------------------------

@class Test: TLeaf, TWithSummary, TIdentified, TNamed, TDescribed
| An abstract test.

	@property _events:Array = []
	@property _context:Any  = Undefined

	@constructor name=Undefined, description=Undefined
		self name = name
		self description = description
		All addChild (self)
	
	@getter events
		return _events

	@method context value
		_context = value
		return self

	@method clearEvents
		_events :: {_ !- "Finish" (self . onEventFinish)}
		_events = []
		self ! "Update"
		return self

	@method addEvent event
		if event
			if event not in _events
				event !+ "Finish" (self . onEventFinish)
				_events push (event)
				self ! "Update" (event)
		return event

	@method hasEvent id
		return bool (getEvent (event))

	@method ensureEvent id
		let e = getEvent (id)
		if e
			return e
		else
			return addEvent (new Event () setID (id))

	@method removeEvent event
		if event in _events
			_events = _events ::? {_ is not event}
			event !- "Finish" (self . onEventFinish)
			self  ! "Update"
		return event

	@method getEvent id
		return first (_events, {_ id == id})

	@method report logger=console
		logger group (typename(core_type(self)) + " " + name) # + "+{success} -{failure} ?{waiting} =?{total}" % (getSummary())))
		logger log   ("===", description) if description
		if _events
			for _,i in _events
				_ report (logger, i)
		logger groupEnd ()

	@method reportJSON
		return {
			type        : "Test"
			name        : name
			id          : id
			description : description
			summary     : getSummary ()
			events      : _events ::= {return _ reportJSON ()}
		}

	@method join rdv=new RendezVous()
	| Returns a Rendez-Vous that will be set when all the tests are not waiting
	| anymore
		rdv ?= new RendezVous ()
		for _ in _events
			# FIXME: This results in unexpected (opposite) behaviour: completed events aren't joined
			if _ status is WAITING
				_ join (rdv)
		return rdv

	@method getSuccess:Array
	| Returns the list of @SUCCESS events
		return _events ::? {_ status is SUCCESS}

	@method getFailure:Array
	| Returns the list of @FAILURE events
		return _events ::? {_ status is FAILURE}

	@method getLike:Array status
		return _events ::? {_ status is status}

	@method getWaiting:Array
	| Returns the list of @WAITING events
		return getLike (WAITING)

	@method getSuccess:Array
	| Returns the list of @SUCCESS events
		return getLike (SUCCESS)

	@method getFailure:Array
	| Returns the list of @FAILURE events
		return getLike (FAILURE)

	@method getSummary
		return _events reduce ({r,v|
			r total += 1
			match v status
				is SUCCESS
					r success  += 1
				is FAILURE
					r failure += 1
				is WAITING
					r waiting  += 1
			return r
		}, {success:0, failure:0, waiting:0, total:0})

	@method onEventFinish event
		pass

# -----------------------------------------------------------------------------
#
# UNIT
#
# -----------------------------------------------------------------------------

@class Unit: Test
| A test aggregates events generated by running a predicate against
| one or more values. Events can be *successes* or *failures*, and
| will each have a timestamp.

	@group Predicates

		@method not value
			if value is? Future
				return _defer (not, value)
			else
				match value
					is? Event
						return value not ()
					else
						return self not (assert (value))

		# FIXME: Rephrase to expected XXX to be equal to YYY
		@method equals value, other, event=Undefined
			if value is? Future
				return _defer (equals, value, other)
			elif cmp( value, other ) != 0
				return _fail (event, "Expected", _value(other), "got", _value(value))
			else
				return _succeed(event, _value(value))

		@method different value, other, event=Undefined
			if value is? Future
				return _defer (different, value, other)
			elif cmp( value, other ) == 0
				return _fail (event, "Expected different from ", _value(other), "got", _value(value))
			else
				return _succeed(event, _value(value), "different from", _value(other))

		@method same value, other, event=Undefined
			if value is? Future
				return _defer (same, value, other)
			elif self not (value is other)
				return _fail (event, "Expected", _value(value), "to be the same as", _value(other))
			else
				return _succeed(event, _value(value), "is the same as", _value(other))

		@method empty value, event=Undefined
			if value is? Future
				return _defer (empty, value)
			elif len(value) != 0
				return _fail (event, "Expected empty value, got", _value(value))
			else
				return _succeed(event, _value(value), "is empty")

		@method assert value, event=Undefined
			if value is? Future
				return _defer (assert, value)
			elif not value
				return _fail (event, "Assertion failed with", _value(value))
			else
				return _succeed(event, "Assertion suceeded with", _value(value))

		@method does callback, event=Undefined
			if callback is? Future
				return _defer (does, callback)
			else
				try
					callback (self)
					return _succeed(event, "Do step successful")
				catch exception
					return _fail(event, "Do step failed:", exception)

		@method exception callback, expected=Undefined, event=Undefined
			if callback is? Future
				return _defer (exception, callback, expected)
			else
				try
					callback (self)
				catch exception
					if expected is Undefined
						return _succeed(event, "Exception successfuly intercepted", exception, "in", callback)
					elif exception is expected or (expected is? Function and exception is? expected)
						return _succeed(event, "Exception successfuly intercepted", exception, "in", callback)
					else
						return _fail(event, "Excepted exception", expected, "got", exception)
				return _succeed(event, "Not exception thrown by", callback, "expected", expected or "one")

		@method timeout callback, delay=1s, event=Undefined
			if callback is? Future
				return _defer (timeout, callback, delay)
			else
				# We create a new event with a timestamp in the future
				let r = new Event (WAITING, now () + delay)
				# We push it on the stack
				addEvent (r)
				# When the timeout expires, we set the type to failure if it was
				# waiting.
				window setTimeout ({
					if r status is WAITING
						r fail ()
						r timestamp = now ()
						r message   = ["Delay of", delay, "expired with", callback]
				}, delay)
				callback (r)
				return r

		@method isTrue value, event=Undefined
			if value is? Future
				return _defer (isTrue, value)
			elif self not (value is True)
				return _fail (event, "Expected", _value (value), "to be",  True)
			else
				return _succeed(event, _value(value), "is true")

		@method isFalse value, event=Undefined
			if value is? Future
				return _defer (isFalse, value)
			elif self not (value is False)
				return _fail (event, "Expected", _value (value), "to be", False)
			else
				return _succeed(event, _value(value), "is false")

		@method isNone value, event=Undefined
		| Alias to @isNull
			return isNull (value)

		@method isa value, ofType, event=Undefined
			# FIXME: This is always truthy; second condition will never be reached
			if value is? Future
				return _defer (isa, value, type)
			elif self not (value is? ofType)
				return _fail (event, "Expected", _value(value), "to be of type", typename(ofType), ", is", typename(core_type(value)))
			else
				return _succeed(event, _value(value), "is of type", typename(ofType))

		@method isNull value, event=Undefined
			if value is? Future
				return _defer (isNull, value)
			elif self not (value is None)
				return _fail (event, "Expected", _value (value), "to be", None)
			else
				return _succeed(event, _value(value), "is", None)

		@method isDefined value, event=Undefined
			if value is? Future
				return _defer (isDefined, value)
			elif (value is Undefined)
				return _fail (event, "Expected", _value(value), "to undefined")
			else
				return _succeed(event, _value(value), "is defined")

		@method isUndefined value, event=Undefined
			if value is? Future
				return _defer (isUndefined, value)
			elif self not (value is Undefined)
				return _fail (event, "Expected", _value(value), "to be undefined")
			else
				return _succeed(event, _value(value), "is", Undefined)

		@method end
			return _succeed (Undefined, "Unit test ended")

	@group Events

		@method _value value
			return value match
				is? String
					new Value (value)
				else
					value

		@method _defer operation, future, args...
			let r = new Event(WAITING, now(), future)
			future then {
				let a = [_] concat (args) concat ([r])
				operation apply (self, a)
			} failed {
				r message = None
				r fail "Timed out"
			}
			addEvent (r)
			return r

		@method _succeed event, message...
		| Logs a @SUCCESS event with the given message
			if event
				event succeed (message)
				return event
			else
				let r = new Event(SUCCESS, now(), message)
				addEvent (r)
				return r

		@method _fail event, message...
		| Logs a @FAILURE event with the given message
			if event
				event fail (message)
				return event
			else
				let r = new Event(FAILURE, now(), message)
				addEvent (r)
				return r

# -----------------------------------------------------------------------------
#
# INTERACTIVE
#
# -----------------------------------------------------------------------------

@class Interactive: Test
| An *interactive test* requires user interaction to complete/evaluate.

	@property _checklist = []
	@property _do  = {}
	@property name
	@property description

	@constructor name, description
		super ()
		self name = name
		self description = description

	@method do callback
		self _do = callback
		return self

	@method checklist value=Undefined
		_checklist = _makeChecklist (value, "T" + id) children
		return self

	@getter items
		return _checklist

	@method run node
		if _do
			return _do (node, self)
		else
			return Undefined

	@method _makeChecklist value, prefix=None
		var parent = {children:[]}
		for v,i in value
			var key = prefix + "_" + i
			match v
				is? String
					parent children push {key, item:v, children:[]}
				is? Array
					parent children[-1] ?= {key, item:v, children:[]}
					let p = parent children[-1]
					p children = p children concat (_makeChecklist (v, key) children)
				else
					error (BadArgument, "value", v, [String, Array])
		return parent


# -----------------------------------------------------------------------------
#
# BENCHMARK
#
# -----------------------------------------------------------------------------

@class Benchmark: Test
| A benchmark allows for the sampling of one or more functions and record
| the elapsed time.

	@property options = {
		cycles : 10000
		scale  : 1000
	}

	@property data             = Undefined
	| Publicly accessible property to store any test-related data.

	@property name
	@property description
	@property _operations:Array  = []
	@property metrics = {
		min : Undefined
		max : Undefined
	}

	@constructor name=Undefined, description=Undefined
		super ()
		self name = name
		self description = description
		All addChild (self)

	@method cycles count=Undefined
		match count
			is? Undefined
				return options cycles
			is? Number
				options cycles = count
				return self
			_
				error (BadArgument, "count", count, [Number], __scope__)

	@method setOptions options
	| Sets the options defined in this benchmark. Options will be available
	| to benchmarked functions
		options :: {v,k|self options [k] = v}
		return self

	@method do name:String, operation:Undefined
	| Executes the given @operations when the benchmark is @run
	|
	| @operations is expected to be `Function(Benchmark,cycle:Number)`, or
	| either an array or map of it.
		operation = name match
			is? String
				{name, operation}
			is? Function
				{name:Undefined, operation:name}
			else
				error (BadArgument, "name", name, [String, Function], __scope__)
		_operations push (operation)
		return operation

	@method async name:String, operation:Undefined
	| Creates an operation that will only finish when the @ff.io.Future it is
	| given as first argument is complete. This returns the future that will
	| be set by the operation.
		let o = do (name, operation)
		o isAsync = True
		return o

	@method run cycles=options cycles
	| Runs the benchmark for the number of @cycles. Each function of the
	| benchmark collection will have all its cycles executed before going
	| to the next.
	|
	| Note that if any operation fails, the whole benchmark will fail as
	| exceptions are not intercepted.
		clearEvents ()
		metrics = metrics ::= {return Undefined}
		_operations :: {v,k|
			let s = now ()
			let c = 1 if v isAsync else (v cycles or cycles)
			let r = []
			let i = c
			# NOTE: Asyncs have only
			while i > 0
				if v isAsync
					# If the operation is async, then we create a new
					# future and pass it as argument to the operation
					# callback. The future will have a `started` and `ended`
					# properties assigned.
					let f = new Future ()
					f started = now ()
					v operation (f, self, i)
					r push (f)
					# Note that in the case of aync ops, the end time is
					# per operations.
					f then {
						f ended  = now ()
						let d    = {}
						d [i] = {
							start    : f started
							end      : f ended
							duration : f ended - f started
							value    : f get ()
						}
					}
				else
					# If it is sync, then we simply execute it.
					let d = v operation (self, i)
					r push (d)
				i -= 1
			# FIXME: Doing r push kills perf
			let e = now ()
			addEvent (new Run (v, r, c, Undefined if v isAsync else (e - s)))
		}
		return self

	@method getMeanDuration
		var mean_duration = 0
		for cycle in data
			mean_duration += cycle duration
		mean_duration = mean_duration / options cycles
		return mean_duration

	@method report logger=console
		logger group (typename(core_type(self)) + " " + name) # + "+{success} -{failure} ?{waiting} =?{total}" % (getSummary())))
		logger log   ("===", description) if description
		logger log   ("Number of cycles: ", options cycles)
		logger log ("Mean duration: ", getMeanDuration ())
		logger groupEnd ()

	@method reportJSON
		var mean_duration = 0
		for cycle in data
			mean_duration += cycle duration
		mean_duration = mean_duration / options cycles
		return merge ({
			type         : "Benchmark"
			events       : _events ::= {_ reportJSON ()}
			meanDuration : getMeanDuration ()
		}, super reportJSON ())

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function run callback
	# TODO: We might want to detect the creation of test cases and
	# add them to a test suite and generate the reports.
	if callback
		callback ()

@function event description
	return new Event (Undefined, Undefined, description)

@function test name, description
	let t = All get (name)
	return t match
		is? Test → t
		_        → error ("Test", name, "already exists and is not a regular test", typename(core_type(t)))
		else     → new Test (name, description)

@function group name, description
	let t = All get (name)
	return t match
		is? Group → t
		_        → error ("Test", name, "already exists and is not a group", typename(core_type(t)))
		else     → new Group (name, description)

@function unit name, description
	let t = All get (name)
	return t match
		is? Unit → t
		_        → error ("Test", name, "already exists and is not a unit", typename(core_type(t)))
		else     → new Unit (name, description)

@function interactive name, description
	let t = All get (name)
	return t match
		is? Interactive → t
		_        → error ("Test", name, "already exists and is not an interactive test", typename(core_type(t)))
		else     → new Interactive (name, description)

@function benchmark name, description
	let t = All get (name)
	return t match
		is? Benchmark → t
		_        → error ("Test", name, "already exists and is not a benchmark", typename(core_type(t)))
		else     → new Benchmark (name, description)

@function report
	All report ()

# EOF
