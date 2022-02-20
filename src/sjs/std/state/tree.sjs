@feature sugar 2
@module std.state.tree
| A collection of data structures that support change tracking and
| propagation, as well a container type to manage hierarchical structures
| of these values.
|
| One of the key concept of this module is that *deltas* (ie. changes) describe
| transformations to data. Because real-world data is most of the time
| hierarchical (for instance, a company has staff who are people with names and
| birthdays), the deltas are scoped with a *path* that identifies the element
| within the data that will be transformed by the change.
|
| We use the term *data space* to denote a hierarchical data set (a tree), and one
| data space is contained within a `World` instance, which acts as the root
| for the data.

@import remove as _remove, keys as _keys from std.collections
@import assert, error, warning, BadArgument, NotImplementedError  from std.errors
@import str, len from std.core
@import timestamp as time_timestamp from std.io.time
@import TOptions from std.patterns.options

# FIXME: Use state. delta
@enum Op = INIT | ADD | SET | INSERT | REMOVE | CLEAR | SWAP | REORDER

# Rework _apply: should be called by apply() that checks that the revision
# is OK and then ensures the revision is updated.

# TODO: It seems that the delta-enabled data structures could be moved to
#       a hierarchy.

# FIXME: Maybe move to std.data.delta?
# TODO: Throttling of deltas in adapters

# -----------------------------------------------------------------------------
#
# DELTA
#
# -----------------------------------------------------------------------------

# TODO: Rename to change
@class Delta
| The abstraction of a change to one of the delta-enabeld data structures defined
| in this module `Value`, `List` and `Map`.

	@shared   SEPARATOR = "/"
	| The separator used in the dataspace paths.

	@property opcode    = 0
	@property _path     = []
	@property node      = Undefined
	@property rev       = 0
	@property timestamp = time_timestamp ()
	@property type      = None
	@property v0        = Undefined
	@property v1        = Undefined
	@property inbound   = False
	@property isPublished = False

	@operation New opcode, path, v0, v1
		return new Delta (opcode, path, v0, v1)

	@operation Init path ,value
		return New (INIT, path, value)

	@operation Add path ,value
		return New (ADD, path, value)

	@operation Set path, index, value
		return New (SET, path, index, value)

	@operation Insert path, index, value
		return New (INSERT, path, index, value)

	@operation Remove path, index
		return New (REMOVE, path, index)

	@operation Path path
		return path match
			is? Datum   -> path getPath ()
			is? Array  -> [] if path length == 1 and path[0] == "" else path
			is? Number -> [Math floor (path)]
			== ""      -> []
			is? String -> ("" + path) split (SEPARATOR)
			else       -> []

	@constructor opcode, path, v0, v1
		self opcode = opcode
		self _path  = Path (path)
		self node   = path if path is? Datum else None
		self rev    = node rev if node else 0
		self v0     = v0
		self v1     = v1

	@getter path
		return node path if node else _path

	@method dump
		return {opcode, rev, path, v0, v1}

	@getter isRemote
		return inbound

	@getter isLocal
		return not inbound


# -----------------------------------------------------------------------------
#
# DELTA GROUP
#
# -----------------------------------------------------------------------------

@class DeltaGroup
| An aggregation of deltas, used to pass around a set of deltas that should
| be applied together.

	@property all = None

	@constructor all=Undefined
		self all = all

# FIXME: Rework these exceptions
# -----------------------------------------------------------------------------
#
# MERGE ERROR
#
# -----------------------------------------------------------------------------

@class MergeError

	@property delta
	@property nodePath
	@property nodeRev
	@property nodeValue

	@constructor delta, node
		self delta = delta
		nodePath   = node path
		nodeRev    = node rev
		nodeValue  = node value

# -----------------------------------------------------------------------------
#
# CONFLICT
#
# -----------------------------------------------------------------------------

@class Conflict: MergeError

# -----------------------------------------------------------------------------
#
# MISSING
#
# -----------------------------------------------------------------------------

@class Missing: MergeError

# -----------------------------------------------------------------------------
#
# ERRORS
#
# -----------------------------------------------------------------------------

@class Error

	@property delta
	@constructor delta
		self delta = delta

@class UnsupportedOperation: Error


# -----------------------------------------------------------------------------
#
# NODE
#
# -----------------------------------------------------------------------------

