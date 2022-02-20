@feature sugar 2
@module std.formats.csv
@import TOptions from std.patterns.options

@class Parser: TOptions
| A simple configurable CSV parser.

	@shared OPTIONS = {
		field  :  ","
		line   :  ["\n", "\r"]
		escape : "\\"
		quotes : ['"']
		spaces : [" "]
	}

	@property table = []

	@method parse text, offset=0
		let last     = text length
		var in_quote = False
		var field    = 0
		var line     = 0
		var row      = []
		let table    = [row]
		while offset < last
			var c = text[offset]
			match c
				== options field and (not in_quote)
					let t = _chunk(text, field, offset)
					row push (t)
					field  = offset + 1
				in options line and (not in_quote)
					# -- 8< -- same as above
					let t = _chunk(text, field, offset)
					row push (t)
					field = offset + 1
					# -- >8 --
					row   = []
					table push (row)
				in options quotes
					# FIXME: This does not work with multiple quote symbols in
					# the case where we have field like "XXXX ' XXXX"
					# CSV quotes are escaped by doubling them, apparently
					if in_quote and (text[offset + 1] == text[offset])
						offset += 1
					else
						in_quote = not in_quote
			offset += 1
		return table

	@method _chunk text, start, end
		if text[start] == text[end] and text[start] in options quotes
			return text[start+1:end-1]
		else
			return text[start:end]

@function uncsv text
	let p = new Parser ()
	return p parse (text)

# EOF
