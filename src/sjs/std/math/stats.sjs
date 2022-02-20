@feature sugar 2
@module std.math.stats
@import len from std.core
@import sorted, partition, access from std.collections
@import identity from std.core

# -----------------------------------------------------------------------------
#
# SAMPLER
#
# -----------------------------------------------------------------------------

@class Sampler

	@property _samples = new Map ()
	@property _extractor = identity

	@method sample value
		let k = _extractor (value)
		let n = (_samples get (k) or 0) + 1
		_samples set (k, n)
		return self

# -----------------------------------------------------------------------------
#
# DISTRIBUTION
#
# -----------------------------------------------------------------------------

@class Distribution

	@property min          = Undefined
	@property max          = Undefined
	@property _count       = 0
	@property _answered    = 0
	@property _mapping     = Undefined
	@property _values      = Undefined
	@property _samples     = {}

	@constructor mapping
		_mapping = mapping

	@getter values
		if _values is Undefined
			_values = update ()
		return _values

	@method sample value, weight
		let k = value match
			is? Number -> value
			is? String -> k
			_          -> json(value)
			else       -> Undefined
		if value is not Undefined
			_samples[k] = (_samples[k] or 0) + weight
			_answered += weight
		_count += 1
		return self

	@method update
	| Updates the values based on the sampled distribution.
	| `[{value,occurences,relativeOccurences,label}]`
		var maxocc = Undefined
		var minocc = Undefined
		for v,k in _samples
			minocc = v if minocc is Undefined else Math min(v, minocc)
			maxocc = v if maxocc is Undefined else Math max(v, maxocc)
		return _samples ::> {r={},v,k|
			let w = {
				value  : _mapping[k] if _mapping else None
				occ    : v
				maxocc : maxocc
				minocc : minocc
				relocc : v / _answered 
				key    : k
			}
			r[k] = w
			return r
		}

# TODO: Should have an accumulator instead of a values processor, with
# optional median (so that you don't have to sort).
@function describe values, precision=2
| Describes the given array of numbers, returning a dictionary with the
| following keys:
|
| - min
| - max
| - median
| - average
| - deviation
| - deviationOver
| - deviationWithin
| - deviationUnder
| - total
| - count
	var nas, non_nas = partition (values, {_ is None or _ is Undefined})
	values = sorted (non_nas)
	var v_min     = None
	var v_max     = None
	var v_average = None
	var v_total   = 0
	var v_count   = 0
	var v_nas     = 0
	for e in values
		if v_min is None
			v_min = e
		if v_max is None
			v_max = e
		v_min = Math min(v_min, e)
		v_max = Math max(v_max, e)
		v_total += e
		v_count += 1
	var v_median   = values [parseInt(v_count / 2)]
	v_average      = v_total / v_count
	var variance_t = 0
	for e in values
		variance_t += Math abs (v_average - e)
	var v_deviation    = variance_t / v_count
	var in_deviation   = 0
	var over_deviation = 0
	var under_deviation = 0
	for e in values
		let d = e - v_average
		if d > v_deviation
			over_deviation += 1
		elif d < (0 - v_deviation)
			under_deviation += 1
		else
			in_deviation += 1
	let factor = Math pow(10, precision)
	return {
		min              : Math round (v_min           * factor)/factor
		max              : Math round (v_max           * factor)/factor
		average          : Math round (v_average       * factor)/factor
		median           : Math round (v_median        * factor)/factor
		deviation        : Math round (v_deviation     * factor)/factor
		deviationWithin  : Math round (in_deviation    * factor)/factor
		deviationOver    : Math round (over_deviation  * factor)/factor
		deviationUnder   : Math round (under_deviation * factor)/factor
		total            : Math round (v_total         * factor)/factor
		count            : Math round (v_count         * factor)/factor
		nas              : len(nas)
	}

# EOF
