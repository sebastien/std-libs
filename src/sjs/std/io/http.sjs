@feature sugar 2
@module std.io.http
@import bool, unjson, len, str, json, merge                from std.core
@import assert, error, NotImplemented, BadArgument         from std.errors
@import Channel                                            from std.io
@import Future, Status, join                               from std.io.async
@import TOptions                                           from std.patterns.options
@import configure                                          from runtime.modules
@import runtime.window                                     as window

@shared http
@shared DEFAULTS = configure ("std.io.http", {
	# Tells whether we should use `HEAD` requests for resolution
	head        : True
	# Tells whether we should use credentials in requests (by default)
	credentials : True
	# Tells which environment to use
	isNode      : bool (window env is "Node")
})

@class Transport

	@shared Instance = None
	@shared OPTIONS  = {}

	@operation Get
		return window env match
			is "Node" -> NodeHTTPTransport Get ()
			else      -> XMLHTTPRequestTransport Get ()

	@operation New options
		return window env match
			is "Node" -> new NodeHTTPTransport (options)
			else      -> new XMLHTTPRequestTransport (options)

	@method createRequest method:String, url:String|Object, body=None, headers:Array=None, options=Undefined
		error (NotImplemented, __scope__)

	@property options

	@constructor options
		self options = merge (merge({}, options), OPTIONS)
	
	@method getOption options, name
		# NOTE: This logic is a bit complex, but it works
		if options and options [name] is not Undefined
			return options [name]
		elif self options and self options [name] is not Undefined
			return self options [name]
		elif OPTIONS[name] is not Undefined
			return OPTIONS [name]
		elif DEFAULTS[name] is not Undefined
			return DEFAULTS[name]
		else
			return Undefined

