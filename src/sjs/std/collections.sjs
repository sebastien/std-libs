@feature sugar 2
@module std.collections
| The *collections module* contains a set of very handy functions to
| manipulate composite data structure. Its functions are used in many of
| the other modules and provide a functional-style interface to manpulating
| simple and complex data.
|
| Implements standard querying and mutating operations on values, including
| arrays, strings and objects. Mutation/updates will mutate the original
| value unless stated otherwise.
|
| Some of the key features of this module are:
|
| - Uniform API for arrays and objects
| - LISP-style accessors (@first, @last, @head, @tail)
| - Pythonic functions (@keys, @values, @items)
| - Conversion between arrays and objects (@asList, @asMap)
| - Supports for set-like operations (@union, @difference, @intersection, etc)
| - Shallow and deep @copy
|
| This is fairly important module to know as knowing its functions will
| make writing code much easier whenever manipulating data structures, which
| is to say, most of the time.
|
| If you're interested in a non-mutating variant, you can check out
| the `std.collections.pure` module.

@import error, BadArgument, NotImplemented from std.errors
@import len, cmp, copy, iterable, list, find from std.core

# TODO: keys, values, items should be moved to std.core
# TODO: Switch from getOwnPropertyNames to Object.keys
# TODO: rotate to rotate elemetns in an arrayt

@group Query

	@function at value, index
		return value[index] if value else Undefined

	@function take value, count=1
		return value match
			is? Array     → value[0:count]
			is? Object    → keys(value)[0:count] ::= {values[k]}
			is None       → []
			is Undefined  → []
			else          → [value]

	@function head value, count=1
		if value is Undefined or value is None
			return [] if count > 1 else Undefined
		elif count is 1
			return value match
				is? Array  → value[0]
				is? Object → value[keys(value)[0]]
				else       → value
		else
			return take (value, count)

	# FIXME: Head and tail should probably return a list
	# event when count is 1?
	@function tail value, count=1
		if count is 1
			return value match
				is? Array  → value[-1]
				is? Object → value[keys(value)[-1]]
				else       → value
		else
			return value match
				is? Array  → value[0 - count:]
				is? Object → value[keys(value)[0 - count:]]
				is None -> []
				else -> [value]

	@function first collection, predicate
	| Returns the first element of the @collection
	| that matches the predicate.
		for v,i in collection
			if (not predicate) or (predicate (v,i))
				return v
		return Undefined

	@function last collection, predicate
	| Returns the last element of the @collection
	| that matches the predicate.
		if collection is? Array
			var i = collection length - 1
			while i >= 0
				let v = collection[i]
				if (not predicate) or (predicate (v,i))
					return v
				i -= 1
			return Undefined
		else
			var w = Undefined
			for v,i in collection
				if (not predicate) or (predicate (v,i))
					w = v
			return w

	@function index collection, predicate
	| Returns the index of the first element of the @collection
	| that matches the predicate, returning `-1` when not found.
		for v,i in collection
			if predicate (v,i)
				return i
		return -1

	@function keyOf collection, value
	| Returns the key of the given @value in the @collection, returning
	| `Undefined` when not found.
		match collection
			is? Array
				let i = collection indexOf (value)
				return i if i != -1 else Undefined
			is? Object
				var i = 0
				for v,k in collection
					if value is v
						return k
				return Undefined
			else
				return Undefined
	
	@function indexOf collection, value
	| Returns the index of the given @value in the @collection, returning
	| `-1` when not found.
		match collection
			is? Array
				return collection indexOf (value)
			is? Object
				var i = 0
				for v,k in collection
					if value is v
						return i
					else
						i += 1
				return -1
			else
				return -1

	@function indexLike collection, predicate
	| Returns the index of the first value in the `collection` that
	| matches the given `predicate`.
		for v,k in collection
			if precicate (value)
				return k
			return -1
		return -1

	@function rindex collection, predicate
		if collection is? Array
			var i = len(collection) - 1
			while i >= 0
				if predicate (collection[i], i)
					return i
				i -= 1
			return -1
		else
			return rindex(values(collection), predicate)

	# FIXME: There's a conflict here
	# NOTE: Deprecating in favor of core.find
	# @function find collection, value
	# | Returns the index of the @value within the @collection,
	# | or `-1` when not found.
	# 	for v,i in collection
	# 		if v is value
	# 			return i
	# 	return -1

	@function keys value
		return value match
			is? Array   → 0..(value length)
			is? Object  → Object keys (value)
			else        → None

	@function values value
		return value match
			is? Array   → value
			is? Object  → Object keys (value) ::= {value[_]}
			else        → None
	@where
		values (1)         == 1
		values ([])        == []
		values ([1])       == [1]
		values ([1,2])     == [1,2]
		values ({a:1})     == [1]
		values ({a:1,b:2}) == [1,2]

	@function items value, keyProcessor=Undefined
		return value match
			is? Array   → value ::= {v,i|
				i = keyProcessor(i) if keyProcessor else i
				return {key:i, value:v}
			}
			is? Object  → Object keys (value) ::= {k|
				let kk = keyProcessor(k) if keyProcessor else k
				{key:kk,value:value[k]}
			}
			else        → None

