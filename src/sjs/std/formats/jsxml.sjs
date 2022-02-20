@feature sugar 2
@module std.formats.jsxml
| Provides methods to load and render JSXML documents.

@import wrap     from std.core
@import http, resolve as http_resolve  from std.io.http
@import Future   from std.io.async
@import error    from std.errors
@import template from std.text
@import relpath, dirname  from std.text.path
@import Instance from std.patterns.registry
@import TOptions from std.patterns.options
@import runtime.modules as modules

# -----------------------------------------------------------------------------
#
# LOADER
#
# -----------------------------------------------------------------------------

# TODO: Move some of the stuff to XSL
@class Loader: Instance, TOptions

	@shared IS_IE11 = window ActiveXObject is not Undefined
	@shared COUNTER = 0

	@shared OPTIONS = {
		stylesheet : "lib/xsl/jsxml.xsl"
		prefix     : "components"
		paths      : [
			"{prefix}{name}/view.js"
			"{prefix}{name}/view.xml"
			"{prefix}{name}"
		]
	}

	# TODO: Should use a self-cleaning cache
	@property cache = {}

	# FIXME: Could be an operation
	@operation ParseXML text
		# FIXME: Might be an issue with Edge
		if IS_IE11
			let doc = new ActiveXObject('Msxml2.DOMDocument.6.0')
			doc loadXML (text)
			return doc
		elif window DOMParser
			return new window DOMParser() parseFromString (text, "text/xml")
		else
			return error ("Browser missing DOMParser", __scope__)

	@method parseXML text
		return ParseXML (text)

	# FIXME: Could be an operation
	@method createXSLTProcessor node
	| Factory method to create an XSLTProcessor from the given XSLT document
	| node.
		if window XSLTProcessor
			let p = new window XSLTProcessor ()
			if node
				p importStylesheet (node)
			return p
		elif window ActiveXObject is not Undefined
			# NOTE: This is IE11, and of course window ActiveXObject == undefined
			# but window ActiveXObject !== undefined
			# Some helpful information: http://blog.pothoven.net/2006/11/using-xml-xpath-and-xslt-with.html
			let p = new ActiveXObject("Msxml2.XSLTemplate.6.0")
			if node
				# NOTE: This will fail if the node is from DOMParser on IE11
				# https://stackoverflow.com/questions/41384726/xslt-not-working-on-ie-11-doesnt-transform-xml
				p stylesheet = node
			return p createProcessor ()
		else
			return error("Browser missing XSLTProcessor implementation", __scope__)

	@method loadXML url
	| Loads the XML document at the given @url
		if not cache[url]
			cache[url] = http get (url) failed {
				error ("Failed to access XML file", url, __scope__)
			}
		return cache[url] chain ()

	@method loadXSL url
	| Loads the XSL stylesheet at the given @url, returning
	| an `XSLTProcessor` instance initialized with the stylesheet.
		# TODO: We might want to implement a request cache, see resolveJSXML
		# below.
		let k = "loadXSL:" + url
		if not cache [k]
			let req = http get (url) failed {
				error ("Failed to access XSL stylesheet at", url, __scope__)
			}
			cache[k] = req chain {
				var xml = _
				if IS_IE11
					# We need to force a re-parsing of the XML document
					# for IE11
					let text = req context request responseText
					xml = parseXML (text)
				elif _ is? String
					xml = parseXML (_)
				if xml is None
					return error ("Failed to parse XSLT stylesheet at ", url, __scope__)
				else
					return createXSLTProcessor (xml)
			}
		return cache[k] chain ()

	@method loadScript:Future text:String, name:String, origin:String=Undefined
	| Loads the given JavaScript code (@text) and returns a @Future
	| holding the loaded module
		# NOTE: Here we have the opportunity to register the components
		# in their own namespace
		let f = new Future ()
		modules parse (text, name, {
			f set (_)
		}, origin)
		return f

	@method resolveJSXML:Future name
		let k = "resolveJSXML:" + name
		if cache[k]
			return cache[k] chain ()
		else
			# NOTE: The strategy here is that we first look for a !component
			# path in the module system, or we default to the options prefix.
			let prefix = modules path ["!component"] or options prefix
			let d = {name:name, prefix:prefix + "/" if prefix else ""}
			let f = http_resolve (options paths ::= {template (_, d)}) always {
				# FIXME: Why are we cleaning the cache entry here?
				if cache[k] is f
					cache[k] = Undefined
				return _
			}
			cache[k] = f
			return f chain ()

	@method loadJSXML:Future url:String, name:String
	| Loads the given JSXML document, resolving the stylesheet, and applying
	| it to transform the XML document into the target format.
		# NOTE: We use expects here because we'll call modules parse in `loadScript`
		# It's safe to call expect more than once
		modules expects (name)
		return loadXML (url) chain {xml|
			if xml is? String
				# We can actually load a JS directly
				return loadScript (xml, name, url)
			else
				var xsl_url = options stylesheet
				# We look for a processing instruction and parse it
				let n       = xml firstChild
				if not n
					return error ("XML document is empty", xml, "from", url, __scope__)
				if (n nodeType == Node PROCESSING_INSTRUCTION_NODE) and (n nodeName == "xml-stylesheet")
					let base = dirname (_ baseURI)
					let d    = document createElement "div"
					d innerHTML = "<span " + n nodeValue + ">_</span>"
					let path = d firstChild getAttribute "href"
					xsl_url  = path if path indexOf "//" != 0 else relpath (path, base)
				return loadXSL (xsl_url) chain {xsl|
					# If there is a default for the rendering engine, we use it
					if modules defaults ["std.formats.jsxml"]
						let r = xml firstElementChild getAttribute "render" or "delta"
						xml firstElementChild setAttribute ("render", modules defaults ["std.formats.jsxml"] render)
					let r = xsl transformToFragment (xml, document)
					# NOTE: We should discriminate between a document with
					# many nodes (ie. HTML) and a purely text-based node.
					if not r
						return error ("XSL stylesheet created empty fragment", xsl_url, ":", document, __scope__)
					else
						return loadScript (r textContent, name, url)
				}
		}

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function resolve name:String
| Resolves the component with the given name
	return Loader Get () resolveJSXML (name)

# TODO: Consider setting resolve to False
@function load:Future name:String, resolve=False
| Tries to resolve the given @url (or name) using @resolve and then loads
| the given JSXML file.
	if not resolve
		return Loader Get () . loadJSXML (name, name)
	else
		let f = new Future ()
		# NOTE: Resolve takes a callback
		modules resolve (name, {f chain (load (_, False))})
		return f

@function convert xml, stylesheet="lib/xsl/jsxml.xsl"
| Converts the given XML using the JSXML stylesheet
	return Loader Get () loadXSL (stylesheet) chain {xsl|
		return xsl transformToFragment (xml, document)
	}


# EOF
