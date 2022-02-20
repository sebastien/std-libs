@feature sugar 2
@module std.state.objects
| Defines abstract primitives to manage a persistent object relational
| data model.
|
| The model defines the notion of stored object and stored relation,
| accessed through an interface singleton that wraps a storage backend
| implementing the actual persistence.

@import TFlyweight from std.patterns.flyweight
@import assert,error,warning,NotImplemented from std.errors
@import cmp,len,bool,str,isDefined,identity,equals,copy,sprintf from std.core
@import first,indexOf,keyOf,keys as col_keys,merge,values,removeAt as col_removeAt,access,sorted,remap as col_remap from std.collections
@import Async,join as async_join,future from std.io.async
@import padl from std.text
@import compactHashInt from std.util.hashing
@import Journal,OP from std.state.journal
@import now,delayed from std.io.time
@import runtime.window as window

@enum  ERRORS = EXTRA | REQUIRED | INVALID | CORRUPT
@enum  ORIGIN = LOCAL | REMOTE

# TODO: Support deletion
# TODO: StoredObject.update actually updates the properties. We should
#       have it manage the meta information as well.
# TODO: StoredRelation._merge expects changes to be scoped at the items level
# TODO: Retain on all the get objects
# TODO: Potential conflict strategy
# TODO: Think about update strategy -- when do we pull? What if the object is subscribed?
# TODO: Error logging/aggregates
# NOTE: pull/push is the primary mechanism to synchronize objects and relations
#       with the remote storage. by defaults, pull/push do a full snapshot update.
# NOTE: _set/_update/_commit are here to manage the application of changes.
# TODO: We should differentiate between new objects (ie. objects that we 
# know are new, because they should have a unique ID) and existing objects. 
# New objects should probably not have their relations setup before their
# properties.

# -----------------------------------------------------------------------------
#
# INTERFACE
#
# -----------------------------------------------------------------------------

@class Interface

	@property _pool    = new ObjectPool ()
	@property _types   = Undefined
	@property _backend = Undefined
	@property _binding = Undefined

	@constructor types:Map, backend:ObjectStorage, binding
		# We make sure the types are types
		_types   = types ::= {v,k|
			if v is? StoredType
				return  k
			else
				return new StoredType (v,k)
		}
		_backend = backend or (new PoolObjectStorage (_pool))
		_binding = binding
		assert (_backend is? ObjectStorage, "Expected backend to be an ObjectStorage, got:", backend)

	# =========================================================================
	# HANDLERS
	# =========================================================================

	@method handle value
	| Returns a handler for the given value
		return StoredHandler Create (value)

	# =========================================================================
	# SUPER HIGH-LEVEL
	# =========================================================================

	@method push
		return _pool map {_ push (True)}

	@method pull
		return _pool map {_ pull ()}

	@method dump
		return _pool dump ()

	@method clear
		return _pool clear ()

	# =========================================================================
	# OBJECTS
	# =========================================================================

	@method getType typeName:String
		let type = typeName if typeName is? StoredType else _types[typeName]
		assert (not type or type is? StoredType, "Expected StoredType at `" + typeName + "`, got:", type)
		return type

	@method listTypes
		return values(_types)

	@method hasType typeName:String
		typeName = typeName name if typeName is? StoredType else typeName
		return bool (_types[typeName])

	@method getImplementation typeName:String
	| Returns the concrete implementation to be used when creating StoredObjects
	| of the given type. This must be a `StoredObject` subclass.
		return _binding and _binding [typeName] or StoredObject

	# =========================================================================
	# OBJECT
	# =========================================================================

	# NOTE: Make sure that these use the canonical encoding, not the backend
	# encoding.

	@method restore data, origin=Undefined, currentType=Undefined, currentKey=Undefined
	| Convenience alias to `restoreObjects`
		return restoreObjects (data, origin, currentType, currentKey)

	@method restoreObjects data, origin=Undefined, currentType=Undefined, currentKey=Undefined
	| Restores the objects encoded in the given `data` This can take array
	| and objects, and will flatten everything, returning the list of restored
	| object instances in the depth-first traversal order.
		let v = data
		let r = []
		if v is? Array
			r =  v ::> {r=[],v|
				let w = restoreObjects (v, origin, currentType, currentKey)
				if w is? Array
					return r concat (w)
				else
					r push (w)
					return r
			}
		elif v and v type and v id
			r push (restoreObject (v, origin))
		elif v and currentType and currentKey
			let w = merge ({type:currentType, id:currentKey}, v)
			r push (restoreObject (w, origin))
		elif v
			for w,k in v
				let lt = currentType        if currentType   else k
				let lk = (currentKey or k)  if (lt is not k) else Undefined
				r = r concat (restoreObjects (w, origin, lt, lk))
		return r

	@method restoreObject data, origin=Undefined, nestedIn:StoredRelation=Undefined
	| Restores the object encoded in the given data.
		if not data
			return None
		assert (data type, "Data must have a `type` property")
		assert (data id,   "Data must have an `id` property")
		let e = hasObject (data type, data id)
		let o = getObject (data type, data id)
		if nestedIn
			o nestIn (nestedIn)
		# TODO: OBJECT_PROPERTIES_KEY
		# NOTE: We're not being strict here and merging everything
		let p = data["-p"] ::? {v,k|o _type hasProperty (k) or True}
		let r = data["-r"] ::? {v,k|o _type hasRelation (k) or True}
		# NOTE: We update the properties, we never clear them
		if not e
			# If the object does not exist, we set it
			o _update (p, origin)
			r :: {v,k|
				let rel = o getRelation (k)
				rel _updateNestedObjects (v["-o"], origin)
				rel _updateItems         (v["-k"], origin)
			}
		elif origin is REMOTE
			# If the object already exists we don't do anything because
			# we probably have (or will soon have) an up-to-date version. If we
			# did update the object, then we might inject stale values when
			# restoring the object from a relation.
			# TODO: Actually, we could merge in any property that is not 
			# defined in the object.
			pass
		else
			# Otherwise we update it
			o _update  (p, origin)
			r :: {v,k|
				let rel = o getRelation (k)
				rel _updateNestedObjects (v["-o"], origin)
				rel _updateItems         (v["-k"], origin)
			}
		return o

	@method createObject type:Type, id:String=Undefined
	| Creates an object, but does not save it yet. The object is automatically
	| retained.
		id ?= _backend nextID ()
		if hasObject (type, id)
			error ("Object already exists with type", type, "and id", id, __scope__)
			return None
		else
			return getObject (type, id) _create ()

	@method listObjects type:Type
		let t   = getType (type)
		assert (t, "Type", type, "is not registered in this interface")
		let res = _backend listObjects (t)
		assert (res is? Async, "Backend must return async value, got", res)
		return res

	@method getObjects type:Type, objects:Array
		let t   = getType (type)
		assert (t, "Type", type, "is not registered in this interface")
		# NOTE: We return a list here
		let res = _backend getObjects (t, objects) chain {
			return _ ::> {r=[],v|r push (restoreObject(v, REMOTE));r}
		}
		assert (res is? Async, "Backend must return async value, got", res)
		return res

	@method setObject object
		assert (object is? StoredObject, "StoredObject expected, got:", object)
		return _backend setObject (object)

	@method getObject type:Type, id:String, retain=False
		let t = getType (type)
		assert (t, "Type", type, "is not registered in this interface")
		let o = _pool get (t name, id)
		if o
			o retain () if retain
			return o
		else
			let object_class = getImplementation (t name)
			let o = (object_class Create (self, t, id)) if object_class Create else (new object_class (self, t, id))
			o retain () if retain
			return _pool set (t name, id, o)

	@method hasObject type:Type, id:String
		assert (type, "Missing type, there might be a problem with the data format")
		let t = getType (type)
		assert (t, "Type", type, "is not registered in this interface")
		return _pool has (t name, id)

	@method nextID
	| Generates a new ID using the backend.
		return _backend nextID ()

	# =========================================================================
	# PROPERTIES
	# =========================================================================

	@method getProperties object:StoredObject
		return _backend getProperties (object)

	@method setProperties object:StoredObject, properties:Object
		return _backend setProperties (object, properties)

	@method onProperties object:StoredObject
		return _backend onProperties (object)

	@method pushProperties object:StoredObject, properties:Object, changes:Array
		return _backend pushProperties (object, properties, changes)

	# =========================================================================
	# RELATIONS
	# =========================================================================

	@method getRelation object, name, complete=False
		assert (object is? StoredObject)
		return _backend getRelation (object, name, complete)

	@method setRelation relation:StoredRelation
		assert (relation is? StoredRelation)
		return _backend setRelation (relation)

	@method updateRelation relation:StoredRelation, changes
		assert (relation is? StoredRelation)
		return _backend updateRelation (relation, changes)
	
	@method onRelation object:StoredObject, name:String
	| Returns a `{objects,values}` change stream map.
		return _backend onRelation (object, name)

	@method pushRelation relation:StoredRelation, changes:Array
		assert (relation is? StoredRelation)
		return _backend pushRelation (relation, changes)

# -----------------------------------------------------------------------------
#
# STORED TYPE
#
# -----------------------------------------------------------------------------