@group Updates

	@function array count, creator={return Undefined}
	| Returns an array of `count` values initialized by the given
	| `creator` function.
		if count < 0
			return None
		let res = new Array (count)
		var i = 0
		while i < count
			res[i] = creator(i)
			i += 1
		return res
	
	@function inplace value, creator
	| Replaces the contents of `value` with the contents
	| produced by the `creator(v,k)` functor.
		for v,k in value
			value[k] = creator (v,k)
		return value

	@function prepend collection, value
	| Prepends the given @value to the given @collection. This only
	| works for lists.
		match collection
			is? Array
				collection splice (0, 0, value)
			is? Object or _
				error (BadArgument, [Array])
		return collection

	@function append collection, value
	| Prepends the given @value to the given @collection. This only
	| works for lists.
		match collection
			is? Array
				collection push (value)
			is? Object or _
				error (BadArgument, [Array])
			else
				collection
		return collection

	@function insert collection, index, value
	| NOTE: Only works with arrays, transparent otherwise.
		match collection
			is? Array
				collection splice (index, 0, value)
		return collection
	
	@function insertBeforeLike collection, predicate, value
	| NOTE: Only works with arrays, transparent otherwise.
		if collection is? Array
			var i = -1
			for v,j in collection
				if predicate (v,j)
					collection splice (j, 0, value)
					return collection
			collection push (value)
			return collection
		else
			return collection

	@function concat collection, value
		match collection
			is? Array
				match value
					is? Array
						return collection concat (value)
					is? Undefined
						return collection
					else
						collection push (value)
						return collection
			is? Object
				match value
					is? Object
						value :: {collection[k]=v}
						return collection
					is? Undefined
						return collection
			is None or collection is? Undefined
				return value
			else
				return collection

	@function merge collection, values, replace=False, limit=0
	| Merges the @values into the given @collection. When
	| @collection is an object/map, existing values won't be
	| replaced unless @replace is `true`.
		match collection
			is? Array
				match values
					is? Array
						for v in values
							# FIXME: We should optimize this as we're going
							# to have to iterate over values
							if v not in collection
								collection push (v)
			is? Object
				for v,k in values
					let w = collection[k]
					if w is Undefined
						collection[k] = v
					elif replace
						collection[k] = v
					elif limit != 0
						if w is? Object or w is? Array
							collection[k] = merge (w,v,replace,limit - 1)
						elif replace
							collection[k] = v
		return collection or values

	@function remove collection, value
		return collection ::? {_ != value}

	@function removeAt collection, key:(String|Number)
	| Removes the given @key from the @collection.
		match collection
			is? Array
				key = parseInt(key) if key is? String else key
				match key
					is? Number
						collection splice (
							key match
								>= 0 → key
								<= 0 → collection length + key
								else → error (BadArgument, "key", key, [String, Number], __scope__)
							1
						)
					else
						error (BadArgument, [Number])
			is? Object
				@embed JavaScript
					delete (collection[key]);
			else
				error (BadArgument, [Array, Object])
		return collection

