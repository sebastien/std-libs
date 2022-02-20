@feature sugar 2
@module std.math
| A collection of generic math functions that make it easier to work
| with numeric values, either individually, or in sets.

@import cmp, len, type from std.core
@import values from std.collections
@import assert, error, NotImplemented from std.errors

@shared PI     = Math PI
@shared TAU    = Math PI + Math PI
@enum   Domain = R | RP | RN | N | NP | NN | Z | Q | C

@group Trigonometry

	@function cos value
		return Math cos (value)

	@function sin value
		return Math sin (value)

	@function sind value
		return Math sin (deg(value))

	@function cosd value
		return Math cos (deg(value))

	@function deg value
	| Converts the given value (in radians) to degrees
		return lerp (0, 360, value / (Math PI * 2)) % 360

	@function rad value
	| Converts the given value (in degrees) to radians
		return ((value / 360) * Math PI * 2) % (2 * Math PI)

	@function pis value
	| Converts the given value (in radians) to factors of Pi
		return value / Math PI

	@function radial angle, radius=1
		return [Math cos (angle) * radius, Math sin (angle) * radius]

	@function radiald angle, radius=1
		return radial (rad(angle), radius)

@group Numbers

	@function random lower=Undefined, upper=Undefined
	| Returns a random number, normalized by default
	| or within (0, @lower) or (@lower, @upper) if one or
	| both parameters are defined.
		return lower match
			is? Undefined
				Math random ()
			else
				upper match
					is? Undefined
						Math random () * lower
					else
						lerp (lower, upper, Math random ())

	@function int value:Number|Array
	| Returns the given number as an integer, or NaN if
	| it cannot be converted.
	|
	| When @value is an @Array, @int will be recursively applied.
		return value match
			is? Number → Math floor (value)
			is? Array or value is? Object → value ::= int
			_ → NaN

	@function abs value
		return Math abs (value)

	@function floor value
		return Math floor (value)

	@function frac value
		value = Math abs (value)
		return value - Math floor (value)

	@function sum numbers
	| Returns the sum of the given numbers
		return numbers ::> {r,v|return (r or 0) + v}

	@function average numbers
		return sum(numbers) / (len(numbers) or 1)

	@function ceil number, roundBy
		return round (number, roundBy, 1)

	@function floor number, roundBy
		return round (number, roundBy, 0)

	@function round number, roundBy=1, bound=0
	| Rounds the given number by the `roundBy` number. For instance :
	|
	| round(2,5) == 0
	| round(3,5) == 5
	| round(6,5) == 5
	| round(8,5) == 10
	| round(0.39, 0.05) == 0.040
	|
	| The `bound` parameter will using `floor` (<0), `round` (=0) and  `ceil` (>0)
	| to for the initial rouding.
	|
	| round(1993,5,0)  == 1995
	| round(1993,5,-1) == 1990
	| round(1993,5, 1) == 1995
	| round(1992,5,0)  == 1990
	| round(1992,5,-1) == 1990
	| round(1992,5, 1) == 1995
		match number
			is? Array
				return number ::= {round (_, roundBy, bound)}
			is? Number
				let v = number / roundBy
				let w = bound match
					< 0  → Math floor (v)
					> 0  → Math ceil  (v)
					else → Math round (v)
				return roundBy * w
			else
				number

	@function roundsum numbers, total=100, roundBy=1
	| Adjusts the given `numbers` so that they all add up to the
	| given `total=100` rounded by `roundBy=1`. The input numbers
	| do not need to sum to `100`, they will bescaled to the given
	| `total`.
	|
	| This function is useful when you're displaying rounded percentage,
	| as it carries over the error.
		let s = sum (numbers)
		let l = len (numbers) - 1
		var t = 0
		# FIXME: Statistically, this is not the best way. Here the error
		# is carried over and impacts the last element, while instead
		# we should influence the rounding decision based on how
		# this impacts the total.
		return numbers ::= {v,i|
			if i == l
				return total - t
			else
				let v = round (scale (v, s, total), roundBy)
				t += v
				return v
		}

	@function mod number, modulus
	| Simple modulo, not remainder, % in javascript is remainder not mod !
		var remainder = number % modulus
		if remainder >= 0
			return remainder
		else
			return Math floor (remainder + modulus)

	@function log10 value
	| Returns the log10 of the given `value`.
	| <https://en.wikipedia.org/wiki/Logarithm>
		return Math log (value) / Math LN10

	@function logn value, base
		return Math log (value) / Math log (base)

	@function toBase value, base=16
	| Returns an array of numbers in the given `base`
	| corresponding to the given number.
		res = []
		while value 

	@function nice value, steps=10, bound=1
	| Returns a "nice" human-friendly, integer value close to the given value. Nice
	| will find the closest power of 10 to the given value, divide it by `steps`
	| and round value to the closest multiple of the result.
	|
	| This works well for numerical values. Usually, if you have a range of values,
	| you would do:
	|
	| `stats nice (stats max (values) * 1.25)`
	|
	| The `1.25` factor allows to leave some space above the value.
		# If value is a list, we map its items to nice
		if  value is? Array
			return value ::= {_,i| return nice (_, steps, -1 if i == 0 else bound) }
		# If the value is negative, we apply nice to the absolute
		if value < 0
			return 0 - nice (Math abs (value), steps, bound)
		# We get the scale, which is the power of 10 that is greater than the
		# value.
		var scale = 0
		while Math pow (10, scale) < value
			scale += 1
		# Now we divide the scale by the number of steps (usually 10)
		let divider = Math pow (10, scale) / steps
		return closest (value, divider, bound)

	@function closest value, multiple=10, bound=1
	| Returns the closest multiple of `multiple` to the given `value`.
		if value is? Array
			return value ::= {_|return closest (_, multiple, bound)}
		if bound > 0
			return Math ceil  (value / multiple) * multiple
		elif bound < 0
			return Math floor (value / multiple) * multiple
		else
			return Math round (value / multiple) * multiple

