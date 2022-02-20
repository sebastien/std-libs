@feature sugar 2
@module std.util.caching
@import now from std.io.time
@import len from std.core
@import keys, items, removeAt from std.collections

@class Cache
| The cache is a dictionary with timestamps which can be used to store
| values that expires. 
|
| Caches have limits both in capacity (the number of characters they can hold)
| and count  (the number of items they can hold). Caches are automatically
| cleaned up on set/update every `cleanDelay` ms.

	@shared LIMIT_SIZE      = 5000 * 1024
	@shared LIMIT_COUNT     = 100
	@shared CLEAN_DELAY     = 10s

	@property _values       = {}
	@property lastCleanup   = None
	@property sizeLimit     = LIMIT_SIZE
	@property countLimit    = LIMIT_COUNT
	@property cleanDelay    = CLEAN_DELAY

	@constructor values={}
		_values = values

	@method setSize value:Integer
		countLimit = value
		return self

	@method setCapacity value:Integer
		sizeLimit = value
		return self

	@method set key:String, value:Any, expires=None
	| Sets the given `value` to the given `key` with the given
	| `expires` (`None` ⇔ infinite by default), expressed in ms.
		autoclean ()
		if expires != 0
			try
				_storageSet (_values, key, {updated:now(), value:value, expires:expires})
			catch e
				warning (__scope__, "forcing clean after failed `" + key + "`=", value, "in", self)
				clean ()
		return value

	@method update key:String, value:Any, expires=Undefined
	| Udpates the `value` bound to the given `key`, optionally changing
	| it `expires` (in ms).
		autoclean ()
		var e = _storageGet (_values, key)
		if e
			e value    = value
			e expires ?= expires
		else
			set (key, value, expires)
		return value

	@method has key:String, expires=Undefined
	| Tells if there is `value` at the given key and that it ffhas not
	| expired. The expiration threshold will be the one given as argument
	| or the expiration value assigned during `set/update`
		var e = _storageGet (_values, key)
		if e
			expires ?= e expires
			# TODO: There is an opportunity for cleaning here
			if expires
				return (now () - e updated) <= expires
			else
				return True
		else
			return False

	@method get key:String, expires=Undefined
	| Retrieves the value with the given key
		if has (key, expires)
			return _storageGet (_values, key) value
		else
			return Undefined

	@method clear
		_values = _storageClear (_values)

	@method keys
		return _storageKeys (_values)

	@method items
		return _storageItems (_values)

	@method size key=Undefined
	| Returns the size (in bytes) of the value at the given key, or the
	| total size of the cache if no key is given.
		if key is Undefined
			return _storageSize (_values, key)
		else
			return reduce (keys(), {r,k|r + size (k)}, 0)

	@method remove key
		return _storageRemove (_values, key)

	@method autoclean
	| Triggers a clean if necessary
		if (now ()  - lastCleanup) >= cleanDelay
			clean ()

	@method clean
	| Cleans the cache from all expired values
		var time_now  = now ()
		lastCleanup   = time_now
		var remaining = []
		var size      = 0
		# We get the expired keys and store the remaining keys with
		# update and size
		var expired   = reduce (_storageItems (_values), {r,item|
			var v = item[1]
			var expired = v expires and (time_now - v updated) > v expires
			if expired
				r push (item[0])
			else
				remaining push {key:item[0], size:self size(item[0]), updated:v updated}
				size += remaining[-1] size
			r
		}, [])
		remaining = extend sorted (extend sorted (remaining, {a,b|return cmp(a size, b size)}), {a,b|return cmp(a updated, b updated)})
		remaining reverse ()
		# If we exceed any size/capacity limit, then we clean the remaining elements
		# starting with the oldest and largest.
		while len(remaining) > 0 and (size >= sizeLimit or len (remaining) >= countLimit)
			var e = remaining pop ()
			size -= e size
			expired push (e key)
		expired :: remove
		return expired

	# FIXME: This should be moved to a simple adapter

	@method _storageGet values, key
		return values[key]

	@method _storageSet values, key, value
		values[key] = value
		return value

	@method _storageKeys values
		return keys (values)

	@method _storageSize values
		return len(values)

	@method _storageClear values
		return {}

	@method _storageItems values
		return items (values)

	@method _storageRemove values, key
		return removeAt (values, keys)

# EOF
