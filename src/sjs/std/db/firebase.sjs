@feature sugar 2
@module std.db.firebase
@import firebase
@import future, Future from std.io.async
@import channel        from std.io
@import error, warning from std.errors
@import len            from std.core
@import keys           from std.collections
@import Operation      from std.state.journal
@import assert, error, Exception, BadArgument from std.errors
@import runtime.window as window

# TODO: Only use futures
# TODO: Use modularized Firebase

# -----------------------------------------------------------------------------
#
# FIREBASE CONNECTOR
#
# -----------------------------------------------------------------------------

@class FirebaseConnector
| A class for connecting to a Firebase database. Includes methods for user
| authentication, writing to the database, and reading from the database.
|
| Note that you will need to include the following JavaScript files to your
| project to use this connector:
|
| - https://www.gstatic.com/firebasejs/live/3.0/firebase.js
|
| TODO:
|
| - Implement additional authentication methods (ex: Facebook, Twitter, Google)
| - Implement methods for querying
|

	@shared ON_VALUE           = "value"
	@shared ON_CHILD_ADDED     = "child_added"
	@shared ON_CHILD_CHANGED   = "child_changed"
	@shared ON_CHILD_REMOVED   = "child_removed"
	@shared ON_CHILD_MOVED     = "child_moved"

	@property connectionCallbacks = []

	@property isDebugging  = False

	@property _app = None
	| The Firebase App instance
	| (see https://firebase.google.com/docs/reference/js/firebase.app.App)

	@property _db = None
	| The Firebase database instance

	@property _root = None
	| A reference to the root of the Firebase database
	| (see https://firebase.google.com/docs/reference/js/firebase.database.Database#ref)

	@property _user = None
	| The Firebase user that is currently authenticated
	| (see https://firebase.google.com/docs/reference/js/firebase.User)

	@property _config = None
	| The configuration used to connect to the database. Must include
	| the following properties:
	|
	| - apiKey        : Found in Firebase Console > Settings > Project > Web API Key
	| - authDomain    : <project-id>.firebaseapp.com
	| - databaseURL   : "https://<project-name>.firebaseio.com"
	| - storageBucket : "<project-bucket>.appspot.com"
	|
	| (see https://firebase.google.com/docs/database/web/start#initialize_the_database_javascript_sdk)

	@property _connectedFuture = None
	@property _authType        = None

	# =========================================================================
	# CONNECTION
	# =========================================================================

	@constructor config=None
		_config = config
		if _config
			connect (_config)

	@method debug enable=True
		if enable is not isDebugging
			enableFirebaseLogging (enable)
			isDebugging = enable
		return self

	@getter root
		return _root

	@getter isConnected
		return _connectedFuture and _connectedFuture isSuccess

	@getter isAuthenticated
		return _authType != None

	# FIXME: Connect should return a future
	# FIXME: Connect should check if the configuration has changed
	@method connect config=_config
	| Connects to Firebase using the given database `config` and executes
	| the given `callback` when successfully connected to the database.
		if isDebugging
			console log ("db.firebase: Connecting with", config)
		if config and config is _config
			assert (_connectedFuture)
			return _connectedFuture
		let f = future ()
		_authType        = None
		_connectedFuture = f
		_config          = config
		if firebase
			var success  = False
			try
				_app  = firebase initializeApp (config)
				_db   = _app database ()
				_root = _db ref ()
				success          = True
			catch
				error (new ConnectionError (config), __scope__)
			if success
				if isDebugging
					console log ("firebase.db: Successfully connected with", config)
				f set (self)
			else
				if isDebugging
					console warning ("firebase.db: Failed connecting with", config)
				f fail ()
		else
			error (FirebaseMissing, __scope__)
			f fail ()
		return f

	@method then
	| Returns a future that will be triggered when Firebase successfully connects.
		if not _connectedFuture
			error ("Call Firebase.connect before calling Firebase.then", __scope__)
			return future () fail ()
		else
			return _connectedFuture chain {return _}

	# =========================================================================
	# AUTHENTICATION
	# =========================================================================

	@method authenticate type="anonymous", email=None, password=None
	| Authenticates a user. When the `type` is 'anonymous', then the user
	| is signed in anonymously to Firebase. When the `type` is 'account', the
	| user is signed in using the given `email` and `password.
		# TODO: Implement other authentication types (i.e: Facebook, Google, Twitter)
		let f = new Future ()
		if not _app
			connect ()
		_authType    = None
		if type == "anonymous"
			# FIXME: What about failure
			firebase auth () signInAnonymously () then {
				_authType = type
				f set ({type:type, user:None})
			} catch {
				f fail (_)
			}
		elif type == "account"
			# FIXME: What about failure
			firebase auth () signInWithEmailAndPassword (email, password) then {_|
				_authType = type
				_user = _
				f set ({type:type, user:_})
			} catch {
				f fail (_)
			}
		else
			return error (__scope__, "authentication type not implemented", type)
		return f

	@method signOut
	| Signs the user out of Firebase.
		firebase auth () signOut ()

	# =========================================================================
	# USER
	# =========================================================================

	@method getUserName
	| Returns the authenticated user's display name. If the user does not have
	| a display name, then their email address is returned.
		return (_user displayName or _user email) if _user else None

	@method getUserId
	| Returns the UID for the currently authenticated user.
		return _user uid if _user else None

	@method isAuthenticated
	| Returns `true` if the user is authenticated.
		return _user and True or False

	# =========================================================================
	# DATABASE WRITING
	# =========================================================================

	@method push path, value
	| Pushes the given `value` to the given database `path`. Returns a Promise
	| that executes the `onSuccess` callback when the write was successful, or
	| the `onFail` callback if the push failed.
		if isDebugging
			_logOutgoingData ("push", path, value)
		return _future (_ref (path) push (value), path)

	@method set path, value
	| Sets given database `path` to the given `value`. Returns a Promise
	| that executes the `onSuccess` callback when the write was successful, or
	| the `onFail` callback if the write failed.
		if isDebugging
			_logOutgoingData ("set", path, value)
		return _future (_ref (path) set (value), path)

	@method update path, value=Undefined
	| Updates the given database `path` with the given `value`. Returns a Promise
	| that executes the `onSuccess` callback when the write was successful, or
	| the `onFail` callback if the write failed.
		if value is Undefined
			if path is? String
				warning ("Calling update with no value", path, __scope__)
				return future () fail ()
			elif path is? Object
				if isDebugging
					_logOutgoingData ("update", path)
				return _future (_root update (path), path)
			else
				return future () fail ()
		else
			if path
				# NOTE: Here update will decompose the value so that
				# it does a partial update at the path
				let v = value ::> {r={},v,k|r[path + "/" + k] = v;r}
				return update (v)
			else
				return future () fail ()

	# FIXME: Convert
	@method remove path, onSuccess, onFail
	| Removes the data stores in the given database `path` from the database.
	| Returns a Promise that executes the `onSuccess` callback when the write
	| was successful, or the `onFail` callback if the write failed.
		let p = _ref (path)
		if isDebugging
			_logOutgoingData ("remove", p, value, onSuccess, onFail)
		return p remove () then (onSuccess) catch (onFail)

	# =========================================================================
	# LISTENING
	# =========================================================================

	# SEE:https://firebase.google.com/docs/reference/js/firebase.database.Reference#on

	@method onChange path
	| Returns a future that will be partially updated with an `std.data.journal.Operation`
	| representing the change that happened at the given path.
		let f = future ()
		let r = _ref (path)
		let update = {datum, event|
			let k = datum key
			let v = datum val ()
			let o = event match
				is "added"
					# NOTE: We used Init before, but init is really
					# meant to clear the whole objeect.
					Operation Set (Undefined, v, k)
				is "changed"
					Operation Set (Undefined, v, k)
				is "removed"
					Operation Remove (Undefined, v, k)
				is "moved"
					# NOTE: Not sure if that's the best way to handle it
					Operation Set (Undefined, v, k)
				else
					error ("Unsupported change event type", event, __scope__)
			f setPartial (o)
		}
		# We curry the `update` function to create specialized
		# event handlers.
		let update_changed = {update(_, "changed")}
		let update_added   = {update(_, "added")}
		let update_removed = {update(_, "removed")}
		let update_moved   = {update(_, "moved")}
		# FIXME: Not sure about the handling of failures here
		r on (ON_CHILD_ADDED,   update_added,   f . fail)
		r on (ON_CHILD_CHANGED, update_changed, f . fail)
		r on (ON_CHILD_REMOVED, update_removed, f . fail)
		r on (ON_CHILD_MOVED,   update_moved,   f . fail)
		f !+ "Cancel" {
			r off (ON_CHILD_ADDED,   update_added)
			r off (ON_CHILD_CHANGED, update_changed)
			r off (ON_CHILD_REMOVED, update_removed)
			r off (ON_CHILD_MOVED,   update_moved)
		}
		return f

	@method onValue path
		return _many (path, ON_VALUE)

	@method onceValue path
		return _once (path, ON_VALUE)

	@method onChildAdded path
		return _many (path, ON_CHILD_ADDED)

	@method onceChildAdded path
		return _once (path, ON_CHILD_ADDED)

	@method onChildRemoved path
		return _many (path, ON_CHILD_REMOVED)

	@method onceChildRemoved path
		return _once (path, ON_CHILD_REMOVED)

	@method onChildChanged path
		return _many (path, ON_CHILD_CHANGED)

	@method onceChildChanged path
		return _once (path, ON_CHILD_CHANGED)

	@method onChildMoved path
		return _many (path, ON_CHILD_MOVED)

	@method onceChildMoved path
		return _once (path, ON_CHILD_MOVED)

	# =========================================================================
	# QUERYING
	# =========================================================================

	@method get path=None
	| Returns the value of the object at the given path.
		return _once (path, "value") chain {_ val ()}

	@method mget path=None, values=Undefined
	| Returns the given list of paths
		error ("Not implemented", __scope__)

	@method list path=None
	| Returns the keys/ids of the objects at the given path. Under the
	| hood this uses `get()`.
		return get (path) chain { keys (_) }

	@method set path, value
		let f = future ()
		_ref (path) set (value) then {f set {path:path, value:value}} catch {f fail (path)}
		return f

	# TODO: Qyert should wrap the results in a future, as otherwise you're
	# better off with the Firebase API using `connector root`
	@method query path, parameters={}, once=True, callback
		var ref = _ref (path)
		# This extracts the query parameters and updates teh query accordingly
		if parameters orderByValue
			ref = ref orderByValue ()
		elif parameters orderByChild
			ref = ref orderByChild (parameters orderByChild)
		else
			ref = ref orderByKey ()
		ref = ref equalTo      (parameters equalTo)      if parameters equalTo      else ref
		ref = ref startAt      (parameters startAt)      if parameters startAt      else ref
		ref = ref endAt        (parameters endAt)        if parameters endAt        else ref
		ref = ref limitToFirst (parameters limitToFirst) if parameters limitToFirst else ref
		if not (callback is? Undefined)
			ref = ref once ("value", callback) if once else ref on ("value", callback)
		else
			ref = ref once ("value") if once else ref on ("value")
			ref = ref then { _ val ()}
		return ref

	# =========================================================================
	# LOW LEVEL API
	# =========================================================================

	@method _ref path=None
	| Returns the database reference for the given path (see
	| https://firebase.google.com/docs/reference/js/firebase.database.Reference).
		assert (_root, "Connector is not connected to a Firebase Realtime Database")
		if not path or path == "/"
			return _root
		else
			return _root child (path)

	@method nextID
	| Returns a unique ID.
		assert (_root, "Connector is not connected to a Firebase Realtime Database")
		return _root push () key

	@method getServerTimestamp
	| Returns a placeholder for the Firebase server timestamp.
	| See https://firebase.google.com/docs/reference/js/firebase.database.ServerValue
		return firebase database ServerValue TIMESTAMP

	@method getLatency
	| Returns a Future whose value will be the estimated latency (in
	| milliseconds) between the client and the Firebase server.
		let f = new Future ()
		bindOnceValue (".info/serverTimeOffset", {_|
			f set ( _ val ())
		}, {_|
			f fail (_)
		})
		return f

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _once path, event
	| Returns a future that will be updated only once when the
	| value is received.
	|
	| The future receives the Firebase value as-is.
		return _future (_ref (path) once (event))

	@method _many path, event
	| Returns a future that will be update (using setPartial) each
	| time a value is received.
	|
	| The future partial receives the Firebase value as-is.
		if not path is? String
			error (BadArgument, "path", path, [String], __scope__)
		let f = future ()
		let l = []
		let on_append = {f setPartial (_)}
		let on_fail   = {
			if f isNew or f isWaiting
				f fail ()
			else
				warning ("Failure received, but future has already partially succeeded", f status __name__, ":", _, __scope__)
		}
		# We don't use the Promise API because we need to unbind the callback
		let r      = _ref (path) on (event, on_append, on_fail)
		let do_end = {r off (event, on_append) ; f !- "Cancel" (do_end)}
		f !+ "Cancel" (do_end)
		return f

	@method _future promise, path
	| Wraps the Firebase promise in a std.io.async Future. The future's context
	| is assigned to the Firebase promise. The value is passed as-is.
		let f  = future ()
		f context = path
		promise then {
			f set (_)
		} catch {
			if f isNew or f isWaiting
				f fail (_)
			else
				warning ("Promise at '" + path + "' failed, but future has already partially succeeded", f status __name__, ":", _, __scope__)
		}
		return f

	# =========================================================================
	# DEBUGGING
	# =========================================================================

	@method enableFirebaseLogging enable=True, persist=False
	| Enables/disables logging of Firebase debugging information in the console.
	| If `persist` is `True` then the logging state is persisted across page
	| refreshes.
	| ** ALSO NOTE: If `persist` is `True`, the output to the console
	| will NOT be prefixed with [FIREBASE DEBUGGING] (as that's our own custom
	| logging flair, and Firebase doesn't allow custom logging when `persist`
	| is `True`)

		if enable
			let f = { console log ("%c[db.firebase]", "color:orange", _)}
			firebase database enableLogging (f, persist)
		else
			firebase database enableLogging (False, persist)
		return self

	@method _logOutgoingData method, path, value, successCallback, failCallback
		console group ("[db.firebase] ――→ ", method)
		console log ("outgoing to Firebase")
		if method == "multipathUpdate"
			for d, p in value
				console log ("path:", p, ", data:", d)
		else
			console log ("path:", path)
			console log ("data:", value)
		console log ("success callback:", successCallback)
		console log ("failure callback:", failCallback)
		console groupEnd ()

	@method _logIncomingData event, path, value, callback, once=False
		console group ("[db.firebase] ←―― ", event)
		console log ("incoming from Firebase")
		console log ("path:", path)
		console log ("data:", value)
		console log ("callback:", callback)
		if once
			console log ("NOTE: Callback was bound using `.once(...)` and will thus be unbound following this event.")
		else
			console log ("NOTE: Callback was bound using `.on(...)` and will thus continue to listen for other ", event, " events until unbound.")
		console groupEnd ()


# -----------------------------------------------------------------------------
#
# FIREBASE MISSING
#
# -----------------------------------------------------------------------------

@singleton FirebaseMissing: Exception

	@property filepath = "https://www.gstatic.com/firebasejs/4.0.0/firebase.js"

	@method write writer, origin
		writer (origin + ": window.firebase not defined. Check that you have included the firebase.js file (", filepath, ") and try again.")

# -----------------------------------------------------------------------------
#
# CONNECTION ERROR
#
# -----------------------------------------------------------------------------

@class ConnectionError: Exception

	@shared ARITY = 1

	@property config = Undefined

	@constructor config={}
		super ()
		self config = config

	@method write writer, origin
		writer (origin + ": Could not connect to Firebase with the given configuration details:", config)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function connect config
	return new FirebaseConnector () connect (config)

# EOF
