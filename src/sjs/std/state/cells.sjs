@feature sugar 2
@module  std.state.cells
@import  list as as_list, merge as core_merge, bool,identity, copy, equals, cmp, type, typename, len from std.core
@import  first,keys,values,flatten,index,append,concat,group,comparator,difference,partition,indexOf,remove as _remove,removeAt as _removeAt,sorted,unique,fitlen from std.collections
@import  TNamed, TDescribed, TIdentified from std.patterns.ids
@import  assert, warning, error, BadArgument, MissingEntry, NotImplemented from std.errors
@import  split from std.text
@import  Throttled,Delayed,now from std.io.time
@import  Async,RendezVous from std.io.async

# TODO: Some paths in the network should be lazy: if they have no output
# or are tagged as lazy, then they should not be updated.
# TODO: Input should be converted to Value
# TODO: _update sometimes use an origin, sometimes it doesn't. It should be consistent.
# TODO: Maybe use timestamps instead of origin list to know if a cell needs
#       an update or not. See #TIMESTAMP

# TODO: Allow some reducers to use a "fingerprint" function to compare. For
# instance, if a reducer is given the same value (an array), you could extract
# the revision numer/mtime of the values and use that as a fingerprint to 
# detect a change. That would be more useful than a custom equality.

# -----------------------------------------------------------------------------
#
# TPRODUCER
#
# -----------------------------------------------------------------------------

@trait TProducer
| A producer cell can *trigger* other cells when it produces a new value.
| Triggered are called the *output cells* of the producer.
|
| ```
| producer triggers (consumers)
| # Returns the current value of the producer
| producer value
| ```


# -----------------------------------------------------------------------------
#
# TCONSUMER
#
# -----------------------------------------------------------------------------

@trait TConsumer
| A consumer takes inputs an acts upon the reception of the changed
| input values.
|
| ```
| consumer takes (producers)
| consumer do    {inputs|console log ("Received", inputs)}
| ```
|
| The semantics of the `do` operation depend on the implementation. If the
| consumer is also a producer, then the result value of the `do` is likely
| going to be used to produce a new value.

	@property _takes = Undefined

	@getter input
	| Returns the current state of the input values of this cell.
		return self _takes match
			is? Cell → _takes value
			else     → _takes ::= {return _ value}

# -----------------------------------------------------------------------------
#
# TBRIDGE
#
# -----------------------------------------------------------------------------

@trait TBridge: TConsumer, TProducer
| A bridge is both a *consumer* and a *producer*. When its value is
| accessed after its inputs have changed,

	@property _value
	# FIXME: Not sure exacatly when this is necessary
	@property _inputsDirty    = False

	@getter value
		# FIXME: This is not supposed to be the case. This is 
		# actually causing double-updated in some reducers. This
		# happens in the _hasChanged(value) in _produce during
		# initial update. The reducer is then called twice as
		# there is no existing value.
		# Disabled 2019-04-23
		# --
		# if _inputsDirty
		# 	 _inputsDirty = False
		# 	 self _update (None)
		return Cell Unwrap (_value)

# -----------------------------------------------------------------------------
#
# CELL
#
# -----------------------------------------------------------------------------

