@feature sugar 2
@module  std.util.sharing
@import  merge, copy, str from std.core
@import keys from std.collections
@import error from std.errors
@import template         from std.text
@import runtime.window as window

@shared META_TAGS = {
	og :{
		url   : "og:url"
		title : "og:title"
		text  : "og:description"
	}
	twitter :{
		text : "twitter:description"
	}
}

@shared NETWORK_URLS = {
	googleplus : "https://plus.google.com/share?url={url}&text={text}"
	facebook   : "http://www.facebook.com/sharer.php?u={url}"
	twitter    : "https://twitter.com/intent/tweet?url={url}&text={text}"
	linkedin   : "https://www.linkedin.com/shareArticle?mini=true&url={url}&summary={text}&title={title}"
	pinterest  : "http://pinterest.com/pin/create/button/?url={url}&description={text}"
	email      : "mailto:{recipient}?subject={title}&body={text}"
}

@shared NETWORK_WINDOWS = {
	default    : [350, 250]
	facebook   : [555, 328]
	linkedin   : [350, 350]
	googleplus : [350, 500]
}

@class Sharing
| An object that allows to share the current URL (or another URL) on social
| networks. By calling `share(network)`

	@property values = {
		googleplus : {url:"", title:"", text:""}
		facebook   : {url:"", title:"", text:""}
		twitter    : {url:"", title:"", text:""}
		linkedin   : {url:"", title:"", text:""}
		pinterest  : {url:"", title:"", text:""}
	}

	@constructor value={}
	| We scrape the meta values in the header for options and
	| optionally you can add a `value` object in the format `{url:"",title:"",text:""}`
	| this value will override any values set in the header meta.
		for default_value, network in self values
			var meta_value       = _getMetaOptions (network)
			var in_value         = value
			self values[network] = _mergeValues (default_value, in_value, meta_value)

	@method set value, network=Undefined
	| Sets the value for all the shares (like the constructor).
	| If a network is defined it will set the value only for that network
		network = _validateNetworkId (network)
		if network
			var current_value    = self values [network]
			self values[network] = _mergeValues (current_value, value)
		else
			# We override all the network values with the set value
			for current_value, network in self values
				self values[network] = _mergeValues (current_value, value)


	@method get network
	| Returns the values map for a network
		network = _validateNetworkId (network)
		return values [network]

	@method share network, value=Undefined
	| Opens a share window for the selected network.
	| Optionally a value can be defined to override the current network values
		network = _validateNetworkId (network)
		if value is? Undefined
			value = values[network]
		var url_template = NETWORK_URLS[network]
		var url          = template (url_template, value)
		var size         = NETWORK_WINDOWS [network] or NETWORK_WINDOWS ["default"]
		window open (url, network, "menubar=1,resizable=1,width=" + size[0] + ",height=" + size[1])

	# =========================================================================
	# INTERNAL
	# =========================================================================

	@method _validateNetworkId network
		network = network toLowerCase ()
		if values[network] is? Undefined
			error ("Network id", network, "is not valid, pick one of", keys (NETWORK_URLS), __scope__)
		return network

	@method _mergeValues currentValues, setValues, metaValues={}
		var value = copy (currentValues)
		# We set the meta values
		for v, k in metaValues
			if not v is? Undefined
				value[k] = v
		# We set the meta values
		for v, k in setValues
			if not v is? Undefined
				value[k] = v
		return value

	@method _getMetaOptions network
		var og      = copy (META_TAGS og)
		var network = META_TAGS [network] or {}
		var meta_tags = merge (og, network, True)
		var m_options = meta_tags ::= {t|
			var node = window document head querySelector ("meta[property=\"" + t + "\"]")
			if not node
				node = window document head querySelector ("meta[name=\"" + t + "\"]")
			if node
				return node getAttribute "content"
			return Undefined
		}
		return m_options

# EOF
