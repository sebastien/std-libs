@feature sugar 2
@module std.api.workers
| Wrapper classes around the DOM's WebWorkers API. It features dynamic
| loading of modules as web-workers and enapsulated communication
| using the `Channel` abstraction.

@import assert, error, warning, Error from std.errors
@import len from std.core
@import now from std.io.time
@import future, join from std.io.async
@import prepend, tail from std.collections
@import average from std.math
@import Channel, ChannelStatus from std.io
@import TNamed from std.patterns.ids
@import http from std.io.http
@import window, runtime

@shared WORKER_READY = "WorkerReady"

# -----------------------------------------------------------------------------
#
# WORKER ERROR
#
# -----------------------------------------------------------------------------

@class WorkerError: Error
| Wrapper around an error generate by a worker.

	@constructor message, data
		super ("Processing message: " + message + " failed")

# -----------------------------------------------------------------------------
#
# CHANNEL
#
# -----------------------------------------------------------------------------

# TODO: The semantics to what happens with a message are not clear yet. Should
# message be consumed by handlers or not?

@class WorkerChannel: Channel, TNamed
| A communication channel that works between the Window and a Worker
| and vice-sersa.
	
	@property _origin    = Undefined
	@property _incoming  = []
	@property _received  = []
	@property _fallback  = Undefined
	@property _handlers  = []

	@constructor  origin=window
		_origin = origin
		_origin onmessage =  self . _onReceiveMessage
		# origin addEventListener ("message", self . _onMessage, False)
	
	@getter hasMessages
	| Tells if the channel has unprocessed received messages
		return len (_received) > 0

	@getter isWaitingForMessages
	| Tells if the channel is waiting for more messages to arrive
		return len(_incoming) > 0

	@method open:Future
		return future (self)

	@method request:Future payload:Any
	| Does a put chained with a get.
		return put (payload) chain {get ()}

	@method does callback
	| A fallback callback that is always executed when a message arrives
		_fallback = callback
		# If we have unprocessed received messages and a 
		# fallback callback, then we process everything.
		while _fallback and _received length > 0
			_fallback (_received pop(), self)
		return self

	@method when callback
	| Returns a future that will be invoked only when the given callback
	| succeeds. The callback is applied to all incoming messages.
		let f = future ()
		let handler = {
			if callback (_)
				f set (_)
				return False
		}
		_handlers push (handler)
		return f

	# TODO: We might want to have `on`, but it might be redundant with 
	# `does` and `when`.

	@method put:Future payload:Any
	| Sends the given message to the channel. This returns a future
	| immediately.
		_doSendMessage (payload)
		return future (self)
	
	@method send payload:Any
	| Like put, but does not create a future for when the message
	| is delivered.
		_doSendMessage (payload)
		return self

	@method get:Future
	| If there's an available message, then gets it, otherwise waits
	| for a message to arrive.
		let f = future()
		if _received length > 0
			let e = _received pop ()
			f setContext (e) set (e data)
		else
			_incoming = prepend (_incoming, f)
		return f

	@method open
	| The origin channel is always open
		# TODO: Actually, not so simple, should manage the lifecycle beter
		return future (self)

	@method close
		if isOpen or isInitializing
			_origin terminate ()
			close ()
			_status = Closed
		return self
	
	@method _doSendMessage data
		# TODO: We might want to use the array buffer syntax
		# --> worker.postMessage(arrayBuffer, [arrayBuffer]);
		_origin postMessage (data)

	@method _onReceiveMessage event
		if _incoming length > 0
			# Do we have an incoming future registered? If so, we
			# pop that future and assign it the event's data
			let f = _incoming pop ()
			f setContext (event) set (event data)
			return 0
		elif _handlers
			let n = _handlers length
			_handlers = _handlers ::? {return _ (event) is not False}
			if n != _handlers length
				return 1
		# We are at the fallback phase
		if _fallback
			# If there's a fallback defined to process messages
			# that arrive unexpectedly, then we do it here.
			_fallback (event, self)
			return 2
		else
			# Otherwise we pile up the message on the received list
			_received = prepend (_received, event)
			return 3

# -----------------------------------------------------------------------------
#
# WEB WORKER
#
# -----------------------------------------------------------------------------

