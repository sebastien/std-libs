@feature sugar 2
@module std.formats.css
@import len, identity          from std.core
@import warning                from std.errors
@import future                 from std.io.async
@import now, repeat, timestamp from std.io.time
@import http                   from std.io.http
@import relpath, dirname       from std.text.path
@import parseURL, relURL       from std.text.url
@import Text, unquote         from std.text
@import runtime.window as window

@shared RE_LINK     = new RegExp "url\(\s*([^\)]+)\)"
@shared STYLESHEETS = {}

@function inject url, text=Undefined
| Injects the given stylesheet in the document, either by URL or by text.
| Returns the injected link or style node.
	if text is Undefined
		# We inject the CSS without a text, which means it
		# will be loaded asynchronously.
		let node = window document createElement "link"
		node setAttribute ("rel", "stylesheet")
		node setAttribute ("href", url)
		if window document and window document head
			window document head appendChild (node)
		else
			warning ("No document head found, cannot inject CSS link node", node, _scope__)
		return node
	else
		let node = window document createElement "style"
		node appendChild (window document createTextNode (text))
		if window document and window document head
			window document head appendChild (node)
		else
			warning ("No document head found, cannot inject CSS style node", node, _scope__)
		return node

@function relink text, processor=identity
| Transforms any link encountered in the given text (corresponding to a
| CSS source file) and returns the result as a text.
	return Text Split (text, RE_LINK, {t,m|'url("' + processor(unquote(m groups [1]))  + '")'}) join ""

@function load url
| Loads the CSS at the given @url, making sure it is not loaded twice, and
| injecting it later in the document.
	if STYLESHEETS[url]
		return STYLESHEETS[url] chain ()
	else
		# We compute the base URL so that we can rewrite links when injecting
		let css_url    = parseURL (url)
		let page_url   = parseURL ("" + window location)
		let base_url   = relURL   (css_url, page_url)
		# If the base URL has a server or a protocol, then we need to use it as a prefix
		let prefix_url = ((base_url protocol or "") + "://" + base_url server) if base_url server else ""
		# We generate a random ID and a random color
		# NOTE: The parsInt is courtesy of IE11
		# TODO: We should actually use a compact hash based on the URL, ideally
		# the hash would map to a single color, which would it trivial to see
		# if the CSS was already loaded/applied.
		let t          = "STD_FORMATS_CSS_" + parseInt (Math round (timestamp () + Math random () * 1000))
		let rgb        = 0..3 ::= {Math round (Math random () * 255)}
		let v          = "rgb(" + rgb join ", " + ")"
		let rule       = "\n#" + t + " {color:" + v + ";}"
		let expected   = {(t):{color:v}}
		base_url path  = dirname  (base_url path)
		let f = http get (url) chain {text|
			# We rewrite links so that they're relative to the CSS when injected,
			# making sure we don't rewrite the local references (common in SVG
			# documents).
			text  = relink (text, {
				if _[0] == "#" or _ indexOf "//" >= 0
					return _
				else
					return prefix_url + relpath (_, base_url path)
			}) + rule
			# We inject the CSS
			inject (url, text)
			# We wait for the expected styles to arrive
			return join (expected)
		}
		STYLESHEETS[url] = f
		return f

@function join styles, timeout=15s, every=250ms
| Returns a future that will be set within `timeout` milliseconds when
| all the given `styles` are satisfied.
|
| Styles is expected to be `{<id>:{<style>:<value>}}`, where `id`
| is a node ID (without the `#`), `style` a valid CSS style property
| and `value` a style property value.
|
| The values will be normalized before being tested.
	# We map the styles to a set of nodes that we make sure
	# won't be visible in the DOM
	let nodes = styles ::= {v,k|
		let n = window document createElement "div"
		if window document getElementById (k)
			warning ("An element with id #" + k + " already exists in the document", __scope__)
		n setAttribute ("id", k)
		n style display = "none"
		n style visibility = "hidden"
		window document body appendChild (n)
		return n
	}
	# Now we normalize the style values so that we guarantee they
	# will be stable for that specific browser
	let n = window document createElement "div"
	let expected = styles ::= {v|
		return v ::= {sv,sk|
			n style [sk] = sv
			return n style [sk]
		}
	}
	let f = future ()
	let t = now ()
	repeat ({
		let e = now () - t
		# We compute the amount of styles that have not been applied yet.
		# We use this slightly awkward imperative so that we break as soon
		# as one style is not ready. Because this is going to be executed
		# one a relatively tight loop, we want it as fast as possible.
		var c = 0
		for v,k in expected
			let n = nodes[k]
			let s = window getComputedStyle (n)
			for sv, sk in v
				if s[sk] != sv
					c += 1
					break
			if c > 0
				break
		# If the counter is 0, then all styles have matched.
		if c == 0
			f set {elapsed:e, styles}
		elif e > timeout
			f fail ()
		# In case of success or failure, we cleanup the
		# remaining nodes
		if c == 0 or e > timeout
			nodes :: {_ parentNode removeChild (_)}
			return False
	}, every)
	return f

# EOF