@group Transformations

	@function reverse value
	| Returns the reverse of the given value, where `Array` and `Object`
	| are supported.
		if value is? Array
			let n = value length
			let r = new Array (n)
			var i = n - 1
			var j = 0
			while i >= 0
				r[j] = value[i]
				j += 1
				i -= 1
			return r
		else
			let l = []
			value ::= {v,k|l splice (0,0,k)}
			if l length == 0
				return value
			else
				return l ::> {r={},k|r[k] = value[k];r}
			
	@function fitlen value, length, onAdd=Undefined, onRemove=Undefined
	| Ensures that the given array has the given length, removing
	| or adding elements if necessary.
		match value
			is? Array
				while value length > length
					let v = value pop ()
					onRemove (v) if onRemove
				while value length < length
					let v = onAdd(value length) if onAdd is? Function else onAdd
					value push (v)
				return value
			_
				return error (NotImplemented)
			else
				return value

	@function sorted value, comparison=cmp, reverse=False
	| Returns a sorted version of the given `value` using the given
	| `comparison(a,b)` function, returned in _ascending_ order
	| unless `reverse` if `True`. Note that `comparison` should return
	| `-1` if less, `0` if equal, or `1` otherwise.
		match comparison
			is? Array
				var l = len (comparison) - 1
				var c = {a,b|
					var total = 0
					for extractor, i in comparison
						var va = extractor (a)
						var vb = extractor (b)
						var v  = cmp (va, vb) * Math pow (10, l - i)
						total += v
					return total
				}
				return sorted (value, c, reverse)
			is? Function
				match value
					is? Number
						return value
					is? String
						return value
					is? Array
						value = copy (value)
						value sort (comparison)
						if reverse
							value reverse ()
						return value
					is? Object
						return sorted (values (value), comparison, reverse)
			else
				error (BadArgument, "comparison", comparison, [Array, Function])

	@function flatten value, depth=-1
		if depth == 0
			return [value]
		else
			return value match
				is? Object
					value ::> {r=[],e|r concat (flatten(e, depth - 1))}
				is Undefined
					[]
				else
					[value]

	@function group values, extractor={_|return _}, useList=True
	| Returns a map where the given @values are grouped by key extracted
	| using the given @extractor function.
	|
	| The `useList` parameter forces the creation of lists in the
	| result map even if there is only one element associated with
	| the extracted key.
	|
	| If @extractor is a **number**, then it will return a list of lists/maps
	| with at most `n=extractor` values.
	|
	| If @extractor is an **array**, it @group will be recursively applied
	| so that the result is going nested groups following each extractor.
		match extractor
			is? Number
				# If the extractor is a number, we return a list of
				# extractor values.
				var res     = []
				var i       = 0
				var l       = None
				var is_list = values is? Array
				for v, k in values
					if i % extractor ==  0
						i = 0
						l = [] if is_list else {}
						res push (l)
					if is_list
						l push (v)
					else
						l [k] = v
					i += 1
				return res
			is? Array
				var result = values
				for e,i in extractor
					var use_list = True
					if i == 0
						result = group (values, e)
					else
						if (not useList) and (i == (len(extractor) - 1))
							use_list = False
						result = result ::= {group(_, e)}
				return result
			else
				var result = {}
				for v,i in values
					k = "" + extractor (v,i)
					if result[k] is Undefined
						result[k] ?= [v] if useList else v
					else
						if result[k] is? Array
							result[k] push (v)
						else
							result[k] = [result[k], v]
				return result

	@function unique value, comparator=None
	| Returns the given @value with duplicates filtered out.
		if comparator
			return value ::> {res=[],v|
				if not first (res, {comparator(v,_)})
					res push (v)
				res
			}
		else
			match value
				is? Array
					return value reduce ({r,v|
						if v not in r
							r push (v)
						r
					}, [])
				is? Object
					let v = []
					return value ::? {
						if _ not in v
							v push (_)
							return True
						else
							return False
					}
				else
					return value

	@function remap values, mapping, create=Undefined, update=Undefined, remove=Undefined
	| Remaps the given `values` to the corresponding `mapping`, using the
	| given `create`, `update` and `remove` callback.
	|
	| - `create` will be called when the key only exists in `values`
	| - `update` will be called when the key exists in both `values` and `mapping`
	| - `remove` will be called when the key only exists in `mapping`
	|
	| Creation is `(value,index,values)→any`, update is `(value,mapped,index,values,mapping)→any`
	| and remove is `(mapped,index,values,mapping)`.
		if not mapping
			# If we don't have an mapping value, we simply map
			# the values and call create
			if create
				return values ::= {v,i|create(v,Undefined,i,values, mapping)}
			else
				return values ::= {return _}
		elif values is? Array and mapping is? Array
			# When both values and mapping are arrays, we use the
			# array remapping.
			let nv = values length
			# We update mapping elments
			let j = Math min (nv, mapping length)
			var i = 0
			while i < j
				# NOTE: We only trigger update if there is a change in value.
				let v = update (values[i], mapping[i], i, values, mapping) if update and values[i] != mapping[i] else values[i]
				mapping[i] = v
				i += 1
			# We we create new elements
			while mapping length < nv
				let i = mapping length
				let v = create (values[i], Undefined, i, values, mapping) if create else values[i]
				mapping push (v)
			# We remove excess elements
			while mapping length > nv
				let d = mapping pop ()
				if remove
					remove (d, mapping length, mapping, values)
			return mapping
		elif values is? Object
			# Otherwise if values is an object, we ensure that mapping
			# is an object.
			if not (mapping is? Object)
				mapping = (mapping ::> {r={},v,k|r[k]=v;r}) or {}
			# We detect new and updated values and assign tehm
			for v,k in values
				if mapping[k] is not Undefined
					# We need to be consistent with what the array does
					let w = update and update (v, mapping[k], k, values, mapping)  if v != mapping[k] else v
					if mapping[k] is not w
						mapping[k] = w
				else
					mapping[k] = create (v, Undefined, k, values, mapping) if create else v
			# Now we clear out the values that are not there anymore.
			for v,k in mapping
				if v is not Undefined and values[k] is Undefined
					remove and remove (v, k, values, mapping)
					mapping = removeAt (mapping, k)
			return mapping
		else
			# FIXME: not sure about that. If we remap(undefined, list) or
			# remap(false, list), we should have an empty list, probably.
			return copy(values)


	@function partition collection, predicate
	| Partitions the given collection using the @predicate, returning
	| a ([],[]) where the first item correspond to matches and the
	| second item to non-matches.
		if len(collection) == 0
			return [[],[]]
		return collection ::> {r,e,i|
			r ?= [[],[]]
			if predicate (e,i)
				r[0] push (e)
			else
				r[1] push (e)
			return r
		}

	# TODO: Shouldn't this be resolve? or probably extract.
	@function access collection, keys, default=Undefined
	| Resolves the given list of `keys` in the given `collection`, returning
	| the `default` if not value exists.
		keys  = keys split "." if keys is? String else list(keys) 
		let j = len (keys)
		var i = 0
		let k = j - 1
		var c = collection
		while i < k and c
			let ki = keys[i]
			if (ki is not '') and (ki is not Undefined) and (ki is not None)
				c = c[keys[i]]
			i += 1
		if i == k and c
			let ki = keys[i]
			if (ki is not '') and (ki is not Undefined) and (ki is not None)
				return c[keys[i]]
			else
				return c
		elif c is not Undefined
			return c
		else
			return default

	@function nested collection, keys, value=Undefined, default=Undefined
	| Nests the given `value` (or initializes the `default` value) for
	| the address identified by the given keys in `collection`, and returns
	| the collection.
		keys  = list (keys)
		let j = keys length
		if j == 0
			# NOTE: We should assert that the collection is an object, at
			# that point.
			match value
				is? None
					pass
				is? Object
					value :: {v,k|collection[k]=v}
			return collection
		else
			var v = collection or {}
			var i = 0
			var k = Undefined
			# These are the keys before the last key
			while i < j - 1
				k = keys[i]
				if k is not ""
					v[k] ?= {}
					v = v[k]
				i += 1
			# This is the last key
			k = keys[i]
			if value is not Undefined
				v[k] = value
			else
				v[k] ?= default
			return v[k]

	@function removeNested collection, keys
	| Removes the value nested at the given keys and removes it from the
	| collection.
		var o = collection
		let l = list (keys)
		var i = 0
		let j = l length - 1
		while o and i < j
			o = o[k]
			i += 1
		if o and i == j
			let k = l[j]
			# NOTE: We mutate in place as we don't want to
			# re asign
			let v = o[k]
			match o
				is? Array
					o splice (k, 1)
					return v
				is? Object
					let v = o[k]
					@embed JavaScript
						delete (o[k]);
					return v
				else
					return Undefined
		return Undefined


	@function nest collection, keys, value=Undefined, default=Undefined
	| Like `nested` but returns the collection instead of the nested
	| value.
		nested (collection, keys, value, default)
		return collection

