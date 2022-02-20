@feature sugar 2
@module std.api.browser
| A module that implements a user agent string parser (`Parser`) as well
| as a singleton that offers a high-level API for browser
| querying (`Browser`).

@import Text, strip from std.text
@import bool        from std.core
@import first       from std.collections
@import runtime.window as window

# Edge: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246
# Ie11: Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko
# Ie11:

# Browser type
# Browser rendering engine
# Browser version

# Features
# - canvas
# - webgl
# - XSLT

@singleton Parser
| A parser for the user agent strings defined in browsers. We assume that
| UA strings are like `AGENT/N.N (ATTR;ATTR;)` and we return a structure
| that is like:
|
| ```
| Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.2117.157 Safari/537.36
|
|	{"Mozilla":{
|		"Windows NT":[6,1,0],
|		"version":[5,0,0]
|	},"AppleWebKit":{
|		"KHTML":"Gecko",
|		"version":[537,36,0]},
|	"Chrome":{
|		"version":[41,0,2228]
|	},"Safari":{
|		"version":[537,36,0]}
|	}
|	```

	@property reEngine  = new RegExp "([\w\d]+)(/([^\s]+))?(\s+\(([^\)]+)\))?"
	@property reVersion = new RegExp "([^\d]*)(\d+(\.\d)*)"
	@property reLike    = new RegExp "([^,]+),\s*like(.+)$"

	@method parse text
		let res = {}
		Text Search (text, reEngine, {
			onMatch : {
				let e = processEngine(_ groups)
				res[e name] = e has
				e has version = e version
			}
		})
		return res

	@method parseEngine text
	| Parses an engine definition, like `Engine/N.N (ATTR;ATTR;...)`
		return processEngine (text match (reEngine))

	@method processEngine match
		let name    = match[1]
		let version = parseVersion (match[3] or "0.0.0")
		let attrs   = {}
		if match[5]
			Text Search (match[5], ";", {onText:{
				let a = parseAttribute(_)
				attrs[a name] = a version or True
			}})
		return {name, version, has:attrs}

	@method parseVersion text
	| Parses a version number like `N.N.N`
		let version = ((strip (text) split ".") ::= {parseInt (_)})[0:3]
		while version length < 3
			version push (0)
		return version

	@method parseAttribute text
	| Attributes are contained within `(ATTR;ATTR;...)` and usually have
	| a version number.
		text = strip (text)
		let engine = text match (reEngine)
		if engine
			# If the attribute is like an engine definition, we reuse the
			# parser
			let r = processEngine (engine)
			return {
				name    : r name
				version : r version
			}
		else
			# Otherwise we split the words and try to detect
			# version information
			let words = []
			var version = None
			for word in text split " "
				word = strip(word)
				if word
					let v = word match (reVersion)
					if v and not version
						if v[1]
							words push (v[1])
						version = parseVersion (v[2])
					else
						words push (word)
			var name = words join " "
			# We also detect the `NNN, like NNN` format.
			let like = name match (reLike)
			if like
				name = like[1]
				if not version
					version = strip(like[2])
			return {
				name : name
				version : version
			}


# -----------------------------------------------------------------------------
#
# BROWSER
#
# -----------------------------------------------------------------------------

@singleton Browser
| Provides easy browser detection functions.

	@property _useragent

	@getter name
	| Returns the name of the browser
		return first (["Chrome", "Firefox", "Safari", "Edge", "IE", "JSDOM"], {bool(self["is" + _])}) or "Unknown"

	@getter agent
	| Returns the browser user agent string as-is.
		return window navigator userAgent

	@getter properties
	| Returns the parsed agent properties.
		_useragent ?= Parser parse (agent)
		return _useragent

	@getter isAndroid
	| Tells if this device runs Android
		let p = properties
		return (p Mozilla and p Mozilla Android) or p Dalvik

	@getter isIOS
	| Tells if this device runs iOS
		let p = properties
		return p Mozilla and (p Mozilla iPhone or p Mozilla iPad)

	@getter isIPhone
	| Tells if this device is an iPhone
		let p = properties
		return p Mozilla and p Mozilla iPhone

	@getter isIPad
	| Tells if this device is an iPad
		let p = properties
		return p Mozilla and p Mozilla iPad

	@getter isMobile
	| Tells if this device is a phone (Android or IOS supported)
		# Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13E188a Safari/601.1
		let p = properties
		return bool(p Mobile or isIPhone or (p Mozilla and p Mozilla Mobile))

	@getter isTablet
	| Tells if this device is a table (Android or IOS supported)
		let p = properties
		# SEE: https://developer.chrome.com/multidevice/user-agent
		return (isAndroid and (not isMobile)) or isIPad

	@getter isIE11
	| Tells if this brwoser is IE11
		let a = properties
		return a Mozilla and a Mozilla Trident and a Mozilla Trident [0] >= 7

	@getter isIE
	| Tells if this brwoser is IE11
		let a = properties
		return a Mozilla and a Mozilla Trident

	@getter isEdge
	| Tells if this brwoser is Edge
		return properties Edge

	@getter isSafari
	| Tells if this browser is Safari
		return properties Safari and not properties Chrome

	@getter isChrome
	| Tells if this browser is Chrome
		return properties Chrome

	@getter isFirefox
	| Tells if this browser is Firefox
		return properties Firefox

	@getter isJSDOM
	| Tells if this (emulated) browser is JSDOM
		return properties jsdom

	@getter isWindows
	| Returns `False` if the operating system is not window, otherwise
	| returns the version of windows.
	|
	| Here are the versions returned:
	|	- [10, 0, 0] for Windows 10
	|	- [6,  3, 0] for Windows 8.1
	|	- [6,  2, 0] for Windows 8
	|	- [6,  1, 0] for Windows 7
	|	- [5,  1, 0] for Windows XP
		let a = properties
		return a Mozilla and a Mozilla ["Windows NT"] or False

	# TODO: IsLinux, IsOSX, IsIOS, IsAndroid