@class NodeHTTPTransport: Transport

	@operation Get
		if not Instance
			Instance = new NodeHTTPTransport ()
		return Instance

	@method createRequest method:String, url:String|Object, body=None, headers:Array=None, options=Undefined
		let node_http = require("http")
		let node_url  = require("url")
		let parsed_url = node_url parse(url)
		let request_options = {
			method   : method
			hostname : parsed_url hostname
			path     : parsed_url path
			headers  : _parseHeaders (headers)
		}
		let future  = new Future () setContext {
			started  : new Date () getTime ()
			ended    : Undefined
			duration : Undefined
		}
		# Creates an HTTP request using http.request()
		# https://nodejs.org/api/http.html#http_http_request_options_callback
		let request = node_http request (request_options, {response|
			var message = ""
			response on ("data", {chunk|
				message += chunk
			})
			response on ("end", {
				future context ended    = new Date () getTime ()
				future context finished = future context ended - future context started
				# TODO: Set the processed message (JSON or XML)
				# For now we are setting the whole response for testing
				response message = message
				future set (response)
			})
		})
		if body is not None
			request write (body)
		request end ()
		return future

	@method _parseHeaders headers
	| In Node, headers should be an object
	| The headers argument may be a mix of nested arrays/objects; we need to account for both
	| See https://nodejs.org/dist/v6.2.1/docs/api/http.html#http_http_request_options_callback
	| Headers can probably be passed as an array but it seems like an afterthought (https://github.com/nodejs/node/issues/8235)

		return headers ::> {r={},v,i|
			match v
				is? Array
					r[v[0]] = v[1]
				is? Object
					merge (r, v)
				else
					error (BadArgument, "headers", headers, [Array, Object], __scope__)
			return r
		}

@class XMLHTTPRequestTransport: Transport

	@shared OPTIONS = {
		credentials : Undefined
		xml         : False
		json        : True
		async       : True
	}

	@operation Get
		if not Instance
			Instance = new XMLHTTPRequestTransport ()
		return Instance

	@method createRequest method:String, url:String|Object, body=None, headers:Array=None, options=Undefined
	| Creates an HTTP request
		let request = new window XMLHttpRequest ()
		let future  = new Future () setContext {
			request
			started  : new Date () getTime ()
			ended    : Undefined
			duration : Undefined
		}
		var callback_was_executed = False
		let on_load       = {progress|
			if future status < Status SUCCESS
				try
					# NOTE: We don't want to set the responseText as for large
					# requests that might come with a penalty (at least in IE/Edge)
					if method == "HEAD" or method == "OPTIONS"
						future setPartial (request)
					else
						future setPartial (_processResponse (request))
				catch e
					future setPartial (Undefined)
		}
		let on_complete   = {state|
			callback_was_executed = True
			if request readyState == 3
				on_load ()
			elif request readyState == 4
				future context ended    = new Date () getTime ()
				# FIXME: Shouldn't this be `future context duration` ?
				future context finished = future context ended - future context started
				# NOTE: In CORS request return a status code of `0` when
				# the Access-Control-Allow-Origin header is not there
				if request status >= 200 and request status < 300
					if method == "HEAD" or method == "OPTIONS"
						future set (request)
					else
						future set (_processResponse (request))
				else
					future fail (request)
		}
		# We only want to ask the browser to use HTTP
		# 'onreadystatechange' in asynchronous mode, so that
		# we can catch any exceptions that options failure()
		# will throw.
		future onCancel {request abort ()}
		let with_credentials = getOption (options, "credentials")
		if with_credentials is not Undefined
			request withCredentials =  bool(with_credentials)
		let with_async = getOption (options, "async")
		if with_async
			request onreadystatechange = on_complete
		if request upload
			request upload addEventListener ("progress", on_load, False)
		request open (method or "GET", url, OPTIONS async or False)
		# On FireFox, headers must be set after request is opened.
		# <http://developer.mozilla.org/en/docs/XMLHttpRequest>
		match headers
			is? Array
				headers :: {request setRequestHeader (_[0],_[1])}
			is? Object
				headers :: {v,k|request setRequestHeader (k,v)}
			_
				error (new BadArgument ("headers", headers, [Array, Object]))
		# We send the request
		try
			request send (body or '')
		catch e
			future fail (e)
		# On FireFox, a synchronous request HTTP 'onreadystatechange' callback is
		# not executed, which means that we have to take care of it manually.
		# NOTE: When FireBug is enabled, this doesn't happen.. go figure !
		if (not callback_was_executed) and (not OPTIONS async)
			on_complete ()
		return future

	@method _processResponse response
		var content_type = (response getResponseHeader "Content-Type" or "") split ";" [0]
		if content_type is "text/x-json" or content_type is "application/json"
			return unjson (response responseText)
		elif content_type indexOf "xml" >= 0
			return response responseXML
		else
			return response responseText or response responseXML

@class HTTP: Channel, TOptions
| The HTTP channel abstracts over HTTP methods using the `XMLHttpRequest` object.
| Note that as opposed to using `fetch`, the `XMLHttpRequest` object processes
| XML documents, and in particular, resolves depedencies of XSLT requests.
|
| Given that we prefer @Future objects as opposed to promises, we don't
| need to use fetch.

	# TODO: Support XML
	@shared ENCODINGS = {
		json   : "application/json"
		form   : "application/x-www-form-urlencoded"
		# NOTE: I have no idea why we used application/x-binary
		# binary : "application/x-binary"
		binary : "application/octet-stream"
		string : "text/plain"
	}

	@shared OPTIONS = {
		prefix      : ""
		credentials : Undefined
	}
	| - `credentials` sets the `withCredentials` XMLHttpRequest property, letting
	|   requests from other domains set cookies (one their own domains.)
	|   See <https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/withCredentials>

	@property _transport

	@constructor options=Undefined
		_transport = Transport New (options) if options else Transport Get ()
		setOptions (options)

	@method get url, body=None, headers=None
		return request ("GET", url, body, headers)

	@method put url, body=None, headers=None, encoding=Undefined
		return request ("PUT", url, body, headers, encoding)

	@method post url, body=None, headers=None, encoding=Undefined
		return request ("POST", url, body, headers, encoding)

	@method head url, body=None, headers=None
		return request ("HEAD", url, body, headers)

	@method option url, body=None, headers=None, encoding=Undefined
		return request ("OPTIONS", url, body, headers, encoding)

	@method delete url, body=None, headers=None, encoding=Undefined
		return request ("DELETE", url, body, headers, encoding)

	@method patch url, body=None, headers=None, encoding=Undefined
		return request ("PATCH", url, body, headers, encoding)

	@method trace url, body=None, headers=None, encoding=Undefined
		return request ("TRACE", url, body, header, encoding)

	@method connect url, body=None, headers=None, encoding=Undefined
		return request ("CONNECT", url, body, headers, encoding)

	@method request method, url, body=None, headers=None, encoding=Undefined
		| Generic function to create an HTTP request with the given parameters
		if url is? Array or url is? Object
			return join (url ::= {request (method, _, body, headers)})
		let request_url   = options prefix + url
		let request_body  = body
		let method_name   = method toUpperCase ()
		if method_name == "POST" or method == "PUT" or method_name == "UPDATE" or method_name == "DELETE" or method_name == "PATCH"
			if body
				encoding ?= "form" if method_name == "POST" else "json"
				request_body = encoding match
					is "json"
						encodeJSON (body)
					is "form"
						encodeForm (body)
					is "string"
						str(body)
					is "binary"
						encodeBinary(body)
					else
						# Here we assume it's the default encoding
						body
				# We always set the "Content-Type" header to the encoding
				# for these requests
				headers = [
					["Content-Type",   ENCODINGS[encoding] or encoding]
					# NOTE: This creates a problem
					# ["Content-Length", request_body length]
				] concat (headers or [])
		else
			if len(body) > 0
				request_url  = encodeURLParameters (body, request_url)
				request_body = None
		return _transport createRequest (method, request_url, request_body, headers, options)

@group Encoding

	@function encodeURLValue data:Any, skipNull=False
	| Encodes a value to be passed as argument in a URL parameter.
		return data match
			is? Array
				"[" + (data ::= encodeURLValue join ", ") + "]"
			is? Object
				"{" + (data ::= {v,k|k + ":" + encodeURLValue (v)} join ", ") + "}"
			_
				encodeURL (data, skipNull)

	@function encodeURL data:Object, skipNull=False
	| Encodes the given map of parameters as an URL parameter. Each value will
	| be encoded using `encodeURLValue`.
		return data match
			is? Object
				data ::> {r="",v,k|
					if v or (not skipNull)
						let p = "&" if r else ""
						r += p + window encodeURIComponent (k) + "=" + encodeURLValue (v)
					return r
				}
			_
				window encodeURIComponent ("" + data) if not skipNull else Undefined
			else
				Undefined


	@function encodeURLParameters value, url=Undefined, skipNull=False
	| A variant of @encodeURL that takes an existing @url as argument, appending
	| the given @value as parameters.
		var params = ""
		if url
			let i = url indexOf "?"
			if i >= 0
				params = url[i + 1:] + "&"
				url    = url[:i - 1]
		return url + "?" + params + encodeURL (value)


	@function encodeJSON data
	| Encodes the given data as json
		return json (data)

	@function encodeForm data:Any, skipNull=False
	| Encodes the given data using form-encoding.
		# FIXME: Not sure how this differs
		return encodeURL (data, skipNull)

	@function encodeBinary data:Any
		# FIXME: Not sure how this differs
		return data

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function resolve urls
| Returns a future that will be set with the first URL that
| yields a successful HTTP HEAD request.
	var p = [] concat (urls) ; p reverse ()
	let f = new Future ()
	let c = {
		if p length == 0
			f fail ()
		else
			let t = p pop ()
			let m = http.head if DEFAULTS head else http.get
			m (t) then {
				f set (t)
			} failed {
				c()
			}
	}
	c ()
	return f

http = new HTTP ()

# EOF
