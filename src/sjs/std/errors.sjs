@feature sugar 2
@module std.errors
| Provides pre-defined exception classes to match common application needs
| as well as the @error function to log exceptions and errors. You should
| always use this modules as opposed to `console.error` as it offers
| a direct support for @Exception subclasses.

@import str, type, subtype, typename from std.core

@class Error
	
	@property description

	@constructor description
		self description = description

@class Exception
| Abstract class for implementing exceptions

	@method write writer:Function, origin
		writer (origin + ":", type(self) __name__)

	@method getName
		return typename(type(self)) split "." [-1]

@singleton NotImplemented: Exception

	@method write writer:Function, origin
		writer (origin + ":", "Not implemented yet")

@class MissingFeature:Exception
| Use when a feature is not implemented, but should be

	@shared ARITY = 1

	@property _type
	@constructor instance
		super ()
		_type = type(instance)

	@method write writer:Function, origin
		if _type
			writer (origin + ":", "Feature not implemented yet in", typename(_type))
		else
			writer (origin + ":", "Feature not implemented yet")


@class MissingBrowserFeature: Exception
| Use when a browser feature is not available, but is expected

	@shared ARITY = 1

	@property _feature

	@constructor feature
		super ()
		_feature = feature

	@method write writer:Function, origin
		writer (origin + ":", "Feature not available in the current browser", _feature)

@singleton NotSupported:Exception
| Use when a specific feature is not supported.

	@method write writer:Function, origin
		writer (origin + ":", "Feature not supported yet")

@singleton UnsupportedType:Exception
| Use when a given type is not supported.

	@method write writer:Function, origin
		writer (origin + ":", "Type not supported")

@class BadArgument: Exception
| Use when an argument is not as expected. You should specify its @name,
| the actual @value and an array of @expected types.

	@shared ARITY = 3

	@property name
	@property value
	@property expected

	@constructor name=Undefined, value=Undefined, expected=Undefined
		super ()
		self name     = name
		self value    = value
		self expected = expected

	@method write writer, origin
		writer (origin + ":", getName() + ": expected `" + name + "` to be one of (", ((expected or []) ::= typename) join ", ", ") got:", value)

@class MissingEntry: Exception
| Use when an entry is expected to be found in a @collection, but is not.

	@shared ARITY = 2

	@property key
	@property collection

	@constructor key=Undefined, collection=Undefined
		super ()
		self key = key
		self collection = collection

	@method write writer, origin
		writer (origin + ":", getName () + ":",  key, " missing from ", collection)

@class OutOfBounds: Exception
| Use when the @index for accessing an array @value is beyond its bounds.

	@shared ARITY = 2

	@property index
	@property value

	@constructor index=Undefined, value=Undefined
		super ()
		self index = index
		self value = value

	@method write writer, origin
		writer (origin + ":", type (self) __name__ +": index out of bounds:", index, "in", value)

@class StateError: Exception
| Use when an element @state is not @valid, usually when you cannot do a transition
| or when somehow the current state is invalid. Use the @message to give
| a better description of the problem.

	@shared ARITY = 3

	@property message
	@property state
	@property valid

	@constructor message, state, valid
		super ()
		self message = message
		self state   = state
		self valid   = valid

	@method write writer, origin
		writer (origin + ":", type (self) __name__ +":", message, "state=",state,"valid=",valid)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function assert condition:Boolean, origin:String, expression:String, message...
	if not condition
		console error apply (console, [origin, expression, "→"] concat (message))

@function should condition:Boolean, origin:String, expression:String, message...
	if not condition
		console warn apply (console, [origin, expression, "→"] concat (message))

@function error exception:Exception, origin:String
| Displays an error message based on the given exception instance with the given origin.
|
| This function can be used in different ways:
|
| - `error(new Exception("<message>"), __scope__)`, where you directly create
|   a new *exception*
|
| - `error(Exception, "<message>", __scope__)`, where you given the
|   exception *class* along with the expected argumnents, optionally followed
|   by the `__scope__`. The number of expected arguments will match the exception
|   subclass `Arity` property.
	if subtype (exception, Exception)
		let a     = arguments ::= {return _}
		origin    = a[exception ARITY + 1]
		let p     = a[1:exception ARITY + 1]
		exception = new exception (‥p)
	match exception
		is? Exception
			exception write (console error, origin or "")
		else
			try
				# NOTE: Edge crashes here with `SCRIPT65535: SCRIPT65535: Invalid calling object`
				console error apply (console error, [arguments[-1] + ":"] concat (arguments[0:-1]))
			catch
				console error (arguments[-1] + ":", arguments[0:-1])

@function hint message‥
| Displays a hint, which is only enabled in development mode.
	# TODO: Should use runtime defaults
	args = ["[HINT]"] concat (message)
	console log apply (console log, args)

@function warning message‥
	let origin = message[-1]
	if subtype (message[0], Exception)
		let e     = message[0]
		let a     = arguments ::= {return _}
		origin    = a[e ARITY + 1]
		let p     = a[1:e ARITY + 1]
		let exception = new e (‥p)
		exception write (console warn, origin or "")
	else
		try
			# NOTE: Edge crashes here with `SCRIPT65535: SCRIPT65535: Invalid calling object`
			console warn apply (console warn, [origin + ":"] concat (message[0:-1]))
		catch
			console warn (origin + ":", message[0:-1])

# EOF