@class Datum
| Represents a node in a delta-enabled tree structure. A node encapsulates
| a value, maintaining a revision number and linking to a parent node. Nodes
| might also have a key that represent the key they are bound to in the parent
| (the key would be an index if the parent is a List)
|
| Datum objects are used to create an object tree where deltas flow bottom-up
| and where specific semantics can be enforced using the `schema`.

	@property _id       = None
	@property _key      = None
	@property _parent   = None
	@property _rev      = 0
	@property _value    = Undefined
	@property _rawValue = Undefined
	# NOTE: The _context is the world
	@property _context   = None
	@property _journal   = []
	@property _schema    = None
	@property isReadonly = False

	@constructor value=Undefined
		 self init (value)

	@getter rev
		return _rev

	@getter value
	| Returns the current value. This might take some time
	| if the node was lazily initialized.
		if _rawValue is not Undefined
			init (_rawValue)
		return _value

	@getter path
	| Returns the path for this node
		return getPath ()

	@getter root
	| Returns the root node, walking up the parent chain
		if not _parent
			return self
		else
			return _parent root

	@getter isMounted
	| A node is mounted when it has a parent and a context.
		return _parent and _context and True or False

	@getter isConverted
		return _rawValue is Undefined

	@method init value
	| Initializes the node with the given value. This does not generate
	| a delta, and expects the value to be fully noramlized and converted
	| into nodes for composite values.
		_value = value
		_rawValue = Undefined
		return self

	@method lazyInit value
	| Defers the initiliazation of this node with the given `value` to
	| when the node is accessed.
		self _value    = Undefined
		self _rawValue = value
		return self

	@method ensureInit
	| Ensures that the `_rawValue` is expanded.
		if _rawValue is not Undefined
			let r = _rawValue
			_rawValue = Undefined
			init (r)
		return self

	@method keys
		return []

	@group Path

		@method setParent parent, key=Undefined
			if key is not Undefined
				self _key = key
			if parent != self _parent
				if parent is? World
					# The parent may be a context
					self _parent  = None
					if not _context
						_context = parent
					elif _context != parent _context
						error ("Datum already has a different context", __scope__)
				else
					self _parent = parent
					# If there is new parent, we set the context
					if parent
						if not _context
							_context = parent _context
						elif _context != parent _context
							error ("Datum new parent is from a different context", __scope__)
					else
						_context = None
					# And assign an id
					if not _id and _context
						_context _counter =  (_context _counter or 0) + 1
						_id = new Date () getTime () toString (16) + (_context _counter - 1) toString (16)
					if parent
						# We forward the journal to the parent if we have any
						if _journal length > 0
							let j = new DeltaGroup (_journal)
							_journal = []
							# We ask the parent to merge the journal. The parent
							# will refuse if it is already mounted.
							parent _mergeJournal (j)
			return self

		@method setKey key
			self _key = key
			return self

		@method unsetParent parent
			if self _parent == parent
				self _parent  = None
				self _context = None
			return self

		@method resolve path
			if path length == 0
				return self
			else
				return None

		@method getPath path=[]
			let k = _key if _key is not Undefined else _id
			if (k is not None) and (k is not Undefined)
				path splice (0, 0, k)
			return _parent getPath (path) if _parent else path

	@group Conversion
	| Convers regular JS objects to delta-enabled objects

		@method _convert value
		| Converts the given value to a `Datum` of the corresponding type.
			match value
				is? Datum
					return value
				is? Adapter
					return _convert (value _node)
				is? Array
					return new List () lazyInit (value)
				is? Object
					return new Map  () lazyInit (value)
				else
					return new Value() lazyInit (value)

		@method unwrap level=1
		| Unwraps the contents of this node, recursively. This returns a plain
		| JavaScript object that is detached copy of this node's content.
			if _rawValue is not Undefined
				return _rawValue
			else
				return _value

		@method _attach value, key=""
			if value is? Datum
				value setParent (self, key)
			elif value is? Adapter
				value _node setParent (self, key)
			return value

		@method _reattach value, key
			if value is? Datum
				value setKey (key)
			elif value is? Adapter
				value _node setKey (key)
			return value

		@method _detach value
			if value is? Datum
				value unsetParent (self)
			elif value is? Adapter
				value _node unsetParent (self)
			return value

	@group Delta

		@method flush
		| Flushes the remaining deltas stored in the journal
			let j = _journal
			_journal = []
			return j

		@method _mergeJournal journal
		| Merges the given journal (coming from a direct child) only if this
		| node has no parent. Otherwise, this means that the state relative
		| to the journal has already been captured.
			if not self _parent
				_journal = _journal concat (journal)
				return True
			else
				return False

		# TOOD: Explain _propagate vs _notify
		@method _propagate delta
			if not (delta is? Delta)
				error (BadArgument, "delta", delta, [Delta], __scope__)
			# Propagate is called for outbound deltas, ie. deltas created
			# locally.
			self ! "Update" (delta)
			if _parent
				_parent _propagate (delta)
				return True
			elif _context
				_context _propagate (delta)
				return True
			else
				if delta is? DeltaGroup
					_journal = _journal concat (delta all, "FROM", self)
				else
					_journal push (delta)
				return False

		@method _notify delta
			# NOTE: Notify is for inbound deltas, ie deltas coming from outside
			self ! "Update" (delta)
			if _parent
				_parent _notify (delta)
				return True
			elif _context
				_context _notify (delta)
				return True
			else
				return False

		@method hasChanged value, oldValue
			# We propagate all the changes
			return True

		# FIXME: What's the difference between merge and delta here?
		@method merge delta
			# TODO: Support revisions
			if delta rev == _rev or _rev == 0
				# NOTE: This happens when an object is modified and then mounted.
				# The first mount will not start at 0
				# If the object's rev is 0, then we can merge anything
				if _apply (delta)
					_rev = delta rev + 1
					# TODO: Should we indicate the delta is merged?
					_notify (delta)
					return True
				else
					error ("Unsupported operation", delta, "in", self, __scope__)
					return new UnsupportedOperation (delta, self)
			elif delta rev > rev
				warning ("posterior delta, skipping ", delta rev, ">", rev, "at", getPath(), __scope__)
				return new Missing (delta, self)
			else
				warning ("anterior delta, skipping", delta rev, "<", rev, "at", getPath(), __scope__)
				return False

		@method apply delta
			if delta rev == self rev
				let r = _apply (delta)
				if r
					self _rev = delta rev + 1
					return r
				else
					warning ("Could not apply the given delta", delta)
					return False
			else
				warning ("Applying delta with wrong revision:", delta rev, "!=", self rev)
				return False

		@method _apply delta
			return True

		@method _delta condition, opcode, v0, v1, propagate=True
		| Helper to generate a delta with the given `opcode` if the `condition`
		| is `true`.
		|
		| When `propagate` is `True` (default), the delta will be propagated and
		| the revision will be updated. However, when `propagate` is `False`
		| the delta will be applied as-is without changing the revision or
		| propagating the change. This should only be used in situtations where
		| the model needs to be patched because some deltas were missing (typically
		| a path that does not exist).
			if condition
				let d  = Delta New (opcode, self, v0, v1)
				let pr = _rev
				let r  = apply (d)
				if r
					if propagate
						_propagate (d)
					else
						_rev = pr
					return True
				else
					return r
			else
				return False