@class StoredType
| Holds the schema for a class of objects, including the description
| of properties, relations and permissions.

	@property _definition
	@property _name

	@operation ParseType text
	| Parses strings like `Type#variant[Param]|tag,tag`, returning
	| `{type:"Type",variant:["subtype"], "params":[{type:"Param"}], tags:["tag","tag"]}`
		let root = {type:""}
		let ctx  = [root]
		var cur  = root
		let n    = text length
		var o    = 0
		var i    = 0
		var mode = None
		# NOTE: This is not super elegant but it's fast and relatively
		# easy to tweak.
		while i < n
			let c = text[i]
			if c is "@"
				mode = c
				cur tags ?= []
				cur tags push ""
			elif c is "#"
				mode = c
				cur variant ?= []
				cur variant push ""
			elif c is "["
				ctx push {cur,mode}
				mode = c
				let v = {type:""}
				cur params ?= []
				cur params push (v)
				cur = v
			elif c is ']'
				let w = ctx pop ()
				cur  = w cur
				mode = w mode
			elif c is ','
				if mode is "@"
					cur tags push ""
				elif mode is "#"
					cur variant push ""
			elif c != ' '
				if mode is "#"
					# We have a regular character in a VARIANT
					let j = len(cur variant) - 1
					cur variant [j] = cur variant [j] + c
				elif mode is "@"
					let j = len(cur tags) - 1
					# We have a regular character in a TAG
					cur tags [j] = cur tags [j] + c
				else
					cur type += c
			i += 1
		return root

	@constructor definition, name=Undefined
		_definition = _normalizeDefinition (definition)
		# TODO: Should define a schema for the validation
		_name       = name or definition name

	@getter name
		return _name
	
	@getter isNested
		return bool (_definition nested)

	# =========================================================================
	# PROPERTIES
	# =========================================================================

	@method getProperties
		return _definition properties

	@method listProperties
		return col_keys (_definition properties)

	@method hasProperty name
		return bool (_definition properties[name])

	@method validateProperty data, name, value
		# TODO: Implement me
		return True

	# =========================================================================
	# RELATIONS
	# =========================================================================

	@method listRelations
		return col_keys (_definition relations)

	@method isRelationNested name
		if not _definition relations[name]
			return False
		else
			# TODO: Refactor as isNested
			return _definition relations[name] nested

	@method getRelations
		return col_keys (_definition relations)

	@method getRelation name
		return _definition relations[name]

	@method isRelationNested name
		let r = getRelation (name)
		return bool (r and r nested)

	@method hasRelation name
		return bool (getRelation(name))

	@method validateRelation data, name, value
		# TODO: Implement me
		return True

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _normalizeProperty value
		return ParseType (value) if value is? String else value
	
	@method _normalizeDefinition value
		return value ::= {v,k|
			if k is "properties"
				return v ::= {_normalizeProperty(_)}
			else
				return v
		}

	# =========================================================================
	# VALIDATE
	# =========================================================================

	@method validate state
	| Verifies the given data against the schema. Returns `True` when
	| it validates, otherwise returns a map with all the erroneous fields.
		# FIXME: Not working
		# We check for the properties that are defined
		let res = state ::> {r,v,k|
			r ?= []
			var v = True
			if hasProperty (k)
				v = validateProperty (state, k, v)
			elif hasRelation (k)
				v = validateRelation (state, k, v)
			else
				v = EXTRA
			if v is not True
				r[k] = v
			return r
		} or {}
		# for v,k in _definition properties
		# 	if v required and state[k] is Undefined
		# 		res[k] = REQUIRED
		return True if len(res) == 0 else res

# -----------------------------------------------------------------------------
#
# STORED VALUE
#
# -----------------------------------------------------------------------------

@class StoredValue: TFlyweight
| The abstract base class for stored objects and relations. Essentially
| wraps a journal, keeping track of local and remote revisions.

	@property _subscriptionCount = 0
	@property _journal:Journal          = Journal Create ()
	@property _localRevision            = -1
	@property _remoteRevision           = -1
	@property _inTransaction            = 0
	@property _inTransactionRevision    = None
	@property _lastPull                 = 0

	@method init
		_inTransaction         = 0
		_inTransactionRevision = None

	@getter repr 
		return "#storedvalue"

	@getter shouldPush
		return _remoteRevision < _localRevision

	@getter canPush
		return True

	@getter shouldPull
		return _lastPull == 0 or _subscriptionCount == 0
	
	@method load
	| Pulls the value only if it has not been pulled or is not subscribed.
		if not shouldPull
			return future (self)
		else
			return pull ()
	
	@method sub
		# FIXME: I'm not sure it's a good thing to have an implicit pull.
		# It's an expensive operation and we absorb the future returned
		# by the pull.
		# --
		# We implicitely pull when doing a sub without a pull, but only
		# if we have nothing to push (or we risk a conflict).
		if shouldPull
			pull ()
		_subscriptionCount += 1
		if _subscriptionCount == 1
			_sub ()
		return self

	@method unsub
	| Unsubscribes to remote property updates
		_subscriptionCount -= 1
		if _subscriptionCount == 0
			_unsub ()
		return self

	@method push
		error (NotImplemented, __scope__)

	@method pull
		error (NotImplemented, __scope__)

	# =========================================================================
	# INTERNAL HANDLERS
	# =========================================================================

	@method onPull
		let t = now()
		if _lastPull and t - _lastPull < 500ms
			warning ("Pulled value within 500ms, consider using `.sub()`:", repr, __scope__)
			return False
		_lastPull = t
		return True

	@method onPush
		pass

	# =========================================================================
	# TRANSACTIONS
	# =========================================================================

	@method transaction callback, objects...
	| Executes the `callback`as transaction on the current object and
	| given stored `objects`. The transaction will defer any update event
	| triggered by the stored values until the end of the transaction.
	|
	| You should use transaction when you're modified interdependent
	| properties between objects.
		objects :: {_ and _ startTransaction ()}
		self startTransaction ()
		callback (self, objects)
		objects :: {_ and _ endTransaction ()}
		return self endTransaction ()

	@method startTransaction
	| Increases the stored value's transaction counter.
		_inTransaction += 1
		return self

	@method endTransaction doesPush=True
	| Decreases the stored value's transaction counter, when the counter
	| reaches 0 and updates happened during the transaction, they will
	| be propagated using `_propagate`.
		_inTransaction -= 1
		if _inTransaction == 0
			if _inTransactionRevision is not None
				let r = _inTransactionRevision
				_inTransactionRevision = None
				# NOTE: We assume local origin, but it might not always be 
				# the case.
				_propagate (_journal after (r), LOCAL)
				# We do a push at the end of the transaction, which is the
				# default behaviour.
				if doesPush
					return push ()
		return future (self)

	# =========================================================================
	# DIFFERENCE TRACKING
	# =========================================================================

	@method isSubset a, b
	| Tells if the given value  `a` is a subset of the value `b`.
		# TODO: Make sure both are objects
		for v,k in a
			if not equals (v, b[k], 1)
				return False
		return True

	# =========================================================================
	# SUB IMPLEMENTATION
	# =========================================================================

	@method _sub
		error (NotImplemented, __scope__)

	@method _unsub
		error (NotImplemented, __scope__)

	@method _propagate delta, origin=LOCAL
	| Propagates the changes through an Update event (locally) and pushes
	| the changes if the origin is LOCAL.
		if _inTransaction > 0
			warning ("Trying to propagate a change when in transaction", repr, delta, __scope__)
		self ! "Update" (delta)

# -----------------------------------------------------------------------------
#
# STORED RELATION
#
# -----------------------------------------------------------------------------

# NOTE: Relations are expected to be relatively small, ie. in the 10s or 100s
# of elements. If they were bigger, then they would probably need to be
# something else, or have a slightly different API.

# TODO: Storing keys is not strictly necessary. The stored relation is
# really meant to be a list.

