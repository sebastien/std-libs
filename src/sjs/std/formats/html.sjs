@feature sugar 2
@module std.formats.html
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
			0..(value length) :: {__append (node, value[_])}
		is? Object and not (value jquery is? Undefined)
			0..(value length) :: {__append (node, value[_])}
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

@function _text value=Undefined
	return window document createTextNode ("" + value if value else "")

@function _comment value=Undefined
	return window document createComment ("" + value if value else "")

@function address:Node content...
	return __node( "address", content )

@function applet:Node content...
	return __node( "applet", content )

@function area:Node content...
	return __node( "area", content )

@function a:Node content...
	return __node( "a", content )

@function base:Node content...
	return __node( "base", content )

@function basefont:Node content...
	return __node( "basefont", content )

@function big:Node content...
	return __node( "big", content )

@function blockquote:Node content...
	return __node( "blockquote", content )

@function body:Node content...
	return __node( "body", content )

@function br:Node content...
	return __node( "br", content )

@function b:Node content...
	return __node( "b", content )

@function caption:Node content...
	return __node( "caption", content )

@function center:Node content...
	return __node( "center", content )

@function cite:Node content...
	return __node( "cite", content )

@function code:Node content...
	return __node( "code", content )

@function dd:Node content...
	return __node( "dd", content )

@function dfn:Node content...
	return __node( "dfn", content )

@function dir:Node content...
	return __node( "dir", content )

@function div:Node content...
	return __node( "div", content )

@function dl:Node content...
	return __node( "dl", content )

@function dt:Node content...
	return __node( "dt", content )

@function em:Node content...
	return __node( "em", content )

@function font:Node content...
	return __node( "font", content )

@function form:Node content...
	return __node( "form", content )

@function h1:Node content...
	return __node( "h1", content )

@function h2:Node content...
	return __node( "h2", content )

@function h3:Node content...
	return __node( "h3", content )

@function h4:Node content...
	return __node( "h4", content )

@function h5:Node content...
	return __node( "h5", content )

@function h6:Node content...
	return __node( "h6", content )

@function head:Node content...
	return __node( "head", content )

@function hr:Node content...
	return __node( "hr", content )

@function html:Node content...
	return __node( "html", content )

@function img:Node content...
	return __node( "img", content )

@function input:Node content...
	return __node( "input", content )

@function isindex:Node content...
	return __node( "isindex", content )

@function i:Node content...
	return __node( "i", content )

@function kbd:Node content...
	return __node( "kbd", content )

@function link:Node content...
	return __node( "link", content )

@function li:Node content...
	return __node( "li", content )

@function map:Node content...
	return __node( "map", content )

@function menu:Node content...
	return __node( "menu", content )

@function meta:Node content...
	return __node( "meta", content )

@function ol:Node content...
	return __node( "ol", content )

@function option:Node content...
	return __node( "option", content )

@function param:Node content...
	return __node( "param", content )

@function pre:Node content...
	return __node( "pre", content )

@function p:Node content...
	return __node( "p", content )

@function samp:Node content...
	return __node( "samp", content )

@function script:Node content...
	return __node( "script", content )

@function select:Node content...
	return __node( "select", content )

@function small:Node content...
	return __node( "small", content )

@function strike:Node content...
	return __node( "strike", content )

@function strong:Node content...
	return __node( "strong", content )

@function style:Node content...
	return __node( "style", content )

@function sub:Node content...
	return __node( "sub", content )

@function sup:Node content...
	return __node( "sup", content )

@function table:Node content...
	return __node( "table", content )

@function td:Node content...
	return __node( "td", content )

@function textarea:Node content...
	return __node( "textarea", content )

@function th:Node content...
	return __node( "th", content )

@function title:Node content...
	return __node( "title", content )

@function tr:Node content...
	return __node( "tr", content )

@function tt:Node content...
	return __node( "tt", content )

@function ul:Node content...
	return __node( "ul", content )

@function u:Node content...
	return __node( "u", content )

@function _var:Node content...
	return __node( "var", content )

@function a:Node content...
	return __node( "a", content )

@function abbr:Node content...
	return __node( "abbr", content )

@function acronym:Node content...
	return __node( "acronym", content )

@function address:Node content...
	return __node( "address", content )

@function applet:Node content...
	return __node( "applet", content )

@function area:Node content...
	return __node( "area", content )

@function article:Node content...
	return __node( "article", content )

@function aside:Node content...
	return __node( "aside", content )

@function audio:Node content...
	return __node( "audio", content )

@function b:Node content...
	return __node( "b", content )

@function base:Node content...
	return __node( "base", content )

@function basefont:Node content...
	return __node( "basefont", content )

@function bdo:Node content...
	return __node( "bdo", content )

@function big:Node content...
	return __node( "big", content )

@function blockquote:Node content...
	return __node( "blockquote", content )

@function body:Node content...
	return __node( "body", content )

@function br:Node content...
	return __node( "br", content )

@function button:Node content...
	return __node( "button", content )

@function canvas:Node content...
	return __node( "canvas", content )

@function caption:Node content...
	return __node( "caption", content )