@class Cell: TNamed, TDescribed
| A cell is an *abstract* element that is part of the cell *network*.

	@shared   EQUALITY         = {a,b|equals(a,b,1)}
	| The comparator is a shallow equals.

	@shared   COUNT            = 0
	@property id               = 0
	@property _parent
	@property _address
	@property _action          = Undefined
	@property isInhibited      = True
	@property alwaysPropagates = False
	@property isDirty          = False
	@property isAsync          = False
	@property _inputs          = []
	@property _takes           = Undefined
	@property _unwraps         = True
	@property _inputsDirty     = False
	@property _outputs         = []
	@property _updated         = 0

	@property _comparator      = EQUALITY
	| The comparison function used by the producer. `std.core.equals` by default.

	@property _value           = Undefined
	| Stores the current value

	@property _valueOrigin     = Undefined
	| Meta information about the provenance of the value. Used to detect
	| asynchronous/streams.

	@operation Wrap value
	| Wraps the given value in a List/Map/Input cell.
		# NOTE: Should we register the cell in the parent network?
		return value match
			is? Array
				new List  () set (value)
			is? Object
				new Map   () set (value)
			_
				new Value () set (value)

	@operation Unwrap value
		return value match
			is? Cell   -> value unwrap ()
			is? Async  -> value value if value isFinished else Undefined
			else       -> value

	@constructor parent
		self id      = COUNT ; Cell COUNT += 1
		self _parent = parent
		isInhibited = False

	@getter updated
	| Returns the timestamp at which the cell was last updated
		return _updated

	@getter parent
		return _parent

	@method setParent cell
		_parent = cell
		return self

	@method getSuccessors
	| See `Network.Successors`
		return Network Successors ([self])[0]

	@method getDependencies
	| See `Network.Dependencies`
		return Network Dependencies ([self])

	@method getSuccessorNames
	| A debugging helper that gives the list of the successor names
		return getSuccessors () ::= {_ name}

	@method getSuccessorAddresses async=True
	| A debugging helper that gives the list of the successor adresses
		return getSuccessors () ::= {_ address}

	@method getUpdateOrigin
	| Returns the cell with the highest `updated` timestamp, this is the
	| one tha can be considered the `origin` of an update.
		var t = -1
		var r = Undefined
		for c in _inputs
			let ct = c _updated
			if ct > t
				r = c
				t = ct
		return r

	@method update
	| Forces an update of the value, this is equivalent to `_produce(value, True)`
		_produce (value, True)
		return self

	# =========================================================================
	# BASE ACCCESSORS
	# =========================================================================

	@getter isAsynchronous
	| A synchronous cell propagates a change synchronously.
		return False

	@getter raw
		return _value

	@getter value
	| Returns the cell @value, unwrapping it if it was previously
	| wrappedin a Cell.
		return unwrap ()

	@method unwraps value=Undefined
		if value is Undefined
			return self _unwraps
		else
			_unwraps = value and True or False
			return self

	@method unwrap
	| Unwraps the current value
		if self _unwraps is True and (_value is? Cell)
			return _value unwrap ()
		elif _value is? Async
			return _value get ()
		else
			return _value

	# =========================================================================
	# CONFIGURATION
	# =========================================================================

	@method does action:Function, trigger=False
	| Registers an action that will be executed whenever this cell is updated.
		if trigger and action
			action (self)
		self _action = action
		return self

	@method comparator value=Undefined
	| Gets/Sets the comparator used by this cell.
		match value
			is? Undefined
				return _comparator
			is? Function
				_comparator = value
				return self
			else
				error (BadArgument, "value", value, [Function], __scope__)

	# =========================================================================
	# ACCESSORS
	# =========================================================================

	@getter address
	| Returns the address of the cell, which is its name or id prefixed
	| by the parent and separated by a dot.
		let prefix = (_parent name or _parent id) + "." if _parent else ""
		return prefix + localAddress

	@getter localAddress
		return (name or id)  + ":" + (typename(type(self)) split "." [-1] toLowerCase ())

	# =========================================================================
	# PRODUCER
	# =========================================================================

	@method triggers cells:List
	| Adds the given cells to the outputs of this cell.
		cells = cells match
			is? Cell   → [cells]
			is? Array  → cells
			is? Object → cells
			_          → error (BadArgument, "cells", cells, [Cell, Array, Object], __scope__)
			else       → error ("No `cells` given as argument in", address, __scope__)
		for cell,i in cells
			match cell
				is? Cell
					_addOutput (cell)
					cell _addInput (self)
				_
					error (BadArgument, "cells." + i, cell, [TConsumer], __scope__)
				else
					error ("Empty cell given as cells[" + i + "] in", address, __scope__)
		return self

	@method untriggers cells:List
		cells = cells match
			is? Cell   → [cells]
			is? Array  → cells
			is? Object → cells
			_          → error (BadArgument, "cells", cells, [Cell, Array, Object], __scope__)
			else       → error ("No `cells` given as argument in", address, __scope__)
		for cell,i in cells
			match cell
				is? Cell
					_removeOutput (cell)
					cell _removeInput (self)
				_
					error (BadArgument, "cells." + i, cell, [TConsumer], __scope__)
				else
					error ("Empty cell given as cells[" + i + "] in", address, __scope__)
		return self

	@method to cells:List
	| An alias to @triggers
		return triggers (cells)
	
	@method detach
	| Completely detaches the cell from its inputs and outputs.
		untriggers (_outputs)
		takes (None)
		return self

	@method touch
	| Forces an update of the cell with the very same value. This is useful
	| when you've changed the contents of the value.
		_produce( _value, True )
		return self

	@method set value, force=False
	| The default way to set a value. Some cells don't allow directly setting
	| a value.
		_produce (value, force)
		return self

	@method _produce value:Any, force=False, origin=None
	| Updates the producer's value to the given @value, dispatching
	| it to the *outputs* if it has changed.
	|
	| This method has special support for async values. The `origin`
	| argument is used internally when futures update themselves, so that
	| partial values can flow in the network.
		if force or _hasChanged (value)
			# TODO: There might be a better way of doing this. Asyncs should
			# simply fire update events, and as they're wrappable they should
			# be unwrapped. That would be a more versatile and easier implementation.
			if value is? Async
				# NOTE: When we have an async value, we assign it
				# as the value origin.
				# --
				# We cancel any previous async value origin, except if the 
				# value has changed (ie. it's a set partial) and the value
				# is the origin.
				if (_valueOrigin is? Async) and (_valueOrigin is not value)
					# NOTE: We might not always want to cancel. This might
					# need to be investigated.
					_valueOrigin cancel ()
					# In this case we defer the production to the moment
					# where the future succeeds.
					_valueOrigin = value
				# NOTE: We force the production because we know for sure there
				# was a change.
				value partial {
					# FIXME: Not sure if this guard is necessary
					if _ != value
						# NOTE: It's supper important to keep the origin
						# here as otherwise the partial value will erase
						# the future.
						_produce (_, True, value)
				}
				# Note how we clear the _valueOrigin only if it's the same
				# as the curent async.
				value then {
					if _valueOrigin == value
						_valueOrigin = None
						# NOTE: Not sure if we should force a production
						if _ != value 
							_produce (_, True)
				}
				# TODO: What should we do if the value fails?
				# NOTE: Important, we set the current value to be
				# the current value of the async, and we keep the origin. This
				# is going in the other branch of the call.
				_valueOrigin = value
				_produce (value value, Undefined, value)
			else
				# We subscribe to the value's Update events
				if _value is not value
					# NOTE: We need to clean this one
					_valueOrigin = origin
					_unbindValue (_value)
					_bindValue   (value)
				let previous = _value
				_value       = value
				if not self isInhibited
					self _updated = now ()
					self ! "Update" (value)
					if self _action
						self _action (self, origin, previous)
					_propagate ()
			return True
		else
			return False

	@method _propagate delta=None, value=self _value
	| Propagates the value of this cell to the outputs. Called by @_produce
	| if the current value has changed.
	|
	| This triggers the `Update` event on this cell.
		# NOTE: We use `value=self _value` instead of  `value=self value`, as
		# `value` might transform the value and trigger an _update as
		# some value getters will trigger an update (eg. for reducers)
		if self _parent
			# If there is a network in this cell, we propagate the value
			# through the network.
			self _parent _propagateNetworkChanges (self, delta, value)
		else
			# FIXME: Not sure this is right. It should only reorder the
			# outputs based on the successors
			# TODO: What about the async level?
			let next = Network Successors (self)
			for cell in next
				if cell != self and (cell in _outputs)
					cell _update (self)

	@method _hasChanged current, previous=self value
	| Tells if the given value has changed. This can be overriden to
	| have more fine-grain comparison.
		return alwaysPropagates or (not _comparator (current, previous))

	@method wouldChange value
	| Convenience method that tells if setting the given value would trigger
	| a change in the cell.
		return _hasChanged(_value, value)

	@method _addOutput cell:TConsumer
		if cell == self
			error ("Cell cannot add itself as output:", self address)
		elif not cell
			warning ("Trying to add an undefined output cell to", address, __scope__)
		elif cell in _outputs
			warning ("Trying to add output cell twice", cell address, "to", address, __scope__)
		else
			_outputs push (cell)
		if _parent
			_parent setDirty ()
		if cell and cell _parent
			cell _parent setDirty ()
		return cell

	@method _hasOutput cell:Cell
		return cell in _outputs

	@method _removeOutput cell:Cell
	| Internal method to remove an output cell from the current cell.
		if cell not in _outputs
			warning ("Trying to remove output cell that was not added", cell address, "from", address, __scope__)
		else
			_outputs = _remove (_outputs, cell)
		if _parent
			_parent setDirty ()
		if cell and cell _parent
			cell _parent setDirty ()
		return cell

	# =========================================================================
	# VALUE
	# =========================================================================

	@method _bindValue value
	| Binds the given value to this cell. This will ensure
	| that update events flow from the value to the cell.
		# TODO: Binding should be optional
		if value is? Object
			value !+ "Update" (self . _relayUpdate)
		return value

	@method _unbindValue value
	| Unbinds the given value to this cel. This will stop
	| the propagation of udpate events from the value to the cell.
		# TODO: Binding should be optional
		if value is? Object
			value !- "Update" (self . _relayUpdate)
		return value

	@method _relayUpdate event
	| Relays an update of this cell's value
		_produce (_value, True)
		return self

	# =========================================================================
	# CONSUMER
	# =========================================================================

	@method takes cells:Producer=Undefined
		# We make sur the input cells is either an array or a map, as this
		# will dictate the layout of values returned by #.input
		if cells is Undefined
			return self
		_takes = cells or []
		cells = cells match
			is? Cell   → [cells]
			is? Array  → cells
			is? Object → cells
			is None    → []
			else       → error (BadArgument, "cells", cells, [Cell, Array, Object], __scope__)
		# It's important to only assign the inputs layout after normalization
		copy (_inputs) :: {cell|
			cell _removeOutput (self)
			_removeInput (cell)
		}
		for cell,i in cells
			match cell
				is? Cell
					_addInput (cell)
					cell _addOutput (self)
				else
					error (BadArgument, "cells." + i, cell, [TProducer], __scope__)
		return self

	@method takesMore cells
	| Updates the `takes` input list. Use this when you need to patch the
	| cell network after it's been created.
		if cells is? Cell
			if _takes and _takes is? Array
				takes ((_takes or []) concat ([cells]))
			else
				takes (core_merge({(cells name):cells}, _takes))
		elif cells is? Array
			if _takes and not _takes is? Array
				error ("Trying to add one more cell with incompatible type", cells, "into", _takes, __scope__)
			else
				takes ((_takes or []) concat (cells))
		elif cells is? Object
			if _takes and not _takes is? Object
				error ("Trying to add one more cell with incompatible type", cells, "into", _takes, __scope__)
			else
				takes (core_merge(cells, _takes))
		return self

	@method _update origin:Cell=None
	| Called by a producer cell's @_propagate to notify that this cell should update
	| itself.
		error (NotImplemented, self, __scope__)

	@method _invalidate
	| Flags the inputs as having changed
		_inputsDirty = True

	@method _addInput cell:Cell
	| Internal method to add an input cell to the current cell.
		if cell == self
			error ("Cell cannot add itself as input:", self address)
		elif not cell
			warning ("Tyring to add an undefined input cell to", address, __scope__)
		elif cell in _inputs
			warning ("Trying to add input cell twice", cell address, "to", address, __scope__)
		else
			_inputs push (cell)
			_invalidate  ()
		# NOTE: This might not be strictly necessary, as _addInput/_addOutput
		# are symetricale.
		if _parent
			_parent setDirty ()
		if cell and cell _parent
			cell _parent setDirty ()
		return cell

	@method _hasInput cell:Cell
		return cell in _inputs

	@method _removeInput cell:Cell
	| Internal method to remove an input cell from the current cell.
		if cell not in _inputs
			warning ("Tyring to remove input cell that was not added", cell address, "from", address, __scope__)
		else
			_inputs      = _remove (_inputs, cell)
			_invalidate  ()
		# NOTE: This might not be strictly necessary, as _addInput/_addOutput
		# are symetricale.
		if _parent
			_parent setDirty ()
		if cell and cell _parent
			cell _parent setDirty ()
		return cell
	

	# ========================================================================
	# PROXY/DELEGATE
	# ========================================================================

	# FIXME: Should be renamed so that the direction is unambiguous
	@method proxy delegate, force=False, update=True
	| Delegates all the mutating and access operations to the given `delegate`
	| cell.
		if not delegate
			warning ("Input cell given undefined cell as proxy: ", localAddress, __scope__)
		else
			assert ((not delegate _parent) or (delegate _parent != self _parent), "Input cell cannot proxy a cell from the same network")
			# And we update the current value accordingly
			if update
				set (delegate value, force)
			# NOTE: We don't use triggers here as if we do we might
			# get duplicate warning.
			# TODO: Investigate the reason.
			if not delegate _hasOutput (self)
				delegate _addOutput (self)
			if not self _hasInput (delegate)
				self _addInput (delegate)
		return self

	@method unproxy delegate
		if delegate
			# NOTE: We don't do untriggers here, as for some reason
			# this triggers warnings.
			# TODO: Investigate the reason.
			if delegate _hasOutput (self)
				delegate _removeOutput (self)
			if self _hasInput (delegate)
				self _removeInput (delegate)
			# This mens the delegate does not take this cell as output
			assert (not delegate _hasOutput (self))
			# And that this cell does not take the delegate as input
			assert (not self _hasInput (delegate))
		return self

	@method fuse delegate
	| Bi-directional proxying of the delegate with the current cell: both
	| cells will always have the same value. The `delegate`'s value'
	| will be used for both.
		if not delegate
			warning ("Input cell given undefined cell as fuse argument: ", localAddress, __scope__)
		else
			proxy (delegate)
			# NOTE: By choice, we allow fuse to work even if the delegate
			# cannot do it ― We might want to raise a warning
			if delegate
				assert (delegate proxy, "Delegate has no proxy method", delegate address)
				delegate proxy (self)
		return self

	@method unfuse delegate
	| Reverse operation of `fuse`.
		if not delegate
			warning ("Input cell given undefined cell as unfuse argument: ", address, __scope__)
		else
			# The unproxy already does assertions
			unproxy (delegate)
			# NOTE: By choice, we allow fuse to work even if the delegate
			# cannot do it
			if delegate
				if delegate _hasInput (self)
					delegate _removeInput (self)
				if self _hasOutput (delegate)
					self _removeOutput (delegate)
			assert (not delegate _hasInput (self))
			assert (not delegate _hasOutput (self))
		return self

	# ========================================================================
	# DEBUGGING
	# ========================================================================

	@method listInputs
		return _inputs ::= {_ address}

	@method listOutputs
		return _outputs ::= {_ address}

	@method toJSON
		return {
			id      : id
			address : _address
			type    : typename(type(self))
			outputs : self _outputs ::= {_ id}
			inputs  : self _inputs  ::= {_ id}
		}

