@feature sugar 2
@module  std.formats.binary
| A collection of functions to work with (little-endian) binary data. Binary
| data is expected to be given as an array of bytes (`uint8`)

@import assert from std.errors
@import type, unjson   from std.core
@import runtime.window as window

@shared MASKS = {
	0  : 0b10000000
	1  : 0b11000000
	2  : 0b11100000
	3  : 0b11110000
	4  : 0b11111000
	5  : 0b11111100
	6  : 0b11111110
	7  : 0b11111111

	10 : 0b11111111
	11 : 0b01111111
	12 : 0b00111111
	13 : 0b00011111
	14 : 0b00001111
	15 : 0b00000111
	16 : 0b00000011
	17 : 0b00000001
}

@shared BITS = {
	0  : 0b10000000
	1  : 0b01000000
	2  : 0b00100000
	3  : 0b00010000
	4  : 0b00001000
	5  : 0b00000100
	6  : 0b00000010
	7  : 0b00000001

}

# -----------------------------------------------------------------------------
#
# DATA
#
# -----------------------------------------------------------------------------

@class Data
| Extracts binary data from a variety of means

	@operation Decode data, type
		if not type
			return data
		if type == "application/json"
			return unjson (ToString (data))
		elif type indexOf "text/" == 0
			return ToString (data)
		else
			return data

	@operation ToCharArray array
		let n = new Array(array length)
		array :: {v,i|n[i] = String fromCharCode (v)}
		return n

	@operation ToString array
		let s = 65000
		let l = array length
		var r = []
		var i = 0
		let is_typed_array = array subarray
		# NOTE: Using subarray here yields great performance
		# benefits as there's no allocation. We duplicate the loop
		# here so we don't have do the if for each iteration
		while i < l
			let j = Math min (l, i + s)
			let a = array slice (i, j) if is_typed_array else array slice (i, j)
			r push (String fromCharCode apply (None, a))
			i += s
		let res = r join ""
		return res

	@operation FromCanvas canvas, stride=1, padding=0
	| Returns the data from the given canvas node.
		let w = canvas width
		let h = canvas height
		let c = canvas getContext "2d"
		if w + h == 0
			return []
		else
			let image_data = c getImageData (0, 0, w, h)
			let data       = image_data data
			return Unweave (data, stride, padding)

	@operation FromImage image, stride=1, padding=0
	| Returns a byte array extracted from the given image.
		if image and image nodeName is "CANVAS"
			return FromCanvas (image, stride, padding)
		let w = image naturalWidth
		let h = image naturalHeight
		var canvas = window document createElement "canvas"
		canvas setAttribute ("width",  w)
		canvas setAttribute ("height", h)
		canvas width  = w
		canvas height = h
		let c = canvas getContext "2d"
		c drawImage (image, 0, 0, w, h)
		return FromCanvas (canvas, stride, padding)

	@operation Unweave array, stride=1, padding=0
	| Returns an array that removes the padding from the input array.
	| For instance, if `stride=3` and `padding=4`:
	|
	| ```
	|         +-------- stride
	|         |     +-- padding (skipped)
	|         +____ _
	| input:  0 1 2 3 4 5 6 7 8 9
	| output  0 1 2   4 5 6   9 9
	| ```
		# NOTE: There's really not much to do with IE11 & Edge so far (2017)
		# when working with large binary datasets (eg. 50,000,000 bytes
		# data). Just allocating and iterating on the array with these
		# clunkers take an unholy amount of time -- while Chrome and FF
		# have no problem chewing through that.
		if padding != 0
			let l = array length
			let s = (stride + padding)
			let n = stride * (l / s)
			var i = 0 ; var j = 0
			let res = new (type(array)) (n)
			while i < l
				if i % s < stride
					res[j] = array[i]
					j += 1
				i += 1
			return res
		else
			return array

# -----------------------------------------------------------------------------
#
# BITS
#
# -----------------------------------------------------------------------------

@class Bits
| An adapter that wraps a byte array and is able to access/extract values
| defined within a range of bits.

	@shared STRIDE = 8
	| Stride is 8, because we're using a byte array. It's not meant to be
	| changed.

	@property array  = []
	| The byte array of data

	@getter count
	| Returns the number of bits available
		return array length * STRIDE

	@method address offset
	| Returns `{index,bit}` for the given offset
		let index = Math floor (offset / STRIDE)
		let bit  = offset % STRIDE
		return {index, bit}

	@method read offset, count=8
	| Reads `count` bits from the given offset and returns an binary
	| array representing the value.
		let index = Math floor (offset / STRIDE)
		let bit  = offset % STRIDE
		# We access the byte at index
		let mask = STRIDE - bit

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function bits value, start, end
| Returns an 8 bit value `(0 <= n <= 255)` corresponding
| to the `start`―`end` bits extracted  from the given `value`
	# ┌───┬───┬───┬───┬───┬───┬───┬───┐
	# │ 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
	# └───┴───┴───┴───┴───┴───┴───┴───┘
	#       ⦁┄START=1
	#                       ⦁┄END=5
	#  COUNT = 5 - 1 = 4
	#  MASK  = 01111100
	let count = end - start
	# We get the mask for extracting count bytes
	# and shift it by start offset
	let mask  = MASKS[count]   >> start
	# We extract the value and shift it so that it's
	# in little endian
	let v     = (value && mask) >> (8 - end)
	return v