@function center:Node content...
	return __node( "center", content )

@function cite:Node content...
	return __node( "cite", content )

@function code:Node content...
	return __node( "code", content )

@function col:Node content...
	return __node( "col", content )

@function colgroup:Node content...
	return __node( "colgroup", content )

@function command:Node content...
	return __node( "command", content )

@function datalist:Node content...
	return __node( "datalist", content )

@function dd:Node content...
	return __node( "dd", content )

@function del:Node content...
	return __node( "del", content )

@function details:Node content...
	return __node( "details", content )

@function dfn:Node content...
	return __node( "dfn", content )

@function dir:Node content...
	return __node( "dir", content )

@function div:Node content...
	return __node( "div", content )

@function dl:Node content...
	return __node( "dl", content )

@function dt:Node content...
	return __node( "dt", content )

@function em:Node content...
	return __node( "em", content )

@function embed:Node content...
	return __node( "embed", content )

@function fieldset:Node content...
	return __node( "fieldset", content )

@function figcaption:Node content...
	return __node( "figcaption", content )

@function figure:Node content...
	return __node( "figure", content )

@function font:Node content...
	return __node( "font", content )

@function footer:Node content...
	return __node( "footer", content )

@function form:Node content...
	return __node( "form", content )

@function frame:Node content...
	return __node( "frame", content )

@function frameset:Node content...
	return __node( "frameset", content )

@function h1:Node content...
	return __node( "h1", content )

@function head:Node content...
	return __node( "head", content )

@function header:Node content...
	return __node( "header", content )

@function hgroup:Node content...
	return __node( "hgroup", content )

@function hr:Node content...
	return __node( "hr", content )

@function html:Node content...
	return __node( "html", content )

@function i:Node content...
	return __node( "i", content )

@function iframe:Node content...
	return __node( "iframe", content )

@function img:Node content...
	return __node( "img", content )

@function input:Node content...
	return __node( "input", content )

@function ins:Node content...
	return __node( "ins", content )

@function keygen:Node content...
	return __node( "keygen", content )

@function kbd:Node content...
	return __node( "kbd", content )

@function label:Node content...
	return __node( "label", content )

@function legend:Node content...
	return __node( "legend", content )

@function li:Node content...
	return __node( "li", content )

@function link:Node content...
	return __node( "link", content )

@function map:Node content...
	return __node( "map", content )

@function mark:Node content...
	return __node( "mark", content )

@function menu:Node content...
	return __node( "menu", content )

@function meta:Node content...
	return __node( "meta", content )

@function meter:Node content...
	return __node( "meter", content )

@function nav:Node content...
	return __node( "nav", content )

@function noframes:Node content...
	return __node( "noframes", content )

@function noscript:Node content...
	return __node( "noscript", content )

@function object:Node content...
	return __node( "object", content )

@function ol:Node content...
	return __node( "ol", content )

@function optgroup:Node content...
	return __node( "optgroup", content )

@function option:Node content...
	return __node( "option", content )

@function output:Node content...
	return __node( "output", content )

@function p:Node content...
	return __node( "p", content )

@function param:Node content...
	return __node( "param", content )

@function pre:Node content...
	return __node( "pre", content )

@function progress:Node content...
	return __node( "progress", content )

@function q:Node content...
	return __node( "q", content )

@function rp:Node content...
	return __node( "rp", content )

@function rt:Node content...
	return __node( "rt", content )

@function ruby:Node content...
	return __node( "ruby", content )

@function s:Node content...
	return __node( "s", content )

@function samp:Node content...
	return __node( "samp", content )

@function script:Node content...
	return __node( "script", content )

@function section:Node content...
	return __node( "section", content )

@function select:Node content...
	return __node( "select", content )

@function small:Node content...
	return __node( "small", content )

@function source:Node content...
	return __node( "source", content )

@function span:Node content...
	return __node( "span", content )

@function strike:Node content...
	return __node( "strike", content )

@function strong:Node content...
	return __node( "strong", content )

@function style:Node content...
	return __node( "style", content )

@function sub:Node content...
	return __node( "sub", content )

@function summary:Node content...
	return __node( "summary", content )

@function sup:Node content...
	return __node( "sup", content )

@function table:Node content...
	return __node( "table", content )

@function tbody:Node content...
	return __node( "tbody", content )

@function td:Node content...
	return __node( "td", content )

@function textarea:Node content...
	return __node( "textarea", content )

@function tfoot:Node content...
	return __node( "tfoot", content )

@function th:Node content...
	return __node( "th", content )

@function thead:Node content...
	return __node( "thead", content )

@function time:Node content...
	return __node( "time", content )

@function title:Node content...
	return __node( "title", content )

@function tr:Node content...
	return __node( "tr", content )

@function tt:Node content...
	return __node( "tt", content )

@function u:Node content...
	return __node( "u", content )

@function ul:Node content...
	return __node( "ul", content )

@function _var:Node content...
	return __node( "var", content )

@function video:Node content...
	return __node( "video", content )

@function wbr:Node content...
	return __node( "wbr", content )

@function xmp:Node content...
	return __node( "xmp", content )

