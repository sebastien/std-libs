@feature sugar 2
@module  std.patterns.components
| A collection of common traits that can be weaved in by components.

@import  list from std.core
@import  assert,warning from std.errors
@import  Network from std.state.cells
@import  Screen from std.ui.interaction

# NOTE: The pattern used in these traits is to defined an `initTRAIT_NAME` 
# method that needs to be called at init, which performs some validation
# and/or initialization.

# -----------------------------------------------------------------------------
#
# RESIZABLE
#
# -----------------------------------------------------------------------------

@trait TResizable
| A resizable component will binds to the screen's resize event and
| invokes `measure()`, setting the `hasResized` flag.

	@method initResizable
		bindResizeable ()

	@method disposeResizable
		unbindResizeable ()

	@method bindResizeable
		Screen !+ "Resize" (self . onResize)

	@method unbindResizeable
		Screen !- "Resize" (self . onResize)

	@method onResize
		hasResized = True
		self measure ()

# -----------------------------------------------------------------------------
#
# EDITABLE
#
# -----------------------------------------------------------------------------

@trait TEditable
| A resizable component will binds to the screen's resize event and
| invokes `measure()`, setting the `hasResized` flag.

	@getter isEditable
		return True

	@method initEditable
		assert (getInputCell  (), "Editable input  cell is missing in:", self name)
		assert (getOutputCell (), "Editable output cell is missing in:", self name)
		assert (getEditedCell (), "Editable edited cell is missing in:", self name)

	@method getInputCell
		return self state input

	@method getOutputCell
		return self state output

	@method getEditedCell
		return self state edited

# -----------------------------------------------------------------------------
#
# COMPOSED NETWORK
#
# -----------------------------------------------------------------------------

@trait TComposedNetwork
| A composed network component will have a set dynamic set of components
| with bound to a dynamic cell network, which is then bound to an
| output value cell.
|
| Typically, a composed network requires:
| - A `network` reducer cell that takes the fields like `[{name:}]`
| - A `value` reducer cell that takes the combined output of the
|   composed network's cells

	@method initComposedNetwork
		assert (getComposedOutputCell (), "Composed network component should defined either a `value` or an `edited` cell:", self name)

	@method reduceNetwork fields, network=new Network ()
	| The reducer that creates/updates the composed network based
	| on the list of `fields`. This remaps fields to cells and ensures
	| that the output value cell takes all the network cells as input.
		let existing_cells = network cells ::= {_ name}
		let all_cells      = fields ::= {_ name}
		let new_cells      = all_cells      ::? {_ not in existing_cells}
		let removed_cells  = existing_cells ::? {_ not in all_cells}
		for name in removed_cells
			let c = network remove (name)
			if not c 
				warning ("Could not find cell", name, "in", self name)
			else
				c detach ()
		for name in new_cells
			network value () as (name)
		getComposedOutputCell () takes (network cells ::> {r={},v|r[v name] = v;r})
		return network

	@method reduceValue values
	| Reduces the values, returned as-is
		# NOTE: We might want to process the values here.
		return values

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method bindComponentToCell component, cell
	| Binds the given component to the given cell, by extracting the
	| component's output cell.
		assert (cell, "No cell to bind to")
		cell proxy (getComponentOutputCell(component))

	@method unbindComponentFromCell component, cell
	| The opposite of `bindComponentToCell`
		assert (cell, "No cell to bind to")
		cell unproxy (getComponentOutputCell(component))

	@method getComponentOutputCell component
	| Returns the output value cell for the given component.
		let res = component getOutputCell () if component isEditable else component state value
		assert (res, "Component", component type, "has no output or value cell.")
		return res

	@method getComposedOutputCell
	| Returns this component's composed output cell (`value` by default)
		# NOTE: Not sure if edited is good, but it's the default
		# for editables.
		return self state edited or self state value

	@method getComposedNetwork
	| Returns this comopnents composed network cell (`network` by default)
		return self state network value

# EOF - vim: ts=4 sw=4 noet