# -----------------------------------------------------------------------------
#
# VALUE
#
# -----------------------------------------------------------------------------

@class Value: Datum

	@property _value = Undefined

	@method getWeight level=-1
		return World Weight (_value if _rawValue is Undefined else _rawValue, level - 1)

	@group Mutators

		@method set value, propagate=True
			return _delta(hasChanged ( value ), INIT, value, propagate)

		@method clear propagate=True
			_delta(value != None, INIT, value, Undefined, propagate)

	@group Accessors

		@method get
			return _value

	@method _apply delta
		ensureInit ()
		match delta opcode
			== INIT
				init (delta v0)
				return True
			== CLEAR
				_value = None
				return True
			else
				warning ("Unsupported delta", delta, __scope__)
		return False

# -----------------------------------------------------------------------------
#
# COMPOSITE
#
# -----------------------------------------------------------------------------

@class Composite: Datum


	@getter length
		return len (_value if _rawValue is Undefined else _rawValue)

	@method unwrap level=-1
		if level == 0
			return _value if _rawValue is Undefined else _rawValue
		else
			return (_value if _rawValue is Undefined else _rawValue) ::= {World Unwrap (_, level - 1)}

	@group Read

		@method keys
			return _keys (_value if _rawValue is Undefined else _rawValue)

		@method get index
			ensureInit ()
			return _value[index]

		@method has index
			return (_value if _rawValue is Undefined else _rawValue) [index] is not Undefined

		@method items index
			return keys() ::= {[get (_),_]}

	@group Write

		@method set index, value, propagate=True
			ensureInit ()
			return _delta (hasChanged(value, _value[index]), SET, index, value, propagate)

		@method remove index, propagate=True
			assert (index != None and index != Undefined)
			return _delta (True, REMOVE, index, Undefined, propagate)

		@method swap i,j, propagate=True
			assert (i != None and i != Undefined)
			assert (j != None and j != Undefined)
			return _delta (True, SWAP, i, j, propagate)

	@group Datum

		@method resolve path
			if path length == 0
				return self
			else
				ensureInit ()
				let v = _value[path[0]]
				match v
					is? Datum
						return v resolve (path[1:])
					else
						return None

