@feature sugar 2
@module std.util.diffing
| The delta module implements a set of classes to create `Delta` objects
| and interpret them in different contexts.

@import NotImplemented, NotSupported, BadArgument from std.errors

# TODO: This module should be moved to `std.util`

@enum Action  = Add | Set | Insert | Remove | Swap | Reorder
@type Delta   = {action:Action, subject:Any, object:Any, qualifier:Any}
@type Address = {slots:List}
@type Value   = {value:Any}

# -----------------------------------------------------------------------------
#
# MODEL
#
# -----------------------------------------------------------------------------

@class DeltaFactory
| Factory for *delta* objects, to be used by data structures/models/APIs that
| wish to implement delta-tracking.

	@method value:Value value:Any
		return new Value (value)

	@method address:Address args‥
		return new Address (args)

	@method change:Delta action:Action, subject:Any, object:Any, qualifier:Any=Undefined
		return (action, subject, object, qualifier)

# -----------------------------------------------------------------------------
#
# UPDATER
#
# -----------------------------------------------------------------------------

@class Updater
| Defines the abstract implementation for an updater. Updaters interpret
| *deltas* and create side-effects accordingly.

	@method apply data:Any, change:Delta
		change match
			.action is Add     → _applyAdd     (data, change)
			.action is Set     → _applySet     (data, change)
			.action is Insert  → _applyInsert  (data, change)
			.action is Remove  → _applyRemove  (data, change)
			.action is Swap    → _applySwap    (data, change)
			.action is Reorder → _applyReorder (data, change)

	@group operations

		@method _applyAdd data:Any, change:Delta
			data match
				is? Array → _addArray (change, data)
				else      → throw new BadArgument (data)

		@method _applySet data:Any, change:Delta
			data match
				is? Array  → _setArray (change, data)
				is? Object → _setObject (change, data)
				else       → throw new BadArgument (data)

		@method _applyRemove data:Any, change:Delta
			data match
				is? Array  →  _removeArray (change, data)
				is? Object → _removeObject (change, data)
				else       → throw new BadArgument (data)

		@method _applyInsert data:Any, change:Delta
			data match
				is? Array K → _insertArray (change, data)
				else        → throw new BadArgument (data)

		@method _applySwap data:Any, change:Delta
			throw NotImplemented

	@group add

		@method _addArray data:Any, change:Delta
			throw NotImplemented

	@group set

		@method _setArray data:Any, change:Delta
			throw NotImplemented

		@method _setObject data:Any, change:Delta
			throw NotImplemented

	@group remove

		@method _removeArray data:Any, change:Delta
			throw NotImplemented

		@method _removeObject data:Any, change:Delta
			throw NotImplemented

	@group insert

		@method _insertArray data:Any, change:Delta
			throw NotImplemented


# -----------------------------------------------------------------------------
#
# DATA UPDATER
#
# -----------------------------------------------------------------------------

@class DataUpdater: Updater

	@method _addArray data:Any, change:Delta
		data push (change)

	@method _setArray data:Any, change:Delta
		data [change qualifier] (change value)

	@method _setObject data:Any, change:Delta
		data [change qualifier] (change value)

	@method _removeObject data:Any, change:Delta
		remove (data, change qualifier)