# SEE: https://www.html5rocks.com/en/tutorials/workers/basics/#toc-transferrables
@class WorkerClient
| Wraps a web worker, dynamically loading the runtime, the module system
| and the worker's module. This ensures that the loader can be loaded
| as a regular module.
|
| The web worker will create a `WorkerChannel` to facilitate communication
| between the browser and the worker thread. The `connect` method
| of the worker will return a future that will only be activated when
| a `WorkerReady` message is received throught the channel.

	@shared   PREAMBLE = Undefined

	@operation GetPreamble
	| Returns the preamble composed of the runtime and the runtime module
	| system, which is enough to grand access to the libs and to dynamic
	| module loading.
		if not PREAMBLE
			PREAMBLE = join {
				runtime : http get (runtime modules baseURL + "/lib/js/runtime.js")
				modules : http get (runtime modules baseURL + "/lib/js/runtime/modules.js")
			} chain {
				return [
					"var window=self;"
					"var runtime=("     + _ runtime + ");"
					"runtime.modules+(" + _ modules + ");"
					"var require=runtime.modules.require; var define=runtime.modules.define;define.amd=true;"
				] 
			}
		return PREAMBLE

	@property _name:String    = Undefined
	@property _path:String    = Undefined
	@property _ready:Future   = future ()
	@property _loading:Future
	@property _worker:Worker
	@property stats = {}
	@property _channel = Undefined
	@property isConnected = False

	@getter worker
		return _loading and _loading value

	@constructor name:String
	| Creates new web worker from the given module `name`. The name will
	| be resolved using the current runtime module loading setup. The name
	| can also be a `path` that is going to be relative to the `runtime.modules.baseURL`
	| value.
	|
	| Once the worker is ready, it will be assigned to the future returned
	| by `then`.
		assert (name, "A web worker needs a path or a module name", __scope__)
		_name = name
		# We try to resolve the path from the name, if it does not 
		# resolve, then we simply assume the name is a URL
		runtime modules resolve (name, {
			_path = _ or name
			start ()
		})
		
	@method start:Future
	| Loads and initializes the web worker, resolving and loading the scripts
	| and setting up the runtime environment.
		if not _loading and _path
			_loading = join {
				preamble : GetPreamble ()
				worker   : http get (_path) failed {
					error ("Unable to load worker script for", _name, "at", _path, __scope__)
				}
			} then {data|
				let base_url = runtime modules baseURL
				# TODO: Exclude lib/sjs when not in production
				let base_paths = (["/lib/sjs/*.sjs", "/lib/js/*.js"] ::= {"'" + base_url + _ + "'"}) join ","
				let code = data preamble concat ([
					"runtime.modules.paths=[" + base_paths + "];"
					data worker
				])
				let blob     = new Blob (code)
				let blob_url = URL createObjectURL (blob)
				_worker      = new window Worker (blob_url)
				_channel     = new WorkerChannel (_worker)
				_ready set (self)
			} 
		return _ready 
	
	@method connect:Future callback=Undefined
	| Waits for the worker to be started and send the `WORKER_READY` event. Once 
	| recevied, the future will succeed with an open channel.
		# TODO: Check if already connected
		return start () chain {
			return _channel when {
				_ data is WORKER_READY
			} chain {
				isConnected = True
				if callback
					callback(self)
				return self
			}
		}
	
	@method request name, data
		if not isConnected
			error ("Worker client is not connected, call `connect` first", __scope__)
		else
			let t = now ()
			stats[name] ?= {samples:[], average:0}
			return _channel request {name, data} then {
				# We compute the elapsed time and keep in the stats. Clients
				# can then adjust throttles/delayed dynamically.
				let d = now () - t
				let s = stats[name]
				s samples push (d)
				s samples = tail (s samples, 5)
				s average = average (s samples)
			}

# -----------------------------------------------------------------------------
#
# WORKER SERVER
#
# -----------------------------------------------------------------------------

@class WorkerServer
| The base class for a worker server. The worker will automatically process
| incoming messages and dispatch them to the corresponding introspected
| `onXXX` methods. For instance, if the message is `computeFoo`, then the
| corresponding method will be `onComputeFoo`. If there is no matching
| method, the messages are processed by `onMessage`.

	@property _channel:WorkerChannel

	@constructor channel=new WorkerChannel ()
		self _channel = channel
		self _channel does (_onChannelReceived)
	
	@method serve
		_channel send (WORKER_READY)
		return self

	@method _onChannelReceived message
		let name = message data name or ""
		let data = message data data
		let f   = (self["on" + name]) or (self["on" + name[0] toUpperCase () + name[1:]])
		var res = f apply (self, [data, message]) if f else onMessage (name, data)
		# NOTE: A channel is sequential, so we don't need to order the messages
		_channel send (res)
	
	@method onMessage name:String, data:Any
	| The default hander for an incoming message.
		warning ("Unhandled worker message", name, ":", data, __scope__)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function client:WorkerClient name
| The **client** creates new `WorkerClient` for the given file or module. The
| client needs to then call `connect` on the worker to access its communication
| channel.
	return new WorkerClient (name)

@function server:WorkerChannel
| The **server** creates a channel and sends the `WorkerReady` message to
| denote that it can accept messages.
	let w = new WorkerChannel ()
	w send (WORKER_READY)
	return w

# EOF - vim: ts=4 sw=4 noet
