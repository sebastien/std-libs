@feature sugar 2
@module std.formats.rss
@import runtime.window as window

@shared NS=None
@shared NAMESPACES = {
	svg   : "http://www.w3.org/2000/svg"
	xlink : "http://www.w3.org/1999/xlink"
	html  : "http://www.w3.org/1999/xhtml"
}

@function __node name:String, content
	let node = window document createElementNS (NS, name) if NS else window document createElement (name)
	content :: {__append (node, _)}
	return node

@function __append:Node node:Node, value:Any
	match value
		is? Undefined
			pass
		is? Number
			node appendChild (window document createTextNode ("" + value))
		is? String
			node appendChild (window document createTextNode (value))
		is? Array
			0..(value length) :: {__append (node, value)}
		is? Object and not (value jquery is? Undefined)
			0..(value length) :: {__append (node, value)}
		is? Object and not (value nodeType is? Undefined)
			node appendChild (value)
		else
			# We have an object, and this object is going to be mapped to
			# attributes
			var has_properties = False
			for v,k in value
				var ns  = Undefined
				var dot = k lastIndexOf ":"
				if dot >= 0
					ns = k substr (0, dot)
					ns = NAMESPACES[ns] or ns
					k  = k substr (dot + 1, k length)
				k = "class" if k == "_" or k == "className" else k
				# If the value is an object, then we will handle both the
				# style and dataset specific cases
				if v is? Object
					if k == "style"
						let style = node style
						for pv, pn in v
							style [pn] = pv
					elif k == "data" and node dataset
						node dataset [k substr (5)] = v
					else
						node setAttributeNS (ns, k, v) if ns else node setAttribute (k, v)
				else
					node setAttributeNS (ns, k, v) if ns else node setAttribute (k, v)
				has_properties = True
			if not has_properties
				node appendChild (window document createTextNode("" + value))

@function rss:Node content...
	return __node( "rss", content )

@function author:Node content...
	return __node( "author", content )

@function category:Node content...
	return __node( "category", content )

@function cloud:Node content...
	return __node( "cloud", content )

@function comments:Node content...
	return __node( "comments", content )

@function copyright:Node content...
	return __node( "copyright", content )

@function description:Node content...
	return __node( "description", content )

@function docs:Node content...
	return __node( "docs", content )

@function enclosure:Node content...
	return __node( "enclosure", content )

@function generator:Node content...
	return __node( "generator", content )

@function guid:Node content...
	return __node( "guid", content )

@function height:Node content...
	return __node( "height", content )

@function image:Node content...
	return __node( "image", content )

@function language:Node content...
	return __node( "language", content )

@function lastbuilddate:Node content...
	return __node( "lastBuildDate", content )

@function link:Node content...
	return __node( "link", content )

@function managingeditor:Node content...
	return __node( "managingEditor", content )

@function name:Node content...
	return __node( "name", content )

@function pubdate:Node content...
	return __node( "pubDate", content )

@function skipdays:Node content...
	return __node( "skipDays", content )

@function skiphours:Node content...
	return __node( "skipHours", content )

@function source:Node content...
	return __node( "source", content )

@function textinput:Node content...
	return __node( "textInput", content )

@function title:Node content...
	return __node( "title", content )

@function ttl:Node content...
	return __node( "ttl", content )

@function url:Node content...
	return __node( "url", content )

@function webmaster:Node content...
	return __node( "webMaster", content )

@function width:Node content...
	return __node( "width", content )