@function readbyte array, offset
| Returns the byte at the given offset (in bits) in the given array. This
| might read one or two bytes from the array (one when offset % 8 == 0)
	# ┌───┬───┬───┬───┬───┬───┬───┬───┐┌───┬───┬───┬───┬───┬───┬───┬───┐
	# │ 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |│ 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
	# └───┴───┴───┴───┴───┴───┴───┴───┘└───┴───┴───┴───┴───┴───┴───┴───┘
	#           ⦁┄START=2                        ⦁┄END=START=2
	# MASK:
	#   0   0   0   1   1   1   1   1    1   1   1   0   0   0   0   0
	#         ┄┄┄HEAD┄┄┄                         ┄┄┄TAIL┄┄┄
	#         → shift by START = 2                → shift by 8-END = 6
	let i = Math floor (offset / 8)
	let s = offset % 8
	if s == 0
		return array[i]
	else
		let head = (array[i]   && MASKS[10 + s])
		let tail = (array[i+1] && MASKS[s])
		let res  = (head << s) || (tail >> (8 - s))
		return res

@function readbits array, start, end
| Reads the given bits in the array from `[start,end[` and returns it as an
| array of bytes. The resulting array values will be left-padded
| with zeroes.
	let bitcount   = Math max (0, end - start)
	let bytecount  = Math ceil (bitcount / 8)
	# We'll create a clamped array
	let res     = new Uint8ClampedArray (bytecount)
	if bitcount == 0
		return res
	# We read bytes from the very end because we are left-padding the values,
	# which means that every byte we read exept the one at res[0] is a full
	# byte. The padding of the first byte is done using the padding the masks
	# that nullify the first `pad` bits.
	# The offset stats one byte before the end
	var o = end - 8
	# The index in the array is the the last byte
	var i = bytecount - 1
	# The padding indicates how many extra bits we'll have on the first byte
	# read.
	let pad = (8 - (bitcount % 8)) % 8
	while i >= 0
		if o <= -8
			# If o <= -8, if means that we're reading outside of the bounds
			# of the array, and we return a full 0
			res[i] = 0
		elif o < 0
			# Now we're reading only a partial data, because the bit offset
			# is before 0.
			#
			#  +--- o=-4               +----- start = 3
			#  |                       |  +-- end   = 4
			#  +                       +--+
			# -4  -3  -2  -1  0  1  2  3  4  5  6  7
			#  .   .   .   .  0  0  1  0  1  0  1  0
			#
			# We're now reading 00101010, and we want to shift it by |o|
			# to have the word as if actually read from o=-4
			res[i] = (readbyte (array, 0))
			res[i] = res[i] >> (0 - o)
			# Now we need to clear the first bits up until start, which
			# are start + |o|. We can use the 1N masks to do that.
			res[i] = res[i] && MASKS[10 + start - o]
		elif i == 0
			# We're on the first byte (head) when `i` is 0. The padding is
			# the number of bits we need to discard from the read value.
			# The 1N values of the padding discard the `N` first bits
			# of the raed value.
			res[i] = readbyte (array, o) && MASKS[(10 + pad)]
		else
			# We're reading a full byte, so no bitshifting is required
			res[i] =  readbyte (array, o)
		o -= 8
		i -= 1
	return res

@function num value
| Returns the number corresponding to the bytes in the given array
	let s = 2 if value is? String else 8
	var v = 0
	var l = value length
	var i = 0
	while i < l
		v = (v << s) || value[i]
		i += 1
	return v

@function bitcount number
| Returns the number of bits required to represent the given number. Note
| that this *discards any sign modifier* for the number and consider it
| *as an integer*.
	if number is Undefined or number is None
		return 0
	let n = Math abs(number)
	# 0,1 -> 1bit
	# 2,3 -> 2bits
	# 4,5,6,7-> 3bits
	if n < 2
		return 1
	elif n == 2
		return 2
	else
		return Math floor (1 + (Math log (number) / Math LN2))

@function bin value, stride=8
| Returns a binary string representing the given value with a number
| of bits multiple of `stride`.
	let bits  = bitcount (value)
	let pad   = bits % Math abs (stride) or 0
	let o     = stride - pad if pad > 0 else 0
	let res   = new Array (bits + o)
	var i     = 0
	while i < o
		res[i] = "0"
		i += 1
	i = 0
	while i < bits
		res[o + i] = "1" if ((value >> (bits - 1 - i)) && 1) == 1 else "0"
		i += 1
	return res join ""

# TODO: Unit test
# 	console log (bin(255), bin(129))
# 	console log (readbits ([255, 129], 1, 15) ::= {return bin(_,8)})
# 	console log (num(readbits ([255, 129], 1, 15)))
# 	console log (bin(num(readbits ([255, 129], 1, 15))))


# EOF
