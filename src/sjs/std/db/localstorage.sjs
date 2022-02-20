@feature sugar 2
@module  std.db.localstorage
@import  len,json,unjson from std.core
@import  runtime.window as window
@import  warning,error from std.errors

# -----------------------------------------------------------------------------
#
# LOCAL STORAGE
#
# -----------------------------------------------------------------------------

@class LocalStorage
| Stores the data in the localStorage. This is more a persistent cache
| than an actual store, though.

	@shared STORE = window localStorage

	@operation Set storage, key, value
		if storage is? Storage
			storage set (key, value)
		else
			storage [key] = value

	@operation Has storage, key
		if storage is? Storage
			return storage has (key)
		else
			return isDefined (storage [key])

	@operation Get storage, key
		if storage is? Storage
			return storage get (key)
		else
			return storage [key]

	@operation Items storage
		if storage is? Storage
			return storage items ()
		else
			return storage ::> {r=[],v,k|r push ([k,v]);r}

	@operation Keys storage
		if storage is? Storage
			return storage keys ()
		else
			return storage ::> {r=[],v,k|r push (k);r}

	@operation Size storage, key
		if storage is? Storage
			return storage size (key)
		else
			return 0

	@operation Remove storage, key
		if storage is? Storage
			return storage remove (key)
		else
			return extend removeAt (storage, key)

	@operation Clear storage
		if storage is? Storage
			return storage clear ()
		elif storage is? Array
			return []
		else
			return {}

	@operation IsAvailable
	| Detects if the storage is available or not
		let available = False
		try
			STORE setItem ("IsAvailable", "true")
			available = True
		catch e
			warning ("Browser does not support local storage", __scope__)
			available = False
		return available

	# =========================================================================
	# INSTANCE
	# =========================================================================
	@property prefix   = ""

	@constructor prefix="app:"
		self prefix = prefix

	# =========================================================================
	# STORAGE PRIMITIVES
	# =========================================================================

	@method set id, value
		id = prefix + id
		STORE setItem (id, json (value))

	@method get id
		id = prefix + id
		let data = STORE getItem (id) or "null"
		return unjson (data)

	@method has id
		id = prefix + id
		let data = STORE getItem (id) or None
		return data is? String

	@method remove id
		id = prefix + id
		STORE removeItem (id)

	@method size id
	| Returns the size (in bytes) of the value at the given key
		id = prefix + id
		let data = STORE getItem (id) or "null"
		return len(data)

	@method keys
		let r = []
		let l = len(prefix)
		return 0..(STORE length) ::> {r=[],i|
			let k = STORE key (i)
			if k indexOf (prefix) == 0
				r push (k[l:])
			return r
		}

	# FIXME: This is not what is expected
	@method items
		return keys () ::= {[_, get(_)]}

	@method clear
		keys () :: remove
		return self

@function localStorage id
	return new LocalStorage (id)

# EOF - vim: ts=4 sw=4 noet
