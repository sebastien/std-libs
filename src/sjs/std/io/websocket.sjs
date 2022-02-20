@feature sugar 2
@module std.io.websocket
@import assert, error, warning   from std.errors
@import prepend         from std.collections
@import Channel         from std.io
@import Future, Status  from std.io.async
@import TOptions        from std.patterns.options
@import runtime.window as window

@class WebSocket: Channel, TOptions

	@shared OPTIONS = {
		prefix      : ""
		reconnect   : True
		fallback    : None
	}

	@property socket     = None
	@property url        = None
	@property _outgoing  = []
	@property _incoming  = []
	@property _received  = []
	@property _onConnect = new Future ()

	@constructor url=Undefined, options=Undefined
		super ()
		if url is? Object
			options = url
			url = Undefined
		setOptions (options)
		if url
			open (url)

	@method open url, body=None, headers=None
		if socket is not None
			close ()
		url = "ws://" + options prefix + url if url indexOf "//" == -1 else url
		socket = new window WebSocket(url)
		socket onopen    = self . _onSocketOpen
		socket onclose   = self . _onSocketClose
		socket onmessage = self . _onSocketMessage
		self url         = url
		return _onConnect

	@method reconnect url=self url
		if socket is None or socket readyState >= 1
			return open (url)
		else
			return False

	@method put payload
		return new Future () set (send (payload))

	@method get
		return receive ()

	@method send payload
		if socket
			match socket readyState
				== 0
					_outgoing push (payload)
					return True
				== 1
					try
						socket send (payload)
						return True
					catch e
						warning ("Could not send on socket", url, "because of", e)
						_outgoing push (payload)
						if options reconnect
							reconnect ()
						# FIXME: Do retry
						return False
				== 3
					# TODO: Implement automatic reconnect
					warning ("Socket to", url, "is closing.")
					if options reconnect
						reconnect ()
				== 4
					# TODO: Implement automatic reconnect
					warning ("Socket to", url, "is closed.")
				else
					return False
			return True
		else
			error ("open() should have been called before", __scope__)
			return False

	@method request payload
		send (payload)
		return receive ()

	@method then
		return _onConnect chain ()

	@method receive
		let f = new Future()
		if _received length > 0
			let e = _received pop ()
			f setContext (e) set (e data)
		else
			_incoming = prepend (_incoming, f)
		return f

	@method flush
		assert (socket)
		assert (socket readyState == 1)
		let q = _outgoing ; _outgoing = []
		q :: {socket send (_)}
		return self

	@method close
		if socket
			let l = _incoming ; _incoming = []
			l :: {l cancel ()}
			socket close ()
			socket = None
			_onConnect = new Future ()
		return self

	@method _onSocketClose
	| Automatically reconnects when `options.reconnect` is true.
		if options reconnect
			reconnect ()

	@method _onSocketOpen
		flush ()
		_onConnect set (self)

	@method _onSocketMessage event
		if _incoming length > 0
			let f = _incoming pop ()
			f setContext (event) set (event data)
		elif options fallback
			options fallback (event)
		else
			_received = prepend (_received, event)
		if _onConnect isNew
			_onConnect set (self)

@function websocket url, options=Undefined
	return new WebSocket (url, options)

# EOF