@group Comparisons

	@function wrap number, base=10
	| Wraps the given number around the given `base`
		base = Math abs (base) if base < 0 else base
		if base is 0
			return 0
		return number match
			is 0
				0
			> 0
				number % base
			else
				(base + (number % base)) % base
	@where
		wrap (0,  9) == 0
		wrap (10, 9) == 0
		wrap (-1, 9) == 8
		wrap (-9, 9) == 0

	@function contained a0, a1, b0=Undefined, b1=Undefined
	| Tells if the range `[a0,a1] is fully contained within `[b0,b1]`
		if a0 is? Array and a1 is? Array
			b0 = a1[0] ; b1 = a1[1]
			a1 = a0[1] ; a0 = a0[0]
		return between(a0,b0,b1) and between(a1,b0,b1)

	@function overlaps a0, a1, b0=Undefined, b1=Undefined
	| Tells if there is an overlap between the range `[a0,a1]` and the
	| range `[b0,b1]`.
		if a0 is? Array and a1 is? Array
			b0 = a1[0] ; b1 = a1[1]
			a1 = a0[1] ; a0 = a0[0]
		# Here we detect if there is an overlap between the segment
		# [a0,a1] and the segment [b0,b1]. The only two case where 
		# it doesn't are the following:
		#
		# ```
		#   Amin-------Amax
		#                  Bmin---------Bmax
		#
		#   Bmin-------Bmax
		#                  Amin---------Amax
		# ```
		let a_min = Math min (a0, a1)
		let a_max = Math max (a0, a1)
		let b_min = Math min (b0, b1)
		let b_max = Math max (b0, b1)
		return  not (a_max < b_min or b_max < a_min)

	@function sign value
	| Returns -1 if @value is negative, 1 otherwise.
		return -1 if value < 0 else 1

	@function min a, b=Undefined
	| Returns the minimum between @a and @b.
	|
	| If @a is an array or object, and @b is not specified, it
	| will return the minimal value of the set.
		if a is b
			return a
		elif a is Undefined
			return min (b)
		elif b is Undefined
			return a match
				is? Array
					(a ::> min) if a length > 0 else Undefined
				is? Array
					Undefined
				is? Object
					min (values (a))
				else
					a
		else
			return b if cmp (a,b) > 0 else a
	@where
		let a = new Object ()
		let b = new Object ()
		min (Undefined, Undefined) is Undefined
		min (a, Undefined) is a
		min (Undefined, a) is a

	@function max a, b=Undefined
	| Returns the maximum between @a and @b.
	|
	| If @a is an array or object, and @b is not specified, it
	| will return the maximal value of the set.
		if a is b
			return a
		elif a is Undefined
			return max (b)
		elif b is Undefined
			return a match
				is? Array
					(a ::> max) if a length > 0 else Undefined
				is? Object
					max (values (a))
				else
					a
		else
			return b if cmp (a,b) < 0 else a
	@where
		let a = new Object ()
		let b = new Object ()
		max (Undefined, Undefined) is Undefined
		max (a, Undefined) is a
		max (Undefined, a) is a

	@function minmax a, b
	| If #a is an #Array and #b is undefined or a #Function, this will
	| return the *(min,max)* elements of #a, extracted using #b when given.
	| Otherwise this returns `(min(a,b),max(a,b))`.
		if a is? Array and (b is Undefined or b is? Function)
			return a ::> {r,e,i|
				e = b(e) if b is? Function else e
				if not r
					r = [e, e]
				else
					r[0] = min(r[0], e)
					r[1] = max(r[1], e)
				return r
			}
		elif b is? Array and (not a is? Array)
			return [a if b[0] is Undefined else min(a,b[0]), a if b[1] is Undefined else max(a, b[1])]
		else
			return [min(a,b), max(a,b)]

	@function clamp value, minval=0, maxval=1
	| Ensures that the given value is within the `[minval, maxval]` interval.
		return minval match
			is? Array
				clamp(value, minval[0], minval[-1])
			else
				max (min (value, maxval), minval)

	@function between v, a, b, includeA=True, includeB=True
	| Predicate that tells if @v is between @a and @b inclusively;
		if a is? Array
			return between (v, a[0], a[1], includeA, includeB)
		elif a is? Undefined
			return v <= b if includeB else v < b
		elif b is? Undefined
			return v >= a if includeA else v > a
		else
			# NOTE: This seems a bit redundant but a more compact version
			# would be more error-prone
			if includeA and includeB
				return v >= a and v <= b
			elif includeA and (not includeB)
				return v >= a and v < b
			elif (not includeA) and includeB
				return v > a and v <= b
			else
				return v > a and v < b

	# TODO: We might want to bisect with a fuzzyness, meaning we
	# get as close to 0 as possible.
	@function bisect min, max, comparator, iterations=-1
	| Finds the value between `min` and `max` where the comparator
	| returns `0` when there is match, `1` when the value is too
	| big and `-1` when the value is too small.
	|
	| This function is useful for narrowing down in a set of results
	| up until the moment you've found what you're looking for. The
	| compartor function is where you'll implement the logic.
		if iterations == 0
			return min + (max - min) / 2
		elif min > max
			return bisect (max, min, comparator, iterations - 1)
		elif min == max
			return min
		else
			let v = min + (max - min) / 2
			let w = comparator (v)
			if w == 0
				return v
			elif w < 0
				return bisect (v, max, comparator, iterations - 1)
			else
				return bisect (min, v, comparator, iterations - 1)

