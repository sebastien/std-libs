@feature sugar 2
@module  std.services
| Defines abstract classes to implement reactive and proactive services.

@import TOptions from std.patterns.options
@import TFlyweight from std.patterns.flyweight


# -----------------------------------------------------------------------------
#
# SERVICE ADAPTER
#
# -----------------------------------------------------------------------------

@class ServiceProvider: TOptions
| Adapts a service provider

	@property _service = None

	@getter service
		return _service

	@method setService service
		_service = service
		return self

# -----------------------------------------------------------------------------
#
# REQUEST ADAPTER
#
# -----------------------------------------------------------------------------

@class RequestAdapter: TFlyweight

	@property _data

	@method init data
		_data = data

	@getter type

	@getter url

	# TODO: Params

	@method read:Future length=Undefined

	@method respond code=Undefined
		let r = _createResponse ()
		if code is not Undefined
			r as (code)
		return r

	@method _createResponse

# -----------------------------------------------------------------------------
#
# RESPONSE ADAPTER
#
# -----------------------------------------------------------------------------

@class ResponseAdapter: TFlyweight

	@property _data

	@method init data
		_data = data

	@method as value, message=Undefined
		return self

	@method param name, value
		return setParameter (name, value)

	@method set value
		write (value)
		return end ()

	@method write value
		return self

	@method end
		return self

# -----------------------------------------------------------------------------
#
# SERVICE
#
# -----------------------------------------------------------------------------

@class Service: TOptions
| Base class for reactive and proactive services. A service is initialized
| with options and can be diposed of.

	@shared OPTIONS = {}

	@method init options
		setOptions (options)
		return self

	@method handle request

	@method dispose

# -----------------------------------------------------------------------------
#
# REACTIVE
#
# -----------------------------------------------------------------------------

@class ReactiveService: Service
| A reactive service is a services that does not contain any active part. It
| is usually composed into a proactive service or a provider infrastructure.
|
| Reactive services are typically simple, compact and short-lived.

# -----------------------------------------------------------------------------
#
# PROACTIVE
#
# -----------------------------------------------------------------------------

@class ProactiveService: Service
| A proactive service is a service that has its own control flow. It is
| typically larger and has a long life span.

	@property _isRunning = True

	@getter isRunning
	| Tells if the service is currently running
		return _isRunning

	@method start
	| Starts the proactive service. Returns `True` if the service was not
	| already started, `False` otherwise.
		if not _isRunning
			_isRunning = True
			doStart ()
			return True
		else
			return False

	@method stop
	| Stops the proactive service. Returns `True` if the service was not
	| already stopped, `False` otherwise.
		if _isRunning
			_isRunning = False
			doStop ()
			return True
		else
			return False

	@method doStart

	@method doStop

# EOF
