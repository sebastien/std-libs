@feature  sugar 2
@module   std.formats.filepack
@version  0.0.0
@import   unjson             from std.core
@import   Data               from std.formats.binary
@import   load as loadPNG    from std.formats.png

@class Unpacker

	@shared RGB             = 3
	@shared RGBA            = 4
	@shared DEFAULT_FORMAT  = 3
	@shared PREAMBLE_DELIM  = ":" charCodeAt 0

	@property _array
	@property _files = Undefined

	@operation Unpack data=_array, format=DEFAULT_FORMAT
	| Decodes the given data and returns the package as a JSON object.
	| The given data can be an image node or an image bitmap data (byte array.)
		# The format is like
		#
		#     <PREAMBLE_LENGTH>:<PREAMBLE><PAYLOADS...>
		#
		# We start by looking for the preamble length
		var preamble_length = ""
		var offset          = 0
		let delim           = PREAMBLE_DELIM
		while (data[offset] != delim) and (offset < Math min (100, data length))
			preamble_length += String fromCharCode (data[offset])
			offset          +=1
		offset             += 1
		if not preamble_length
			# The file was expected to have a preamble
			return None
		else
			preamble_length = parseInt(preamble_length)
			# Now we extract and parse the preamble
			let preamble_data = Data ToString (data slice (offset, offset+preamble_length))
			let preamble      = unjson (preamble_data)
			offset           += preamble_length
			# Based on the preamble, we can now restore the package
			let result    = {}
			for key_length in preamble
				var key, length, type = key_length
				result[key]     = {
					path : key
					type : type
					data : Data Decode (data[offset:offset+length], type)
				}
				offset         += length
			return result

	@constructor array
		self _array = array

	@method getFiles
		if not _files
			_files = Unpack (_array)
		return _files

@function load url
	let image_url = url
	return loadPNG (image_url) chain {
		return new Unpacker (Data FromImage (_, 3, 1))
	}


# EOF - vim: ts=4 sw=4 noet