@group Operations

	@function add a, b
		if a is? Array
			let t = type(a)
			let n = a length
			let v = new t (n)
			if b is? Number
				var i = 0
				while i < n
					v[i] = a[i] + b
					i += 1
				return v
			if b is? Array
				var i = 0
				let m = Math min(n, b length)
				while i < m
					v[i] = a[i] + b[i]
					i += 1
				while i < n
					v[i] = a[i]
					i += 1
				return v
		elif a is? Number
			if b is? Number
				return a + b
			else
				error ("Cannot add", a, "to", b,  __scope__)
				return Undefined
		else
			error ("Cannot add", a, "to", b,  __scope__)
			return Undefined

	@function sub a, b
		if a is? Array
			let t = type(a)
			let n = a length
			let v = new t (n)
			if b is? Number
				var i = 0
				while i < n
					v[i] = a[i] - b
					i += 1
				return v
			if b is? Array
				var i = 0
				let m = Math min(n, b length)
				while i < m
					v[i] = a[i] - b[i]
					i += 1
				while i < n
					v[i] = a[i]
					i += 1
				return v
		elif a is? Number
			if b is? Number
				return a - b
			else
				error ("Cannot remove", a, "from", b,  __scope__)
				return Undefined
		else
			error ("Cannot remove", a, "from", b,  __scope__)
			return Undefined

	@function mul a, b
		if a is? Array
			let t = type(a)
			let n = a length
			let v = new t (n)
			if b is? Number
				var i = 0
				while i < n
					v[i] = a[i] * b
					i += 1
				return v
			elif b is? Array
				var i = 0
				let m = Math min(n, b length)
				while i < m
					v[i] = a[i] * b[i]
					i += 1
				while i < n
					v[i] = a[i]
					i += 1
				return v
		elif a is? Number
			if b is? Number
				return a * b
			else
				error ("Cannot multiply", a, "by", b,  __scope__)
				return Undefined
		else
			error ("Cannot multiply", a, "by", b,  __scope__)
			return Undefined

	@function div a, b
		if a is? Array
			let t = type(a)
			let n = a length
			let v = new t (n)
			if b is? Number
				var i = 0
				while i < n
					v[i] = a[i] / (b or 1)
					i += 1
				return v
			elif b is? Array
				var i = 0
				let m = Math min(n, b length)
				while i < m
					v[i] = a[i] / (b[i] or 1)
					i += 1
				while i < n
					v[i] = a[i]
					i += 1
				return v
		elif a is? Number
			if b is? Number
				return a / (b or 1)
			else
				error ("Cannot divide", a, "by", b,  __scope__)
				return Undefined
		else
			error ("Cannot divide", a, "by", b,  __scope__)
			return Undefined
	
	@function avg items
		var v = 0
		var n = 0
		items :: {v += _;n += 1}
		return v / n