# -----------------------------------------------------------------------------
#
# VALUE
#
# -----------------------------------------------------------------------------

@class Value: Cell, TProducer

	@property _value
	@property isRaw = False

	@constructor parent, value
		super (parent)
		# FIXME: This will trigger the cell right away
		set (value) if value is not Undefined

	@getter value
		return _value if isRaw else Cell Unwrap (_value) 

	@method setRaw value
	| A raw value wil not try to unwrap its content. This is useful
	| when you want a cell to hold a cell as a value but not
	| unwrap its content.
		isRaw = bool (value)
		return self

	@method toggle
		set (not (bool (value)))
		return self

	@method clear
		_produce (Undefined)
		return self

	@method _update origin:Cell=None
		# NOTE: We DON'T want to assign from an origin that is not an input,
		# otherwise the result wouldn't be valid!
		if origin
			if origin is self
				pass
			elif origin is? Cell
				if origin in _inputs
					set (origin raw)
				else
					# This might happen if the inputs are dynamically changed. It doesn't necessarily
					# mean it's bad, simply that it might be a problem.
					warning (address, "updated with origin cell not in inputs: ", origin address, __scope__)
			else
				for o in origin
					if o in _inputs
						set (o raw)
						# NOTE: Early exit
						return self
				warning (address, "update with at least one origin cells that is not in its inputs: ", address, "origin", origin, __scope__)
		else
			# FIXME: Identify when this happens
			warning (address, "updated without an origin cell", __scope__)
		return self

	@method _addInput cell:TProducer
		if not cell
			warning ("Value cell given undefined cell as input: ", address, __scope__)
		elif (cell _parent) and (cell _parent == self _parent)
			error ("Value cell cannot have inputs from the same cell network:", self address, "with input", cell address)
			return self
		else
			return super _addInput (cell)

# -----------------------------------------------------------------------------
#
# SIGNAL
#
# -----------------------------------------------------------------------------

# TODO: It seems that a signal might just be like a reducer, there doesn't seem
# to be a fundamental difference. The reducers also could have an additional
# information, which is which cell originated the change, or which cell 
# changed. This might be solved by adding a timestamp to the last update
# and picking the most recent update.
@class Signal: Cell, TBridge
| A signal is a bridge (or terminal) cell that relays data but can also
| inject an arbitrary data into the network. It will always be triggered,
| even if the value does not change.

	@property _effect

	# NOTE: Not sure about the effect here
	@constructor parent, effect
		super (parent)
		_effect = effect

	@method effect callback
		_effect = callback
		return self

	@method set value
	| When a signal is set it does not care whether the value has changed
	| or not. It will always propagate.
		_value = value
		_produce (value, True)
		return self

	@method _update origin=Undefined
		# NOTE: We don't use the origin here
		let v = origin value if origin else input
		# TODO: This should be abstracted. SEE #REDUCER_INPUT
		let w = v[0] if _takes is? Array and _takes length == 1 and v is? Array else v
		_produce (w, True, origin)
		return self

	@method _produce value:Any, force=False, origin=Undefined
		if super _produce (value, force, origin)
			if _effect
				_effect (value, origin, self)
			return True
		else
			return False

	
	# =========================================================================
	# OVERRIDES
	# =========================================================================

	@method proxy delegate, force=False
	| Signals do not update their value when proxied.
		return super proxy (delegate, force, False)

	@method _bindValue value
	| Signals do not subscribe to their values being updated.
		return value

	@method _unbindValue value
	| Signals do not subscribe to their values being updated.
		return value

# -----------------------------------------------------------------------------
#
# REDUCER
#
# -----------------------------------------------------------------------------

@class Reducer: Cell, TBridge
| Computes a new value when any of the inputs change.

	@property _action    = Undefined
	@property _processor = identity
	@property isDirty    = True

	@method refresh
		return update ()

	@method update
	| Forces a recalculation of the reducers' value, as if the inputs
	| have changed.
		_update ()
		return self

	
	@method _update origin=Undefined
		# NOTE: We don't use the origin here
		# We propduce a new value
		let n = len(_inputs)
		let v = input
		let w = _value
		# REDUCER_INPUT: We might want to specify how we want the
		# input of a reducer to be managed, either as an array of values,
		# as an array of arguments or as a map. Maybe the reducer could choose?
		# ---
		# If there is more than one input and the value is an input,
		# we consider the inputs as arguments and add the previous value
		# NOTE: Should we always force the production?
		var result = Undefined
		if _takes is? Array and v is? Array
			result =  _processor (...(v concat ([w, self])))
		else
			result = _processor( v, w, self )
		_produce (result)
		isDirty = False
		return v

	@method set value, force=False
	| Reducers don't allow setting a value.
		error ("Reducers don't allow to set a value:", address, __scope__)
		return self

	@method returns processor
		if processor != self _processor
			self _processor = processor
			if not isInhibited
				_update ()
		return self

# -----------------------------------------------------------------------------
#
# OBSERVER
#
# -----------------------------------------------------------------------------

# TODO: Add extractor to extract the listened values
@class Observer: Cell, TBridge
| An observer observes specific values from its inputs and relays updated
| from these values to the result.
|
| You should use observers in cell networks where some producers return
| composite values that might change and where you want to listen
| to the change.

	@property _observed = {}
	@property _events   = ["Update"]

	@method set events=_events
	| Sets the list of events this observer listens to
		if events is _events
			return self
		events = as_list(events)
		let c = self . _relayValueEvent
		# We stop listening for the current events
		_observed :: {o|_events :: {e|o !- e (c)}}
		# We start listening to the the new events
		_observed :: {o| events :: {e|o !+ e (c)}}
		return self

	@method _update origin=Undefined
		# NOTE: We don't use the origin here
		# We extract the observable list/map from the
		# inputs.
		let v = input[0] if len(_inputs) == 1 else input
		if len(_inputs) > 1
			warning ("Observers do not support more than one input for now:", address, __scope__)
		let c = self . _relayValueEvent
		# Now we detect if there is a change in the
		# observed values
		for w,k in v
			let o = _observed[k]
			if o is w
				pass
			else
				# If there is, we update our event binding
				if o
					_events :: {e|o !- e (c)}
				_events :: {e|w !+ e (c)}
				_observed[k] = w
		if not v
			# If there is no more value, then we
			# unbind everything
			_observed :: {o|_events :: {e|o !- e (c)}}
		else
			# Otherwise we only unbind the observed that don't exist
			# anymore.
			for o,k in _observed
				if v[k] is not o
					_events :: {e|o !- e (c)}
				_observed = _removeAt (_observed, k)
		# It,s important to call produce
		_produce (v)
		return v

	@method _relayValueEvent
	| An observer relays the given events as an update to itself.
		_produce (_value, True)

# -----------------------------------------------------------------------------
#
# LIST
#
# -----------------------------------------------------------------------------

