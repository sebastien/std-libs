@feature sugar 2
@module std.patterns.connector
| A base class that implements the core functionality for an application
| connector, which is mainly the management of the current language locale and the
| dynamic (pre)loading of assets and data.
@import join, Async from std.io.async
@import http from std.io.http
@import template from std.text
@import fileext from std.text.path
@import warning, error from std.errors
@import TOptions from std.patterns.options
@import TSingleton from std.patterns.oo
@import preload from std.util.preloading
@import assert from std.errors

@class Connector: TOptions, TSingleton

	@shared PRELOAD = {}
	@shared OPTIONS = {
		prefix : ""
		api    : ""
	}

	@property lang  = Undefined
	@property cache      = {}
	@property data       = Undefined
	@property _preloaded = Undefined

	@constructor  options
		# We want to set the options first before init.
		setOptions (options)
		init ()

	@method init
		pass

	@method load
		if not _preloaded
			_preloaded = join (createPreloaded(PRELOAD ::= {
				return _ match
					is? String
						request (_)
					is? Function
						_ (self)
					is? Async
						_
					else
						error ("Unsupported PRELOAD value", _, __scope__)
			})) chain {
				let d = _processData(_) or _
				if d is? Async
					return d chain {onLoaded();return self}
				else
					data ?= d
					onLoaded ()
					return self
			}
		return _preloaded 
	
	@method onLoaded
		pass

	@method expand url, options=self options
	| Expands the given URL (or text) through the `std.text.template` function
	| using the connector's options.
		return template (url, options)

	@method createPreloaded preloaded
		return preloaded

	@method _processData data
		return data

	@method get url:String, data, headers=None
		return request (url, data, headers)

	@method post url:String, data, headers=None, encoding="string"
		return request (url, data, "POST", headers, encoding)

	@method put url:String, data, headers=None, encoding="string"
		return request (url, data, "PUT", headers, encoding)

	@method request url:String, data=Undefined, method="GET", headers=None, encoding=Undefined
		assert (url, "Request without a URL: '" + url + "'")
		url = expand (url)
		let key = method + ":" + url if data is Undefined else Undefined
		if (key is Undefined) or (not cache[key])
			var f = Undefined
			if fileext (url) in ("png", "gif", "jpg")
				f = preload (url)
			elif method is "POST"
				f = http post (url, data, headers, encoding)
			else
				f = http get (url, headers, encoding)
			f failed { onRequestFailed(url, _) }
			if key is Undefined
				return f
			else
				cache [key] = f
				return f
		else
			return cache [key]

	@method onRequestFailed url, origin=Undefined
		warning ("Request failed", url, "from", origin, __scope__)

# EOF 
