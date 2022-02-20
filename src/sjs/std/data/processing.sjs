@feature sugar 2
@module  std.data.processing
| Offers a set of primitives for fast data filtering and mapping using
| a composable set of objects that can be iteratively applied in
| pipeline.

@import assert, warning, error from std.errors
@import len, identity, list from std.core
@import keys from std.collections

# TODO: This module would actually be a great candidate for delta-processing

# -----------------------------------------------------------------------------
#
# DESCRIPTOR
#
# -----------------------------------------------------------------------------

@class Descriptor
| Samples numerical data and accumulates min/max/total/count and nas.

	@property name  = Undefined
	@property min   = 0
	@property max   = 0
	@property total = 0
	@property count = 0
	@property nas   = 0

	@getter type
		return "N"

	@getter isNumeric
		return True

	@getter isCategorical
		return True

	@method isNA value
		return _ is Undefined or _ is None

	@constructor name
		self name = name

	@method sample value
		if count == 0
			min = value
			max = value
		else
			min = Math min (min, value)
			max = Math max (max, value)
		if isNA (value)
			nas += 1
		else
			total += value
		count += 1
		return self

	@method encode value
		return value
	
	@method asJSON
		return {name,type,min,max,total,count,nas}

@class StringDescriptor: Descriptor
| Samples string data (ie. categorical) and accumulates min/max/total/count 
| and nas as well as distribution.

	@property maxDist = 0
	@property dist = {}
	@property _distIndex = Undefined

	@getter type
		return "S"

	@getter isNumeric
		return False

	@getter isCategorical
		return True
	
	@getter distIndex
		if _distIndex is Undefined
			_distIndex = dist ::> {r=[],v,k|r push (k);r}
		return _distIndex

	@method sample value
		if count == 0
			min = value length
			max = value length
		else
			min = Math min (min, value length)
			max = Math max (max, value length)
		if isNA (value)
			nas += 1
		else
			total = total + value length
			dist [value] = (dist[value] or 0) + 1
			maxDist = Math max (dist[value], maxDist)
		count += 1
		_distIndex = Undefined
		return self
	
	@method encode value
		assert (dist, "String descriptor must have a distribution")
		return distIndex indexOf (value)

	@method asJSON
		let values = distIndex ::> {r={},v,k|r[k]=v;r}
		return {name,type,min,max,total,count,nas,values}

# -----------------------------------------------------------------------------
#
# PIPE PROCESSOR
#
# -----------------------------------------------------------------------------

@class IPipeProcessor

	@method start collection
		pass

	@method process value
		return value

	@method end collection
		pass

# -----------------------------------------------------------------------------
#
# NORMALIZER
#
# -----------------------------------------------------------------------------

@class Normalizer: IPipeProcessor

	@property _normalize = {}

	@constructor normalize
		_normalize = normalize or {}
	
	@method process value
		return value ::= {v,k|
			let f = _normalize[k] or identity
			return f(v)
		}

# -----------------------------------------------------------------------------
#
# MAPPER
#
# -----------------------------------------------------------------------------

@class Mapper: IPipeProcessor
| Samples an object or array value and samples each property/item, creating
| mapping of the sampled values.

	@property _columns   = []
	@property _values    = {}
	@property _normalize = {}
	@property _rows      = 0

	@constructor normalize
		_normalize = normalize or {}
	
	@method process value
		for v,k in value
			let f = _normalize[k] if _normalize else None
			let w = f(v) if f else v
			if k not in _columns
				_columns push (k)
			_values[k] ?= new StringDescriptor (k) if w is? String else new Descriptor (k)
			_values[k] sample (w)
		_rows += 1
		return value
	
	@method getMapping
		return _columns ::= {_values[_] asJSON ()}

# -----------------------------------------------------------------------------
#
# ENCODER
#
# -----------------------------------------------------------------------------

@class Encoder: IPipeProcessor
| Encodes the given data as a Float32 array using the given mapper information

	@property _mapper:Mapper
	@property _result = Undefined
	@property _offset = 0

	@constructor mapper
		_mapper = mapper
		assert (mapper)

	@method start collection
		let n = len(collection) * _mapper _columns length
		_result = new Float32Array (n)
		_offset = 0

	@method end collection
		return _result

	@method process value, index
		let col = _mapper _columns
		let w   = col length
		let h   = _mapper _rows
		let res = _result
		for v,k in value
			let j = col indexOf (k)
			if j == -1
				warning ("Element has no matching column", v, k, "in", col, __scope__)
			else
				let w = encodeColumnValue (k, v, index, value)
				res [_offset + j] = w
		_offset += w
		return value
	
	@method encodeColumnValue column, value, index, context
	| Encodes the given `value` for the given `column`, using the descriptions
	| aggregated in the mapper.
		let d = _mapper _values [column]
		if not d
			warning ("Mapper has no record for column", column, "pick one of", keys(_mapper _values), __scope__)
			return None
		else
			let w = d encode (value)
			if w is -1 and d isCategorical
				warning ("Value", value, "for column '" + column + "' of row '" + index + "' in", context, "is not part of the column distribution", __scope__)
			return w

# -----------------------------------------------------------------------------
#
# PIPERLINE
#
# -----------------------------------------------------------------------------

# TODO: Clarify what happens
@class Pipeline
| Combines pipeline processors `IPipeProcessor` together in the following
| way:
|
| ```
| [P01, …, Pnj], [Pi1, …, Pij]
| ```
|
| Where for each item `Vn` of the collection `C` we have
| `Ci = [Pij(…P01(V0)), …, Pij(…Pi1(Vn))`
|
	@property _steps = []

	@method add step
		step = list(step)
		_steps push (step)
		return self
	
	@method process data
		for steps,i in _steps
			steps :: {_ start (data)}
			data = data ::= {v,k|
				for step in steps
					v = step process (v,k)
				return v
			}
			steps :: {
				let w = _ end (data)
				if w is not Undefined
					data = w
			}
		return data


@class Frame
	
	@property _mapping

@class Filter

	@method formatFilter

	@method formatEq a, b

	@method formatGt a, b

	@method formatGte a, b

	@method formatLt a, b

	@method formatLte a, b

@function pipeline args...
	let p = new Pipeline ()
	for arg in args
		p add (arg)
	return p
		
# EOF - vim: ts=4 sw=4 noet