@trait TComposite: TProducer

	@method add value
		pass

	@method remove value
		pass

	@method removeAt index
		pass

	@method set index, value, force=False
		return self

	@method get index=Undefined
		pass

	@method unwrap
		if self _unwraps
			return self _value ::= {return Cell Unwrap (_)}
		else
			return self _value

# -----------------------------------------------------------------------------
#
# LIST
#
# -----------------------------------------------------------------------------

# TODO: Implement delta protocol
@class List: Value, TComposite

	@property _value      = []

	@getter length
		return _value length

	@method has value
		return value in _value

	@method add value
		_bindValue (value)
		_value push (value)
		_produce (_value, True)
		return value

	@method toggle value
		if has (value)
			remove (value)
		else
			add (value)
		return self
		
	@method append value
		return add (value)

	@method grow count, defaultValue=Undefined
		if _value length < count
			# TODO: Should bind value
			while _value length < count
				_value push ( _bindValue (defaultValue))
			_produce (_value, True)
		return self

	@method shrink count
		if _value length > count
			while _value length > count
				_unbindValue (_value pop ())
			_produce (_value, True)
		return self
	
	@method resize count
		if _value length < count
			grow (count)
		elif _value length > count
			shrink (count)
		return self

	@method find value
	| Returns the index of the given value
		return indexOf (_value, value)

	@method after index, value
		index = (_value length + index) if index < 0 else index
		# NOTE: This used to be `index == _value length + 1`. Should check that.
		if index >= _value length
			return add (value)
		else
			return insert (index + 1, value)

	@method insert index, value, grow=True
		# TODO: Insert when index is > length
		if grow
			let v = fitlen (_value, index) if grow and index >= len(_value) else _value
		_bindValue (value)
		let w = _value[0:index] concat ([value]) concat (_value[index:])
		_produce (w)
		return value

	@method clear
		_produce ([])
		return self

	@method remove value
		_unbindValue (value)
		_produce (_value ::? {_ is not value})
		return value

	@method removeAt index
		let v = _value[index]
		_unbindValue (v)
		_produce (_removeAt (_value, index), True)
		return v
	
	@method shift
		return removeAt (0)

	@method pop index=length - 1
		return removeAt (index)

	@method slice start=0, end=-1
		start = _value length + start if start < 0 else start
		end   = _value length + end   if end   < 0 else end
		return _value slice (start, end)

	@method set index:Number|Array, value=Undefined, force=False
		match index
			is? Array
				# We can assign an array
				if _hasChanged (index) or force
					let v = [] concat (index)
					_value :: _unbindValue
					v      :: _bindValue
					_produce (v)
			is? Number
				index = (_value length + index) if index < 0 else index
				if index < _value length
					if _hasChanged (_value[index], value) or force
						_unbindValue (_value[index])
						_value [index] = value
						_bindValue (value)
						# FIXME: Should be a delta
						_produce (_value, True)
				else
					error ("Index out of bounds", index, ">=", _value length, "in", address, __scope__)
			is Undefined and value is Undefined
				pass
			_
				error (BadArgument, "index", index, [Array, Number], __scope__)
		return self

	@method get index=Undefined
		if index is Undefined
			return value
		else
			index = (_value length + index) if index < 0 else index
			return Cell Unwrap (_value [index])

	@method extend values, force=False
		if values
			for v in values
				_value push (v)
				_bindValue (v)
			_propagate (_value, True)
		return self

	# TODO: Merge should be implemented, but it's trickier than
	# for the map.
	# @method merge values, force=False
	
	@method swap i, j
		i = _value length + i if i < 0 else i
		j = _value length + j if j < 0 else j
		let vi = _value[i]
		let vj = _value[j]
		_value[j] = vi
		_value[i] = vj
		_produce (_value, True)
		return self

# -----------------------------------------------------------------------------
#
# MAP
#
# -----------------------------------------------------------------------------

# TODO: Implement delta protocol
@class Map: Value, TComposite

	@property _value = {}

	@method remove value
		_unbindValue (value)
		_produce (_value ::? {_ is not value})
		return value

	@method removeAt index
		let v = _value[index]
		_unbindValue (v)
		_produce (_removeAt (_value, index), True)
		return v

	@method clear index=Undefined
		if index is Undefined
			_produce ({})
			return self
		else
			return removeAt (index)

	@method set key, value=Undefined, force=False
		match key
			is? Object
				# We can assign an array
				if _hasChanged (key) or force
					_value :: _unbindValue
					key    :: _bindValue
					_produce (key, force)
			is? String or key is? Number
				if _hasChanged (_value[key], value) or force
					_unbindValue (_value[key])
					_value[key] = value
					_bindValue (value)
					# FIXME: Should be a delta
					_produce (_value, True)
			is Undefined and value is Undefined
				pass
			is None
				set ({}, Undefined, force)
			else
				error (BadArgument, "key", key, [Object, String, Number], __scope__)
		return self

	@method get key=Undefined, defaultValue=Undefined
	| Returns the value bound to the given @key
		if key is Undefined
			return value
		else
			let v = _value [key]
			if _value [key] is Undefined
				return defaultValue
			else
				return Cell Unwrap (v)

	@method merge values, override=False
		var changed = False
		for v,k in values
			if _hasChanged (_value[k], v) or override
				_unbindValue (_value[k])
				_value [k] = v
				_bindValue (v)
				changed = True
		if changed
			_propagate (_value, True)
		return self

# -----------------------------------------------------------------------------
#
# THROTTLE
#
# -----------------------------------------------------------------------------

# FIXME: The throttle will never work unless it is asynchronous because the
# Network.Sucessors won't list anything up until it thottle is is ready.
@class Throttle: Cell, TBridge
| A throttle cell prevents propagation of values for the given delay

	@property _throttled = new Throttled {_produce (input)}
	@property isAsync    = True

	@constructor parent, delay=100ms
		super (parent)
		_throttled set (delay)

	@getter isAsynchronous
	| A thtrottle is only async when it can't tick right away
		return not _throttled canTick

	@method delay delay=Undefined
		if delay is Undefined
			return _throttled delay
		else
			_throttled set (delay)
			return self

	@method _update origin:Cell=None
	| Called by a producer cell's @_propagate to notify that this cell should update
	| itself.
		# NOTE: We don't use the origin here
		let v = input
		# NOTE: This is the same logic as with the Reducer, but it seems
		# a bit brittle. We should rework this. SEE REDUCER_INPUT
		let w = v[0] if _takes is? Array and _takes length == 1 and v is? Array else v
		if _hasChanged (w, _value)
			# NOTE: This will in turn invoke a produce
			_throttled trigger (v)

# -----------------------------------------------------------------------------
#
# DELAYED
#
# -----------------------------------------------------------------------------

@class Delay: Cell, TBridge
| A delayed cell prevents propagation of values for the given delay. This is
| useful for saving stuff.

	@property isAsync  = True
	@property _delayed = new Delayed {
		_produce (input)
	}

	@constructor parent, delay=100ms
		super (parent)
		_delayed set (delay)

	@getter isAsynchronous
		not _delayed canTick

	@method delay delay=Undefined
		if delay is Undefined
			return _delayed delay
		else
			_delayed set (delay)
			return self

	@method _update origin:Cell=None
	| Called by a producer cell's @_propagate to notify that this cell should update
	| itself.
		let v = input
		if _hasChanged (v, _value)
			_delayed push (v)

# -----------------------------------------------------------------------------
#
# COMBINATOR
#
# -----------------------------------------------------------------------------

@class Combinator: Cell, TBridge
| A combinator combines cell values together in a memory-efficient way,
| typically iterating over a composite value (a list or a map) and creating
| new composite structure integrating the other values.
|
| Combinators are conceptually a subset of reducers, but the key difference
| is that the are optimized to reuse the combined elements and to have fast
| iteration. This helps relieve some strain from the garbage collector. The
| downside is that the combinator will always produce a the SAME values, which
| means that the rendering will need to be forced to always render items.

	# TODO: Implement recycling
	@property _combines = [Undefined, Undefined]
	@property _combined = []

	@method combines configuration
	| Configures the combinator. This
	| takes `[<iterated cell>,{<cell name>:<extractor>}]`.
		assert (configuration is? Array or configuration length != 2, "Combinator expectes [str, map], got:", configuration, __scope__)
		_combines = configuration
		isDirty   = True
		return self

	@method _update origin=Undefined
	| Creates (or rather updates) the array of combined values based on the
	| combined iteration.
		# NOTE: We don't use the origin
		isDirty       = False
		let args      = input
		let name      = _combines[0]
		let iterated  = args[name]
		let r         = _combined
		let l         = r length
		var i         = 0
		# We iterate over the iterated element (ie. the first argument
		# to `combine()`.
		for v,k in iterated
			var o = Undefined
			# We create the combination, adding a new item if
			# we have more elements in iterated than in r
			if l <= i
				o = {}
				r push (o)
			else
				o = r[i]
			# FIXME: This really needs clarification
			# We set the iterated value in the `o` object, which
			# containes the combined values.
			o [name] = v
			# And combine the other values
			for combined_name, n in _combines[1]
				o[combined_name] = args[n]
			i += 1
		# We remove excess elements
		while r length > i
			# TODO: We might want to cache the excess
			r pop ()
		# Because we re-use r, we need to force the final
		# result.
		_produce (r, True)
		return r

