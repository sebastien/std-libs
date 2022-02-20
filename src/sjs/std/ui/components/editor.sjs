@feature sugar 2
@module std.ui.components.editor
@import merge                               from std.core
@import error,warning,assert,NotImplemented from std.errors
@import Future                              from std.io.async
@import Keymap,Focus,Keyboard               from std.ui.interaction
@import Component, load, instanciate        from std.ui.components
@import Measure, Update                     from std.api.dom
@import runtime.window as window


# TODO: Refactor - active should be isActive

# TODO: Feature - shown as a dialog, tooltip, or embedded
# TODO: Feature - detect the best placement taking into consideration a rectangle (the screen) like a tooltip

# NOTE: It's interesting here how there is opportunity to use an adapter-like
# pattern to make the trait independent from a class. In this case, the editor
# trait implicitly requires the base class to be a Component or at least offer
# similar features.

@class Editor: Component
| A specialized component that offers the following features:
|
| - `edit(options,node?)` to start the editing process, returns a future
|    holding the result when it is set.
|
| - `apply()` and `cancel()` to save or cancel the editing operation.
|
| - Supports a custom `keymap`
|
| It augments the component with the following features:
|
| - An `active` inputs cell telling wether the editor is active or not.
|
| Editors support the following ways of being mounted:
|
| - `modal`, where the editor is expected to be displayed as a modal dialog.
| - `cover`, where the editor is expected to be display as a modal dialog
|    covering a specific node, so that the editor appears on top of the edited
|    node.
| - `anchor` is like `cover` but does not touch width or height
| - `inplace`, where the editor substitutes itself with edited node.
| - `inline`, where the editor is simply left where it is declared

	@shared   EDITORS = {}

	@operation Load name
	| Loads the editor with the given name and registers it in the
	| `Editor.EDITORS` collection.
		if not EDITORS[name]
			EDITORS[name] = load (name) chain {
				let n = window document createElement "div"
				n setAttribute ("class", "editor")
				n setAttribute ("data-name", name)
				return instanciate (_ model, _ view, n, name)
			}
		return EDITORS[name] chain ()

	@property options        = {}
	@property _resultFuture  = None
	@property _previousStyle = None

	@property keymap      = new Keymap {
		ESC   : {onESC()    ;return False}
		ENTER : {onEnter()  ;return False}
	} as "editor"

	@method bindNetwork network, render
	| Adds the following cells to the network, if not already defined:
	|
	| - `active`: tells if the editor is active or not.
	| - `mode`: the rendering mode, can be `cover`, etc
	| - `value` the input value
	| - `edited`: the edited value
	| - `output`: the result, after editing the value
	| - `offset`: the offset used for the rendering mode
	| - `mountOn`: the node on which the editor should be mounted (optional)
	| - `focusOn`: the node on which the editor should focus on (optional)
	| - `anchor`:  the node on which the editor should focus on (optional)
		super bindNetwork (network, render)
		let render_cell = network cell "render"
		# We make sure that the active cell triggers a re-render, it's not
		# so important for the other cells.
		if not (network has "active")
			render_cell takesMore (network value (False) as "active")
		if not (network has "mode")
			network value ("cover") as "mode"
		if not (network has "value")
			network value (None) as "value"
		if not (network has "offset")
			network value ([0,0]) as "offset"
		if not (network has "edited")
			network value (Undefined) as "edited"
		if not (network has "mountOn")
			network value (Undefined) as "mountOn"
		if not (network has "focusOn")
			network value (Undefined) as "focusOn"
		if not (network has "anchor")
			network value (Undefined) as "anchor"
		if not (network has "output")
			network signal () as "output"
		let active = network cell "active"
		if not active _action
			active does (onActiveUpdated)

	# =========================================================================
	# GETTER
	# =========================================================================

	@getter isActive
		return state active value

	# =========================================================================
	# EDITING CYCLE
	# =========================================================================

	@method edit options
	| Tells the editor to start a new edit cycle. The `options`
	| allow to pass editing options, usually `{mode,focusOn,mountOn}` and the
	| `mountOn` specifies a node the editor should be mounted on in
	| case it requires (for instance, `cover` and `anchor` modes will
	| require the editor to be mounted on a top-level node). In most
	| cases, you won't need to specify it.
	|
	| The `edit` method returns a *future* that will hold the edited
	| value once applied. The future will be canceled if the editor
	| is cancelled as well.
		# If the editor is already active, we close it. This used to
		# yield an error, but we just close the editor now, as it's
		# the most common behaviour.
		if state active value
			close ()
		# Set the active state
		if _resultFuture
			_resultFuture fail ()
		_resultFuture = new Future ()
		network inhibit ()
		# NOTE: We now have reset as an optional step
		if options and (options reset is not False)
			reset ()
		configure (options)
		state active set (True)
		network release ()
		# FIXME: This should probably be Layout if it's a custom
		# event.
		window addEventListener ("layout", self . measure)
		# We set the value and render
		render ()
		return _resultFuture

	@method configure options
	| Can be overriden by subclasses to configure the editor
	| before an edit.
		network atomic {
			options :: {v,k|
				if state[k]
					state[k] set (v)
				elif k == "reset"
					# 'reset' has a special treatment
					pass
				elif v is not Undefined
					warning ("Editor", name, "passed option", k, "=", v, "that is not defined in its state", __scope__)
			}
		}

	@method reset
	| Can be overriden, does not thing for now

	@method apply value=Undefined
	| Applies the current value to the future's result.
		if value is not Undefined
			state output set (value)
		if not isActive
			warning ("Editor", address, "is not active", __scope__)
		else
			# assert (result, "Editor must have a result")
			if _resultFuture
				_resultFuture set (getEditedValue ())
			close ()
	
	@method save
		apply ()

	@method cancel
	| Closes without updating the result's future.
		if not isActive
			warning ("Editor", address, "is not active", __scope__)
		else
			# assert (result, "Editor must have a result, which means closed was already called")
			if _resultFuture and not _resultFuture isFinished
				_resultFuture cancel ()
			close ()

	@method close
		if not state active value
			return False
		window removeEventListener ("layout", self . measure)
		# We fail the result if not succeeded
		if _resultFuture and not _resultFuture isSuccess
			_resultFuture fail ()
		# We clear the result
		_resultFuture = None
		# Set the state as inactive
		state active set (False)
		# Clear the mounted on node
		let mounted_on = state mountOn value
		if mounted_on
			let n = getMountedNode ()
			if n parentNode is mounted_on
				mounted_on removeChild (n)
			state mountOn set (None)
		return True

	@method getEditedValue
		return state output value

	@method getMountedNode
	| Returns the node corresponding to the editor, which is either
	| `nodes.editor` or `node`. The `editor` node is useful when
	| the editor node should be detached from the editor parent.
		return nodes editor or node

	# =========================================================================
	# HANDLERS
	# =========================================================================

	@method onESC
		cancel ()

	@method onEnter
		apply ()

	@method onActiveUpdated cell
		# We centralize the management of the focus state to prevent
		# inconsistencies when the editor is not used through the 
		# edit method.
		if cell value
			cache focused ?= 0
			cache focused += 1
			# We push the focus and the keymap
			Focus pushContext ()
			Keymap Push (keymap) if keymap
		else
			if cache focused > 0
				# Pop the focus and keymap
				Focus popContext ()
				Keymap Pop (keymap) if keymap
				cache focused -= 1

	# =========================================================================
	# RENDERING
	# =========================================================================

	@method measure
		let mode = state mode value if state mode else "cover"
		# We need to mount the editor content first so that the measuring works.
		let mounted_on = state mountOn value
		if mounted_on
			# If we have a `mountOn` node (setup by edit), then we make sure
			# the content is added to the `mountOn` node
			let n = getMountedNode ()
			if n parentNode != mounted_on
				mounted_on appendChild (n)
		let focus_on = state focusOn value
		mode match
			== "cover"
				_editorCover  (focus_on)
			== "anchor"
				_editorAnchor (focus_on)
			== "inline"
				_editorInline ()
			== "fixed"
				_editorFixed ()
			==  "mount"
				_editorMount ()
			== "inplace"
				error (NotImplemented)
			else
				_editorReset ()

	@method _editorCover coverNode
		if not coverNode
			return None
		let p = Measure bounds  (coverNode)
		let o = state offset value or [0,0]
		let x = p[0] + (o[0] or 0)
		let y = p[1] + (o[1] or 0)
		return _applyStyle {
			position : "absolute"
			left     : x + "px"
			top      : y + "px"
			width    : p[2] + "px"
			height   : p[3] + "px"
		}

	@method _editorAnchor targetNode
		if not targetNode
			return None
		# TODO: Support editor anchor
		let n = nodes editor or node
		let o = state offset value or (0,0)
		let a = state anchor value or ("N","S")
		let o_target = Measure anchor    (a[0], targetNode)
		let o_editor = Measure relanchor (a[1], n)
		let x = (o[0] or 0) + o_target[0] - o_editor[0]
		let y = (o[1] or 0) + o_target[1] - o_editor[1]
		return _applyStyle ({
			position : "absolute"
			left     : x + "px"
			top      : y + "px"
		}, n)

	@method _editorInline
		let o = state offset value or (0,0)
		let x = o[0] or 0
		let y = o[1] or 0
		return _applyStyle {
			position : "relative"
			left     : x + "px"
			top      : y + "px"
		}
	
	@method _editorFixed
		return _applyStyle {
			position : "fixed"
			left     : "0px"
			top      : "0px"
			right    : "0px"
			bottom   : "0px"
		}

	@method _editorMount
		return _applyStyle {
			position : "unset"
			left     : "unset"
			top      : "unset"
			right    : "unset"
			bottom   : "unset"
		}

	@method _editorReset node=getMountedNode()
		if node
			let s = node style
			_previousStyle :: {v,k|s[k] = v}
			_previousStyle = None

	@method _applyStyle properties, node=getMountedNode()
		if node
			let s = node style
			_previousStyle = properties ::= {v,k|s[k]}
			Update style (node, properties)
		else
			warning ("Editor has no node", node)
			_previousStyle = None
		return node
# EOF
