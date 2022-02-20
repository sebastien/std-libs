@feature sugar 2
@module std.state.history
@import error,NotImplemented from std.errors
@import str,copy,merge from std.core
@import removeAt from std.collections
@import dirname from std.text.path
@import Serializer from std.formats.urlhash
@import TSingleton from std.patterns.oo
@import runtime.window as window

# TODO: We might want to refactor that and do `state.url` instead
# TODO: We might want to make this more abstract and support different types of
# backends. In particular, history could be stored in the cookie jar, local
# storage, URL hash, etc. Maybe these could be defined in the std.db. module
# `std.db.{url,cookies,localstorage}`...

# TODO: We might want to limit the number of states stacked in the history,
# as this might otherwise leak.

# -----------------------------------------------------------------------------
#
# HISTORY
#
# -----------------------------------------------------------------------------

# FIXME: We should maybe do a cap for history

@class History: TSingleton

	@shared SEPARATOR    = "#"
	@property _lastState = {}
	@property _lastURL   = Undefined
	@property handler    = new ClickHandler (self)

	@property _serializer = new Serializer ()
	| The default serializer used to convert a state
	| to a string.

	@getter length
		error (NotImplemented, __scope__)

	@constructor
		bind ()
		init ()

	@getter length
		error (NotImplemented, __scope__)

	@getter state
		return _lastState or {}

	@method bind
		pass

	@method init
		_onURLUpdated (None)

	@method get name=Undefined, value=Undefined
		let v = state if name is Undefined else state[name]
		return value if v is Undefined else v


	@method update state, title=window title
	| Pushes a copy of the given `state` merged
	| with the current `state`. This means that we're pushing
	| a state derived from the current state based on the given
	| update.
		return push (merge (copy(state), _lastState))
	
	@method set state, title=window title
	| Pushes a new state on the stack, not merging with the
	| last state.
		return push (state or {})

	@method replace state, title=window title
	| Replaces the current state with the given state.
		let url = _getURL   (state)
		let t   = _getTitle (state, title)
		if _lastURL != url
			_replace (state, t, url)
			_lastURL   = url
			_setState(state)

	# NOTE: Push is not the usual way to interact with it,
	# `set()` is probably the best.
	@method push state, title=window title
	| Pushes a new state in the history.
		let url = _getURL   (state)
		let t   = _getTitle (state, title)
		if _lastURL != url
			_push (state, t, url)
			_lastURL   = url
			_setState(state)
		return self

	@method pop
		_pop ()
		return self

	@method clear key=Undefined
		return key match
			is Undefined
				push {}
			is? Array
				push (key ::> {r=copy(state),v|
					removeAt (r, v)
				})
			is? Object
				key ::> {r=copy(state),v,k|
					removeAt (r, k)
				}
			else
				push (removeAt(copy(state), key))

	@method _push state, title=Undefined
		error (NotImplemented, __scope__)

	@method _replace state, title=Undefined
		error (NotImplemented, __scope__)

	@method _pop
		error (NotImplemented, __scope__)

	@method serialize state
		return _serializer serialize (state)

	@method deserialize text
		return _serializer deserialize (text)

	@method _setState state
	| Sets the given `state` as the current state.
		_lastState = state
		self ! "Update" (state)

	@method _getPublicState state
	| Returns the `public` state from the given state
		return state

	@method _getTitle state, title=Undefined
	| Returns the title that corresponds to the given state. By default,
	| this is either the given `title` or the current `title`.
		if title
			return title
		elif window document
			return window document title
		else
			return Undefined

	@method _getURL state=self state
	| Returns the formatted URL fragment corresponding to the public
	| version of the given state value.
		return window location pathname + SEPARATOR + serialize (_getPublicState (state))

	@method _retrieveURL
		let t = str(window location) 
		if not SEPARATOR
			return t
		else
			let i = text indexOf (SEPARATOR)
			return t[i+1:] if i >= 0 else t

	@method _parseURL text=_retrieveURL()
	| Parses the given URL as as string, and returns the encoded public
	| state in there.
		return deserialize (text)

	@method _onURLUpdated event
		let s    = _parseURL ()
		_lastURL = _getURL (s)
		_setState (s)

# -----------------------------------------------------------------------------
#
# URL HISTORY
#
# -----------------------------------------------------------------------------

@class URLHistory: History

	@shared EVENT = "popstate"

	@property prefix = ""

	@constructor prefix=Undefined
		self prefix = prefix
		super ()

	@method bind prefix=Undefined
		setPrefix (prefix)
		window addEventListener (EVENT, self . _onURLUpdated)
		return self

	@method unbind
		window removeEventListener (EVENT, self . _onURLUpdated)
		return self

	@getter length
		return window history length

	@method setPrefix prefix=Undefined
	| Sets the prefix, and by default extract it from the pathname
		if prefix is Undefined
			let path = window location pathname
			prefix   = path if path[-1] == "/" else dirname (path) + "/"
		self prefix = prefix
		return self

	@method _push state, title, url
		window history pushState (state, title, url )

	@method _replace state, title, url
		window history replaceState (state, title, url)

	@method _pop
		window history popState ()

	@method _onURLUpdated event
		return super _onURLUpdated (event)

	@method _getURL state=self state
	| Returns the formatted URL fragment corresponding to the public
	| version of the given state value.
		return prefix + serialize (_getPublicState (state))

	@method _retrieveURL
		return str(window location pathname) substring (prefix length)

# -----------------------------------------------------------------------------
#
# URL HASH HISTORY
#
# -----------------------------------------------------------------------------

@class URLHashHistory: URLHistory

	@shared EVENT     = "hashchange"

	@property _stack = []

	@getter length
		return _stack length

	@method _push state, title, url
		window location hash = url
		window location title = title
		_stack push (state)

	@method _replace state, title, url
		window location hash  = url
		window location title = title
		_stack[-1] = state

	@method _retrieveURL
		return str(window location hash)[1:]

	@method _getURL state=self state
		return serialize (_getPublicState (state))

# -----------------------------------------------------------------------------
#
# CLICK HANDLER
#
# -----------------------------------------------------------------------------

@class ClickHandler
| An object that implements an `onClick` event that intercepts link clicks
| and translates them ot an history update.

	@property _history = Undefined

	@constructor history
		_history = history

	@method bind node
		node addEventListener ("click", self . onClick, True)

	@method unbind node
		node removeEventListener ("click", self . onClick, True)

	@method onClick event
	| Changes the link behaviour so that the "href" is interpreted like this:
	| - if it starts with a `+`, the string after the `+` will be parsed and merged
	|   in the current URL state
	| - if it starts with a `-`, the string after the `-` will be parsed and removed
	|   from the current URL state
	| - otherwise the content of the `href` will replace the current URL state
		let link = event currentTarget
		var href = link getAttribute "href" or link getAttribute "data-href" or ""
		var t    = link getAttribute "target"
		# We always prevent the default
		event preventDefault ()
		# NOTE: We do not use the custom fromString as we want the link
		# format to be independant of the link formatting
		if href indexOf "http://" == 0 or href indexOf "https://" == 0
			# SEE: http://stackoverflow.com/questions/7924232/open-new-tab-in-javascript
			window open  (href, t or "_blank")
			window focus ()
			return False
		elif href
			_history update  (_history deserialize (href))
			return False
		else
			return True

# EOF