# -----------------------------------------------------------------------------
#
# NETWORK
#
# -----------------------------------------------------------------------------

@class Network: TNamed, TIdentified
| A network holds cells together and manages the dispatching of update
| events within the cell network.

	@property cells          = []
	@property cycle          = Undefined
	@property cycles         = 0
	@property owner          = Undefined
	| A reference to the owener of a cell network, which is typically
	| a user interface component. This reference is useful when receiving
	| a signal from a cell and going up the chain to the owning component.
	@property isDebugging    = False
	@property isInhibited    = False
	@property isInitializing = False
	@property _inhibited     = []
	@property _successors    = Undefined
	@property _isDirty       = True

	# =========================================================================
	# HIGH-LEVLE OPERATIONS
	# =========================================================================

	@operation Define network, defaultNodes
	| Defines a new network based on the given `DSL` definition of the
	| given network.
		if network
			return network match
				is? Network -> network
				else        -> DSL define (network, defaultNodes)
		elif defaultNodes
			return DSL define (None, defaultNodes)
		else
			return new Network ()

	@operation Extent cells, inputs=True, outputs=True, res=[]
	| Returns an array of all the cells reachable (inputs and outputs) from the given
	| list of cells.
		let c = [cells] if cells is? Cell else as_list(cells)
		let to_visit = [] concat (cells)
		let visited  = []
		while to_visit length > 0
			let node = to_visit shift ()
			visited push (node)
			for child in node _inputs concat (node _outputs)
				if child not in visited and child not in to_visit
					to_visit push (child)
			for child in node _outputs
				if child not in visited and child not in to_visit
					to_visit push (child)
		return visited

	@operation Ranks cells
	| Returns a `Map[Cell.id,int]` indicating the depth level (or rank) of
	| all the cells reachable as outputs of the given root cells. This is
	| a grouping by level of a breadth-first walk.
		let roots    = [cells] if cells is? Cell else as_list(cells)
		let ranks    = roots ::> {r={},v|r[v id] = 0;r}
		let to_visit = [] concat (roots)
		var rank     = 0
		while to_visit length 
			let cell       = to_visit shift ()
			ranks[cell id] = rank
			rank          += 1
			for next in cell _outputs
				if ranks[next id] is Undefined and (next not in to_visit)
					to_visit push (next)
		return ranks
	
	@operation Dependencies cells
	| Returns the dependencies of the given cell(s) as a list ordered
	| in topologoical order (ie. dependencies first). The algorithm
	| is resistent to cycles, but may give different orders based on
	| the given list of cells.
		let roots   = [cells] if cells is? Cell else as_list(cells)
		let visited = []
		let result  = []
		# TODO: Convert to iterative
		# This implementation is a very basic recursive topolgical sort, but
		# as it turns out it works better than the fancier implementations
		# we had before.
		let ranks   = Ranks (cells)
		let visit   = {cell|
			if cell in visited
				return result
			else
				visited push (cell)
				# The guarantees that all inputs are always added BEFORE
				# the cell, but the actual result might differ based on the
				# input cells. We ignore input to non-consumers, as these
				# are proxies/bridges between network. If we keep it, then we'll
				# get wrong orders. For instance
				# --
				# G0.A  -> G1.B
				# G1.B <-> G2.C
				# G2.C  -> G2.D
				# --
				# Would yield [C,B,D] as successors of A instead of [B,C,D],
				# because C is a proxied input of B. This shows how the
				# proxy link has different qualities and is asymetric compared
				# to the producer-consumer link.
				if cell is? TConsumer
					cell _inputs :: {visit(_)}
				else
					# So this branch is about ensuring the following rule:
					# a proxy dependency between A and B is only applied if
					# the input cell is not part of descendants walk from the roots
					# or if its walked before.
					cell _inputs :: {
						if (ranks[_ id] or -1) <= ranks[cell id]
							visit(_)
					}
				result push (cell)
				return result
		}
		# I'm leaving `res` here in case we want to log the result, which
		# is good for debugging.
		return roots ::> {r,v|visit(v)}

	# FIXME: async does not work
	@operation Successors cells, async=True
	| Returns a tuple `(successors:List[Cell] ,origins:List[Cell])` representing
	| the list of all successors ordered toplogically (ie. depndencies first).
		let roots            = [cells] if cells is? Cell else as_list(cells)
		let to_visit         = [] concat (roots)
		let visited          = []
		# The given cells need their origins here.
		let origins          = roots ::> {r={},v|r[v id] = v;r}
		# Firt step, we look at all the cells that are going to be
		# activated based on this cell.
		while to_visit length > 0
			let cell   = to_visit shift ()
			visited push (cell)
			# NOTE: If async is False, then we don't include the successors
			# of async cells in a network update. If we include them, then
			# the propagation would get through the async barrier, and all
			# the successors would be updated anyway.
			if  async is False and _ isAsync
				pass
			else
				for _ in cell _outputs
					if (_ not in visited) and (_ not in to_visit)
						to_visit push  (_)
						# NOTE: We should not override an existing origin, as otherwise
						# in two cells are interdependent (they proxy each other),
						# either directly or indirectly, it will cause problem. For
						# instance if A <--> B, A <--> C, then we might have
						# an update order of [A,B,C] but origins like [C,C,B]. Using
						# the conditional assignment ensure that the first origin
						# is kept.
						origins[_ id] ?= cell
		# Second step, we get the dependencies order of all the visited
		# node, making sure that we remove any node that was not part
		# of the successors (as some inputs might be part of it)
		# --
		# NOTE: It is CRUCIAL to filter out the given cells, as otherwise
		# we might create infinite cycles in propagation.
		# --
		# NOTE: This could probably be optimized, as dependencies will do
		# at least another traversal.
		let deps = Dependencies (visited) ::? {(_ in visited) and (_ not in roots)}
		assert (len(deps) == len(visited) - len(roots), "Missing cells in dependencies of", roots)
		# And now we remap the origins we got from before.
		return [deps, deps ::= {return origins[_ id]}]

	# =========================================================================
	# GETTERS
	# =========================================================================

	@getter raw
	| Returns the cells contained within the network, as a list
		return cells
	
	@getter roots
	| Returns the root cells of this network
		return cells ::? {not (_ is? TConsumer)}

	# =========================================================================
	# BASE API
	# =========================================================================

	@method init
	| Called after a network is created to initialize it. Will update
	| any dirty cell and trigger each cell's `action `with (cell,"init")`.
	| No signal will be triggered at this stage.
		# We update the dirty cells and ensure that the network's
		# cells are all up to date.
		isInitializing =  True
		atomic {walkRank {_ _update () if _ isDirty and (not (_ is? Signal))} }
		# TODO: Should we keep that? Not sure when it is actually
		# necessary.
		# --
		# The network is now bound, so we call the `_action` handler
		# of the cells with the `init` argument. This gives a chance
		# to do something upon initialization.
		atomic {walkRank {_ _action (_, "init") if _ _action and (not (_ is? Signal))}}
		isInitializing =  False
		return self

	@method setDirty
	| Sets this network as dirty, which means the successors will need to
	| be recalculated next time.
		_isDirty = True
		return self

	@method debug value=True
	| Enables/disables debugging mode. Dispatched events will be logged when
	| debugging is enabled.
		self isDebugging = value
		return self

	@method has name
	| Returns the index of the cell with the given name
		return index (cells, {_ name == name}) >= 0

	@method cell name
	| Returns the cell with the given #name
		if name is? Cell
			return name
		elif name is? Number
			return cells[name]
		else
			let i = index (cells, {_ name == name})
			return cells[i] if i>=0 else None

	@method remove name
		let c = cell (name) if name is? String else name
		if c
			c _parent = Undefined
			cells = cells ::? {_ is not c}
		return c

	@method wrap value
	| Wraps the given value in a cell. Shorthand to `Cell.Wrap`
		return Cell Wrap (value)

	@method unwrap
	| Returns the **unwrapped** value of the cell network.
		return cells reduce ({r,e,i|
			if e
				r[e name or i] = e unwrap ()
			return r
		}, {})

	@method _add cell
	| Helper to add the given cell to the network, ensuring the cell
	| is not added twice.
		if cell not in cells
			cells push (cell)
		return cell

	@method walkRank functor, cells=self cells
	| Walks this network in the same order as the successors.
		let r    = cells ::? {not (_ is? TConsumer)}
		# NOTE: We do include the successors here
		let succ = r concat (Successors (r, True)[0])
		succ :: functor
		return succ

	# =========================================================================
	# PROPAGATION
	# =========================================================================

	@method inhibit value=True
	| Inhibits the propagation of values between cells of this network.
	| If #value is a function, then it will be executed while ensuring
	| that the network is inhibited. This is useful when initializing a
	| network and make sure it won't be propagating events as its cells
	| are being populated and initialized.
		let is_inhibited = isInhibited
		if value is? Function
			isInhibited = True
			let res = inhibit ()
			isInhibited = isInhibited
			return res
		elif value
			isInhibited = True
		else
			isInhibited = False
		return self

	@method release
	| Ends the inhibition and propagates the inhibited events.
		let l = _inhibited
		_inhibited  = None
		isInhibited = False
		if l
			if isDebugging
				console log ("cells.Network[" +  name + "]#" + cycles + " resuming propagation of", l ::= {_ address})
			# NOTE: We do one update with the cells altogether. The
			# updated successor algorithm will now defer any 
			# successor appearing twice.
			_propagateNetworkChanges (l)
		return self

	@method defer callback
	| Schedules a callback right after the end of this cycle
		if cycle and (not cycle hasEnded)
			cycle inhibited push (callback)
		else
			callback ()
		return self
		
	@method atomic callback
	| Executes the #callback atomatically, making sure the events only
	| propagate once the callback has completed.
		if callback is? Function
			if inhibit ()
				callback ()
				release  ()
			else
				callback ()
		return self

	@method getSuccessors cell, async=Undefined
	| An alias to #Network.Successors
		return Successors (cell, async)

	@method getRanks cell
	| An alias to #Network.Ranks
		return Ranks (cell)

	# NOTE: This method is the nevraglic point of the cell network. That's
	# where the magic happens. It's a fairly hard methood to get right
	# and required many rewrites/experimentation.
	@method _propagateNetworkChanges cell
	| Propagates the given #delta and #value coming from the given #cell. This
	| will detect if we're in a new update cycle or not and order the cycle's
	| scheduled updates so that each cell will only be updated once, and the
	| cells with satisfied dependencies will be updated first.
		# NOTE: In this algorithm, there are two things that are crucial:
		# 1) Successors need to be defined in topological order
		# 2) Origins need to be properly passed, as some cells rely on
		#    which origin activates it.
		if not cell
			return warning ("Propagating without a cell", __scope__)
		if isInhibited
			# If the network is inhibited, we push the propagation
			if isDebugging
				console log ("cells.Network[" +  name + "]#" + cycles + " propagation of cell `" + cell address + "` deferred (network inhibited)")
			_inhibited = _inhibited or []
			# We don't want to add a cell twice to the inhibited list
			if cell not in _inhibited
				_inhibited push (cell)
		elif (not cycle) or (cycle hasEnded)
			self ! "Propagate" (cell)
			# If there is no cycle, we start a new one. There's no need to
			# inhibit the network, as any further call will simply extend the
			# current cycle. This should work for nodes in other networks as
			# well.
			if isDebugging
				console group ("cells.Network[" +  name + "]#" + cycles + " initiated by cells ", as_list (cell) ::= {_ and _ address or "N/A"})

			# NOTE: We specify 1 in the async level here, as if the async
			# node was updated we assume the successors can be updated.
			# FIXME: This actually should not be necessary if isAsynchronous
			# is properly implemened.
			let s_o = getSuccessors (cell)
			# NOTE: There's a potential for performance monitoring here.
			cycle = {
				successors : s_o[0]
				origins    : s_o[1]
				step       : 0
				cell       : Undefined
				started    : now ()
				hasEnded   : False
				inhibited  : []
			}
			cycles += 1
			var i   = 0
			var error_count = 0
			# TODO: It might be good to defer terminals (with no output)
			# to the very end of the cycle. Keep in mind that the cycle might
			# grow if other nodes are triggered.
			while i < cycle successors length
				let next   = cycle successors [i]
				cycle step = i
				cycle cell = next
				# if isDebugging
				# 	console log ("X `" + next localAddress + "` selected as successor #" + (i + 1) + "/" + cycle successors length)
				let origin = cycle origins[i]
				# NOTE: This call should then call Network._propagateNetworkChanges again and go
				# in the next branch, where a cycle is defined.
				let next_network  = next parent
				if origin is next
					# If the origin is the same as the cell, then it means that the
					# cell was added as part of an input of a successor. We don't need
					# to update it as it is NOT DIRECTLY affected by the change
					pass
				elif next_network == self
					# Here we differentiate between a LOCAL CELL and a REMOTE CELL
					# It's a LOCAL cell, so we tell it to update itself
					if isDebugging
						console log ("● `" + next localAddress + "` is updating as successor of `" + origin localAddress + "` #" + (i + 1) + "/" + cycle successors length)
					try
						next _update (origin)
					catch e
						error_count += 1
						error ("Network propagation failed at cell", next address, ":", e, __scope__)
				elif (not next_network cycle) or (next_network cycle hasEnded)
					# NOTE: It is SUPER important to test for next_network cycle hasEnded,
					# as otherwise we might re-trigger successors many times as the
					# event propagates across networks. That's because the successor
					# finds ALL successors, event from other networks. So if the foreign
					# cell has already been updated, all the networks need to know (using the
					# cycle origins list). Arguably, a #TIMESTAMP might be a better option here.
					if isDebugging
						console log ("● `" + next address + "` crosses network boundaries, updated successor of `" + origin localAddress + "` #" + (i + 1) + "/" + cycle successors length)
					# It's a foreign cell with a network that has no cycle, so we temporarily
					# share the cycle with the other network.
					# NOTE: We don't mind the reference leaking after the end, it
					# has a `hasEnded` flag that the foreign network will detect
					# and cleanup the reference upon next update.
					next_network cycle = cycle
					try
						next _update (origin)
					catch e
						error_count += 1
						error ("Network propagation failed at cell", next address, ":", e, __scope__)
				elif next_network cycle is cycle
					if isDebugging
						console log ("● Updating in-cycle foreign cell `" + next address + "` (same cycle) as successor of `" + origin address + "` #" + (i + 1) + "/" + cycle successors length)
					# It's a foreign cell whose network cycle is this current cycle
					try
						next _update (origin)
					catch e
						error_count += 1
						error ("Network propagation failed at cell", next address, ":", e, __scope__)
				else
					if isDebugging
						console log ("● Updating out-of-cycle foreign cell `" + next address + "` as successor of `" + origin address + "` #" + (i + 1) + "/" + cycle successors length)
					# NOTE: Not sure if we should handle this case differently
					# It's a foreign cell whose network cycle IS NOT this current cycle
					try
						next _update (origin)
					catch e
						error_count += 1
						error ("Network propagation failed at cell", next address, ":", e, __scope__)
				i += 1
			# We set the `hasEnded` to True as the cycle might be shared with
			# other networks.
			cycle hasEnded = True
			let l = cycle inhibited
			let old_cycle = cycle
			self ! "Update" (old_cycle)
			# We execute the inhibited callbacks
			while l length
				l pop 0 ()
			if isDebugging
				if error_count == 0
					console log ("%c□ cells.Network[" +  name + "]#" + cycles + " complete.", "color:#A0A0A0")
				else
					console warn ("□ cells.Network[" +  name + "]#" + cycles + " complete with " + error_count + " errors.")
				console groupEnd ()
		elif cell is? Array
			# We have an array and we're within a cycle, so we dispatch all
			# of them.
			if isDebugging
				console log ("◌ In-cycle cell group",(cell ::= {_ localAddress}),"is going to be dispatched individually")
			cell :: {_propagateNetworkChanges (_)}
		elif cell is cycle cell or cell in cycle origins
			if isDebugging and cell is not cycle cell
				console log ("◌ Cell `" + cell localAddress + "` already updated, flagging as inhibited")
			# TODO: Disabled for now, but would allow to resume an interrupted propagation.
			# if cell not in cycle inhibited
			# 	cycle inhibited push (cell)
		elif cell not in cycle successors
			# NOTE: This is an IMPORTANT CASE: some cells might implicity affect
			# other cells throught their action or reducer (by setting another cell), 
			# which results in cells being updated within an existing update cycle,
			# but with no prior explicit edge defined in the network to indicate the
			# dependency.
			#
			# So here we need to mutate the list of successors with any successor
			# that is not already in the list of successors.
			if isDebugging
				console group ("◌ `" + cell localAddress + "` asked to propagate, but not in cycle")
			# We want to make sure that the cell is part of this network
			if cell parent == self
				let s_o = Successors (cell)
				for next, i in s_o[0]
					if isDebugging
						console log ("⊕ `" + next localAddress + "` added to cycle at position #" + (cycle successors length + 1))
						if next in cycle successors
							console warn ("Cell `" + next address + "` is triggered more than once in this cycle, you should batch the cell updates")
					# We won't do anything if it's already been scheduled
					let j = indexOf (cycle successors, next)
					if j >= 0
						# We don't complain about the last successor being added twice unless it's already
						# been updated.
						if j <= cycle step
							# But we do when a successor is added twice, as it might create a loop
							# NOTE: There are some legit cases where this might happen, but I'm leaving 
							# it here as we need to investigate.
							warning ("Trying to add successor `" + next address + "` of `" + cell address + "` again into", cycle successors ::= {_ address}, __scope__)
					else
						# We push the successors as well as the origin
						cycle successors push (next)
						# NOTE: It is very important to push the origin as well.
						cycle origins    push (s_o[1][i])
			# Otherwise it's an update from a foreign network, so we don't do anything
			# as the request is going to reach the foreign network, which might not
			# be currently in a cycle.
			else
				if isDebugging
					console log ("⊕ `" + next localAddress + "` detected as foreign cell implicit update, ignoring update request.")
			if isDebugging
				console groupEnd ()
		elif isDebugging and cell is not cycle cell
			console log ("%c◌ `" + cell localAddress + "` already updated, flagging as inhibited", "color:#A0A0A0")
			# TODO: Disabled for now, but would allow to resume an interrupted propagation.
			# if cell not in cycle inhibited
			# 	cycle inhibited push (cell)

	
	# =========================================================================
	# FACTORY
	# =========================================================================

	@method input value=Undefined
		warning ("`input` is deprecated, use `value`", __scope__)
		return self value (value)

	@method value value=Undefined
		return _add (new Value (self, value))

	@method reduce cells
		return _add (new Reducer (self) takes (cells))

	@method combine cells
		return _add (new Combinator (self) combine (cells))

	@method list value=Undefined
		return _add (new List (self) set (value))

	@method map value=Undefined
		return _add (new Map (self) set (value))

	@method signal effect=Undefined
		return _add (new Signal (self, effect))

	@method throttle cells, delay=Undefined
		return _add (new Throttle (self, delay) takes (cells))

	@method delay cells, delay=Undefined
		return _add (new Delay (self, delay) takes (cells))

	# =========================================================================
	# EXPORT
	# =========================================================================

	# TODO: This should be wrap () or something like that.
	@method state cells=None, res={}
	| Return an object that wraps this network, the given list of cells
	| (which will be added to the network), and offers a `get()` method
	| to output the state.
		let c   = {}
		# We patch the result object with network properties
		res _network = self
		res atomic = {self atomic (_)}
		res get = {return c ::= {return Cell Unwrap (_)}}
		res set = {
			self inhibit ()
			_ :: {v,k|
				if res[k]
					res[k] set (v)
				else
					warning ("Network does not define cell `" + k + "`:", res _network, __scope__)
			}
			self release ()
			return res
		}
		# We bind the cells
		for v,i in self cells
			if v name
				res[v name] = v
				c[v name]   = v
		# And now we update them
		for v,k in cells
			v setParent (self)
			v id = k ; v as (k)
			self _add (v)
			res [k] = v
			c   [k] = v
		return res

	@method validate
	| Ensures that all nodes are properly linked an reachable
		let res   = {
			notInInputOutput:[]
			notInOutputInput:[]
			notInSuccessors :[]
		}
		let to_visit   = [] concat (cells)
		let visited    = []
		let successors = Successors (cells)
		var count      = 0
		# Verifies that _inputs and _outputs match
		while to_visit length > 0
			let a  = to_visit pop ()
			visited push (a)
			for b in a _inputs
				if a not in b _outputs
					res notInInputOutput push {node:b, missing:a}
					count     += 1
				if (b not in visited) and (b not in to_visit)
					to_visit push (b)
			for b in a _outputs
				if a not in b _inputs
					res notInOutputInput push {node:b, missing:a}
					count     += 1
				if (b not in visited) and (b not in to_visit)
					to_visit push (b)
		for a in visited
			if a not in successors
				res notInSuccessors push (a)
				count += 1
		if count == 0
			return None
		else
			return res ::? {return len(_) > 0}

	@method toJSON
		return cells reduce ({r,e,i|
			r[e name or i] = e toJSON ()
			return r
		}, {})
	
	# FIXME: Should be the same proptotype
	@method getReachableCells cells=self cells, forward=True, backward=True
	| Returns a breadth-first walk of all the nodes reachable from the 
	| given nodes. This takes into consideration both inputs and outputs,
	| unless `forward` is False (no outputs) or `backward` is False (no inputs).
		let visited  = []
		let to_visit = [] concat (cells) ; to_visit reverse ()
		while to_visit length > 0
			let node = to_visit pop ()
			visited push (node)
			if forward
				for n in node _outputs
					if n not in to_visit and n not in visited
						to_visit push (n)
			if backward
				for n in node _inputs
					if n not in to_visit and n not in visited
						to_visit push (n)
		return visited

	@method toGraphViz
	| Returns a GraphViz source code that can be used to represent the
		# SEE: https://graphs.grevian.org/example
		# SEE: graphviz.christine.website
		# SEE: https://dreampuf.github.io/GraphvizOnline/
		let network_edges = {}
		let network_cells = {}
		let networks      = {}
		let to_visit      = getReachableCells ()
		let successors    = Successors  (cells)
		var offset        = 0
		for a in to_visit
			networks[a _parent id] = a _parent
			network_edges[a _parent id] ?= []
			network_cells[a _parent id] ?= []
			let le = network_edges[a _parent id]
			let lc = network_cells[a _parent id]
			lc push ("N" + a id + "[label=\"" + a name + " (" + a id + ")\"];")
			for b in a _outputs
				let i = successors[0] indexOf (b)
				le push ("N" + a id + " -> N" + b id + "[label=\"" + offset + " (" + i  + ")\"];")
				offset += 1
		let res = ["digraph {"]
		for l,nid in network_cells
			res push ("\tsubgraph cluster_G" + nid + "{") 
			res push ('\t\tlabel="'  + (networks[nid] name or nid) + '";')
			l                  :: {res push ("\t\t" + _)}
			res push ("\t}")
		for l,nid in network_edges
			l :: {res push ("\t" + _)}
		res push "}"
		return res join "\n"