# -----------------------------------------------------------------------------
#
# DELTA-ENABLED LIST
#
# -----------------------------------------------------------------------------

@class List: Composite

	@property _value = []

	@method init value
		_value = (value ::> {r,e,i|r?=[];r push (_attach(_convert(e),i));r}) or []
		_rawValue = Undefined
		return self

	@method getWeight level=-1
		let res = (_value if _rawValue is Undefined else _rawValue) ::> {r,v|(r or 0) + 4 + (World Weight (v, level - 1))}
		return res or 0

	@method add value, propagate=True
		return _delta (True, ADD, value, Undefined, propagate)

	@method _apply delta
		ensureInit ()
		match delta opcode
			== INIT
				# FIXME: Check value
				init (delta v0)
				return True
			== ADD
				_value push (_attach (_convert (delta v0), _value length))
				return True
			== SET
				while _value length < delta v0
					_value push (Undefined)
				_value[delta v0] = _attach (_convert (delta v1), delta v0)
				return True
			== INSERT
				_value splice (delta v0, 0, _attach (_convert (delta v1), delta v0))
				var i = delta v0 + 1
				while i < _value length
					_reattach (_value[i], i)
				return True
			== REMOVE
				_detach (_value[delta v0])
				_value splice (delta v0, 1)
				var i = delta v0
				while i < _value length
					_reattach (_value[i], i)
					i += 1
				return True
			== SWAP
				let a = _value[delta v0]
				let b = _value[delta v1]
				_value[delta v1] = _reattach(a, delta v1)
				_value[delta v0] = _reattach(b, delta v0)
				return True
			== CLEAR
				_value :: {_detach (_)}
				_value    = []
				rev       = delta rev
				return True
			else
				warning ("Array: unsupported delta opcode", delta, __scope__)
		return False

# -----------------------------------------------------------------------------
#
# DELTA-ENABLED MAP
#
# -----------------------------------------------------------------------------

@class Map: Composite

	@property _value = {}

	@method init value
		_value = (value ::> {r,v,k|r?={};r[k]=_attach(_convert(v, self),k);r}) or {}
		_rawValue = Undefined
		return self

	@method getWeight level=-1
		let res = (_value if _rawValue is Undefined else _rawValue) ::> {r,v,k|(r or 0) + k length + (World Weight (v, level - 1))}
		return res or 0

	@method update value
		value :: {v,k|set(k,v)}
		return self

	@method _apply delta
		ensureInit ()
		match delta opcode
			== INIT
				# FIXME: Check value
				init (delta v0)
				return True
			== SET
				_value[delta v0] = _attach (_convert(delta v1), delta v0)
				return True
			== REMOVE
				_detach (_value[delta v0])
				_remove (_value , delta v0)
				return True
			== SWAP
				let a = _value[delta v0]
				let b = _value[delta v1]
				_value[delta v1] = _reattach (a, delta v1)
				_value[delta v0] = _reattach (b, delta v0)
				return True
			== CLEAR
				let v = _value
				_value    = {}
				v :: _detach
				return True
			else
				error ("Map: unsupported delta opcode", delta, __scope__)
		return False

# -----------------------------------------------------------------------------
#
# ADAPTER
#
# -----------------------------------------------------------------------------