# -----------------------------------------------------------------------------
#
# FEATURES
#
# -----------------------------------------------------------------------------
# NOTE: We could organize features in levels, so that we know the level
# of support of each browser.
@singleton Features

	@property known = {
		passiveEvents : Undefined
		webGL         : Undefined
		canvas        : Undefined
	}
	| The list of known features

	@getter hasPassiveEvents
		if known passiveEvents is Undefined
			# SEE: https://github.com/WICG/EventListenerOptions/blob/gh-pages/explainer.md
			try
				let o = Object defineProperty ({}, "passive", {
					get : {known passiveEvents = True}
				})
				window addEventListener    ("testPassive", None, o)
				window removeEventListener ("testPassive", None, o)
			catch
				known passiveEvents = False
		return known passiveEvents

	@getter hasWebGL
		if known wegGL is Undefined
			if canvas
				let c = window document createElement "canvas"
				try
					known webGL = canvas getContext "3d" and True or False
				catch
					known webGL = False
			else
				known wegGL = False
		return known webGL

	@getter hasCanvas
		if known canvas is Undefined
			let c = window document createElement "canvas"
			try
				known canvas = canvas getContext "2d" and True or False
			catch
				known canvas = False
		return known canvas

	@getter hasXSLT
		return False

	@getter hasXPath
		return False

	@getter hasSVG
		return False

	@getter hasCustomEvents
		if known customEvents is Undefined
			try
				# IE11 does not allow the creation of custom events like that, so
				# we detect it.
				new CustomEvent("Ready")
				known customEvents = True
			catch
				known customEvents = False
		return known cutomEvents

# -----------------------------------------------------------------------------
#
# API
#
# -----------------------------------------------------------------------------

@singleton API
| The factory singleton provides an abstraction over browser quirks (mainly
| IE) sot that

	@method HasHistory
	| Returns `False` if the API is not supported, otherwise returns a map
	| of the supported methods.
		if not window history
			return False
		else
			return ["pushState", "popState", "replaceState"] ::> {r={},v|r[v]=bool(window history[v]);r}

	@method CustomEvent name, data
	| Creates a new CustomEvent with the given `name` and `data`
	| like `{detail:{},bubbles:‥}`
		if Features CustomEvents
			return new CustomEvent (name, data)
		else
			# IE11 does not allow the direct creation of custom events.
			let e = window document createEvent ("CustomEvent")
			e initCustomEvent (name, bool(data bubbles), False, data detail)
			return e

	@method DOMParser
	| Creates a new dom parsing function that takes `text` and returns
	| a new XML document that can be passed to XSLT.
		if Browser isIE11
			# FIXME: Might be an issue with Edge
			return {text|
				let doc = new ActiveXObject('Msxml2.DOMDocument.6.0')
				doc loadXML (text)
				return doc
			}
		elif window DOMParser
			return {text,type="text/xml"|
				return new window DOMParser() parseFromString (text, type)
			}
		else
			return error ("Browser missing DOMParser", __scope__)

	@method XSLTProcessor node
	| Returns an XSLT processor for the give node corresponding to an
	| XSLT document.
		if window XSLTProcessor
			let p = new window XSLTProcessor ()
			if node
				p importStylesheet (node)
			return p
		elif window ActiveXObject is not Undefined
			# NOTE: This is IE11, and of course window ActiveXObject == undefined
			# but window ActiveXObject !== undefined
			# Some helpful information: http://blog.pothoven.net/2006/11/using-xml-xpath-and-xslt-with.html
			let p = new ActiveXObject ("Msxml2.XSLTemplate.6.0")
			if node
				# NOTE: This will fail if the node is from DOMParser on IE11
				# https://stackoverflow.com/questions/41384726/xslt-not-working-on-ie-11-doesnt-transform-xml
				p stylesheet = node
			return p createProcessor ()
		else
			return error("Browser missing XSLTProcessor implementation", __scope__)

	@method addPassiveEventListener element, name, callback
		if Features passiveEvents
			return element addEventListener (name, callback, {passive:True})
		else
			return element addEventListener (name, callback, False)

@function agent
| Returns the `Browser` singleton
	return Browser

# EOF
