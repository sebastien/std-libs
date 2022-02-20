@feature sugar 2
@module  std.util.hashing

# TODO: This module needs some serious theoretical exploration. We need
# to better defines the types of hashes and their properties.

@class Hash
| A very simple hash function that hashes JavaScript objects
| into a unique number. Although is likely going to have a lot of collision, it is
| primarily designed to detect whether a value has changed or not.

	@shared Instance
	@shared CHARS = "abcdefghijklmnopqrstuvwxyABCDEFGHIJKLMNOPQRSTUVWXY01234567890-_"

	@operation Get
		Hash Instance ?= new Hash ()
		return Instance

	@operation AsString value:Number
		var res = []
		var l   = CHARS length
		while value > 0
			var c  = value % l
			value  = (value - c) / l
			res splice (0,0, CHARS[c])
		return res join ""

	@method hashnum value
		return hashValue (value)
	
	@method hashstr value
		return AsString (hashnum (value))

	@method hashNumber value
		return 1 + value

	@method hashString value
		# NOTE: This should probably be revisited, but I don't see how
		# we can skip bytes in a string.
		var step   = 1
		var offset = 0
		var result = 5
		var length = value length
		while offset < length
			if offset % 2 == 0
				result  = result + (value charCodeAt (offset))
			else
				result  = result * (value charCodeAt (offset))
			result += value charCodeAt (offset)
			offset += step
		return result

	@method hashList value
		var i = 0
		var l = value length
		var r = 4
		while i < l
			# NOTE: Any change here should be replicated in Writer.onList
			r += hashValue (value[i])
			i += 1
			r  = (r + 1) * i
		return r

	@method hashMap value
		var i = 0
		var r = 6
		for v,k in value
			# NOTE: Any change here should be replicated in Writer.onMap
			r += hashString (k) + hashValue (v)
			r  = r * (i + 2)
			i += 1
		return r

	@method hashValue value
		return value match
			is? Number
				hashNumber (value)
			is? String
				hashString (value)
			is? Array
				hashList (value)
			is True
				5573
			is False
				7473
			is None
				0
			is Undefined
				0
			is? Object
				hashMap (value)
			else
				777

@class CompactHash: Hash

	@operation Get
		CompactHash Instance ?= new CompactHash ()
		return Instance

	@method hashString value:String
	| Returns a numeric hash from the given string value
		let v = "" + value
		var r = 0
		var j = 0
		var i = 0
		let n = value length
		while i < n
			let w = v charCodeAt (i)
			match j
				== 1
					r = r * (w + 1)
				== 2
					r = (r / (w + 1)) + w
				else
					r += w
			i += 1
			j = (j + 1) % 3
		return r

@function compactHashInt value
	return CompactHash Get () hashnum (value)

@function hashint value
	return Hash Get () hashnum (value)

@function hash value
	return Hash Get() hashstr (value)

# EOF
