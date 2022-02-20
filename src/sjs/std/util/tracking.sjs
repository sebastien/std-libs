@feature sugar 2
@module   std.util.tracking
| A set of abstractions around common tracking/analytics API.
@import runtime.window as window
@import json, bool, type, typename from std.core
@import TSingleton from std.patterns.oo
@import assert, warning from std.errors

# TODO: Providers might work like channels/topics, where they only forward
#       events of a given class.

# -----------------------------------------------------------------------------
#
# PROVIDER
#
# -----------------------------------------------------------------------------

@class Provider
| An abstract event tracking provider.

	@shared CREATED = {}
	@shared DEFAULT_ID = Undefined

	@property id = Undefined

	@operation Get id=Undefined
		return CREATED[id]

	@operation Has id=DEFAULT_ID
	| When `id` is undefined, tells if any provider of this type is installed.
	| When `is` is given, tell if the provider of this type with the given
	| `id` is installed.
		if id is Undefined
			return len(CREATED) > 0
		else
			return bool(CREATED[id])

	@operation Install id:String=DEFAULT_ID, options=Undefined
	| Installs the tracking provider with the given `id` and `options`.
		if not Has (id)
			let res = Create(id)
			Tracking Get () add (res)
			return res
		else
			return Get (id)

	@operation Create id:String=DEFAULT_ID, options=Undefined
	| Creates the tracking provider with the given `id` and `options`.
		assert (id, "A tracking identifier must be given to the provider")
		if not CREATED[id]
			CREATED[id] = _Create (id, options) or True
		return CREATED[id]

	@operation _Create id, options
	| Abstract operation that actually installs the specific provider
	| in the application.
		return new self (id, options)

	@constructor id
		self id = id

	@method accepts source:String, event:String, value:Any
	| Allows providers to only accept a subset of events. By default, all events
	| are accepted.
		return True

	@method track source:String, event:String, value:Any
	| Abstract method that track an `event` from the given `source` with
	| the given `value`.
		warning ("Provider does not implement tracking", typename(type(self)), __scope__)

# -----------------------------------------------------------------------------
#
# CONSOLE
#
# -----------------------------------------------------------------------------

@class Console: Provider

	@shared DEFAULT_ID = "console"

	@method track source:String, event:String, value:Any
		console log ("std.util.tracking:", source + "." + event, "=", {source,event,value})

# -----------------------------------------------------------------------------
#
# GOOGLE ANALYTICS
#
# -----------------------------------------------------------------------------

# SEE: https://developers.google.com/analytics/devguides/collection/analyticsjs/
@class GoogleAnalytics: Provider

	@operation _Create id, options=Undefined
	| Installs the Google Analytics code and returns an initialized
	| instance of this provider.
		# SEE: https://developers.google.com/tag-manager/quickstart
		assert (id, "A Google Analytics id like `UA-XXXXXXXX-X` must be provided")
		# We inject the data layer before we load the GTM
		let head_script = document createElement "script"
		head_script innerText = "(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');ga('create', '" + id + "', 'auto');ga('send', 'pageview');"
		document head appendChild (head_script)
		# And return the corresponding configured provider
		return new GoogleAnalytics (id)

	@method track source, event, value
	| Pushes the given event to the data layer.
		# SEE: https://developers.google.com/analytics/devguides/collection/analyticsjs/events
		if not window ga
			warning ("Google Analaytics (window.ga) is not available", __scope__)
		else
			window ga ("send", "event", {
				eventCategory :source
				eventAction   :event
				eventLabel    :value if value is? String else json(value)
			})

# -----------------------------------------------------------------------------
#
# GOOGLE TAG
#
# -----------------------------------------------------------------------------