# NOTE: The strategy for changes is that all changes push by default, unless
# we're in a transaction.
@class StoredRelation: StoredValue
| Manages a 1-N mapping between a **subject** and **objects of the same type**,
| where each mapping can have extra value. For instance, a mapping
| between a project and users, where users have roles specific to the project.
|
| Relations are implemented as an **ordered map** of `{object,value}` maps,
| where the `object` is a `StoredObject` (which can be nested in the relation),
| and `value` some arbitrary primitive data.
|
| You can get the ordered map as `relation value`, the list objects
| as `relation objects`, the list of values as `relation values`, and
| a map of objects `ids` as `relation ids`.

	# TODO: Support ranges

	@property _subject:StoredObject
	@property _name:String
	@property _values:Object
	@property _objects:Object
	@property _keys:Array
	@property _subscription:Stream
	@property _remoteRelation = Undefined
	@property _cachedObjectList:Array
	@property _cachedValuesList:Array
	@property _cachedObjectIDs:Map

	@method init subject, name
		assert (subject is? StoredObject)
		assert (name   is? String)
		self _subject  = subject
		self _name     = name
		self _values   = {}
		self _objects  = {}
		self _keys     = []

	@method reset
		_journal reset () if _journal
		if _remoteRelation
			_remoteRelation values cancel ()
			if _remoteRelation objects
				_remoteRelation objects cancel ()
		_localRevision    = -1
		_remoteRevision   = -1
		_cachedObjectList = Undefined
		_cachedValuesList = Undefined
		_cachedObjectIDs  = Undefined
		_objects :: {_ release ()}
		_objects = {}
		_values  = {}
		_keys    = []

	# =========================================================================
	# ACCESSORS
	# =========================================================================

	@getter repr 
		return _subject _type name + "." + _subject id + "#" + _name

	@getter name
		return _name

	@getter parent
		return _subject

	@getter length
		return _keys length if _keys else 0

	@getter count
	| An alias for length
		return length

	@getter id
		return _subject id + "." + _name

	@getter type
		return _subject _type getRelation (_name) type

	@getter schema
	| Returns the schema for this relation
		return _subject _type getRelation (_name)

	@getter keys
	| Returns the list of keys in this relation
		# TODO: Cache and freeze
		return _keys

	@getter objects
	| Returns the list of objects in this relation
		# TODO: Cache and freeze
		_cachedObjectList ?= Object freeze (_keys ::= {_objects[_]})
		return _cachedObjectList

	@getter values
	| Returns the list of values in this relation
		_cachedValuesList ?= Object freeze (_keys ::= {_values[_]})
		return _cachedValuesList

	@getter items
	| Returns `{object,value}` for this relation.
		# TODO: Should we cache?
		return keys ::= {{object:_objects[_], value:_values[_], key:_}}

	@getter ids
	| Returns a map of object id to object
		_cachedObjectIDs ?= Object freeze (_objects ::> {r={},v|r[v id] = v;r})
		return _cachedObjectIDs

	@getter isNested
	| Tells if this relation is nested (ie. does it has a nested property).
		return bool (access (_subject type, ["_definition", "relations", name, "nested"]))

	# =========================================================================
	# LIST API
	# =========================================================================

	# --- READ OPERATIONS -----------------------------------------------------

	@method hasKey key
		return bool (_objects[key])

	@method hasObject value:StoredObject
	| Tells if the object is registered in this relation.
		# FIXME: indexOf is a bit inconsistent there. If _objects is a map,
		# it returns the key or Undefined if not found, or it returns the
		# index or -1 if not defined. It should always return the index.
		return keyOf (_objects, value) is not Undefined

	@method getObjectKey object:StoredObject
	| Returns the key to which the given object is bound, or
	| `undefined` if not found.
		return keyOf (_objects, object)

	@method getObject key:Value
	| Returns the **object** associated with the given `key`
		return _objects[key]

	@method getNestedObject type, id
	| Returns the nested object of the given type, as nested within this
	| relation.
		return _subject _interface getObject (type, id) nestIn (self)

	@method getObjectAt index:Number
		return getObject (getKeyAt (index))

	@method getValue key:Value
	| Returns the **value** at the given `key`
		return _values[key]

	@method getItem key:Value
	| Returns the `{object,value}` pair at the given `key `
		let o = _objects[key]
		if o is Undefined
			return Undefined
		else
			let r = {}
			r object = o
			let v = _values[key]
			if isDefined (v)
				r value = v
			return r

	@method getKeyForValue value
		var key = None
		each {o,k,v|
			if v is value
				key = k
				return False
		}
		return key

	@method getKeyAt index
		return _keys[index]

	@method each callback
	| Takes `callback(o,k,v)`, iterating over the available values.
		for k in _keys
			if callback (_objects[k], k, _values[k]) is False
				return self
		return self

	# --- WRITE OPERATIONS ----------------------------------------------------
	# NOTE: All these operations affect the journal.

	@method setObjects objects
		if objects
			let items = objects ::> {r={},v|r[v id]={object:v};r}
			set (items)
		else
			clear ()
		return self

	# FIXME: This should probably be depreacted in favor of set{Object,Value,Item}
	@method set key=Undefined, object=Undefined, value=Undefined
	| Sets the given `{<key>:{object,value}}` as the new
	| items of this relation.
		if object is Undefined
			let items = key
			_setItems (items, LOCAL)
		else
			_updateItems ({(key):{object,value}}, LOCAL)
		return self
	
	@method setObject key, object
		return set (key, object)

	@method setValue key, value
		let o = getObject (key)
		assert (o, "Setting a value with no object bound to key", key, "in", repr)
		# TODO: We might want to have a more specific update for that, like
		# this: _journal doSet ("values",  value, key)
		return set (key, o, value)
	
	@method mergeValue key, value
		return setValue (key, merge (copy(value), getValue(key)))

	@method clearValue key
		_journal doClear ("values", key)
		_commit (LOCAL)
		return self

	@method mergeItems items
	| Merges the given `{<key>:{object,value}}` 
	| items into this relation.
		_update (items, LOCAL, False)
		return self

	# TODO: Support clear with key
	@method clear
	| Clears all the items from this relation.
		_journal doClear "values"
		_journal doClear "objects"
		_journal doClear "keys"
		_commit (LOCAL)
		push ()
		return self

	# TODO: Prepend
	# TODO: Insert

	@method add object:StoredObject, value=None, key=Undefined
	| Adds the given `{object,value} pair at the end
		key ?= generateNextKey (object,value)
		assert (indexOf (_keys, 0) == -1, "Trying to add with duplicate key", key)
		# NOTE: objects and values are maps, only keys is a list
		_journal doSet ("objects", object retain (), key)
		_journal doSet ("values",  value, key)
		_journal doAdd ("keys",    key)
		_commit (LOCAL)
		push ()
		return self

	@method addObject object
		return add (object)

	@method remove object:StoredObject
	| Removes the first item involving the given `object` from this
	| relation.
		let key = getObjectKey (object)
		if key is Undefined
			warning ("Object not found in relation", object, ":", self, __scope__)
		else
			removeAt (key)
		return self

	@method removeObject object:StoredObject
		return remove (object)

	@method removeFor key
		return removeAt (key)

	# FIXME: Should be removeFor
	@method removeAt key
	| This is an internal method that removes the item at the given index.
		let o = _objects[key]
		let v = _values[key]
		if not o
			warning ("Trying to remove item at", key, "in", repr, "but no item bound for this key.", __scope__)
		else
			o and o release ()
			_journal doRemove ("objects", o, key)
			_journal doRemove ("values",  v, key)
			_commit (LOCAL)
			push ()
		return self

	@method swap a:StoredObject, b:StoredObject
		let i = getObjectKey (a)
		let j = getObjectKey (b)
		if (i is not Undefined) and (j is not Undefined)
			assert (a is not b)
			let oa = _objects [i]
			let va = _values  [i]
			let ob = _objects [j]
			let vb = _values  [j]
			_journal doSet ("objects", oa, j)
			_journal doSet ("values",  va, j)
			_journal doSet ("objects", ob, i)
			_journal doSet ("values",  vb, i)
			_commit (LOCAL)
			push ()
		return self

	# TODO: RE Implement
	# @method swapBefore object:StoredObject
	# | Swaps the first item referencing the given object with the item before.
	# 	let i = indexOf (_keys, getObjectKey (object))
	# 	if i > 0
	# 		let k = _keys[i - 1]
	# 		swap (object, _objects[ka])
	# 	return self

	# @method swapAfter value:StoredObject
	# | Swaps the first item referencing the given object with the item after.
	# 	let i = indexOf (_keys, getObjectKey (object))
	# 	if i < length - 1
	# 		let k = _keys[i + 1]
	# 		swap (object, _objects[k])
	# 	return self

	# FIXME: I don't think this works anymore
	@method sort comparator
	| Sorts the objects according to the given `comparator(a,b)` function, which
	| return -1 when `a < b` , 1 when `a > b` and 0 otherwise.
	|
	| Note that this may/will probably reassign object/values to
	| different keys.
		# This returns a sorted list of keys
		let kl = sorted (_keys, {a,b|
			let oa = _objects[a]
			let ob = _objects[b]
			return comparator (oa, ob)
		})
		# FIXME: What about the keys?
		for k,i in kl
			let kk = _keys[i]
			if k != kk
				# We extract the item from `kl` and rebind
				# it to the i-th key in _keys.
				# NOTE: It's OK to do that, as the commit only happens
				# at the end of the iteration.
				let oa = _objects[k]
				let va = _values[k]
				_journal doSet ("objects", oa, kk)
				_journal doSet ("values",  va, kk)
		_commit (LOCAL)
		push ()
		return self

	# =========================================================================
	# SYNCHRONIZATION
	# =========================================================================

	@method then continuation
		return pull () then (continuation)

	@method pull complete=True, start=Undefined, end=Undefined
	| Whith no arguments, pulls the relation itself. With arguments, pulls
	| the objects within the slice.
		# TODO: We might want to return an empty future if this object
		# is already subscribed.
		assert (_subject, "Relation has not subject defined")
		assert (_subject is? StoredObject, "Relation's subject is not a stored object")
		if (not shouldPull) or (onPull() is False)
			return future (self)
		if start is Undefined and end is Undefined
			return _subject _interface getRelation (_subject, _name, complete) chain {
				# We restore/update any object we have in the relation -- we should
				# be careful not to override their contents.
				for t in _ ["-o"]
					for o in t
						# NOTE: We use _restoreObject to preserve the nesting
						_restoreObject (o, REMOTE)
				# TODO: RELATION_VALUES_KEY
				_update (_["-v"], REMOTE)
				return self
			}
		else
			# FIXME: We  should 
			error ("Relation slice is not implemented", repr, __scope__)
			# return pull (complete) chain {
			# 	async_join ( slice(start, end) ::= {_ pull ()} )
			# 	return self
			# }

	# TODO: We might want to split the pushObjects as well
	@method push complete=False
	| Sends any unsent changes to the remote backend.
		# When the update is done, we update the remote revision to be
		# at least the local revision.
		let should_push = shouldPush
		if should_push
			onPush ()
		elif not complete
			# If we should not push and we're not asking for a complete (ie.
			# a push with nested objects), then we can exit early.
			# FIXME: Shouldn't we update the revision number?
			return future (self)
		# When `complete` is set, we push all the children that need to be pushed,
		let p = ((_objects ::> {r=[],v|
			if v shouldPush
				# FIXME: We don't forward `complete` here as otherwise
				# we might have loops.
				r push (v push ())
			return r
		}) or []) if complete else []

		if (not should_push) and len(p) == 0
			# In this case we should push neither the relation, nor the objects,
			# so there's literraly nothing to do. We just return a future, as
			# there's no update per se.
			# We still update the revision number
			_remoteRevision = Math max (_remoteRevision, _localRevision)
			return future (self)
		else
			# We update the revision right away, so that we don't send duplicate changes, 
			# but we'll restore the remote revision in case of failure.
			let remote_rev  = _remoteRevision
			_remoteRevision = Math max (_remoteRevision, _localRevision)
			let reset_rev   = {_remoteRevision = Math min (_remoteRevision, remote_rev)}
			# We push the relation itself as a part of the list of futures.
			# NOTE: It's super important here to axtract the journal after remote_rev, and not
			# _remoteRevision, as otherwise we're going to send blank changes.
			# NOTE: We're sending the changes that happened AFTER the latest known remove rev
			p push (_subject _interface pushRelation (self, _journal after (remote_rev + 1)) failed (reset_rev) cancelled (reset_rev))
			return async_join (p) chain {return self}

	@method _sub
	| Subscribes to remote property updates. Unlike objects, relations have
	| two streams of updates: one for the values, and one for nested
	| objects (nested relations only).
		if not _remoteRelation
			_remoteRelation = _subject _interface onRelation (_subject, _name)
			if _remoteRelation objects
				_remoteRelation objects partial (self . _doRelationObjectsUpdate)
			if _remoteRelation values
				_remoteRelation values  partial (self . _doRelationValuesUpdate)
		return self

	@method _doRelationValuesUpdate change
		# NOTE: We don't need to access the nested value here
		# OK, so some changes might come from nested 
		if change scope length == 0
			# It's too the root, so it's fine
			pass
		else
			# We have a key as the scope's first elemetn, and then
			# it's nested.
			let c = change clone ()
			c value = change nested 1
			c scope = []
			c key   = change scope [0]
			change  = c
		# NOTE: The scope might be more nested than we think, so we need 
		# to change the scope so that it is rooted a the relation values
		# level.
		_merge (change , REMOTE)
		# FIXME: Is this really the case? What about if there are
		# local changes not sent yet?
		_remoteRevision = Math max (_remoteRevision, _journal revision)
		# NOTE: We don't need to send an Update event, as this 
		# has been done by the `_merge`.

	@method _doRelationObjectsUpdate change
	| Applies a change made to any nested object within this relation. This
	| method will identify the scope of the change (ie. an object or 
	| a relation), retrieve the stored value and forward the change to
	| it.
		# NOTE: This method is a bit complicated as we need to account for
		# arbitrarily nested obejcts, so we need to extract the target
		# first and then pass on the value.
		let scope = change scope
		if scope length < 2
			warning ("Scope is too short, expecting at list [TYPE, OID]:", change)
		elif scope length == 2
			# It's the full object
			_subject _interface restoreObject (change value, REMOTE)
		elif scope[2] == "-p" 
			# It's the object properties
			_subject _interface getObject (scope[0], scope[1]) nestIn (self) update (change nested 3 , REMOTE)
		elif scope[2] == "-r" 
			# FIXME: These are the hard cases, this needs to be validated.
			if scope[4] == "-v"
				# We have [TYPE, ID, "-r", NAME, "-v",…] 
				let o = _subject _interface getObject (scope[0], scope[1]) nestIn (self)
				let r = o getRelation (scope[3]) 
				# Now the change value should be {<key>:{object,value}}
				let v = change nested 5 
				r _update (v, REMOTE)
			elif scope[4] == "-o"
				# We have [TYPE, ID, "-r", NAME, "-o"] # 5
				# We restore the parent object and the parent relation in which 
				# the object is nested.
				let o = _subject _interface getObject (scope[0], scope[1]) nestIn (self)
				let r = o getRelation (scope[3]) 
				for objects, t in change nested 5
					for o,oid in objects
						if o type is Undefined or o id is Undefined
							# If the object is missing type or id information,
							# we provide it without mutating the data structure.
							let oo = copy (o)
							oo type ?= t
							oo id   ?= oid
							_subject _interface restoreObject (oo, REMOTE, r)
						else
							_subject _interface restoreObject (o, REMOTE, r)
			else
				warning ("Unsupported change relation scope", scope, __scope__)
		else
			warning ("Unsupported change scope", scope, __scope__)
		# We do notify that there was a change made to this object, as the
		# changes are indirect (ie. in nested objects), but we do want
		# to notify that something has changed beneath.
		self ! "Update" (change)
	
	@method _unsub
		if _remoteRelation
			_remoteRelation values cancel ()
			if _remoteRelation objects
				_remoteRelation objects cancel ()
			_remoteRelation = Undefined
		return self

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method generateNextKey object, value, index=length, format="%08x_%08x"
	| Generates the next key in this relation based on the given object and value. 
	| This creates a hash from the contents and the value as well as the index,
	| so that it is stable based on the (index,value,object)  triple.
		# FIXME: This is a bit experimental, needs some updates
		let ho  = (compactHashInt(object _properties) + compactHashInt(object id) + compactHashInt(object type name)) if object else 0
		let hv  = compactHashInt (value) if value else 0
		let h   = Math floor (ho + hv)
		let i   = Math floor (index) if index is? Number else index
		# NOTE: The keys need to be lexically ordered, as that's what is 
		# going to be used to restore the keys array.
		let res = sprintf(format, i, h % 999999999999)
		return  res

	# =========================================================================
	# JOURNAL
	# =========================================================================

	@method _setItems values, origin=Undefined
	| Updates the state of this relation so that it is exactly the given
	| values.
		return _set (values, origin)

	@method _updateItems values, origin
		# NOTE: Right now this is just a wrapper
		return _update (values, origin)

	@method _set values, origin
		# If we clear, then we simply set stuff
		let set_values  = {}
		let set_objects = {}
		# NOTE: We store the keys as an array, but the objects
		# and values as a map.
		values :: {v,k|
			set_objects [k] = v object
			set_values  [k] = v value
		}
		_journal doSet ("values",  set_values)
		_journal doSet ("objects", set_objects)
		# If we clear, we release the existing objects, it's OK to do that
		# after the journal doClear because no change is applied until we
		# commit, and it's better to release after we've retained.
		_objects :: {_ release ()}
		_commit (origin)
		if origin is LOCAL
			push ()
		return True

	# FIXME: Should support partial updates and Undefined instead of None
	# FIXME: This implementation is not good, it should support PARTIAL updates
	#        and COMPLETE updated.
	@method _update values, origin=Undefined, clear=False
	| Updates the state of this relation taking a list of `{object,value}`
	| items.
	|
	| The values can be given either
	| as an array or map, and will be considered as a patch (ie, does not clear)
	| unless `clear` is `True`.
		assert (origin, "Update without origin")
		# TODO: Detect if there is an actual change
		if not _journal isSynced (_localRevision)
			# TODO: Potential conflict
			warning ("Potential conflict", values, "vs", _values, __scope__)
		# NOTE: We normalize keys to STRINGS, which is important as 0 != '0'
		# We iterate on the keys
		for item,k in values
			# NOTE: The objects might be only partially loaded. A nested
			# relation will have up-to date content, but otherwise the
			# objects will need to be pull()'ed to be up to date.
			k              = "" + k
			assert (item, "Empty value within the values at key", k)
			let item_o     = _restoreObject (item object, origin) if item and item object else None
			let item_v     = item value
			let existing_o = _objects[k]
			let existing_v = _values [k]
			# We manage the value
			if cmp(existing_v, item_v) != 0
				if not isDefined (item_v)
					_journal doRemove ("values", existing_v, k)
				else
					_journal doSet    ("values", item_v,     k)
			# We manage the object
			if not StoredObject Same (existing_o, item_o)
				if not isDefined (item_o)
					if isDefined (existing_o)
						_journal doRemove ("objects", existing_o release (), k)
				else
					existing_o and existing_o release ()
					_journal doSet ("objects", item_o retain (),     k)
		_commit (origin)
		if origin is LOCAL
			push ()
		return True

	@method _updateNestedObjects objects, origin=Undefined
		# TODO:
		warning ("Not implemented", __scope__)

	# NOTE: The changes here are scope at the Items/Value (-v) level
	# TODO: Should be _mergeItems
	@method _merge change:Operation, origin=Undefined
		if not change
			return None
		if not _journal isSynced (_localRevision)
			# TODO: Potential conflict
			warning ("Potential conflict", change, "vs", _values, __scope__)
		if change key
			return _mergeSingleChange (change op, change key, change value, origin)
		else
			# NOTE: We start a transaction as we're going to do multiple changes.
			# If the change is not an update, we clear the keys, objects and values.
			startTransaction ()
			if not change canUpdate
				_journal doClear "keys"
				_journal doClear "objects"
				_journal doClear "values"
				_commit (origin)
			var res = True
			for item, key in change value
				res = _mergeSingleChange (change op, key, item, origin) and res
			endTransaction (origin is LOCAL)
			return res

	@method _mergeSingleChange op, key, item, origin=Undefined
	| Merges the given changeset into this relation. This takes care
	| of updating the reference count of the corresponding objects.
	|
	| The deltas (as `std.state.journal.Operation`) are expected to work
	| on a structure like `[{object,value}]`.
		# We make sure the key is a string
		key  = "" + key
		# Here having `Undefined` means we're keeping the old value, while
		# having `None` means we're removing it.
		let o = item match
			is Undefined → Undefined
			is None      → None
			else         → item object
		# NOTE: We expect the changes to have a key and a value. Technically
		# we could manage SET/CLEAR/INITs
		assert ((key is not None) and (key is not Undefined), "Delta has no key", {op,key,item,origin})
		# NOTE: Before we were checking if there was an object in the item, but
		# there might not be (ie.partial update)
		assert (origin, "Missing origin in merge")
		# We restore the object referenced by the item object (there must be one)
		let change_object = _restoreObject (o, origin) if isDefined (o) else o
		let change_value  = item match
			is Undefined  → Undefined
			is None       → None
			else          → item value
		# Here we need to re-interpret each change in the context
		# of a different data structure. The input structure is
		# like [{object,value}], the output structure is
		# like `{objects:[],values:[]}`.
		# ---
		# We get an item representing this value
		let change_item = {
			object : change_object
			value  : change_value
		}
		# We get the existing item and look for changes in either
		# the value or object
		# [E]xisting [O]bject
		let eo               = _objects[key]
		# [C]hange [O]bject
		let co               = change_object
		var is_same_object   = StoredObject Same (eo, co)
		var is_same_value    = cmp (change_item value, _values[key]) == 0
		# We correct the changes for None/Undefined. None meaning a deletion.
		if change_object is Undefined or ((not isDefined (change_object)) and (not isDefined (eo)))
			is_same_object = True
		if change_value is Undefined or ((not isDefined (change_value)) and (not isDefined (_values[key])))
			is_same_value = True
		let is_same          = is_same_object and is_same_value
		# Nowe comes the hard part. We need to translate the delta, detecting
		# if it is already applied or not, and retaining/releasing the
		# objects accordingly.
		var is_applied       = False
		# TODO: Make sure the full spectrum of operations is supported
		# here.
		match op
			is OP INIT
				if is_same
					is_applied = True
				else
					eo and eo release ()
					co and co retain  ()
			is OP SET
				if is_same
					is_applied = True
				else
					eo and eo release ()
					co and co retain  ()
			is OP UPDATE
				if is_same
					is_applied = True
				else
					eo and eo release ()
					co and co retain  ()
			is OP INSERT
				if is_same
					is_applied = True
				else
					co and co retain  ()
			is OP REMOVE
				if is_same
					eo and eo release ()
				else
					is_applied = True
			is OP CLEAR
				if is_same
					eo and eo release ()
				else
					is_applied = True
			else
				error ("Unsupported operation", op, __scope__)
		if not is_applied
			# NOTE: There's an overhead here in the journal, as any change
			# to one one object will generate three deltas. It might be
			# better in the end to have the same internal format in
			# the relation.
			# --
			# We only log the delta if it has not already been applied.
			# FIXME: The logic is actually not good, and depends on each
			# operation.
			# --
			# NOTE: We handle None/null as a deletion here.
			if change_value is None
				_journal doOp (OP REMOVE, "values", Undefined, key)
			elif isDefined ( change_value )
				_journal doOp (op, "values", change_value, key)
			if change_object is None
				_journal doOp (OP REMOVE, "objects", change_object, key)
			elif change_object
				_journal doOp (op, "objects", change_object, key)
			_commit (origin)
			if origin is LOCAL
				push ()
			return True
		else
			# Otherwise we don't do anything and return None
			return None

	@method _commit origin=Undefined
	| Commits the changes that are left in the journal. This is an internal
	| method that is used by mutating methods.
		assert (origin, "Commit without origin")
		if _journal revision != _localRevision
			let update = _journal apply ()
			_keys = (update objects ::> {r=[],v,k|r push (k);r}) or []
			_keys sort ()
			_objects = update objects
			_values  = update values
			# FIXME: I'm having problems with the optimized implementation,
			# so we're just going to do a brute force for now.
			# Applies the changes and gets back the updated collections
			# let update     = _journal apply ({}, _localRevision + 1)
			# for o,k in update objects
			# 	# NOTE: This is an optimized version, but it needs testing
			# 	# var ki = -1
			# 	# for kk,j in _keys
			# 	# 	if k == kk 
			# 	# 		ki = -2
			# 	# 		break
			# 	# 	elif cmp(k, kk) > 0
			# 	# 		if j == _keys length - 1
			# 	# 			_keys push (k)
			# 	# 		else
			# 	# 			_keys splice (j, 0, k)
			# 	# 		break
			# 	# if ki == -1
			# 	# 	_keys push (k)
			# 	if k not in _keys
			# 		_keys push (k)
			# 	_objects[k] = o
			# 	_values [k] = update values[k]
			# # We make sure the keys are sorted
			# _keys = sorted(_keys)
			# We reset the cache
			_cachedObjectList = Undefined
			_cachedValuesList = Undefined
			_cachedObjectIDs  = Undefined
			let ops        = _journal after (_localRevision)
			# We update the revision now that the changes were applied
			_localRevision = _journal revision
			# If the origin is remote, then we do need to update the remote
			# revision number as well. As for stored objects, this will
			# need to be changed to support proper merging.
			if origin is REMOTE
				_remoteRevision = Math max (_remoteRevision, _localRevision)
			# NOTE: Do we really want to notify the parent object? Strictly
			# speaking, the object has not changed, only its relation.
			# if _subject
			# 	_subject ! "Update" ()
			# NOTE: We only propagate when we're not in a transaction
			# FIXME: Does that work equally for LOCAL and REMOTE?
			if _inTransaction > 0
				if _inTransactionRevision is None
					_inTransactionRevision = _localRevision
				else
					# We don't do anything
					pass
			else
				_propagate (ops, origin)
		return self

	@method _restoreObject value, origin
	| Restores the object defined on the given `value` as sent from the
	| backend. Some objects are nested in the relation, in which case
	| they will be fully restored from the relation value.
		assert (origin, "Missing origin in object restoration")
		let  o = _subject _interface restoreObject (value, origin)
		if not o
			warning ("Object restoration of value", value, "returned an empty object", __scope__)
		elif isNested
			assert ((not o _nestedIn) or (o _nestedIn is self), "Object is nested in a different relation", o)
			o _nestedIn = self
		return o

	@method _propagate delta, origin=LOCAL
	| Propagates the changes through an Update event (locally) and pushes
	| the changes if the origin is LOCAL.
		super _propagate (delta, origin)
		# NOTE[2019/11/08]: Having a push here forces a push when it's not necessarily
		# requested. For instance, creating a nested Comment and then
		# setting the author relation in a transaction will trigger a push,
		# as `_propagate` is called by `endTransaction`.
		# # NOTE: Not sure about the push here
		# if origin is LOCAL
		# 	push ()

	# =========================================================================
	# SERIALIZATION
	# =========================================================================

	@method dump level=-1
	| Dumps this relation. The relation values are dumped as a list.
		# TODO: We might want to have level==0
		if (not _keys) or (_keys length == 0) 
			return {}
		else
			return _keys ::> {r={},k,i|
				let v = _values[k]
				let o = _objects[k]
				let item = {}
				if isDefined (v)
					item value = v
				if isDefined (o)
					item object = o dump (level - 1 if isNested else 0)
				r[k] = item
				r
			}

# -----------------------------------------------------------------------------
#
# STORED OBJECT
#
# -----------------------------------------------------------------------------

# TODO: Right now the journal only stores properties, but we might want
# to scope the journal operations on proeperties with '-p' to isolate them and
# keep a journal for metadata.
@class StoredObject: StoredValue
| Manages a list of properties and relations, as well as journal of the
| changes made to the properties.

	@shared   DEFAULTS                  = {}
	@property _type                     = Undefined
	@property _id                       = Undefined
	@property _interface:Interface
	@property _refCount                 = 0
	@property _remoteProperties         = Undefined
	@property _relations                = Undefined
	@property _properties               = Undefined
	@property _nestedIn:StoredRelation  = Undefined

	@operation Same a, b
	| Tells if both objects (or object references) are for the same
	| objects.
		if (not a) or (not b)
			return False
		else
			return (a is b) or (a id is b id and a type is b type)

	@method init interface, type, id
		super init ()
		assert (interface is? Interface)
		assert (type      is? StoredType)
		assert (id        is? String)
		_interface            = interface
		_type                 = type
		_id                   = id
		_localRevision        = -1
		_remoteRevision       = -1
		_properties           = {}
		_relations            = {}
		_nestedIn             = Undefined
		# NOTE: This does not work with the JS backend, as the _journal
		# is not defined yet.
		_journal reset ()
		onInit ()
		self ! "Init" ()
		return self

	@method reset
		super reset ()
		if _remoteProperties
			_remoteProperties cancel ()
			_remoteProperties = Undefined
		_relations :: {_ dispose ()}
		_relations  = Undefined
		_properties = Undefined
		self ! "Reset" ()
		onReset ()
		return self

	@method dispose
		super dispose ()
		self ! "Dispose" ()
		onDispose ()
		return self

	@method onInit

	@method onReset

	@method onDispose

	# =========================================================================
	# ACCESSORS
	# =========================================================================

	@getter repr 
		return _type name + "." + _id

	@getter type
		return _type

	@getter id
		return _id
	
	@getter fqid
	| Fully qualified id
		if _nestedIn
			let r = _nestedIn parent fqid
			r push (_nestedIn name)
			r push (_id)
			return r
		else
			return [_id]

	@getter isInitialized
	| Returns `True` if the stored object is initialized, meaning that
	| its loca revision is greater than 0.
		return _localRevision > 0

	@getter isNested
	| A nested object is composed with another through its relation. In
	| practice this means that the state of the object would be stored
	| in the state of the relation, meaning that the whole object
	| should be restored when the relation is pulled.
		return bool (_nestedIn)

	@method isNestedIn relation:StoredRelation
		return _nestedIn is relation

	@method getParentRelation
	| Returns the reference in which this object is nested, if any.
		return _nestedIn

	@method getParentObject
	| Returns the parent object, ie. the subject of the relation
	| in which this object is nested.
		return _nestedIn _subject if _nestedIn else None

	@method getRootObject
	| Returns the root object, which is this object if it's not nested,
	| otherwise it walks up the chain.
		if _nestedIn
			return _nestedIn _subject getRootObject ()
		else
			return self

	@method nestIn relation:StoredRelation
	| Nests an object in the given relation
		if _nestedIn is relation
			return self
		elif not relation
			_nestedIn = Undefined
			return self
		else
			assert (not _nestedIn, "Object", repr, "already nested in relation:", _nestedIn repr, "while trying to nest in relation:", relation repr )
			assert (relation is? StoredRelation, "Can only nest object", repr, "in a relation, got:", relation)
			assert (_remoteRevision == -1, "Can only nest an object that has not been pushed:", repr, "has remote revision:", _remoteRevision)
			_nestedIn = relation
			return self

	@getter nestedInObject
		return _nestedIn _subject if _nestedIn else None

	@getter nestedInRelation
		return _nestedIn or None

	@getter canPush
	| An object can only be pushed if it is not nested or has been
	| nested in a relation.
		return (not type isNested) or bool (_nestedIn)

	# =========================================================================
	# REFCOUNT
	# =========================================================================

	@method retain
		_refCount += 1
		return self

	@method release
		_refCount -= 1
		# TODO: Garbage collect
		return self

	# =========================================================================
	# PROPERTIES
	# =========================================================================

	@method _create
	| Called by the interface to denote that this object is a new one. The
	| new object is automatically retained.
		# NOTE: Before we were initializing with {type,id} but we aren't.
		_journal doInit (None, {})
		_commit (LOCAL)
		retain ()
		return self

	@method set state, origin=LOCAL
	| Sets the state of this object to be the given state, clearing out
	| any property not defined in the state.
		_set (state, origin)
		return self

	@method update state, origin=LOCAL
	| Updates the state by updating the keys defined in the given `state`.
		_update (state, origin)
		return self

	@method setProperties properties, origin=LOCAL
		# FIXME: This should be _updateProperties
		startTransaction ()
		_set (properties, origin)
		endTransaction ()
		return self

	@method updateProperties properties, origin=LOCAL
		# FIXME: This should be _updateProperties
		if properties
			startTransaction ()
			_update (properties, origin)
			endTransaction ()
		return self

	@method setProperty name:String, value:Any, origin=LOCAL
		_journal doSet (None, value, name)
		_commit (origin)
		return self

	@method getProperty name:String
		let value = _properties[name]
		if value is Undefined
			return DEFAULTS[name]
		else
			return value

	@method getProperties
	| Returns the properties (but you should not modify them)
		return _properties

	@method hasProperty name:String
		return _properties[name] is not Undefined

	# =========================================================================
	# RELATIONS
	# =========================================================================

	@method getRelation name:String
	| Gets the relation with the given name. This lazily creates the underlying
	| StoredRelation object.
		if not _type hasRelation (name)
			error ("Object of type", _type name, "has no relation", name, __scope__)
			return None
		let r = _relations[name]
		if not r
			let n = new StoredRelation (self, name)
			_relations[name] = n
			return n
		else
			return r
	
	@method getRelations
		return _type listRelations () ::= {getRelation (_)}

	# =========================================================================
	# SYNCHRONIZATION
	# =========================================================================

	# NOTE: The status should actually be inferred from the journal, and be
	# based on a propagation of deltas. This should be rethought.

	@method then continuation
		return pull () then (continuation)

	# TODO: Sort out wether push/pull pushes/pull the relations as well
	@method pull relations=False
		# TODO: We could define in the schema some relations that should be pulled
		# or allow to give a list of relations to pull
		if relations
			return pullRelations (relations, pullProperties ()) chain {return self}
		else
			return pullProperties ()
	
	@method pullProperties
		if (not shouldPull) or onPull () is False
			return future (self)
		# NOTE: We don't pull the changes to the properties
		return _interface getProperties (self) chain {
			# We make sure to update the remote revision with at least
			# the local revision, and make sure it's at least 1
			_set (_, REMOTE)
			return self
		} failed {reason|
			# TODO: Log error
			warning ("Failed while pulling object", _type name , ".", _id, ":", reason, __scope__)
			return None
		}
	
	@method pullRelations relations=None, expects={}
		let r = _type getRelations () if relations is True else relations
		if r is? Array
			r :: {expects[_] = getRelation (_) pull ()}
		else
			r :: {v,k|expects[k] = getRelation (k) pull ()}
		return async_join (expects)

	# TODO: We should do the same as with `pull` and break down in push{Properties,Relations}
	@method push relations=True
	| Sends any unsent changes to the remote backend.
		if relations
			return pushRelations (relations, pushProperties ()) chain {return self}
		else
			return pushProperties ()

	@method pushProperties
		if not canPush
			warning ("Trying to push object of nested type with no parent", repr, __scope__)
			return future (self)
		elif not shouldPush
			return  future (self)
		else
			onPush ()
		# We need to create the object if there is no remote revision. We do
		# need to set the remote revision early as otherwise we might 
		# send multiple updates.
		let remote_rev      = _remoteRevision
		# NOTE: We're sending the changes AFTER the remove rev
		let push_properties = {_interface pushProperties (self, _properties, _journal after (remote_rev + 1))}
		# FIXME: It's a bit weird to have `_remoteRevision`, it should be in the push_properties.
		_remoteRevision     = Math max (_remoteRevision, _localRevision)
		let reset_rev       = {_remoteRevision = Math min (_remoteRevision, remote_rev)}
		if remote_rev < 0
			# If the object is new we need to register it first
			# NOTE: The use of `dump()` here is questionable, it should
			# be standardized.
			# NOTE: We don't need to chain a push properties, are we're
			# setting the object.
			# FIXME: We might want to just do an updateObject here, as we
			# might inadvertently erase stuff.
			return _interface setObject (self) failed (reset_rev) cancelled (reset_rev)
		else
			return push_properties () failed (reset_rev) cancelled (reset_rev)

	@method pushRelations relations=True, expects={}
		let r = _type getRelations () if relations is True else relations
		if r is? Array
			r :: {
				let v = getRelation (_)
				if v shouldPush
					expects[_] = v push  ()
			}
		else
			r :: {
				let v = getRelation (_1)
				if v shouldPush
					expects[_1] = v push ()
			}
		return async_join (expects)

	@method _sub
	| Subscribes to remote property updates
		if not _remoteProperties
			_remoteProperties = _interface onProperties (self)
			_remoteProperties partial {
				let has_changed = _merge (_, REMOTE)
				# FIXME: Is this really the case? What about if there are
				# local changes not sent yet?
				# --> In that case we should merge the _remoteRevision - _localRevision
				#     changes and send them as a subsequent update/patch.
				_remoteRevision = Math max (_remoteRevision, _journal revision)
			}
		return self

	@method _unsub
	| Unsubscribes to remote property updates
		if _remoteProperties
			_remoteProperties cancel ()
			_remoteProperties = Undefined
		return self

	# =========================================================================
	# JOURNAL
	# =========================================================================

	@method _set data, origin=Undefined
	| Updates the properties of this object, removing properties
	| that are not defined in the current `data`
		return _update (data, origin, True)

	# TODO: We should have update take the serialized object {type,id,-p,-r}
	# and work from there.
	@method _update data, origin=Undefined, clear=False
	| Does a full update of this object's properties. If `clear` is `True`,
	| properties not defined in `data` will be removed.
		if not data
			return True
		if not _type or not _journal
			# FIXME: This does not make much sense, but somehow the
			# object is manipulated and its properties are erased.
			warning ("Error: object has no type of journal", __scope__)
			return False
		# We do a clear if necessary
		if clear
			_journal doClear ()
		# TODO: Do something with the result
		_type validate (data)
		if not (_journal isSynced (_localRevision) or isSubset (data,  _properties))
			# TODO: Potential conflict
			warning ("Potential conflict", data, "vs", _properties, __scope__)
		# We only log the differences, which is what was removed and what
		# was updated.
		for v,k in data
			if _properties[k] != v and k != "id" and k != "type"
				# NOTE: Before we were checking if the property was defined (hasProperty)
				_journal doSet (None, v, k)
		_commit (origin)
		return True

	# TODO: We might want to make the difference between properties and meta/relations
	# TODO: Should be _mergeProperties
	@method _merge change, origin=Undefined
	| Merges the given change to the properties
		if not (_journal isSynced (_localRevision) or isSubset (data, _properties))
			# TODO: Potential conflict
			warning ("Potential conflict", change, "vs", _properties, __scope__)
		if change and not change isApplied (_properties)
			_journal _log (change)
			_commit (origin)
			return True
		else
			return None

	@method _commit origin=Undefined
	| Commits all the pending changes for the object
		if _journal revision != _localRevision
			# We apply the changes locally…
			_properties    = _journal apply (_properties, _localRevision + 1)
			_localRevision = _journal revision
			# …but we don't propagate them if we're in a transaction
			# FIXME: Does that work equally for LOCAL and REMOTE?
			if _inTransaction > 0
				if _inTransactionRevision is None
					_inTransactionRevision = _localRevision
			else
				let ops = _journal after (_localRevision)
				_propagate (ops, origin)
				# We automatically push a commit if the origin is local. This
				# was done in propagate before, but it does make more sense
				# to have it here.
				if origin is LOCAL
					push ()
		# If the commit is coming from a REMOTE origin, then we bump
		# the remote revision.
		# NOTE: If there was a conflict, then the remote revision
		# number should be reset to before the conflict so that
		# the delta will be pushed.
		if origin is REMOTE
			_remoteRevision = Math max (_remoteRevision, _localRevision)
		return self

	@method _propagate ops, origin=LOCAL
	| Propagates the changes through an Update event (locally) and pushes
	| the changes if the origin is LOCAL.
		super _propagate (ops, origin)
		self ! "Update" (ops)
		# NOTE: Before 2019-06-05 propagation was pushing when changes
		# were local and the object was subscribed, but this is
		# a bad ideas as you really want the clients to control
		# when the pushing is done, as it's an expensive operation.

	# =========================================================================
	# DUMP
	# =========================================================================

	@method dump level=-1
	| Dumps this stored object as a canonical object that can be imported.
		let o = {type:_type name, id:_id}
		if level is 0
			return o
		else
			# FIXME: We might want to use the globals "-p","-v", etc
			o["-p"] = _properties
			o["-r"] = _relations ::= {_ dump (level - 1)}
			return o

# -----------------------------------------------------------------------------
#
# OBJECT STORAGE
#
# -----------------------------------------------------------------------------

@class ObjectStorage
| A base class to map objects and their relations to a tree-like
| structure.

	@shared   PROPERTIES_KEY        = "-p"
	@shared   RELATIONS_KEY         = "-r"
	@shared   RELATION_OBJECTS_KEY  = "-o"
	# TODO: Maybe rename to RELATION_ITEMS_KEY
	@shared   RELATION_VALUES_KEY   = "-v"
	@shared   ID                    = new Date () getTime () * 1000
	@property _db                   = Undefined
	@property _version              = "V0"

	@constructor db
		_db = db

	@getter prefix
		return _version

	# =========================================================================
	# CONNECT
	# =========================================================================

	@method connect options=Undefined
		return future (self)

	@method disconnect
		_db = None
		return future (self)

	# =========================================================================
	# IDS
	# =========================================================================

	@method nextID
		ID += 1
		return "" + ID

	# =========================================================================
	# OBJECTS
	# =========================================================================

	@method setObject object
	| Returns a new object of the given type. The object is not yet stored
	| in the database, it needs to be added either to a relation or using
	| the  `addObject`
		return _db update (_getObjectPath (object), encodeObject(object, -1)) chain {return object}

	@method listObjects type
	| Lists the ids of the objects available at the given type.
		let path = _getTypePath (type)
		return _db list (path)

	@method getObjects type, objects
	| Returns the give object ids for the given type.
		let path = _getTypePath (type)
		# FIXME: This might not be the best. We might want
		# disjoint fields here in Firebase.
		return _db mget (path, objects) chain {return _ ::= {decodeObject (_)}}

	# =========================================================================
	# PROPERTIES
	# =========================================================================

	@method getProperties object
	| Returns the properties of the given type and id.
		# NOTE: Firebase's driver does not always return the exact same values
		# even when the data has not changed. You can check this by getting
		# incoming twice for a value that did not change and contains a simple
		# array and the test for equality. This basically means we can't
		# do change detection as easily as if the data was immutable and
		# monotonic.
		return _db get (_getPropertiesPath (object))

	@method setProperties object, properties
	| Commits the given change/delta to the given object.
		# NOTE: We scope at the properties level, and we don't check/validate
		# NOTE: In Firebase, an update is like a SET
		return _db set (_getPropertiesPath (object), properties)
	
	@method updateProperties object, properties
		return _db update (_getPropertiesPath (object), properties)

	@method onProperties object
		return _db onChange (_getPropertiesPath (object))

	@method pushProperties object, properties, changes
		# FIXME: The Firebase backend does not support streaming of deltas/changes. Instead it updates everything.
		return updateProperties (object, properties)

	# =========================================================================
	# RELATIONS
	# =========================================================================

	@method getRelation object, name, complete=False
	| Retrieves the relation with the given `name` for the given `object`
	| from the storage.
		if not complete
			return {(RELATION_VALUES_KEY):getRelationValues (object, name)}
		else
			let p = _getRelationPath (object, name)
			let f = _db get (p)
			return f chain {return {
				(RELATION_VALUES_KEY):decodeRelationValues (_ [RELATION_VALUES_KEY])
				(RELATION_OBJECTS_KEY):decodeRelationValues(_ [RELATION_OBJECTS_KEY])
			}}

	@method getRelationValues object, name
		let p = _getRelationValuesPath (object, name)
		let f = _db get (p)
		return f chain {decodeRelationValues(_)}

	@method getRelationObjects object, name
		let p = _getRelationObjectsPath (object, name)
		let f = _db get (p)
		return f chain {decodeRelationObjects(_)}

	@method setRelation relation
	| Sets the relation items (ie. the objects and values)
		# We have `{objects:{<key>:<object>,values:{<key>:<value>}}}`, and we 
		# We need to encode the relation values as `{<key>:{object:<object>,value:<value>}}`.
		let res = {}
		relation each {o,k,v|
			# TODO: Store/cache the properties defined in the model
			let w = {object:encodeObject(o)}
			if v is not Undefined
				w value = v
			res[k] = w
		}
		return _db set (_getRelationValuesPath (relation _subject, relation _name), res)
	
	@method updateRelation relation, changes
		# The journal is encoded as `{objects:{<key>:<object>},values:{<key>:<value>}}`
		var can_update = True
		var patch = {}
		# The first step is to determine wether we can do a patch (ie, there
		# is no global SET, CLEAR or INIT) or not.
		for change,i in changes
			let op  = change op
			let key = change key
			if (op is OP SET or op is OP CLEAR or op is OP INIT) and (key is Undefined or key is None)
				can_update = False
				break
			else
				patch = change apply (patch)
		# If we can't do a patch, we do a set.
		if not can_update
			return setRelation (relation)
		else
			# We encode the patch, and limit the depth to 0 for objects
			# and relations.
			# FIXME: That does not quite work
			let v = encodeValue (patch, 0)
			let w = {}
			# FIXME: This is quite inefficient, we have to do two iterations to 
			# recreate a zipped version. of the changes.
			for o,k in v values
				w[k] ?= {}
				w[k] value = o
			# We also have to be careful about including  `None` that might denote 
			# the removal of a value. Here objects have a priority over values
			# as each item must have a bound object.
			for o,k in v objects
				if o is None
					w[k] = None
				else
					w[k] ?= {}
					# TODO: Store/cache the properties defined in the model
					w[k] object = encodeObject (o)
			# FIXME: Do we care about nested objects?
			return _db update (_getRelationValuesPath (relation _subject, relation _name), w)

	@method onRelation object, name
	| This is called by the `StoredObject._sub` method. This returns a
	| `{values,objects}` stream map.
		let is_nested = object type isRelationNested (name)
		if not is_nested
			return {
				values  : _onRelationValue (object, name)
				objects : None
			}
		else
			# NOTE: The order is kind of important here, as we want to
			# favor objects over values, so that objects have a chance
			# of being loaded first. There is no guarantee that it
			# will be the case, though, but it's good practice.
			let o = _onRelationObject (object, name)
			let v = _onRelationValue  (object, name)
			return {
				values  : v
				objects : o
			}

	@method _onRelationValue object, name
		let path = _getRelationValuesPath (object, name)
		return _db onChange (path) pipe {change|
			# The relation items are stored encoded. Here we decode the value.
			change value = decodeRelationValue (change value)
			return change
		}

	@method _onRelationObject object, name
		let path = _getRelationObjectsPath (object, name)
		return _db onChange (path) pipe {change|
			# The relation items are stored encoded. Here we're listening
			# to the values path, so we suffix the change's key with
			# `value` so that it targets the `value` of the `{object,value}`
			change value = decodeObject (change value)
			return change
		}

	@method pushRelation relation, changes=Undefined
	| The default storage backend does not support streaming of deltas/changes. Instead
	| it updates everything.
		# TODO: We should actually to a patch/updateRelation instead.
		return updateRelation (relation, changes)

	# =========================================================================
	# DECODERS
	# =========================================================================
	# NOTE: By default we assume the payloads are canonically encoded, so
	# there's no extra step required.

	@method decodeObject payload:Any
	| Decodes a value stored in the storage and returns a normalized
	| structure that can be converted to a stored object.
		# We assume everything is canonically encoded
		return payload

	@method decodeRelation payload
	| The inverse function of `encodeRelation`. Takes
	| an `{-o:{},-v:{<KEY>:{object,value}}}` map, returning an ordered map
	| of `{-o:{},-v:{<KEY>:{object,value}}}` that can be directly given to the
	| `StoredRelation.update` method.
		# We assume everything is canonically encoded
		if not payload
			return []
		else
			return payload
	
	@method decodeRelationValues payload
		# We assume everything is canonically encoded
		return payload

	@method decodeRelationValue payload
		return payload

	# =========================================================================
	# ENCODERS
	# =========================================================================

	@method encodeValue value:Any, depth=0
		# NOTE: The depth is only passed to the encode{Object,Relation}, it's
		# a bit weird, but well...
		if value is? StoredValue
			return value dump ()
		# FIXME: This has to be enabled, but for now it causes issues
		# if value is? StoredObject
		# 	return encodeObject (value, depth)
		# elif value is? StoredRelation
		# 	return encodeRelation (value, depth)
		elif value is None
			return None
		elif value is? Object
			return value ::= {encodeValue (_,depth)}
		else
			return value

	# TODO: support a way to indicate which properties should be stored/encoded
	@method encodeObject object:StoredObject, depth=0
	| Encodes a `StoredObject` into the representation that is stored
	| in Firebase.
		if not object
			return error ("Trying to encode a value that is not an object", object, __scope__)
		# FIXME: We don't always (or maybe even never get a stored object).
		let res = {id:object id,type:object type name} if object is? StoredObject else copy(object)
		assert (res id,   "Object must have id, got:", object, "in", res)
		assert (res type, "Object must have type, got:", object, "in", res)
		# We want to recurse if depth < 0 (no limit) or depth > 0 (limit not reached)
		if depth != 0
			# NOTE: we only assign the properties and relations if they
			# are set, as otherwise this might forcibly erase properties
			# or relations that might have been there.
			if object _properties
				var i = 0
				let p = object _properties ::= {i+=1;return _}
				if i > 0
					res[PROPERTIES_KEY] = p
			if object _relations
				var j = 0
				# TODO: Support relations with meta information
				let r  = object _relations  ::= {
					j += 1
					return encodeRelation (_, depth - 1)
				}
				if j > 0
					res[RELATIONS_KEY] = r
		return res

	@method encodeRelation relation:StoredRelation, depth=0, isNested=False
	| Relations are encoded as an ordered map of
	| `{-v:{<KEY>:{object,value}},-o:{}}`.
	|
	| This encoding is designed
	| to provide stability of nested objects (in the `-o` map), independently
	| from ordering in the relation (`-v`).
	|
	| Relations that don't have nested objects will have an empty `-o`
	| map.
		let objects = {}
		let values  = {}
		relation each {o,k,v|
			# This is is the encoding of a relation item (value)
			let r = {}
			if o
				assert (o is? StoredObject)
				# FIXME: We only encode objects at 0, but we should
				# really SERIALIZE USING THE SCHEMA.
				r object = encodeObject (o, 0)
				if isNested
					objects[o id] = encodeObject (o, -1)
			if v is not Undefined
				r value = v
			values[k] = r
		}
		let res = {
			(RELATION_VALUES_KEY)  : values
			(RELATION_OBJECTS_KEY) : objects
		}
		return res

	# =========================================================================
	# PATHS
	# =========================================================================

	@method _getTypePath type
		assert (type, "Missing type")
		assert (type name, "Type has non name")
		return prefix + "/" + type name

	@method _getObjectPath object
		if object isNested
			# If an object is nested, its path will be prefixed with its
			# parent path, the relation name, and the objects prefix for
			# relation keys.
			assert (object nestedInObject)
			return _getRelationObjectsPath (object nestedInObject, object nestedInRelation name) + "/" + object type name + "/" + object id
		else
			# Otherwise the object is simply the object type name and the object id
			return _getTypePath (object type) + "/" + object id

	@method _getPropertiesPath object
		return _getObjectPath (object) + "/" + PROPERTIES_KEY

	@method _getRelationsPath object
		return _getObjectPath (object) + "/" + RELATIONS_KEY

	@method _getRelationPath object, name
		return _getRelationsPath (object) + "/" + name

	@method _getRelationValuesPath object, name
		return _getRelationPath (object, name) + "/" + RELATION_VALUES_KEY

	@method _getRelationObjectsPath object, name
		return _getRelationPath (object, name) + "/" + RELATION_OBJECTS_KEY

# -----------------------------------------------------------------------------
#
# POOL OBJECT STORAGE
#
# -----------------------------------------------------------------------------

@class PoolObjectStorage: ObjectStorage
| An object storage that uses a given object pool as a storage interface. This
| is useful for in-memory, read-only models.

	@property _pool

	@method setObject object
		return future (object)

	@method listObjects type
	| Lists the ids of the objects available at the given type.
		return future (col_keys (access (_db _instances, type name)))

	@method getObjects type, objects
		let pool = access (_db _instances, type name)
		if pool
			return future ( objects ::> {r={},v|
				if pool[v]
					r[v] = pool[v]
				return r
			})
		else
			return future ([])

	# =========================================================================
	# PROPERTIES
	# =========================================================================

	@method getProperties object
		return future(object getProperties ())

	@method setProperties object, properties
		return future (self)

	@method onProperties object
		return future ()

	@method pushProperties object, properties, changes
		return future ()

	# =========================================================================
	# RELATIONS
	# =========================================================================

	@method getRelation object, name
		return future {object getRelation "name" asPrimitive ()}

	@method setRelation relation
		return future (self)

	@method updateRelation relation, changes
		return future (self)

	@method onRelation object, name
		return future ()

	@method pushRelation relation, changes=Undefined
		return future (self)

# -----------------------------------------------------------------------------
#
# OBJECT POOL
#
# -----------------------------------------------------------------------------

@class ObjectPool
| A utility class that maps `(type,id)` strings to object instances, ensuring
| referential transparency in stored objects.

	@property _instances = {}
	| Instances are mapped by type name.

	@method has type:String, id:String
		return bool (_instances[type] and _instances[type][id] is not Undefined)

	@method get type:String, id:String
		return _instances[type] and _instances[type][id]

	@method set type:String, id:String, object:StoredObject
		_instances[type] ?= {}
		let o = _instances[type][id]
		if not o
			_instances[type][id] = object
			return object
		elif o is object
			return o
		else
			error ("Object exists with the same key", type, id, __scope__)
			return o

	@method remove type:String, id:String
		if _instances[type]
			let o = _instances[type][id]
			_instances = remove (_instances, id)
			return o
		else
			return Undefined

	@method map functor=identity
		return _instances ::> {r=[],v,k|
			for w in v
				if w
					r push (functor (w))
			return r
		}

	@method clear
		_instances = {}
		return self

	@method dump
		return map {_ dump ()}

# -----------------------------------------------------------------------------
#
# STORED HANDLER
#
# -----------------------------------------------------------------------------

# FIXME: It is not clear if this is actually useful in this form, this
# might need to be rethought.
@class StoredHandler: TFlyweight
| Wraps a reference to a stored object or relation, making sure that the
| value is always synchronized with the backend.
|
| ```sugar2
| let h = new StoredHandler ()
| let o = API getObject "<OID>"
| let h set (o) then {
|    # The object o is now subscribed to
| }
| ```
|
| A handler is useful for objects that might use different stored objects
| across their lifetime, such as components displaying a stored object. The
| handler basically acts as a reference that ensures that the object is
| always up to date.
|
| The handler also supports futures.

	# TODO: Make subscribing optional
	@property _value = Undefined
	@property _accessor = Undefined

	@getter value
	| Returns the value.
		let v = _value get () if _value is? Async else _value
		if _accessor
			return _accessor (v)
		else
			return v

	@method reset
		clear (False)

	@method clear update=True
		# We always unsubscribe from stored values
		_unbind (_value)
		_value = Undefined
		if update
			self ! "Update"
		return self

	@method _bind value
		# If it's an async, we bind the update events
		if value is? Async
			value !+ "Partial" (self . onUpdate)
			value !+ "Success" (self . onSuccess)
		# Bind event handlers
		if value is? Object
			value !+ "Update" (self . onUpdate)
		return value

	@method _unbind value
		if not value
			return None
		if value is? StoredValue
			value unsub ()
		if value is? Object
			value !- "Update" (self . onUpdate)
		if value is? Async
			value !- "Partial" (self . onUpdate)
			value !- "Success" (self . onSuccess)

	@method set value, accessor=Undefined, update=True
	| Sets the handler's `value`. The given `accessor` will
	| be used to return the value when `value` or `get` is invoked.
	| `Update` event handlers will be bound/unbound if the
	| value is an object.
		if value is _value
			# If the value is the same,we return early
			return future (value)
		else
			# Otherwise we clear the previous value
			_unbind (_value)
			# Set the accessor
			if accessor is not Undefined
				_accessor = accessor
			# Bind the handlers
			_value = value
			_bind (_value)
			if update
				self ! "Update"
			# And make sure we subscribe to the object
			if value is? StoredValue
				return value sub ()
			else
				return future (value)

	@method get
	| Returns the current value
		return value

	@method onUpdate
	| Relays an update from the underlying value
		self ! "Update"

	@method onSuccess
	| The value is unwrapped from the future if there is a success.
		if _value is? Async
			set (_value value, _accessor)
		# NOTE: We should probably not get there

# -----------------------------------------------------------------------------
#
# SUBSCRIPTION POOL
#
# -----------------------------------------------------------------------------

@class SubscriptionPool
| Manages a set of stored objects, automatically pulling their properties,
| some relations and subscribing to their updates based on a schema
| configuration.
|
| ```
| let pool = new SubscriptionPool {
|    Conversation:{
|        # Subscribes to conversation messages
|        messages : True
|    }
| }
| …
| pool remove (old_object) add (new_object)
| ```
|
| Pools can be used within user interface components that display a set
| of objects and want to make sure the display is always up to date. The
| pool will take care of managing subscriptions and updates and provide
| fine and coarse grain hooks, through array and futures and its `Update` event
| to be notified of changes.

	@property expected = 0

	@property _updater = delayed (self . _doUpdate, 100ms)
	| The updater delayed will trigger an `Update` event after 10ms of reaching
	| `expected = 0`

	@property schema  = {}
	| The schema is `{<type>:{<relation name>:Any…}}` and specifies which
	| relations need to be subscribed to for each type.

	@property objects = {}
	| The local pool of objects

	@constructor schema
	| Creates a new schema for the pool. See `schema`.
		self schema = schema

	@method clear
	| Clears all the objects from the subscription pool
		objects :: {_ :: {_doRemove (_)}}
		return self

	@method addMany value:Collection
	| Adds many stored objects to the pool, returns the given
	| value as-is.
		for object in value
			if not objects[object type name][object id]
				_doRegister (object)
		return object

	@method add object:StoredObject
	| Adds a stored objects to the pool, returns the given
	| value as-is.
		if object and (not objects[object type name][object id])
			_doRegister (object)
		return object
	
	@method remap previous, next
	| Removes the `previous` and adds the `next` only
	| if they are different. Returns the `next`.
		if previous is next
			return next
		elif next is? Array
			let p = previous or []
			assert (p is? Array, "Trying to remap with `next` as an array, but `previous` not an array:", previous)
			return col_remap (next, previous or [], {add(_)}, {a,b|remove (b) add (a)})
		else
			return remove (previous) add (next)
	
	# FIXME: Are joins really necessary? The objects are going
	# to update themselves anyway
	@method join object:StoredObject
		let f = []
		if object and (not objects[object type name][object id])
			_doRegister (object, f)
		return async_join (f) chain {return object}

	@method joinMany value:Collection
		let f = []
		for object in value
			if not objects[object type name][object id]
				_doRegister (object, f)
		return async_join (f) chain {return object}

	@method removeMany value
	| Removes the set of objects from the pool
		value :: remove
		return self

	@method remove object:StoredObject
	| Removes the given object from the pool
		if not object
			return self
		elif object is?Array
			removeMany (object)
		else
			let t = object type name
			objects[t] ?= {}
			if objects[t][object id]
				_doUnregister (object)
		return self

	@method _doRegister object:StoredObject, futures=None
	| Internal method that registers the object in the pool, pull the
	| properties and the relations of the object, and also subscribes to their
	| updates.
		let t = object type name
		objects[t] ?= {}
		let do_joined = self . _doJoined
		if objects[t][object id]
			warning ("Object already registered in pool:", object, __scope__)
		else
			# NOTE: In this branch, we only pull the objects
			# if they should not be pushed. We might not 
			# even do a pull, as there is an implicit pull in the
			# objects. Maybe the implicit pull should be removed?
			objects[t][object id] = object
			# So before 2019-09-16, we did not register for object
			# updates, which is a bit weird. We do want the pool
			# to update when objects change.
			object !+ "Update" (self . _onObjectUpdate)
			for v,name in schema[t]
				let r = object getRelation (name)
				if not r
					warning ("Object", t + "." + object id, " has no relation '" +  name + "'", __scope__)
				else
					r !+ "Update" (self . _onRelationUpdate)
					if r shouldPush
						# If the relation has local changes, ie. should
						# be pushed, then we don't pull
						r sub ()
					else
						# If it's a new object, we sub and pull
						_doExpect ()
						let f = r sub () pull () then (do_joined)
						if futures
							futures push (f)
			if object shouldPush
				# We don't pull if the object has local changes.
				object sub ()
			else
				_doExpect ()
				let f = object sub () pull () then (do_joined)
				if futures
					futures push (f)

	@method _doUnregister object:StoredObject
	| Internal method that removes the given object from the pool
	| and unsubscribes from its updates.
		let t = object type name
		object !- "Update" (self . _onObjectUpdate)
		objects[t] = col_removeAt (objects[t], object id)
		for v,name in schema[t]
			let r = object getRelation (name) 
			r !- "Update" (self . _onRelationUpdate)
			r unsub ()
		object unsub ()

	@method _onRelationUpdate data, relation
		# TODO: We should remove/unregister objects that were removed,
		# otherwise there's going to be leak.
		relation objects :: add
		# NOTE[ABSORB_UPDATES]: Instead of doing an update right away, we use the
		# deferred, so that we avoid too many consecutive updates
		# 
		_updater push ()

	@method _onObjectUpdate data, object
		# SEE: ABSORB_UPDATES
		_updater push ()
	
	@method _doExpect
	| Callback triggered when we expect a registered object to be updated
	| in the near future.
		expected += 1

	@method _doJoined
	| Callback triggered when a registered object has been updated.
		expected -= 1
		if expected == 0
			_updater push ()
	
	@method _doUpdate
	| The `Update` event is triggered when all the expected futures
	| have joined. This makes it possible to trigger a re-render when we
	| know  that all the objects are up to date.
		self ! "Update"

# -----------------------------------------------------------------------------
#
# HIGH LEVEL API
#
# -----------------------------------------------------------------------------

@function pull value
| Pulls the give value(s) so that they are updated with the state of the
| database.
	return value match
		is? StoredObject
			value pull ()
		is? StoredRelation
			value pull ()
		else
			async_join (value ::= {pull (_)})

@function mount types, backend=None, binding=Undefined
	return new Interface (types, backend, binding)

# EOF
