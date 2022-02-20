@feature sugar 2
@module   std.formats.urlhash
| Implements a serialization format that can encode and decode primitive
| objects in a URL hash.

@import json, unjson, str from std.core
@import sorted, keys from std.collections
@import TSingleton from std.patterns.oo

# TODO: Have a remapping dictionary so that terms can be shortened, expanded
# TODO: Implement a normalization map so that values can be ensured to be always
# in the same format.
@class Serializer: TSingleton

	@property entrySeparator      = "&"
	@property valueSeparator      = "="
	@property keySeparator        = ":"
	@property itemSeparator       = "+"
	@property defaultKey          = "path"
	@property extraKey            = "extra"

	@method serialize value, level=0
		if value is? Array
			if level == 0
				return serializeList (value, level, entrySeparator)
			else
				return serializeList (value, level)
		elif value is? Object
			if level == 0
				return serializeMap (value, level, entrySeparator, valueSeparator)
			else
				return serializeMap (value, level)
		elif value is? String
			return serializeString (value, level)
		elif value is? Number
			return serializeNumber (value, level)
		else
			return serializeSymbol (value, level)

	@method deserialize value, level=0
		let res = _deserialize (value)
		if res is? String
			return {(defaultKey):res}
		else
			return res

	@method _deserialize value, level=0
		var res    = Undefined
		var key    = Undefined
		var o      = 0
		var i      = 0
		let n      = value length
		# TODO: This does not support nested arrays yet, but the implementation
		# is extensible enough to support that.
		# This first step looks for chunks that can be deserialized. It is
		# the recursive part.
		var stack = []
		while i < n
			let c = value[i]
			match c
				is valueSeparator and level is 0
					# ENTRY = VALUE
					res ?= {}
					key = value[o:i]
					o   = i + 1
				is entrySeparator and level is 0
					# ENTRY & ENTRY
					res ?= {}
					res[key or defaultKey] = _deserialize (value[o:i], level + 1)
					key  = Undefined
					o = i + 1
				is "(" and level >= 1
					stack push ([key, res])
					res = Undefined
					o = i + 1
				is ")" and level >= 1
					res = stack[-1][1]
					stack pop ()
					o = i + 1
					# var o_key = stack[-1][0]
					# var o_res = stack[-1][1]
					# if res is Undefined
					# 	if o_key is Undefined
					# 		o_res push (res)
					# 	else
					# 		o_res [o_key] = res
				is itemSeparator and level >= 1
					# ITEM + ITEM
					res ?= []
					res push (_deserialize (value[o:i], level + 1))
					o = i + 1
				is keySeparator and level >= 1
					# KEY : VALUE
					res ?= {}
					key = value[o:i]
					res[key] = _deserialize (value[o:i], level + 1)
					o = i + 1
			i += 1
		if o < i
			# This where the parsing of single values happen
			var w = deserializeTerminal (value[o:i])
			if res is Undefined
				return w
			elif res is? Array
				res push (w)
				return res
			else
				res[key or extraKey] = w
				return res
		else
			# If there's no rest (unlikely, but possible), we return the
			# result as-is.
			return res

	@method deserializeTerminal text
		if parseFloat(text) == text
			return parseFloat(text)
		elif text is "true"
			return True
		elif text is "false"
			return False
		elif text is "null"
			return None
		else
			return text

	@method serializeList value, level=0, itemSeparator=self itemSeparator
		let l = level + 1
		let r = ((value ::> {r=[],v|r push(serialize(v,l));r}) or []) join (itemSeparator)
		if level > 1
			return "(" + r + ")"
		else
			return r

	@method deserializeList text, level=0
		return text split (itemSeparator) ::= {_deserialize (_, level + 1)}

	@method serializeMap value, level=0, itemSeparator=self itemSeparator, keySeparator=self keySeparator
		let l = level + 1
		let k = sorted (keys (value))
		let r = ((k ::> {r=[],k|
			let v = value[k]
			let w = serialize(v,l+1)
			if level == 0 and k == defaultKey
				r push (w)
			else
				r push (k + (keySeparator) + w)
			r
		}) or []) join (itemSeparator)
		if level > 1
			return "(" + r + ")"
		else
			return r

	@method deserializeMap text, itemSeparator=self itemSeparator, keySeparator=self keySeparator
		return text split (itemSeparator) ::> {r={},v|
			let i = v indexOf (keySeparator)
			if i >= 0
				let k = v[0:i]
				let w = v[i+1:]
				r[k] = w
			return r
		}

	@method serializeString value, level=1
		return encodeURI (value)

	@method deserializeString text
		return deserializeSymbol (decodeURI (text))

	@method serializeNumber value, level=1
		return str (value)

	@method deserializeNumber text
		return parseFloat (text)

	@method serializeSymbol value, level=1
		return value match
			is True  -> "true"
			is False -> "true"
			else     -> "null"

	@method deserializeSymbol text
		return value match
			is "true"  -> True
			is "false" -> False
			is "null"  -> None
			else       -> text

@function hash state:Any
	return Serializer Get () serialize (state)

@function unhash text:String
	return Serializer Get () deserialize (text)

# EOF - vim: ts=4 sw=4 noet
