@feature  sugar 2
@module   std.services.aws
@import   ServiceProvider, RequestAdapter, ResponseAdapter from std.services
@import   NotImplemented from std.errors
@import   removeAt from std.collections

@class RequestAdapter

	@getter type
		return _data method

	@getter url
		return _data url

	@method init event
		let data = {
			method: event httpMethod
			parameters: {
				pathname: event path
				query: event queryStringParameters
			}
			url: event path or "/"
			body: event body
		}
		super init (data)

	@method read
		let f = future ()
		f set (data body)
		return f

# -----------------------------------------------------------------------------
#
# RESPONSE ADAPTER
#
# -----------------------------------------------------------------------------

@class ResponseAdapter
| Adapts an AWS Lambda request handler.

	@property _step         = 0
	@property statusCode    = 200
	@property headers       = Undefined
	@property _cb           = Undefined
	@property body          = Undefined

	@method init callback
		headers = {}
		_step     = 0
		_cb       = callback

	@method as code=200, message=Undefined
		assert (_step is 0, "Type was already set")
		statusCode = code
		_step = 1
		return self

	# This mocks setHeader()
	@method param name, value=Undefined
		if value is None
			_headers = removeAt (_headers, name)
		else
			_headers[name] = value
		return self

	@method write value
		if _step == 1
			_step = 2
		# TODO: Investigate Node response.write() implementation
		body += value
		return self

	# In Node, calling end() with an arg does res.write(); res.end()
	@method end data
		assert (step < 3, "Request already ended")
		_step = 3
		if data
			_data += data
		return _cb (null, self)

# -----------------------------------------------------------------------------
#
# LAMBDA PROVIDER
#
# -----------------------------------------------------------------------------

@class LambdaProvider: ServiceProvider

	@shared Instance = None

	# In the functions index.js, this should be called e.g.
	# exports.awsHandler = LambdaProvider.Get().handle
	@operation Get event, context, callback
		# There are various event triggers, HTTP Proxy is just one
		# see https://gist.github.com/jeshan/52cb021fd20d871c56ad5ce6d2654d7b
		if _getLambdaEventTrigger (event) = "APIGatewayHTTPProxy"
			return HTTPProxyAdapter Get ()
		else
			return error (NotImplemented, __scope__)

	@method handle event, context, callback
		error (NotImplemented, __scope__)

	@method _getLambdaEventTrigger event
		if event pathParameters and event PathParameters proxy
			return "APIGatewayHTTPProxy"
		else
			return Undefined

@class HTTPProxyAdapter: LambdaProvider

	@operation Get
		if not Instance
			Instance = new HTTPProxyAdapter ()
		return Instance

	@method handle event, context, callback
		let res = ResponseAdapter Create (callback)
		let req = RequestAdapter Create (event, context)
		# This will freeze the event loop and return a response on callback
		context callbackWaitsForEmptyEventLoop = False
		service handle (req, res)

# EOF - vim: ts=4 sw=4 noet
