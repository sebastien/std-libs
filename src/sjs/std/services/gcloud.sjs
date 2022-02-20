@feature  sugar 2
@module   std.services.gcloud
@import   ServiceProvider, RequestAdapter, ResponseAdapter from std.services
@import   removeAt from std.collections
@import   http as node_http

@class RequestAdapter

	@property _response

	@getter type
		return _data method

	@getter url
		return _data url

	@method init data, response
		super init (data)
		_response = response

	@method read
		# FIXME: Probably not necessary
		_data setEncoding "utf-8"
		let f = future ()
		request on ("data", {
			# TODO: Is data a one off, or is it streaming result?
			f set (_)
		})
		return f

	@method _createResponse
		return _response

# -----------------------------------------------------------------------------
#
# RESPONSE ADAPTER
#
# -----------------------------------------------------------------------------

@class ResponseAdapter
| Adapts a Google Cloud Function request handler.

	@property _step    = 0
	@property _type    = 200
	@property _headers = Undefined

	@method init data
		super init (data)
		_headers = {}
		step     = 0

	@method as code=200, message=Undefined
		assert (_step is 0, "Type was already set")
		_type = code
		_step = 1
		return self

	# Perhaps this should use Node's setHeader()
	# write() below uses Node's writeHead()
	# see: https://github.com/nodejs/node/blob/f7fbbeedc609f56c898230971b44d3dde0934dc9/lib/_http_outgoing.js#L507
	@method param name, value=Undefined
		if value is None
			_headers = removeAt (_headers, name)
		else
			_headers[name] = value
		return self

	@method write value
		assert (step >  0, "Cannot write before setting a response type")
		assert (step <= 2, "Request already sent, can't change it")
		if _step == 1
			_data writeHead (_code, _headers)
			_step = 2
		_data write (value)
		return self

	@method end
		assert (step < 3, "Request already ended")
		_step = 3
		_data end ()
		return self

# -----------------------------------------------------------------------------
#
# CLOUD FUNCTION PROVIDER
#
# -----------------------------------------------------------------------------

@class CloudFunctionProvider: ServiceProvider

	@method handle request, response
		let res = ResponseAdapter Create (response)
		let req = RequestAdapter Create (request, res)
		service handle (req, res)

# -----------------------------------------------------------------------------
#
# APP ENGINE PROVIDER
#
# -----------------------------------------------------------------------------

@class AppEngineAdapter: CloudFunctionProvider

	@shared OPTIONS = {
		port : 8000
	}

	@method doStart
		console log ("Starting node server on port ", options port)
		http createServer (self . handle) listen (options port)

	@method doStop
		# TODO: Implement

# EOF - vim: ts=4 sw=4 noet