@group Matrices

	@function matrix:Array width, height, init={return 0}
		var res = new Array (height)
		var i = 0
		let n = width * height
		for y in 0..height
			var line = new Array (width)
			for x in 0..width
				line [x] = init(x,y,i,n)
				i += 1
			res[y] = line
		return res

	@function flatmatrix width, height, init={return 0}, arrayType=Float32Array
		let n = width * height
		let r = new (arrayType) (n)
		var i = 0
		var y = 0
		while y < height
			var x = 0
			while x < width
				r[i] = init(x,y,i,n)
				x   += 1
			y += 1
			i += 1
		return r

	# We should try to find a rationale to get the best units for an axis
	@function step start, end, count=10, base=10
	| Returns the ideal step size to create a scale for the range `[start,end]`,
	| when you'd like approximatively `count=10` steps. The `base=10` will
	| be used as the base modifier for the steps.
		let v = extent (start, end)
		# We get the start and end scale
		let start_scale  = Math log(start) / Math log(base) if start else 0
		let end_scale    = Math log(end)   / Math log(base) if end else 0
		# We get the extent of the scale in orders of magnitude of base
		let scale_order = Math ceil (Math abs (end_scale - start_scale))
		# Now, the steps should be within the sub order of magnitude
		let step_order  = scale_order - 1
		let step_delta  = sign (end_scale - start_scale) * round (Math pow (base, scale_order) / count, Math pow (base, step_order))
		return step_delta

	@function steps start, end, count=10, base=10
		let s = step (start, end, count, base)
		let r = []
		var i = start
		if start < end
			while i <= end
				r push (i)
				i += s
		else
			while i >= end
				r push (i)
				i += s
		return r

