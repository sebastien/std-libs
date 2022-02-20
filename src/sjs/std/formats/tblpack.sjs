@feature sugar 2
@module  std.formats.tablepack
| Tablepack is a binary encoding of tabular data designed to transfer a lot
| of information with a minimum bandwidth impact.

@import Data, readbits, bin, num from std.formats.binary
@import assert, warning    from std.errors
@import join               from std.io.async
@import http               from std.io.http
@import load as loadPNG    from std.formats.png

@class Unpacker
| Unpacker a `(header, array)` couple where the header is a data structure
| defining each field `{type,bits,min,max}` and the `array` an array of bytes
| to be decoded.

	@property _array
	@property _strings
	@property _header
	@property _bitsPerRow

	@constructor array, header, strings
		setHeader (header)
		_array   = array
		_strings = strings

	# =========================================================================
	# ACCESSORS
	# =========================================================================

	@getter header
		return _header

	@getter bitsPerRow
		return _bitsPerRow

	@getter cols
		return _header length

	@getter length
		return rows * cols

	@getter rows
		return Math floor (_array length * 8.0 / _bitsPerRow)

	# =========================================================================
	# API
	# =========================================================================

	@method setHeader header
	| Sets the header to be used
		_header = header
		_bitsPerRow = header ::> {r,v|return ((r or 0) + (v bits or 0))}
		assert (_bitsPerRow > 0, "Bits per row is 0")
		return self

	@method getHeader index=Undefined
		if index is Undefined
			return _header
		else
			return _header[index]

	@method getCell row, column
		return getRow (row) [column]

	@method getUnprocessedCell row, column
		return getUnprocessedRow (row) [column]

	@method getCellOffset row, column
		return getColumnOffset (column) + row * _bitsPerRow

	@method getColumnOffset column
		return header[0:column] ::> {r,v|(r or 0) + (v bits or 0)}

	@method getRows
	| Returns the decoded table
		return 0..rows ::= {getRow(_)}

	@method getRow index, process=True
	| Returns the decoded `index`-th row of the array
		if _bitsPerRow <= 0
			return None
		let start  = index * _bitsPerRow
		# NOTE: We pre-allocate the row
		let row    = new Array (_header length)
		var offset = 0
		for col, i in _header
			let b  = col bits
			let s  = start + offset
			let e  = s + b
			# FIXME: Readbits is super slow on Edge
			let v  = readbits (_array, s, e)
			row[i] = v
			# row[i] = _extractValue(v, col, i) if process else num(v)
			offset += b
		return row

	@method getUnprocessedRows
	| Returns the unprocessed table
		return 0..1000 ::= getUnprocessedRow

	@method getUnprocessedRow index
	| Returns the unprocessed row, ie. the value before it is being
	| decoded.
		return getRow (index, False)

	@method getBinRows
		return 0..rows ::= getBinRow

	@method getBinRow index
		let start  = index * _bitsPerRow
		let row    = new Array (_header length)
		var offset = 0
		for col, i in _header
			let b  = col bits
			let s  = start + offset
			let e  = s + b
			let v  = readbits (_array, s, e)
			row[i] = [s,e,bin(num(v),b)]
			offset += b
		return row
		# let h = _header
		# return getRow (index, False) ::= {v,i|
		# 	return bin (v, h[i] bits or 0)
		# }

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _extractValue bitarray, format, column
	| Extracts the value defined in the given `bitarray` based
	| on the `{type,optional,values,min,max}` format definition.
		assert (bitarray length == Math ceil (format bits / 8.0), "Bitarray is", bitarray length, "bits, expected", format bits, "in", format)
		let v = num(bitarray)
		var w = v
		match format type
			== "mixed"
				assert (format values, "Format should have values", format)
				assert (w < format values length, "Format should have at least", w + 1, "values", format)
				w = format values [v]
			== "int"
				if format optional
					if v == 0
						w = None
					else
						w = v + format min - 1
				else
					w = v + format min
			== "float"
				let prec = Math pow (10, format precision)
				if format optional
					if v == 0
						w = None
					else
						w = (v - 1) / prec + format min
				else
					w = (v / prec) + format min
				if w != None
					w = w
			== "none"
				return None
			== "str"
				if format values
					if v >= 0 and v < format values length
						w = format values [v]
					else
						warning ("String index out of bounds", v, "should be between 0 and ", format values length, __scope__)
						w = None
				elif _strings
					let l = _strings[column]
					if l
						if v >= l length
							warning ("Strings for column", column, "should have at least", v, "entries, got", l length, ":", l, __scope__)
							w = None
						else
							w = l[v]
					else
						warning ("Strings are missing for column", column, __scope__)
						w = None
				else
					w = None
		return w

@function unpack array, header, strings
| Unpacks the given array using the given header. This returns the decoded array
| of values.
	return new Unpacker (array, header, strings) getRows ()

@function load url, strings=False
	let image_url   = url
	let json_url    = url + ".json"
	let strings_url = (url + ".strings.json") if strings else False
	return join {
		image   : loadPNG  (image_url)
		json    : http get (json_url)
		strings : http get (strings_url) if strings_url else Undefined
	} chain {
		# NOTE: We only want the RGB, not the A which is always set to 255
		new Unpacker (Data FromImage (_ image, 3, 1), _ json, strings)
	}


# EOF