@class Adapter
| Adapters wrap (or compose) delta-enabled `Datum` and are meant to be
| specialized to provide an API. You should specialize *adapters* if you are implementing
| a model API that is backed by delta-enabled objects.

	@property _node = None
	@shared   KEY   = "_adapter"

	# @operation Get path
	# 	return Wrap (World get (path)) if World else None

	@operation Wrap node
		if not node
			return None
		elif not (node is? Datum)
			return error (BadArgument, "node", node, [Datum], __scope__)
		elif node [KEY] is? self
			return node [KEY]
		elif node [KEY]
			return new self (node)
		else
			node [KEY] = new self (node)
			return node [KEY]

	@constructor node=None
		# TODO: Adapter should wrap non-Datum values
		self _node = node

	@getter _value
		return _node _value

	@method wrap node
		# FIXME: Careful of leaking of updates
		if _node != node
			if self _node
				self _node !- "Update" (self . _onDatumUpdate)
			if node
				node !+ "Update" (self . _onDatumUpdate)
			self _node = node
		return node

	@method unwrap level=-1
		if level == 0
			return _node
		else
			return _node unwrap (level - 1) if _node else Undefined

	@method _onDatumUpdate event
		self ! "Update" (event)

# -----------------------------------------------------------------------------
#
# SCHEMA
#
# -----------------------------------------------------------------------------

@class Schema
| A schema node defines how a given set of nodes/descendants behave, and
| is identified by a path within the data space. Any datum node that is prefixes
| with the path might be impacted by the schema.
|
| Schema node can define specific properties/operations:
|
| - Guards that may prevent the application of a given delta
| - Rules that might be triggered upon the application of a given delta
|
| Both guard and rules are potentially applied to datum nodes with the same path
| as the schema nodes or their descendants.
|
| *Guards* are typically used to implement validation and write access rules,
| while *rules* can trigger side effects, like managing a count of elements,
| mapping indexes or creating extra data based on a change.

	@property _parent
	@property _key
	@property _contextRequirement

	@property guards   = []
	@property rules    = []
	@property children = {}

	@constructor parent=Undefined, key=Undefined
		if parent is not Undefined
			setParent (parent, key)

	@getter path
		return getPath ()

	@getter parent
		return _parent

	@method addGuard guard
		guards push (guard)
		return self

	@method addRule rule
		rules push (rule)
		return self

	@method setParent parent, key=Undefined
		_parent = parent
		_key    = key
		return self

	@method getPath path=[]
		if not _key
			if _parent
				warn ("Schema node should have a key", self)
			else
				return path
		path splice (0, 0, _key or "?")
		if _parent
			return _parent getPath (path)
		else
			return path

	# FIXME: Don't really like that
	@method setContextRequirement value
		_contextRequirement = Math max (value, _contextRequirement or 0)
		return self

	@method apply delta
	| Tries to apply the given delta. If it returns `True`, the application
	| is successful, otherwise it's false.
		for guard in guards
			if not guard (delta, self)
				return False
		for rule in rules
			rule (delta, self)
		return True

	@method ensure path
		path = Delta Path (path)
		if path length == 0
			return self
		elif path length >= 1
			let k = path[0]
			var v = children[k] or children["*"]
			if not v
				v = new Schema (self, k)
				children[k] = v
			if path length == 1
				return v
			else
				return v ensure (path[1:])

	@method resolve path, strict=False
		path = Delta Path (path)
		if path length == 0
			# If there's a `*` defined, then it would match first
			return children["*"] or self
		elif path length >= 1
			let k = path[0]
			var v = children[k] or children["*"]
			if v
				return v resolve(path[1:]) if path length > 1 else v
			else
				return None if strict else self

# -----------------------------------------------------------------------------
#
# CONTEXT
#
# -----------------------------------------------------------------------------