# FIXME: Does not work for range(-14,0)
@group Interpolation

	@function range start, end, step=Undefined, inclusive=True
	| Returns the range from start to end (*inclusive*) with the given step.
	| when the step if negative (start < end) or positive (end < start), the
	| step will be the number of steps (+0/1) from start to end.
	|
	| If `step` is undefined or `0`, then it will default to the lower power
	| of 10 like so: `log10(abs(end - start)) - 1`.
	|
	| Examples:
	|
	| ```
	| range(0,100,5)  # A list of ages from 0 to 100 with a step of 5 years
	| range(0,100,-5) # Divides (0,100) in 5 buckets
	| ```
		# We correct the step based on the ends
		if not step
			step = 1 if start < end else -1
			step = step * Math pow (10, Math floor (log10 (Math abs(end - start))) - 1)
		elif start < end and step < 0
			step = ((end - start) / Math abs (step))
		elif start > end and step > 0
			step = ((start - end) / Math abs (step))
		if start == end
			return [start, end]
		elif start > end
			let r = []
			var i = start
			if not inclusive
				end += step
			while i > end
				r push (i)
				i += step
			r push (end)
			return r
		else
			let r = []
			var i = start
			if not inclusive
				end += step
			while i < end
				r push (i)
				i += step
			r push (end)
			return r

	@function extent a, b
	| Returns the extent between a and b, which is `|b-a|`.
		if a is? Array
			return Math abs (a[1] - a[0])
		else
			return Math abs (b - a)

	@function prel a, b, v
	| The inverse of lerp, returns `k` for the given value. You can
	| think of `prel` as *percentage relative to the [b,a] range*.
		return (v - a) / (b - a)

	@function lerp a, b, k=0.5, depth=3
	| Linear interpolation between @a and @b with a normalized factor of @k.
	| This function can lerp numbers, arrays and maps. It has a `depth` limit
	| of 2, which means it will stop recursing on composite structures until
	| the depth is reached. at which point it will return a or b based on k.
		if depth <= 0
			if a is? Number
				a + (b - a) * k
			else
				return a if k <= 0.5 else b
		let nd = depth - 1
		return a match
			is? Number
				a + (b - a) * k
			is? Array
				0..(max(len(a),len(b))) ::= {
					lerp (
						a[_] match
							is? Undefined → b[_]
							else          → a[_]
						b[_] match
							is? Undefined → a[_]
							else          → b[_]
						k
						nd
					)
				}
			is? Object
				a ::= {lerp(_0,b[_1],k,nd)}
			!= b
				a if k < 0.5 else b
			else
				a

	@where
		lerp (0, 1, 0)   == 0
		lerp (0, 1, 0.5) == 0.5
		lerp (0, 1, 1)   == 1

		lerp (0, 10, 0)   == 0
		lerp (0, 10, 0.5) == 5
		lerp (0, 10, 1)   == 10

	@function scale value, fromRange, toRange=Undefined
	| Transforms the given `value` that is supposed to be contained within
	| `fromRange` into the domain where `fromRange` corresponds to `toRange`.
	|
	| Ex: scale(5, [0,10],  [0,100])  == 50
	| Ex: scale(5, [100,0], [0,100]) == 90
		if toRange is? Undefined
			toRange   = fromRange
			fromRange = [0, 1.0]
		fromRange = [0, fromRange] if fromRange is? Number else fromRange
		toRange   = [0, toRange]   if toRange   is? Number else toRange
		var o = (value - fromRange[0]) / ((fromRange[-1] - fromRange[0]) or 1)
		return toRange[0]+ o * (toRange[-1] - toRange[0])

	@function multiscale value, fromRanges, toRanges
	| Scales the given `value` from the given set of value ranges, mapped to 
	| the given set of output ranges. This makes it possible to scale portions
	| of a domain differently.
	|
	| For instance:
	|
	| ```
	| multiscale(0,  [0,5,10], [0, 10, 100]) == 0
	| multiscale(5,  [0,5,10], [0, 10, 100]) == 10
	| multiscale(10, [0,5,10], [0, 10, 100]) == 100
	|
	| multiscale(3,  [0,5,10], [0, 10, 100]) == 6
	| multiscale(7,  [0,5,10], [0, 10, 100]) == 46
	| 
	| multiscale(-1,  [0,5,10], [0, 10, 100]) == 0
	| multiscale(11,  [0,5,10], [0, 10, 100]) == 100
	| ```
		let n = len(fromRanges)
		assert (len(toRanges) == n, "The number of items in `fromRanges` must be the same as `toRanges`")
		for v,i in fromRanges
			let j = i + 1
			if i == 0 and value < v
				return toRanges[0]
			elif j < n
				let w = fromRanges[j]
				if value >= v and value < w
					return lerp (toRanges[i], toRanges[j], prel(v,w,value))
			else
				return toRanges[i]
		return Undefined
# EOF
