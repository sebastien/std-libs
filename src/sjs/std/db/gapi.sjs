@feature sugar 2
@module  std.db.gapi
| A thin wrapper around Google's generic API.

@import  assert, warning, error from std.errors
@import  merge from std.collections
@import  future from std.io.async
@import  runtime.window as window

# -----------------------------------------------------------------------------
#
# GOOGLE SHEETS CONNECTOR
#
# -----------------------------------------------------------------------------

# TODO: Provide an abstraction over the scopes

# SEEL https://developers.google.com/sheets/api/quickstart/js
# SEE: https://developers.google.com/identity/protocols/OAuth2
# SEE: https://developers.google.com/api-client-library/javascript/features/authentication
@class GAPIConnector
| A wrapper class that manages a connection to Google the Google API.

	@shared GOOGLE_API = False
	| Managed by `EnsureGoogleAPI`, will contain a future with the Google
	| API object reference.

	# Client ID and API key from the Developer Console
	@shared CONFIGURATION = {
		key       : Undefined # The API key
		client    : Undefined # The client ID (optional)
		# Authorization scopes required by the API; multiple scopes can be
		# included, separated by spaces.
		# e.g "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.profile"
		scopes    : "https://www.googleapis.com/auth/spreadsheets"
		# Array of API discovery doc URLs for APIs used by the quickstart
		discovery : [
			"https://sheets.googleapis.com/$discovery/rest?version=v4"
			"https://www.googleapis.com/discovery/v1/apis/drive/v2/rest"
		]
	}

	@operation EnsureGoogleAPI
	| Makes sure that the Google API script is loaded, returning a future
	| that contains a reference to it.
		# NOTE: This does some weird thing in chrome where it clears the console.
		#       console errors might get hidden by this
		if not GOOGLE_API
			let script   = window document createElement "script"
			script type  = "text/javascript"
			script async = True
			script src   = "https://apis.google.com/js/api.js"
			GOOGLE_API   = future ()
			script onload = {
				window gapi load ("client:auth2", {GOOGLE_API set (window gapi)})
			}
			window document getElementsByTagName "head"[0] appendChild (script)
		return GOOGLE_API chain {return _}

	@event Connected
	| Indicates a change in the connection status

	@event Signed
	| Indicates that the user is now connected

	@property _isSignedIn  = False
	@property _loading     = Undefined
	| Will hold a future that will be satisfied when the GAPI module is loaded.
	@property _connection  = future ()
	@property _config      = Undefined
	@property gapi         = Undefined

	# =========================================================================
	# CONSTRUCTOR
	# =========================================================================

	@constructor configuration=Undefined
	| Creates a new Google Sheets connector with the given condfiguration.
	| The configuration should have at least `{client,key}` with
	| respectively the `client` ID and the API `key`.
		_config  = merge (merge ({}, configuration), CONFIGURATION)
		_loading = EnsureGoogleAPI () chain (onGoogleAPILoaded)

	@method then
	| Returns a future representing the connection state.
		return _connection chain {return self}

	# =========================================================================
	# ACCESSORS
	# =========================================================================

	@getter isLoaded
		return _loading isFinished

	@getter isConnected
		return _connection isSuccess

	# =========================================================================
	# BACKEND EVENT HANDLERS
	# =========================================================================

	@method onGoogleAPILoaded gapi
	| Does the client authentication, which will then trigger the the `onUpdateSignInStatus`
		assert (gapi,           "Google API not loaded yet")
		assert (_config,        "No configuration given yet")
		assert (_config key,    "Missing `key` entry in configuration (API key)")
		assert (_config client, "Missing `client` entry in configuration (API key)")
		self gapi = gapi
		# SEE: https://developers.google.com/api-client-library/javascript/samples/samples#LoadinganAPIandMakingaRequest
		return gapi client init {
			discoveryDocs      : _config discovery
			clientId           : _config client
			apiKey             : _config key
			scope              : _config scopes
			fetch_basic_profile: True
		} then {
			# Listen for sign-in state changes.
			gapi auth2 getAuthInstance() isSignedIn listen (onUpdateSignInStatus)

			# Handle the initial sign-in state.
			onUpdateSignInStatus (gapi auth2 getAuthInstance() isSignedIn get())
			_connection set (True)
			self ! Connected (True)
		}

	@method onUpdateSignInStatus isSignedIn
	| Callback notifying a change in the connection status.
		_isSignedIn = isSignedIn
		self ! Signed (_isSignedIn)

	# =========================================================================
	# SIGN IN/OUT
	# =========================================================================

	@method login
	| Logs the current user in. You don't need to login/logout to use
	| the GAPI connector.
		if not _loading isFinished
			return _loading chain {connect ()}
		elif _connection isFinished
			return _connection chain {self}
		else
			return future (gapi auth2 getAuthInstance() signIn ()) chain {return self}

	@method logout
	| Logs the current user out.
		if not _loading isFinished
			return _loading chain {disconnect ()}
		elif _connection isFinished
			return _connection chain {self}
		else
			return future (gapi auth2 getAuthInstance () signOut ()) chain {return self}

	# =========================================================================
	# USER API
	# =========================================================================

	@method getUserInfo
		# FIXME: Find a better way to get the user info, This is brittle
		# and is likely to break on a rebuild as these properties are obfuscated.
		assert (gapi, "Google API not loaded yet")
		let user = gapi auth2 getAuthInstance() currentUser Aia value w3
		if not user
			return Undefined
		return {
			name     : user ofa
			fullName : user ig
			img      : user Paa
			email    : user U3
		}

	@method getUserEmail
		# FIXME: Equally brittle
		let user = getUserInfo ()
		return user and user email

	# =========================================================================
	# FILE API
	# =========================================================================

	# FIXME: Needs refactoring. What is fileId?
	# @method createCopy fileId, copyTitle
	# | Copies the file and returns a future with the link to the new file
	# | NOTE: This needs drive permissions
	# 	var f = future ()
	# 	var request = gapi client drive files copy ({
	# 		"fileId"   : fileId
	# 		"resource" : {"title" : copyTitle}
	# 	})
	# 	signIn () then ({
	# 		request execute ({resp|
	# 			f set (resp alternateLink)
	# 		})
	# 	})
	# 	return f

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function connect configuration=Undefined
	return new GAPIConnector (configuration) connect ()

# EOF