# -----------------------------------------------------------------------------
#
# DSL
#
# -----------------------------------------------------------------------------

@singleton DSL
| A simple DSL to describe cell networks. The DSL takes network definitions
| like this one:
|
| ```
| let n = network {
| 	nodes: {
| 		"-inputs:value" : {
| 			"a": 0
| 			"b": 0
| 		}
| 		"-outputs" : {
| 			"total:reducer|init,always":{_ a + _ b}
| 		}
| 	}
| 	edges : [
| 		"{a,b}->total|throttle:100"
| 	]
| }
| ```

	# FIXME: When the network is defined and has a `*->render` edge, the cells
	# that might be monkey-patched (like in the `components.editor` module)
	# won't be registered in the `*`, leading to subtle bugs.
	# FIXME: Allowed should be based on type.
	@property allowed = ["returns", "effect", "does", "delay", "value", "init", "compare", "comparator", "iterate", "update"]

	@property factory = {
		combine  : {new Combinator (_)}
		delay    : {new Delay      (_)}
		value    : {new Value      (_)}
		input    : {warning (":input cell type is deprecated, use :value", __scope__);new Value   (_)}
		list     : {new List       (_)}
		map      : {new Map        (_)}
		observe  : {new Observer   (_)}
		reducer  : {warning (":reducer cell type deprecated, use :reduce", __scope__);new Reducer  (_)}
		reduce   : {new Reducer    (_)}
		signal   : {new Signal     (_)}
		throttle : {new Throttle   (_)}
	}

	@method _normalizeNodes nodes
	| Returns a normalized `Map[str,{attr,value}]` extracted from the
	| network.
		let res = {}
		for node_or_group, k in nodes
			let group = node_or_group if k[0] == "-" else {(k):node_or_group}
			for value,node_name in node_or_group
				let i    = node_name indexOf ":"
				let name = node_name[0:i]  if i >=0 else node_name
				let attr = node_name[i+1:] split "|" if i >=0 else []
				res[name] = {attr,value}
		return res

	@method _mergeNodes network, parent
		if not network
			return None
		parent ?= network ["extends"]
		if not parent
			return network nodes
		else
			# We need to extract all the nodes and normalize them,
			# indexing them by node name. Nodes can be nested in groups
			# and can have different suffixes, so we need to make
			# sure we account for that.
			let parent_nodes  = _normalizeNodes(parent  nodes) 
			let network_nodes = _normalizeNodes(network nodes) 
			for node_info,node_name in parent_nodes
				let existing_node = network_nodes[node_name]
				if existing_node
					existing_node value ?= node_info value
					existing_node attr  ?= []
					# We only merge attributes if they were not already
					# listed
					for attr in node_info attr
						if attr not in existing_node attr
							existing_node attr push (attr)
				else
					network_nodes[node_name] = node_info
			# This returns a normalized version
			return network_nodes ::> {r={},v,k|
				let attr  = _normalizeAttrList (v attr) join "|"
				let key   = k + ":" + attr if attr length > 0 else k
				r[key]    = v value
				return r
			}
	
	@method _normalizeAttrList attr
	| The attribute list might have more than one type, so we make sure
	| type is first and then we have the rest.
		return as_list(concat (
			first(attr, {factory[_]})
			attr ::? {not factory[_]}
		))

	@method _mergeEdges network
		if not network
			return None
		# NOTE: We need to be mindful of crappy minifiers
		let parent = network ["extends"]
		if parent
			let f  = {group(_, {_ split "->" [-1]})}
			return flatten(values(core_merge(core_merge ({}, f(network edges)), f (parent edges))))
		else
			return network edges

	@method define description, defaultNodes={}, network=new Network ()
	| Processes the `{nodes,edges,name}` definition for the network, returning
	| the new network, complete with cells and their inputs mapped.
	|
	| Note that since `2018-09-18`, defining a network does not autoamically
	| update its cells, you should call `network update()` after.
		# We create the network, merging the definition from the parents if necessary
		description = core_merge ({
			nodes : _mergeNodes (description)
			edges : _mergeEdges (description)
		}, description)
		network as (description name) if description and description name
		# We instanciate the nodes
		let nodes = parseNodeGroup (network, description nodes if description else None, parseNodeGroup (network, defaultNodes))
		# we get a list of edges and feed them as inputs to the nodes
		(description edges ::> {r,edge|parseEdgeDefinition (network, nodes, edge, r)}) ::= {inputs,name|
			let cell = nodes[name]
			match cell
				is? TConsumer
					cell takes (inputs)
				else
					error ("Cell `" + name + "` of `" + description name + "` should be a consumer, is " + typename(type(cell)), __scope__)
		}
		return network

	@method parseNodeGroup network, group, result={}, defaultType=Undefined
		return (group ::> {r,v,k|
			r  ?= result or {}
			if k is? String and (k[0] == "-" or k[0] == "_")
				let t = k split ":" [1] or defaultType
				parseNodeGroup (network, v, result, t)
			else
				let cell     = parseNodeDefinition (network, k, v, defaultType)
				initializeNode (cell, v)
				r[cell name] = cell
			return r
		}) or result

	@method parseNodeDefinition network, text, value, defaultType=Undefined
	| Parses a node definition like
	|
	| `NAME:TYPE|OPTION,OPTION‥`
		# We extract the name, type and options
		var name,type = text split ":"
		if type is Undefined
			if defaultType
				type = defaultType
			elif value is? Function
				type = "reduce"
			else
				type = "value"
		let type_options = type split ("|")
		type = type_options[0]
		let options = ((type_options[1] or "") split ",") ::= {_ trim ()}
		assert (factory[type], "Unrecognized cell type: `" + type + "`, expecting one of ", keys(factory))
		# We instanciate the cell
		let cell = factory[type](network) as (name)
		# We set the options
		for o in options
			match o
				== "force"
					cell alwaysPropagates = True
				== "always"
					cell alwaysPropagates = True
				== "init"
					# NOTE: This is only for reducers
					cell isDirty = True
				== "clean"
					# NOTE: This is only for reducers
					cell isDirty = False
				_
					error ("Unknown option in cell", text, ": ", o, __scope__)

		# We add the cell to the network
		network _add (cell)
		return cell

	@method initializeNode cell, options
	| Initializes the given cell with the given options
		if options is? Object and (not (options is? Function)) and  difference(keys(options), allowed) length == 0
			cell isInhibited = True
			for v,k in options
				match k
					== "returns"
						cell returns (v)
					== "effect"
						cell effect (v)
					== "value"
						cell set (v)
					== "proxy"
						cell proxy (v)
					== "fuse"
						cell fuse (v)
					== "delay"
						cell delay (v)
					== "does"
						cell does (v)
					== "init"
						v (cell value)
					== "comparator"
						cell comparator (v)
					== "compare"
						cell comparator (v)
					== "combines"
						assert (cells is? Comparator, "combines can only be used with Comparator cell, got", typename(cell), __scope__)
						cell combines (v)
					else
						error ("Cell", cell localAddress, "received unsupported option: ",  k, __scope__)
			cell isInhibited = False
		elif options is not Undefined
			cell isInhibited = True
			match cell
				is? Value
					# NOTE: We force a proxing if we're passing a cell
					if options is? Cell
						cell proxy (options)
					else
						cell set (options)
				is? List
					if options is? List
						cell proxy (options)
					else
						cell set (options)
				is? Map
					if options is? Map
						cell proxy (options)
					else
						cell set (options)
				is? Reducer
					cell returns (options)
				is? Observer
					cell set (options)
				is? Combinator
					cell combines (options)
				is? Signal
					cell effect (options)
				is? Throttle
					cell delay (options)
				is? Delay
					cell delay (options)
				else
					error (BadArgument, cell, "cell", [Value,List,Map,Reducer,Signal], __scope__)
			cell isInhibited = False
		return cell

	@method parseEdgeDefinition network, nodes, text, inputs={}
	| Parses an edge definition like
	|
	| ```
	| SOURCE (-> NODE)* -> END
	| ```
	|
	| Where `END` must be an existing node name, and `SOURCE` might
	| be an existing node name, or `{N,N,‥}` or `[N,N,‥]`
		let steps    = text split "->"
		var incoming = parseNodeSet(nodes, steps[0])
		for outgoing, i in steps[1:]
			assert (nodes[outgoing], "Cell `" + outgoing + "` referenced but not declared")
			# In case we had a `*`, we make sure to remove the current destination cell
			if incoming == nodes
				incoming = incoming ::? {_ != nodes[outgoing]}
			if inputs[outgoing]
				inputs[outgoing] = inputs[outgoing] match
					is? Array
						inputs[outgoing] concat (values(incoming))
					is? Object and incoming is? Array
						values(inputs[outgoing]) concat (incoming)
					is? Object and incoming is? Object
						core_merge(inputs[outgoing], incoming)
					else
						error ("Unsupported branch", inputs[outgoing], ",", incoming, __scope__)
			else
				inputs[outgoing] = incoming
			# And we update the incoming
			incoming = [nodes[outgoing]]
		return inputs

	@method parseEffects network, effects
	| Takes a strings formatted like `EFFECT:PARAMS|EFFECT:PARAMS…` and returns
	| an array of cells initiliazed like that.
		if not effects
			return None
		res = []
		for effect in effects split "|"
			let name, params = split (effect, ":")
			let cell = factory[name](network) if factory[name] else None
			if not cell
				error ("Could not find factory entry for cell type: '" + name + "' in effect", effect, __scope__)
			else
				res push (cell)
		return res

	@method parseNodeSet nodes, text
	| A nodeset is like `{NODE,‥}|[NODE,‥]|(NODE,)|NODE`. This returns the
	| expanded node set.
		text = text trim ()
		if text == "*"
			return nodes
		let s = text[0]
		let e = text[-1]
		if s == "{" and e == "}"
			return text[1:-1] split "," ::> {r,e|e=e trim ();r?={};r[e]=_getNode(nodes,e);r}
		elif s == "[" and e == "]"
			return text[1:-1] split "," ::= {_getNode(nodes,_ trim ())}
		elif s == "(" and e == ")"
			return text[1:-1] split "," ::= {_getNode(nodes,_ trim ())}
		else
			return nodes[text]

	@method _getNode nodes, key
		let n = nodes[key]
		if not n
			error (MissingEntry, key, nodes, __scope__)
		else
			return nodes[key]

# -----------------------------------------------------------------------------
#
# API
#
# -----------------------------------------------------------------------------

@function network description=Undefined
| Alias to #Network.constructor
	if description
		return DSL define (description)
	else
		return new Network ()

@function wrap value
| Wraps the given @value in a cell of the corresponding type. Alias to #Cell.Wrap
	return Cell Wrap (value)

@function unwrap value
| Alias to #Cell.Unwrap
	return Cell Unwrap (value)

# EOF