# SEE: https://developers.google.com/analytics/devguides/collection/gtagjs/
@class GoogleTag: Provider
| The GoogleTag is the more recent version of GoogleAnalytics and has a
| similar infrastructure/format as Google Tag Manager.

	@operation _Create id, options=Undefined
	| Installs the Google Analytics code and returns an initialized
	| instance of this provider.
		# SEE: https://developers.google.com/tag-manager/quickstart
		assert (id, "A Google Tag (GTag) id like `UA-XXXXXXXX-X` must be provided")
		# We inject the data layer before we load the GTM
		let head_script = document createElement "script"
		head_script setAttribute ("async", "")
		head_script setAttribute ("src", "https://www.googletagmanager.com/gtag/js?id=" + id)
		window dataLayer ?= []
		let layer = window dataLayer
		let log = {layer push (arguments)}
		log ("js", new Date ())
		log ("config", id)
		document head appendChild (head_script)
		return new GoogleTag (id, layer)

	@property _layer = None

	@constructor id, layer
		super (id)
		_layer = layer

	@method _track args...
		_layer push (arguments)

	@method track source, event, value
	| Pushes the given event to the data layer.
		# SEE: https://developers.google.com/analytics/devguides/collection/gtagjs/events
		_track ("event", event, {
			event_category : source
			event_label    : value if value is? String else json(value)
		})

# -----------------------------------------------------------------------------
#
# GOOGLE TAG MANAGER
#
# -----------------------------------------------------------------------------

# SEE: https://developers.google.com/tag-manager/quickstart
# NOTE: It is important to publish before
# SEE: https://stackoverflow.com/questions/29243170/404-error-for-google-tag-manager
@class GoogleTagManager: GoogleTag
| A provider that installs and configures a Google Tag Manager (GTM) instance for
| the whole page.

	@operation _Create id, options=Undefined
	| Installs the Google Tag Manager code and returns an initialized
	| instance of the Google Tag Manager provider.
		assert (id, "A GTM id like `GTM-XXX` must be provided")
		let head_script = document createElement "script"
		# We inject the data layer before we load the GTM
		window dataLayer ?= []
		head_script innerText = "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0], j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','" + id + "');"
		# This is the pure JavaScript version of the noscript tag insertion
		let body_noscript = document createElement "noscript"
		let frame = document createElement "iframe"
		frame setAttribute ("src", "https://www.googletagmanager.com/ns.html?id='" + id + "'")
		frame setAttribute ("height", "0")
		frame setAttribute ("width", "0")
		frame setAttribute ("style", "display:none;visibility:hidden")
		body_noscript appendChild (frame)
		# We append the tags to the head and body
		if not document head
			return error ("Document has no <head> tag, cannnot install Google Tag Manager")
		else
			document head appendChild (head_script)
		if not document body
			return error ("Document has no <body> tag, cannnot install Google Tag Manager")
		if document body firstChild
			document body insertBefore (body_noscript, document body firstChild)
		else
			document body appendChild (body_noscript)
		# And return the corresponding configured provider
		return new GoogleTagManager (id, window dataLayer)

	@method track source, event, value
	| Pushes the given event to the data layer.
		# NOTE: This is the same format as GoogleTag Manager
		let data = {
			event  : event
			source : source
			label  : value if value is? String else json (value)
		}
		_layer push (data)

# -----------------------------------------------------------------------------
#
# TRACKING
#
# -----------------------------------------------------------------------------

@class Tracking: TSingleton
| The hub that aggregates event tracking systems.

	@property _providers = []

	@method add provider
		assert (provider, "Trying to register an empty provider", provider)
		_providers push (provider) if provider not in _providers
		return provider

	@method track source:String, event:String, value:Any
		for provider, i in _providers
			if not provider
				warning ("Empty provider registered at index", i, __scope__)
			elif provider accepts (source, event, value)
				provider track (source, event, value)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function track source:String, event:String, value:Any
| Tracks the given `event` coming from the given `source`, with the given `value`.
	Tracking Get () track (source, event, value)

# EOF - vim: ts=4 sw=4 noet
