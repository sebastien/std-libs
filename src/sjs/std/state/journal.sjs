@feature sugar 2
@module std.state.journal
| Provides abstractions to manage a journal of modifications. Journals
| can be used a building block for doing lightweight version control, undo/redo
| support and change detection and resolution on data structures.

@import assert,error,warning,NotImplemented from std.errors
@import len,cmp,isDefined from std.core
@import bisect from std.math
@import error from std.errors
@import TFlyweight      from std.patterns.flyweight
@import access,nested as col_nested,insert,removeAt,removeNested,merge from std.collections

@enum OP     = INIT  | ADD | SET | UPDATE | INSERT | REMOVE | CLEAR
@enum STATUS = BLANK | NEW | RESTORED
@enum SYNC   = NEVER | CHANGED | SYNCED

# TODO: This does not make the disctinction between map and array (or any other type)
# TODO: Optimize journal slicing
# TODO: Determine when a key is required or not
# NOTE: INIT AND CLEAR ARE THE SAME AS ADD/REMOVE when they don't have a key.
# TODO: Scope and key are redundant {scope:[key], value:…}, vs {scope:None,key:key,value:…}

# -----------------------------------------------------------------------------
#
# OPERATION
#
# -----------------------------------------------------------------------------

@class Operation: TFlyweight
| An operation abstracts a change in a structure.

	@property op:OP
	| The operation, one of `OP`

	@property scope
	| The scope, which can be nothing, a key or a list of keys, resolving
	| the object to be operated on from the context.

	@property value
	| The value attached to the operation.

	# TODO: Should we do that?
	# @property previous
	# | The previous value attached to the operation (optional)

	@property key
	| The key on which the operation is perfored (might be nothing)

	@property timestamp
	| The optional timestamp at which the operation is performed.

	@property conflict
	| A flag indicating wether this operation has a conflict of not.

	@property revision
	| An revision identifier attached to the operation.

	@operation Init scope=Undefined, value=Undefined, key=Undefined, timestamp=Undefined
		return Create (INIT, scope, value, key, timestamp)

	@operation Set scope=Undefined, value=Undefined, key=Undefined, timestamp=Undefined
		return Create (SET, scope, value, key, timestamp)

	@operation Add scope=Undefined, value=Undefined, key=Undefined, timestamp=Undefined
		return Create (ADD, scope, value, key, timestamp)

	@operation Remove scope=Undefined, value=Undefined, key=Undefined, timestamp=Undefined
		return Create (REMOVE, scope, value, key, timestamp)

	@operation Insert scope=Undefined, value=Undefined, key=Undefined, timestamp=Undefined
		return Create (INSERT, scope, value, key, timestamp)

	@operation Update scope=Undefined, value=Undefined, key=Undefined, timestamp=Undefined
		return Create (UPDATE, scope, value, key, timestamp)

	@operation Clear scope=Undefined, value=Undefined, key=Undefined, timestamp=Undefined
		return Create (CLEAR, scope, value, key, timestamp)

	@method init op, scope, value, key, timestamp
		super init ()
		self op        = op
		self scope     = scope
		self value     = value
		self key       = key
		self timestamp = timestamp
		self revision  = None
		self conflict  = None
	
	@getter isNested
		return len (scope) > 0

	@getter canUpdate
	| Tells if this operation is compatible with an update of the scope, or
	| does it resets everything.
		if (not key) and (op is CLEAR or op is REMOVE or op is SET or op is INIT)
			return False
		else
			return True

	# TODO: This is not a clear description, clarify.
	@method nested count=0
	| Returns the change's value as if it was nested at the given `count` offset
	| from the root scope. For instance, if the scope is `["user","name"]`
	| and the value is `"john"`, then the nested 1 value is `{name:"john"}` and
	| the nested 0 value is `{user:{name:{"john"}}}`
	| 
	| Note that this does NOT mutate the value or the operation.
		let n = len(scope)
		# `i` is going to be the last element before we start nesting.
		let i = count if count >= 0 else n + count
		if i == n
			return value
		assert (i < n, "Nested count", count, "is greater or equal to scope length", n, ":", scope)
		assert (i >= 0)
		# That's the index of the last element
		var j = n - 1
		var res = value
		while j >= i
			if key
				res = {(key):res}
				key   = Undefined
			else
				res = {(scope[j]):res}
				j -= 1
		return res

	@method clone
		return Operation Create (op, scope, value, key, timestamp)

	@method reset
		super reset ()
		op        = Undefined
		scope     = Undefined
		key       = Undefined
		value     = Undefined
		timestamp = Undefined
		conflict  = Undefined

	@method isApplied context
	| Tells if this operation is already applied in the given context, ie.
	| if applying this operation would not change the context.
		match op
			is INIT
				let o = access (context, scope)
				# Init may not have a key
				if key is None or key is Undefined
					return o and not hasChanged (o, value)
				else
					return o and not hasChanged (o[key], value)
			is SET
				let o = access (context, scope)
				return o and not hasChanged (o[key], value)
			is UPDATE
				# Update may not have a key
				let o = access (context, scope)
				let c = o[key] if key else o
				if not c
					return False
				elif value is? Array or value is? Object
					for v,k in value
						if hasChanged (c[k], v)
							return False
					return True
				else
					return not hasChanged (c, value)
			is ADD
				let o = access (context, scope)
				return value in o
			is REMOVE
				let o = access (context, scope)
				return value not in o
			is INSERT
				let o = access (context, scope)
				return o and not hasChanged (o[key], value)
			is CLEAR
				let o = access (context, scope)
				return not o
			else
				error (NotImplemented, __scope__)
		return context
	
	@method hasChanged previous, value
	| Default implementation for detecting change between the previous
	| and the current/new value.
		return cmp (value, previous, 1) != 0

	@method _mergeValues a, b
		if a is Undefined
			return b
		elif a is? Object
			if b is? Object
				return merge(a, b, True)
			else
				return b
		elif a is? Array
			if value is? Array
				fitlen (a, b length)
				value :: {_,i|a[i]=_}
				return a
			else
				return b
		else
			return b

	@method apply context={}, removal=True
	| Applies this operation to the given context, mutating the context
	| to reflect the operation.
	|
	| When enabled, the `removal` argument forces removals to set 
	| a `None` value.
		match op
			is INIT
				col_nested (context, scope, Undefined, value)
			is SET
				# NOTE: You can SET without a key, in which case the
				# SCOPE is replaced.
				if not isDefined (key)
					col_nested (context, scope, value, value)
				else
					# FIXME: I've seen a case where `v` was undefined
					let v = col_nested (context, scope, Undefined, {})
					v[key] = value
			is UPDATE
				let v = col_nested (context, scope, Undefined, {})
				if key is Undefined or key is None
					if value is? Object
						assert (v, "Missing context slot", scope, "in", context)
						merge(v, value, True)
					else
						warning ("Applying update without a key for a non-object value:", value, self, __scope__)
				else
					v[key] = _mergeValues (v[key], value)
			is ADD
				let v = col_nested (context, scope, Undefined, [])
				# TODO: We should check that `v` is an array
				if v is? Array
					v push (value)
				else
					let k = len(v)
					v[k] = value
			is REMOVE
				if key is Undefined
					error ("Trying to REMOVE without a key", {context,scope,key}, "in", self, __scope__)
				elif removal
					# If we have a removal, we explicitly set it.
					# NOTE: We're guaranteed to have a key here.
					var v = col_nested (context, scope, {(key):None})
					if v is? Array
						# If we have an array, we transform it to a map
						let w = v ::> {r={},v,k|r[k]=v;r}
						w[key] = None
						col_nested (context, scope, Undefined, w)
				else
					# If we don't have a removal then it's easy.
					let v = col_nested (context, scope, Undefined)
					if (v is not None) and (v is not Undefined)
						# We only remove if v is a composite or 
						col_nested (context, scope, Undefined, removeAt (v, key))

			is INSERT
				if key is Undefined
					error ("Trying to INSERT without a key", {context,scope,v,key}, "in", self, __scope__)
				else
					let v = col_nested (context, scope, Undefined, [])
					col_nested (context, scope, Undefined, insert (v, key, value))
			is CLEAR
				# FIXME: I'm not sure this is right
				removeNested (context, scope, None, Undefined)
			else
				error (NotImplemented, __scope__)
		return context
	

	@method dump
		return [op __name__, scope, key, value]

