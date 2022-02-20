@feature sugar 2
@module std.formats.xml
@import runtime.window as window

@function parse text:String
	match window
		.ActiveXObject
			var a  = new ActiveXObject "Microsoft.XMLDOM"
			a async = "false"
			return a loadXML (text)
		else
			var p = new window DOMParser()
			return p parseFromString (text, "text/xml")