@group BooleanOps

	@function union a, b
	| Returns the union between @a and @b, meaning that any element of @b
	| in @a will be removed.
		match a
			is? Array
				match b
					is? Array
						return a concat (b ::? {_ not in a})
					is None
						return a
					is? Object
						b = values (b)
						return a concat (b ::? {_ not in a})
					_
						return error (BadArgument, "b", b, [Array, Object], __scope__)
					else
						return a
			is? Object
				match b
					is? Array
						return error (BadArgument, "b", b, [Object], __scope__)
					is None
						return a
					is? Object
						return merge (a, b, False)
					_
						return error (BadArgument, "b", b, [Array, Object], __scope__)
			_
				return error (BadArgument, "a", a, [Array, Object], __scope__)
			else
				return None

	@function difference a, b
	| Returns the difference between @a and @b, meaning that any element of @b
	| in @a will be removed.
		match a
			is? Array
				match b
					is? Array
						return a ::? {_ not in b}
					is? Object
						b = values (b)
						return a ::? {_ not in b}
					_
						return error (BadArgument, "b", b, [Array, Object], __scope__)
					else
						return a
			is? Object
				match b
					is? Array
						return a ::? {_ not in b}
					is? Object
						return a ::? {_ != b[_1]}
					_
						return error (BadArgument, "b", b, [Array, Object], __scope__)
					else
						return a
			_
				return error (BadArgument, "a", a, [Array, Object], __scope__)
			else
				return None
	@where
		difference([1,2,3],[2,3]) == [1]
		difference({a:1,b:2,c:3},[2,3]) == {a:1}


	@function intersection a, b
	| Returns the elements that are both in @a and @b
		# NOTE: This has exactly the same structure as @difference except we
		# use in instead of not in.
		match a
			is? Array
				match b
					is? Array
						return a ::? {_ in b}
					is? Object
						b = values (b)
						return a ::? {_ in b}
					_
						return error (BadArgument, "b", b, [Array, Object], __scope__)
					else
						return None
			is? Object
				match b
					is? Array
						return a ::? {_ in b}
					is? Object
						return a ::? {_ == b[_1]}
					_
						return error (BadArgument, "b", b, [Array, Object], __scope__)
					else
						return None
			_
				return error (BadArgument, "a", a, [Array, Object], __scope__)
			else
				return None

	@function delta a:Any, b:Value, detectMoved=False
	| Calculates the delta `{added:‥,changed:‥,removed:‥,same:‥}` between
	| `previous` and `current`. The delta is calculated according to the
	| following semantics:
	|
	| - Lists elements are compared by index
	| - Map elements are compared by key
	| - Comparison is using equality (a == b)
	| - Added/changed/removed/same are all list of indexes/keys
	|
	| Note that this does not look for values that have been moved from
	| one location to the other unless you specify `detectMoved=True`, which
	| will then add a `moved:{<from>:<to>}` entry in the delta.
		var added   = Undefined
		var changed = Undefined
		var removed = Undefined
		var same    = Undefined
		var moved   = Undefined
		if   a is? Array
			if b
				# B is expected to be an array, so we make sure it
				# is one.
				b  = list (b)
				la = len (a)
				lb = len (b)
				# We start by iterating on a
				for v,i in a
					if i >= lb
						# If we're past the length of B, all these
						# items were removed from A
						removed ?= []
						removed push (i)
					elif b[i] != a[i]
						# Otherwise if the values are not the same, they
						# have changed.
						changed ?= []
						changed push (i)
					else
						# Otherwise they're the same
						same ?= []
						same push (i)
				# All the values after len(a) have been added.
				var i = la
				if i < lb
					added = []
					while i < lb
						added push (i)
						i += 1

			else
				added = 0..(len(a))
		elif a is? Object
			if b
				for v,k in a
					let w = b[k]
					if w == v
						same ?= []
						same push (k)
					elif w is None or w is Undefined
						removed ?= []
						removed push (k)
					else
						changed ?= []
						changed push (k)
				for v,k in b
					let w = b[k]
					if v is not Undefined and v is not None and w is Undefined
						added ?= []
						added push (k)
		# We create the result set
		let res = {}
		if added
			res added = added
		if changed
			res changed = changed
		if removed
			res removed = removed
		if same
			res same = same
		# We detect moved elemenents if the option was set
		if detectMoved
			moved ?= {}
			added :: {
				let i = find (a, b[_])
				if i >= 0
					moved[i] = _
			}
			removed :: {
				let i = find (b, a[_])
				if i >= 0
					moved[_] = i
			}
			changed :: {
				let i = find (b, a[_])
				if i >= 0
					moved[_] = i
			}
		if moved and moved length > 0
			res moved = moved
		# We return the aggregate
		return res

@group Utilities

	@function comparator extractor
	| Returns a comparator function that applies the given `extractor`
	| to the `(a,b)` arguments.
		return {a,b|cmp(extractor(a), extractor(b))}

# EOF