# -----------------------------------------------------------------------------
#
# JOURNAL
#
# -----------------------------------------------------------------------------

@class Journal: TFlyweight
| Aggregates a set of operations.

	@property operations   = []
	@property status       = BLANK

	@property _isInAtomic
	| Internal flag that tells if the journal is currently in atomic mode.

	@method reset
		super reset ()
		operations  = []
		_isInAtomic = False
		status      = BLANK

	@getter revision
		if operations length == 0
			return -1
		else
			return operations[-1] revision

	@method isSynced revision
	| Tells if the given revision is synchronized with the journal.
		# FIXME: It might need to be >=
		return revision == self revision

	@method isNew revision=-1
	| Tells if there is an `INIT` operation after (and including) the
	| given revision.
		for o,i in operations
			if o revision >= revision and o op is INIT
				return True
		return False

	@method doOp op, scope, value, key, timestamp=Undefined
		return _log (Operation Create (op, scope, value, key))

	@method doInit scope, value, key=None, timestamp=Undefined
		return _log (Operation Create (INIT, scope, value, key))

	@method doClear scope, value, key=None, timestamp=Undefined
		return _log (Operation Create (CLEAR, scope, value, key))

	@method doSet scope, value, key=None, timestamp=Undefined
		return _log (Operation Create (SET, scope, value, key))

	@method doAdd scope, value, key=None, timestamp=Undefined
		return _log (Operation Create (ADD, scope, value, key))

	@method doUpdate scope, value, key=None, timestamp=Undefined
		return _log (Operation Create (UPDATE, scope, value, key))

	@method doRemove scope, value, key=None, timestamp=Undefined
		return _log (Operation Create (REMOVE, scope, value, key))

	@method _log operation
		# This updates the status of the journal. If there is
		# one INIT operation, then the status is NEW, otherwise
		# it is RESTORED as long as there is at least one operation.
		if operation op is INIT
			status = NEW
		elif status is BLANK
			status = RESTORED
		operation revision = operations length
		operations push (operation)
		return operation

	@method after revision=0
	| Returns all the operations that are equal or after to the given revision
		# TODO: Optimize and use bisect
		return operations ::? {_ revision >= revision}

	@method canUpdate fromRevision=0, toRevision=revision, removal=Undefined
	| Tells if the journal can produce an update or if it needs to produce
	| a full snapshot.
		for op,i in operations
			if v revision >= fromRevision and v revision <= toRevision
				if v op is CLEAR or (v op is SET and (not v key))
					return False
		return True

	@method apply context={}, fromRevision=0, toRevision=revision, removal=Undefined
	| Applies all the operations in the journal, without flushing them.
	| This recreates a snapshot of the state based on the operations.
		# TODO: Optimize by looking for the first index th
		# TODO: let i = bisect (0, len(operations), {cmp(operations[Math floor (_)] revision, revision)})
		return operations reduce ({r,v,i|
			if v revision >= fromRevision and v revision <= toRevision
				# We only enable removal when the revision is greater than
				# 0 or when removal is explicitly given.
				return v apply (r, removal or fromRevision > 0)
			else
				return r
		}, context)

	@method atomic callback
	| Atomically executes the given callback, which means
	| that no propagation will be triggered until the atomic
	| change is released.
		let in_atomic = _isInAtomic
		if not in_atomic
			_isInAtomic = True
		callback (self) if callback
		if not in_atomic
			_inInAtomic = False
		return self

	@method dump
		return operations ::= {_ dump ()}

# EOF