# FIXME: Should this be a node?
@class World: TOptions
| The world acts as the main entry point to a delta-enabled data tree. The
| world manages a schema and an object root, produces and allows to merge
| deltas.

	@shared   OPTIONS = {
		strict : False
	}

	@property _counter = 0
	@property objects  = new Map () setParent (self)
	@property _schema  = new Schema ()
	@property _timestamp = -1
	@property journal  = []

	@operation Unwrap value, level=-1
		return value match
			is? Datum
				value unwrap (level)
			is? Adapter
				value unwrap (level)
			else
				value

	# TODO: Might move that to the node
	@operation Weight value, level=-1
	| Estimates the weight of a given node within the tree. You can
	| use this as a way to estimate the number of bytes taken in memory.
		if level == 0
			return 0
		return value match
			is? Datum
				value getWeight (level)
			is? Adapter
				World Weight (value _node)
			is? Number
				4
			is? String
				value length
			_
				value ::> {r,e|(r or 0) + World Weight(e, level - 1)} or 0
			else
				0

	@constructor options=Undefined
		setOptions(options)

	@method reset
		_counter = 0
		objects  = new Map () setParent (self)
		_schema  = new Schema ()
		journal  = []

	@method getWeight
	| Calculates the weight of the actual data stored in the world, in bytes. This counts
	| numbers as 4b each.
		return objects getWeight ()

	@group Schema

		@method schema path, ensure=False
			return _schema ensure (path) if ensure else _schema resolve (path)

	@group Mounting

		# TODO: should be ensure (path, value,limit)
		@method _ensure path, limit=path length
		| Ensures that the given path exists, up to the given limit
			var c = objects
			if limit < 0
				limit += path length
			for p,i in path
				let pi = parseInt(p)
				let is_number = i is? Number and (not isNaN(pi))
				let k  = pi if is_number else p
				# TODO: Check for the type
				if i < limit
					if c has (k)
						c = c get (k)
					else
						let n = new List () if is_number else new Map ()
						c set (k, n)
						c = n
				else
					return c
			return c

		@method mount path, value, delta=True, timestamp=_timestamp
			path       = Delta Path (path)
			_timestamp = Math max (timestamp, _timestamp)
			# We flush the remaining deltas
			let j = value match
				is? Adapter → value _node flush ()
				is? Datum    → value flush ()
				else        → []
			if path length == 0
				objects update (value)
			else
				let c = _ensure (path, -1)
				let k = path[-1]
				if c
					c set (k, value, delta)
			return j

		@method unmount path
			# TODO: Not sure what the semantics should be. Probably detach
			# the datum and mark it as read only.
			error (NotImplemented)

		@method restore path, value, timestamp
			return mount (path, value, False, timestamp)

	@group Query

		@method get path
			return resolve (path)

		@method has path
			return resolve (path)

		@method keys
			return objects keys ()

		@method items
			return objects items ()

	@group Creation

		@method load path, value
			path = Delta Path (path)
			# TODO :The set could be mount
			match value
				is? Datum
					load (path, value)
				is? Adapter
					load (path, value _node)
				is? Array
					let v = list ()
					mount (path, v)
					value :: {_,k|load (path concat ([k]), _)}
				is? Object
					let v = map ()
					mount (path, v)
					value :: {_,k|load (path concat ([k]), _)}
				_
					mount (path, value)
			return get (path)


		@method set path, value
			return mount (path, value)

		@method list
			return new List ()

		@method map
			return new Map ()

		@method value
			return new Value ()

	@group Conversion

		@method unwrap level=-1
			return Unwrap (objects, level)

	@group Resolve
	| Resolves a path in this context

		@method resolveParent path=Undefined, context=objects
			path = Delta Path (path) [0:-1]
			return objects resolve (path)

		@method resolve path=Undefined, context=objects
			path  = Delta Path (path)
			return objects resolve (path)

	@group Deltas

		@method flush
			let r = journal
			journal = []
			return r

		@method _propagate delta
		| Propagates the given delta upwards, and notifies of the dispatch
			# We see if there is a schema first
			var s = schema (delta path)
			_timestamp = Math max (_timestamp, delta timestamp)
			while s
				s apply (delta)
				s = s parent
			# FIXME: Not sure storing in journal is a good thing
			# And then we merge the change
			if delta is? DeltaGroup
				journal = journal concat (delta all)
			elif delta is? Delta
				journal push (delta)
			else
				error (BadArgument, "delta", delta, [Delta, DeltaGroup], __scope__)
			self ! "Update" (delta)

		@method _notify delta
		| Notify that the given delta was applied
			self ! "Update" (delta)

		@method merge delta
		| Merges the given delta into this context
			let o = resolve (delta path)
			if o is None
				if options strict
					error ("Could not resolve object:", delta path)
				else
					let is_number = delta opcode match
						== ADD
							True
						== INSERT
							True
						== INSERT
							str(parseInt(delta v0)) == str(delta v0)
						== SET
							str(parseInt(delta v0)) == str(delta v0)
						== REMOVE
							str(parseInt(delta v0)) == str(delta v0)
						== SWAP
							str(parseInt(delta v0)) == str(delta v0) and str(parseInt(delta v1)) == str(delta v1)
					o = list() if is_number else map ()
					# The third argument here prevents propagation of that change, as we're
					# already merging.
					_timestamp = Math max (_timestamp, delta timestamp)
					mount (delta path, o, False)
					return o merge (delta)
			else
				return o merge (delta)

# EOF
