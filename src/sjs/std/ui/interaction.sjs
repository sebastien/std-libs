@feature sugar 2
@module  std.ui.interaction
| Provides abstractions to manage interaction with a wide range of devices,
| including mouse, keyboard, screen and touch. The module also provides
| objects that represent complex interactions such as gestures.

@import  removeAt, unique  from std.collections
@import  bool, list, len, json, type, subtype, typename from std.core
@import  NotImplemented, BadArgument, MissingEntry, assert, error, warning from std.errors
@import  TIdentified from std.patterns.ids
@import  TSingleton  from std.patterns.oo
@import  TOptions   from std.patterns.options
@import  capitalize from std.text
@import  Traversal  from std.api.dom
@import  Features, API from std.api.browser
@import  runtime.window as window

# SEE: https://github.com/WICG/EventListenerOptions/blob/gh-pages/explainer.md

@enum    Position  = SCREEN  | PAGE | WINDOW
@enum    Unit      = PIXELS  | CM
@enum    Phase     = INITIAL | END
@enum    Modifiers = ALT | SHIFT | CTRL | META

@shared  SWALLOW   = {_ preventDefault  ();False}
@shared  STOP      = {_ stopPropagation ();False}
@shared  BLOCK     = {_ preventDefault () ; _ stopPropagation ();False}

# TODO: Add capture/bubble support
# TODO: Ensure the use case where a single interaction is bound to multiple
#       objects: the state should be local to the started element target.

# -----------------------------------------------------------------------------
#
# MOUSE
#
# -----------------------------------------------------------------------------

@singleton Mouse

	# SEE: http://devdocs.io/dom/mouseevent/buttons
	# NOTE: These values are different from the event.button property. See http://devdocs.io/dom/mouseevent/button
	@property NONE   = 0
	@property LEFT  = 1
	@property RIGHT  = 2
	@property MIDDLE = 4

	@property PX_LINE_RATIO = 15
	| This value is the number of pixels per line (font-size) of the container
	| element.
	| TODO: We should actually manually get this value from the scope

	@property Up    = "mouseup"
	@property Down  = "mousedown"
	@property Move  = "mousemove"
	@property In    = "mousein"
	@property Out   = "mouseout"
	@property Wheel = "mousewheel"

	@method WheelDelta event
	| Returns the delta for the given mouse wheel event
		# TODO: Should follow a similar pattern as others with delta = [x,y]
		# FIXME: Does not work the same in FF and Chrome
		var delta    = event delta
		var delta_x  = event deltaX
		var delta_y  = event deltaY
		# If delta_x and delta_y are in lines and not pixels (FF sometimes calculates in lines)
		# SEE: http://devdocs.io/dom/wheelevent/deltamode
		if event deltaMode == 1
			# SEE: http://stackoverflow.com/questions/4571813/why-is-this-javascript-function-so-slow-on-firefox
			var px_line = PX_LINE_RATIO
			delta_y = delta_y * px_line
			# NOTE: We would assume that the X is in lines as well, but it's actually
			# not in Firefox.
			# delta_x = delta_x * px_line
		# FROM jquery.mousewheel-3.0.6
		# SEE: https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/wheel?redirectlocale=en-US&redirectslug=Mozilla_event_reference%2Fwheel
		# SEE: http://msdn.microsoft.com/en-us/library/ie/ms536951(v=vs.85).aspx
		if event detail
			delta = event detail / 3
		# NOTE: We need to do a copy as some of the event event properties
		# are immutable. Ideally, we should use the Event class.
		return [delta_x, delta_y]

	@method Has event
		return event is? window.MouseEvent

# -----------------------------------------------------------------------------
#
# TOUCH
#
# -----------------------------------------------------------------------------

@singleton Touch

	@property Start   = "touchstart"
	@property Move    = "touchmove"
	@property Cancel  = "touchcancel"
	@property End     = "touchend"

	@property _locked = 0

	# NOTE: I'm disabling these as apparently they're deprecated
	# @property Leave   = "touchleave"
	# @property Enter   = "touchenter"

	@method Has event
		return event is? window.TouchEvent

	@method Lock
		if _locked == 0
			window document addEventListener ("touchmove", SWALLOW, {passive:False, capture:True})
		_locked += 1

	@method Unlock
		if _locked == 1
			window document removeEventListener ("touchmove", SWALLOW)
		_locked = Math max (0, _locked - 1)

# -----------------------------------------------------------------------------
#
# DEVICE
#
# -----------------------------------------------------------------------------

@singleton Device

	# SEE: https://developer.mozilla.org/en-US/docs/Web/API/Detecting_device_orientation
	@property Orientation = "deviceorientation"
	@property Motion      = "devicemotion"


# -----------------------------------------------------------------------------
#
# SCREEN
#
# -----------------------------------------------------------------------------

@singleton Screen

	@property DEFAULT_DPI = 96

	@property _size
	@property _willResize

	@constructor
		# SEE: https://developer.mozilla.org/en-US/docs/Web/Events/resize
		let o = {passive:True} if Features hasPassiveEvents else False
		window addEventListener ("resize", _onResize, o)

	@getter dpi
	| Returns the DPI of the screen
		if not _dpi
			_dpi = guessDPI 10
		return _dpi

	@getter size
		if not _size
			_size = [window innerWidth, window innerHeight]
		return _size

	@method cm pixels
	| Returns the width of the given pixels in actual centimeres
		return inches (pixels) * 2.54

	@method inches pixels
	| Returns the width of the given pixels in inches
		return pixels / dpi / (window devicePixelRatio or 1.0)

	# FIXME: This does not work consistently between Chrome and Safari
	# on Retina display. Chrome would give 196dpi, while Safari would say 96.
	@method guessDPI steps=10
	| Guesses the DPIs of the current device
		var mindpi = 0
		var maxdpi = 600
		while (steps > 0 and not hasDPI(maxdpi))
			var delta = maxdpi - mindpi
			var guess = parseInt (mindpi + (delta / 2))
			if hasDPI (guess)
				mindpi = guess
			else
				maxdpi = guess
			steps -= 1
		# These are heuristics to infer the dpi when min-resolution is not
		# working (for example on Safari iOS 5)
		# SEE: http://en.wikipedia.org/wiki/List_of_displays_by_pixel_density
		return mindpi match
			== 0
				window navigator userAgent match
					.indexOf "iPhone" >= 0 → 326
					else                   → DEFAULT_DPI
			else
				mindpi

	@method hasDPI value
	| Tells if the divice has at least the given DPI resolution
		return window matchMedia ("(min-resolution: " + value + "dpi)") matches

	@method measure unit="dp"
	| Returns the dimension of the screen in the given unit (`dp`, `pc`, `in` or `cm`)
		let s   = size
		let dpi = guessDPI ()
		let dp_to_px = Math max (1.0, dpi/DEFAULT_DPI)
		match unit
			is "dp"
				return [s[0] / dp_to_px, s[1] / dp_to_px]
			is "in"
				return [s[0] / dpi, s[1] / dpi]
			is "cm"
				return [2.54 * s[0] / dpi, 2.54 * s[1] / dpi]
			else
				return s

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _onResize
		# NOTE: This is critical, needs to be fast
		if not _willResize
			_willResize = True
			window requestAnimationFrame (_doResize)

	@method _doResize
		_willResize = False
		_size       = Undefined
		self ! "Resize" ()

# -----------------------------------------------------------------------------
#
# WINDOW
#
# -----------------------------------------------------------------------------

# TODO
# @singleton Window


# -----------------------------------------------------------------------------
#
# KEYBOARD
#
# -----------------------------------------------------------------------------

@singleton Keyboard

	@property Down   = "keydown"
	@property Up     = "keyup"
	@property Press  = "press"

	# http://www.javascriptkeycode.com/
	@property codes = {
		SPACE     : 32
		TAB       : 9
		ENTER     : 13

		COMMA     : 188
		COLON     : 186
		BACKSPACE : 8
		INSERT    : 45
		DELETE    : 46
		ESC       : 27

		UP        : 38
		DOWN      : 40
		LEFT      : 37
		RIGHT     : 39

		PAGEUP    : 33
		PAGEDOWN  : 34
		HOME      : 36
		END       : 35

		SHIFT     : 16
		ALT       : 18
		CTRL      : 17
		META_L    : 91
		META_R    : 92
	}

	@method key event
	| Returns the name of the key pressed. This takes into account
	| keyboard layout and modifiers.
		# FIXME: Only works in recent Chrome & Firefox
		if event
			if  event key is not Undefined
				return event key
			elif event keyIdentifier is not Undefined
				return event keyIdentifier
			else
				return error (__scope__, "Keyboard event is expected to have either key or keyIdentifier", event)
		else
			return None

	@method code event
	| Returns the code of the key. This does not take into account
	| keyboard layout, it just returns the number of the key.
		# SEE: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
		# SEE: http://caniuse.com/#feat=keyboardevent-code
		if event
			if event keyCode is not Undefined
				return event keyCode
			else
				# So keyCode is deprecated but it's still useful!
				error ("keyCode support required", __scope__)
				return None
		else
			return None

	@method char event
	| Returns the character that would be typed by the event. This relies
	| on `Key` to work.
	|
	| Note that the often recommended `String.fromCharCode(event.keyCode)`
	| does not work as you would expect. The problem is that you can't use `keyCode` because it can
	| translate into different characters based on modifiers and
	| keyboard layout. For instance pressing 8 gives keyCode=56,
	| but pressing shift+8 gives also keyCode=56, while the
	| key is "*" on FR_CA keyboard.
		if event
			var k = key (event)
			# TODO: Alt would be String fromCharCode (event charCode)
			if len(k) == 1
				return k
			elif k is "Enter"
				return "\n"
			else
				return None
		else
			return None

	@method isControl event
		return len (key (event)) > 1

	@method hasModifier event
		return event and (event altKey or event ctrlKey)

# -----------------------------------------------------------------------------
#
# FOCUS
#
# -----------------------------------------------------------------------------

@singleton Focus
| Manages **hierarchical focus** in the current document. Bind a focusable
| node using `.bind` and it  will  receive `Focus` and `Blur` custom events, 
| along with its `.focusable` ancestors.
|
| Focusable nodes must have the `focusable` class.
|
| The `pushContext` and `popContext` methods are used to create modal Focuses,
| where the current focus is saved and won't be affected by any focus/blur
| change until the context is poped. This is useful for managing focus
| between components that do not share an ancestor node, such as editors, or
| when you want to freeze the focus status of some nodes for a while.

	@property current     = None
	@property parents     = []
	@property contexts    = []
	@property _isBound    = False
	@property _boundCount = 0

	@method Bind node, focus=Undefined
	| Provided for consistency with Keymap
		return bind (node, focus)

	@method Unbind node, focus=Undefined
	| Provided for consistency with Keymap
		return unbind (node, focus)

	@method bind node, focus=["focus", "click"]
		for _ in focus
			node addEventListener (_, self . _relayFocus )
		node addEventListener ("blur", self . _relayBlur )
		_boundCount += 1
		_ensureBound ()
		return node

	@method unbind node, focus=["focus", "click"]
		for _ in focus
			node removeEventListener (_, self . _relayFocus )
		node removeEventListener ("blur", self . _relayBlur )
		_boundCount -= 1
		if _boundCount == 0
			_ensureUnbound ()
		return node

	@method pushContext node=None
	| Pushes the current parents onto the contexts stack.
		contexts push {current, parents}
		current = node
		parents = []
		return self

	@method popContext
	| Pops the previous parents from the context stack and
	| assigns them as the current parent.
		let p   = parents
		let c   = current
		if contexts length > 0
			let cp  = contexts pop ()
			current = cp current
			parents = cp parents
			# We put the focus back to where it was
			if current
				current focus ()
			return cp
		else
			warning ("Cannot pop focus context, as there is no more contect to pop", __scope__)
			return None

	@method isInPreviousContext node
	| Tells if the node belongs to one of the previous context. In general
	| no focus/blur event will be generated if the node belongs to a previous
	| context.
		for c in contexts
			if node == c current or node in c parents
				return True

	@method set node
	| Sets the focus to the given `node` (alias to `setFocus`)
		return setFocus (node, event)

	@method setFocus node
	| Sets the focus to the given `node`. Nothing will happen if the node
	| was focused in a previous context, and any node belonging to a previous
	| context will be skipped.
		if isInPreviousContext (node)
			return None
		elif current != node
			let old_path    = [current] concat     (parents) if current else parents
			let new_parents = _getFocusableParents (node)    if node
			let new_path    = [node]    concat (new_parents) if node else []

			let to_focus    = new_path ::? {not (_  in old_path)}
			let to_blur     = old_path ::? {not (_  in new_path)}
			let to_subfocus = new_path ::? {_  in old_path}

			to_blur :: {
				self ! "Blur" (_, current)
				_    ! "Blur" (current)
				# FIXME: Oddly enough, the event bubbles up in the DOM despite bubbles being explicitely
				# specified as False.
				let ce =  API CustomEvent ("Blur", {detail:{node:_,current}, bubbles:False, composed:False})
				_ dispatchEvent (ce)
			}

			self current = node
			self parents = new_parents

			to_focus :: {
				self ! "Focus" (_, node)
				_    ! "Focus" (node)
				let ce = API CustomEvent ("Focus", {detail:{node:_,current:node}, bubbles:False, composed:False})
				_ dispatchEvent (ce)
			}

			to_subfocus :: {
				self ! "SubFocus" (_, node)
				_    ! "SubFocus" (node)
				let ce = API CustomEvent ("SubFocus", {detail:{node:_,current:node}, bubbles:False, composed:False})
				_ dispatchEvent (ce)
			}
			

	@method loseFocus node
	| Loses the focus on the given node. This does not blur the current parents,
	| as they're still indirectly focused. Only a subsequent blur can
	| do this.
		if isInPreviousContext (node)
			return None
		elif current == node and current
			self ! "Blur" (node, node)
			node ! "Blur" ()
			let ce = API CustomEvent ("Blur", {detail:{node:node}, bubbles:False})
			node dispatchEvent (ce)
			let c = current
			current = None
			return c
		else
			return None

	@method onDocumentClick event
	| Intercepts document clicks to correct the focus
		if current != event target
			let p =_getFocusableParents (event target, True)
			if p length > 0
				setFocus (p[0], event)
			else
				setFocus (event target, event)

	@method _getFocusableParents node, includeSelf=False
	| Returns the list of focusable parents, that is `.focusable` nodes
	| that are not part of a previous focus context.
		let r = []
		if node
			let f = {
				if _ classList contains "focusable"
					# NOTE: The `isInPreviousContext` call can be a bit costly
					# as it has to traversel all the `context` nodes. However,
					# it is important to ensure that no further event will
					# be generated for nodes belonging to previous contexts.
					if not isInPreviousContext (_)
						r push (_)
			}
			if includeSelf
				Traversal ancestorsOrSelf (node, f)
			else
				Traversal ancestors (node, f)
		return r

	@method _relayFocus event
		# TODO: This used to be _ currentTarget, but the problem is that
		# this would skip focusing in any nested focusable
		setFocus (event target, event)

	@method _relayBlur event
		# TODO: This used to be _ currentTarget, but the problem is that
		# this would skip focusing in any nested focusable
		loseFocus (event target, event)

	@method _ensureBound
		if not _isBound
			_isBound = True
			# NOTE: We don't bind on click as the position mouse up of a click
			# might be different from the mouse up
			window document body addEventListener ("mousedown", self . onDocumentClick)
			# TODO: We should probably support touch as well

	@method _ensureUnbound
		if _isBound
			_isBound = False
			window document body removeEventListener ("mousedown", self . onDocumentClick)
			# TODO: We should probably support touch as well

# -----------------------------------------------------------------------------
#
# KEYMAP
#
# -----------------------------------------------------------------------------

@class Keymap
| Keymaps specify how input events are handled. It is essentially a mapping
| of key descriptions to a callback (or a `{condition,action}` sequence).
|
| The key description can be either of these:
|
| - The `key` as in `event.key`, which is a capitalized key name
| - A special value from `Keymap.SPECIAL`: `CONTROL`, `DIGIT`, `LETTER`, `SYMBOL`, `ANY`
| - The `event.keyCode` number (although this is deprecated)
|
| Here's a more formal description of the declaration of a keymap
|
| ```
| {
|     (<KEY CODE>|<KEY STRING>) : <CALLBACK> | {condition:PREDICATE, action:CALLBACK}
|     ‥
| }
|
| ```
|
| And here is an example
|
| ```
| var k = new Keymap {
|     ESC    : {close  ()}
|     ENTER  : {filter ()}
|     DOWN   : {next     ()}
|     UP     : {previous ()}
|     SYMBOL : {False}
| }
| ‥
| ui keypress {k process (_)}
| ```

	@shared IDS         = 0
	@shared SPECIAL     = ["CONTROL", "DIGIT", "LETTER", "SYMBOL", "ANY"]
	@shared KEYMAP      = new Keymap () as "root" bind (window)
	| The global keymap to which keymaps are pushed/pop'ed.
	@shared KEYMAPS     = []

	@shared RE_LETTER   = new RegExp "^\\w$"
	@shared RE_DIGIT    = new RegExp "^\\d$"
	@shared RE_SYMBOL   = new RegExp "^[^\\w]$"

	@property mapping   = {}
	@property parent    = None
	@property callbacks = []
	@property id        = 0
	@property name      = Undefined

	@operation Bind element=window
	| Binds the global keymap `KEYMAP` to the given element.
		return KEYMAP bind (element)

	@operation Unbind element=window
	| Unbinds th given `element` from the global keymap `KEYMAP`
		return KEYMAP unbind (element)

	@operation Push keymap
	| Adds the given `keymap` to the the stack of active keymaps. The global
	| `KEYMAP` will get the `keymap` as a new parent.
		if keymap in KEYMAPS
			# NOTE: This might not always be a problem, actually, but
			warning ("Pushing the same keymap twice", keymap, __scope__)
			# We should allow the keymap to be pushed and not return,
			# but I'm fixing it there.
			return keymap
		let parent =  KEYMAPS[-1] if KEYMAPS length > 0 else None
		# We make the current keymap the parent of the given keymap
		keymap attach (parent)
		# We attach the given keymap as parent of the global keymap
		KEYMAP  attach (keymap)
		# We add the given keymap to the stack
		KEYMAPS push   (keymap)
		return keymap

	@operation Pop keymap=Undefined
	| Removes the given keymap (or last one) from the active stack of keymaps.
		if KEYMAPS length == 0
			error ("No keymap installed", __scope__)
			return None
		else
			if not keymap or KEYMAPS[-1] == keymap
				# If the given keymap is not defined or is the last one
				# on the stack
				let k = KEYMAPS pop () detach ()
				let p = KEYMAPS[-1] if KEYMAPS length > 0 else None
				KEYMAP attach (p)
				return k
			else
				warning ("Poping keymap that is not on top", __scope__)
				return None

	@constructor mapping
		id = IDS ; IDS += 1
		set (mapping)

	@method as name
		self name = name
		return self

	@method attach parent
		assert (parent != self, "Attaching keymap to iself", __scope__)
		self parent = parent
		return self

	@method detach
		self parent = None
		return self

	@method bind node=window
		node addEventListener ("keydown",  self . onDown,  True)
		node addEventListener ("keyup",    self . onUp,    True)
		node addEventListener ("keypress", self . onPress, True)
		return self

	@method unbind node=window
		node removeEventListener ("keydown",  self . onDown)
		node removeEventListener ("keyup",    self . onUp)
		node removeEventListener ("keypress", self . onPress)
		return self

	@method setParent keymap:Keymap
		if parent != keymap
			parent = keymap
			return True
		else
			return False

	@method onDown event
		process (event, "down")

	@method onUp event
		process (event, "up")

	@method onPress event
		process (event, "press")

	@method reset
	| Resets the mapping
		mapping = {}
		return self

	@method set mapping
	| Sets up the keymap
		reset ()
		mapping :: {v,k|addMapping(k,v)}
		return self

	@method addMapping name, action, modifiers=[]
		var n = name toLowerCase ()
		if   n indexOf "alt-" == 0
			return addMapping (n[4:], action, modifiers concat (ALT))
		if   n indexOf "a-" == 0
			return addMapping (n[2:], action, modifiers concat (ALT))
		elif n indexOf "ctrl-" == 0
			return addMapping (n[5:], action, modifiers concat (CTRL))
		elif n indexOf "c-" == 0
			return addMapping (n[2:], action, modifiers concat (CTRL))
		elif n indexOf "meta-" == 0
			return addMapping (n[5:], action, modifiers concat (META))
		elif n indexOf "m-" == 0
			return addMapping (n[2:], action, modifiers concat (META))
		elif n indexOf "shift-" == 0
			return addMapping (n[6:], action, modifiers concat (SHIFT))
		elif n indexOf "s-" == 0
			return addMapping (n[2:], action, modifiers concat (SHIFT))
		else
			var p = Undefined
			if n indexOf ":" >= 0
				n = n split ":"
				p = n[1] ; n = n[0]
			let key            = Keyboard codes [n toUpperCase ()] or (name split ":" [0])
			let pre            = _getModifiersPrefix (modifiers)
			action             = _normalizeAction (action)
			# If there is any modifier, we force the up phase
			if key is? Number
				# We trigger the on key down for non letter/digit keys
				mapping [pre + key + ":" + (p or "down")]  = action
			else
				if pre and (p == "press" or not p)
					p = "up"
				mapping [pre + key + ":" + (p or "press")] = action

	@method _normalizeAction action
		if action is? Function
			return {action}
		else
			return action

	@method _getModifiersPrefix modifiers
		let res = ""
		if ALT in modifiers or modifiers altKey
			res += "A-"
		if META in modifiers or modifiers metaKey
			res += "M-"
		if CTRL in modifiers or modifiers ctrlKey
			res += "C-"
		if SHIFT in modifiers or modifiers shiftKey
			res += "S-"
		return res

	@method process event, phase="press", context=Undefined
	| Processes the mapping, executing any matching action/condition. If there is
	| no matching step and a parent is defined, then the event will
	| be forwarded/delegated to it.
		var step   = getStep (event, phase)
		var result = Undefined
		# NOTE: We have a few nested returns here because we're delegating to the parentk
		if step
			if (not step condition) or (step condition (event, step, context, self))
				result = step action and step action (event, step, context, self)
			elif parent
				result = parent process (event, phase, context)
		elif parent
			result = parent process (event, phase, context)
		if result is False
			# FIXME: This does not seem to work
			event preventDefault ()
			event stopImmediatePropagation ()
			event stopPropagation ()
		elif result is? Function
			result (event)
		callbacks :: {_(event, context, result)}
		return result

	@method getStep event, phase="press"
	| Returns the step defined in this keymap for the given event. The process
	| is as follows:
	|
	| - Is there a match for `event.keyCode` in the process (`Keymap.mapping`)
	| - If not, is the event a control and is there a `CONTROL` entry in the process?
	| - If not, is the event a symbol and is there a `SYMBOL` entry in the process?
	| - If not, is the event a digit and is there a `DIGIT` entry in the process?
	| - If not, is the event a letter and is there a `LETTER` entry in the process?
	| - If not, is there an `ANY` entry in the process?
	|
	| If any of the above yield a value, then we've found a matching step.
	| Otherwise we haven't and return `None`.
		# console log (event key, "control=", isControl (event), "symbol=", isSymbol (event), "digit=", isDigit(event), "letter=", isLetter(event))
		# We extract the key, numer and character
		let pre     = _getModifiersPrefix (event)
		phase       = ":" + phase
		# Warning: Tab is not TAB, it's TAB
		var key     = Keyboard key  (event)
		var num     = Keyboard code (event)
		var chr     = Keyboard char (event)
		var step    = Undefined
		if mapping[pre + num + phase]
			step = mapping[pre + num + phase]
		elif mapping[num + phase]
			step = mapping[num + phase]
		elif mapping[pre + key + phase]
			step = mapping[pre + key + phase]
		elif mapping[key + phase]
			step = mapping[key + phase]
		elif not isControl (event)
			if mapping[pre + chr + phase]
				step = mapping[pre + chr + phase]
			if mapping[chr + phase]
				step = mapping[chr + phase]
			elif mapping [pre + "SYMBOL" + phase] and isSymbol (event)
				step = mapping [pre + "SYMBOL" + phase]
			elif mapping [pre + "DIGIT" + phase] and isDigit (event)
				step = mapping [pre + "DIGIT" + phase]
			elif mapping [pre + "LETTER" + phase] and isLetter (event)
				step = mapping [pre + "LETTER" + phase]
			elif mapping [pre + "ANY" + phase]
				step = mapping [pre + "ANY" + phase]
		elif mapping [pre + "CONTROL" + phase]
			step = mapping [pre + "CONTROL" + phase]
		else
			step = None
		if step is None and mapping [pre + "ANY" + phase]
			step = mapping [pre + "ANY" + phase]
		return mapping[step] if (step is? String) else step

	@method isControl event
	| Tells if the given event corresponds to a control key press
		return Keyboard isControl (event)

	@method isLetter event
	| Tells if the given event corresponds to a letter key press. Note that
	| this also includes digit.
		return RE_LETTER test (event key)

	@method isDigit event
	| Tells if the given event corresponds to a digit key press.
		return RE_DIGIT test (event key)

	@method isSymbol event
	| Tells if the given event corresponds to a symbol key press (neither
	| a digit or a letter).
		return RE_SYMBOL test (event key) and len (event key) == 1

# ADD: Document
# ADD: Selection
# ADD: Screen

# -----------------------------------------------------------------------------
#
# INTERACTION
#
# -----------------------------------------------------------------------------

@class Interaction: TIdentified, TSingleton, TOptions
| The interaction provides an abstraction over a *state machine* where
| transitions are triggered by events.
|
| Each state is defined by a structure like this:
|
| ```sugar2
| {
|     on       : [Mouse.Up]
|     when     : {event,last,context|True}
|     does     : {event,last,context|console log ("Event triggered", event)}
|     triggers : "customevent"
|     next     : ["start"]
| }
| ```

	@shared   STATES        = {}
	@property event         = capitalize (typename (type (self)) split "." [-1])
	@property name          = Undefined
	@property _targetNodes  = []
	@property _targetEvents = []

	@constructor options=None
		super ()
		name = typename(type(self)) + "." + id
		setOptions (options) if options

	@method state name
		return STATES [name]

	@method bind element
	| Binds this interaction to the given element. This looks for the `start`
	| @STATE declaration and binds it to the given DOM @element.
		if not element
			return False
		if not state "start"
			return error ("No `start` state defined in", typename(type(self)), __scope__)
		else
			_targetNodes  push (element)
			_targetEvents push (_bind (element, ["start"], INITIAL, {target:element}))
		return element

	@method unbind element
	| Unbinds this interaction from the given @element.
		if not element
			return False
		if element
			let i = _targetNodes indexOf (element)
			if i >= 0
				# We force the unbinding
				_unbind (_targetEvents[i], True)
				_targetEvents = removeAt (_targetEvents, i)
				_targetNodes  = removeAt (_targetNodes , i)
			else
				pass
				# NOTE: This would happen when the unbind happens
				# more than once.
				# warning ("Element has no bound interaction:", element, typename(type(self)))

	@method _bind element, names, _lastEvent=None, _state={}
	| Binds the given @STATES handlers (given by @names) to the @element. This
	| method interpret the DSL described in @STATES and does the actual
	| event binding to the given element.
	|
	| The @_applied and @_lastEvent arguments are directly passed to the
	| @step method when it is called back. This essentially allows handlers
	| to carry their own state and have one single interaction instance
	| work with many elements and many concurrent instances.
	|
	| This returns a structure like `{element,event,states:[{callback,name}]}`
		let context  = {
			element  : element
			event    : _lastEvent
			state    : _state
			names    : names
		}
		context states   =  names ::> {res,name|
			res          = res or []
			let s        = state (name)
			let bound    = []
			let callback = {event|return step(event, context, name)}
			if not s
				error (MissingEntry, name, STATES, __scope__)
				return res
			elif name == "start" and (_lastEvent is not INITIAL)
				# We don't bind the start event except when _lastEvent
				# is INITIAL. This is because the start event is ALWAYS
				# bound.
				pass
			else
				for on in list(s on)
					match on
						is? String
							# When on:"<EVENT>" we use a regular DOM binding
							# FIXME: Not sure what to do with capture
							element addEventListener (on, callback)
						is? Interaction
							# If it's an interaction instance
							on bind (element)
							element addEventListener (on event, callback)
						!= Undefined and subtype (on, Interaction)
							# If on:<InteractionSubClass>, then we bind the interaction
							# and bind an event listener for the interaction's
							# event.
							let i = on Get ()
							i bind (element)
							element addEventListener (i event, callback)
						is? Object
							# When on:{target:Element|Function},capture}
							let e = on target match
								is? Function
									on target (element, _lastEvent, callback)
								_
									on target
								else
									element
							# http://devdocs.io/dom/eventtarget/addeventlistener
							# Since Chrome 56, touch events are passive by default
							# https://www.chromestatus.com/features/5093566007214080
							let o = {}
							var c = 0
							if on capture is not Undefined
								o capture = bool(on capture)
								c += 10
							if on once is not Undefined
								o once = bool(on once)
								c += 1
							if on passive is not Undefined
								o passive = bool(on passive)
								c += 1
							# NOTE: This little dance ensures full compatibility
							# with the older API
							if c == 0
								e addEventListener (on event, callback)
							elif c == 10
								e addEventListener (on event, callback, bool (o capture))
							else
								e addEventListener (on event, callback, o)
						else
							error ("Undefined event in state `" + name + "`:", s, __scope__)
			res push {name, callback}
			return res
		}
		return context

	@method _unbind context=None, force=False
	| The inverse function of @_bind. Takes the `{element,event,states:[{callback,name}]}` structure
	| returned by @_bind and unbinds everything.
		if not context
			return False
		let element  = context element
		let last     = context event
		let callback = context callback
		if last is INITIAL and (not force)
			# We don't want to unbind the start event as otherwise we wouldn't
			# be able to trigger the interaction again.
			return False
		for st in context states
			let s = state (st name) if name is? String else name
			let callback = st callback
			if s
				for on in list(s on)
					# This is the exact inverse of @_bind, with `removeEventListener`
					# used instead of `addEventListener`.
					match on
						is? String
							element removeEventListener (on, callback)
						is? Interaction
							on unbind (element)
							element removeEventListener (on event, callback)
						!= Undefined and subtype(on, Interaction)
							let i = on Get ()
							i unbind (element)
							element removeEventListener (i event, callback)
						is? Object
							# NOTE:  We used to complain about a missing target,
							# but we'll just use the context's
							let e = on target match
								is? Function
									on target (element, last, self)
								_
									on target
								else
									element
							e removeEventListener (on event, callback, bool(on capture))

	@method step event, context, matchingState
	| The @step method is the core of the interaction state machine,
	| as it manages the transitions between state. Each @context state
	| is executed with the current event to determine what the next states
	| are.
	|
	| The *next states* is the list of the states that can potentially happen
	| when an event is triggered. When the `step` is called, each
	| *context state* will be executed in order to generate the list
	| of the *next states* to apply.
	|
	| Each state's `next` property defines what happens after the state, it
	| is meant to return one of more values for the states that might potentially
	| happen.
	|
	| Here is how each value affects the transition:
	|
	| - `True` will *end* the interaction, the `end` state will be added as next
	|   and any remaining states won't be exectued.
	|
	| - `False` will *break* the interaction, skipping any remaining state.
	|
	| - a *string* indicates the name of the next state
	|
	| - an *array* indicates strings|true|false and will be merged with the
	|   current next states.
	|
	| - a *function* is expected to return any of the above
	|
	| - anything else will add `"end"` as the next state.
		var next    = []
		# TODO: We should probably pass the context to next instead of context.state, 
		# or maybe we should keep this opaque.
		# === 1) UNBINDING
		# We unbind any previously bound state
		_unbind (context)
		# === 2) GETTING THE NEXT POSSIBLE STATE(S)
		# These indicate wether the interaction ends or not at this step
		# and whether it ends with a success or not.
		var ends    = None
		var success = False
		var next    = []
		var triggered = False
		if matchingState
			let s = state (matchingState)
			if not s
				error ("Cannot find definition for state `" + matchingState + "`", __scope__)
			elif (not s when) or (s when (event, context event, options, context state, self))
				# We execute the optional side-effect
				s ["does"] (event, context event, options, context state, self) if s ["does"]
				# We execute the trigger clause and dispatch the context
				# state target.
				var e = s triggers match
					is? Function
						s triggers (event, context event, options, context state, self)
					is? String
						API CustomEvent (s triggers,s triggers, {detail:{event:event, context:context}})
				match e
					is? Event or e is? CustomEvent
						context state target dispatchEvent (e)
						triggered = True
				# And get the list of next elements
				var n = s next (event, context event, options, context state, self) if (s next is? Function) else s next
				# Now we decide what to do with it
				match n
					is True or n == "end"
						# True means we sucessefully completed the interaction.
						# We push the `end` state to explicitely indicate the success.
						ends    = True
						success = True
					is False or n is Undefined
						# False or Undefined means we stop everything
						ends    = True
					is? Array
						# An array means we have many possible
						# next steps.
						next = n
					_
						next push (n)
			else
				# If the transition fails, we end the interaction.
				# NOTE: There might be some cases where we might have other
				# valid interactions, but we'll wait for a use case before
				# building the infrastructure.
				ends    = True
				success = False
		# === 3) DOING THE TRANSITION
		if (not ends) and next length == 0
			# It might happen that we don't have any eligible next event, which
			# hints at some discrepancy between the events subscribed and
			# the current state. We issue a warning and end the interaction
			# to fail gracefully.
			warning ("Interaction", name, "cannot react to event", event, "in", matchingState, __scope__)
			ends    = True
			success = False
		# We process the next states and detects if there is an
		# `end` state. We also filter out duplicates in the process.
		next      = unique (next)
		if not ends
			# If the interaction does not end yet, we unbind the
			# current context and bind the `next` handlers
			_unbind (context)
			_bind   (event currentTarget, next, event, context state)
		else
			# If the interaction ends, we unbind the context, which
			# naturally resets the interaction.
			# the end events.
			_unbind (context)
			if success is not False
				dispatch (context state target, self event, {original:event, data:success, context:context})

# -----------------------------------------------------------------------------
#
# PRESS
#
# -----------------------------------------------------------------------------

# TODO: Make sure we have better finger detection
@class Press: Interaction

	@shared OPTIONS = {
		distance : 100
		within   : 500ms
	}

	@shared STATES = {
		start : {
			on   : [Mouse Down, Touch Start]
			next : {e,l,o|
				if Touch Has (e)
					return ["touchUp"]
				else
					return ["mouseUp"]
			}
		}
		mouseUp : {
			on   : [Mouse Up]
			next : {e,l,o|
				return distance(e, l) < o distance and elapsed (e,l) < o within
			}
		}
		touchUp : {
			on   : [Touch End]
			next : {e,l,o|
				return distance(e, l) < o distance and elapsed (e,l) < o within
			}
		}
	}

# -----------------------------------------------------------------------------
#
# CLICKS
#
# -----------------------------------------------------------------------------

@class Clicks: Interaction

	@shared OPTIONS = {
		count  : 2
		within : 500ms
	}

	@shared STATES = {
		start : {
			on   : [Press]
			next : {e,l,o,s|_IsCountReached(e,l,o,s)}
		}
	}

	@operation _IsCountReached event, last, options, state
		state left = state left or options count
		if elapsed(event, state last) < options within
			state left -= 1
		else
			state left = options count - 1
		state last = event
		if state left == 0
			state left = options count
			return True
		else
			return "start"

# -----------------------------------------------------------------------------
#
# DRAG
#
# -----------------------------------------------------------------------------

# NOTE: We need to block many of these events for touch devices, as otherwise
# the brower will scroll.
@class Drag: Interaction

	# NOTE: We dont' want to clash with existing events, so we use CamelCase
	@event Start = "DragStart"
	@event Drag  = "Drag"
	@event Stop  = "DragStop"

	@shared OPTIONS = {
		threshold : 5
		touch     : True
		mouse     : True
	}

	@method setDocumentDragStart
		window document body classList add "dragging" if window document and window document body

	@method setDocumentDragStop
		window document body classList remove "dragging" if window document and window document body

	@shared STATES = {
		start : {
			on    : [Mouse Down, Mouse Up, {event:Touch Start, passive:False, capture:True}]
			does  : {e,l,o,s|
				s origin     = position(e)
				s startEvent = e
				s target     = e currentTarget
				s started    = False
			}
			next : {e,l,o|
				if e type == Touch Start
					if o touch is False
						return False
					else
						return ["touchMove", "touchUp"]
				elif o mouse is False
					return False
				elif e type == Mouse Up
					return False
				elif e buttons != Mouse LEFT
					return False
				else
					return ["move", "up"]
			}
		}
		move : {
			on   : [{event:Mouse Move, target:window}]
			next : {e,l,o,s|
				BLOCK (e)
				if e type is Mouse Move and e buttons != Mouse LEFT
					return ["stop"]
				if distance(s origin, e) > o threshold
					return ["drag", "stop"] 
				else
					return ["move", "up"]
			}
		}
		touchMove : {
			on   : [{event:Touch Move, target:window, passive:False, capture:True}]
			next : {e,l,o,s|
				BLOCK (e)
				return ["touchDrag", "touchStop"] if distance(s origin, e) > o threshold else ["touchMove", "touchUp"]
			}
		}
		drag : {
			on       : [{event:Mouse Move, target:window}]
			triggers : {e,l,o,s|
				if not s started
					s started = True
					dispatch (s target, Start, {original:e, position:position(e), origin:s origin, context:s})
				else
					dispatch (s target, Drag, {original:e, position:position(e), origin:s origin, context:s})
			}
			next     : ["drag", "stop"]
		}
		touchDrag : {
			on       : [{event:Touch Move, target:window, passive:False, capture:True}]
			triggers : {e,l,o,s|
				BLOCK (e)
				if not s started
					s started = True
					dispatch (s target, Start, {original:e, position:position(e), origin:s origin, context:s})
				else
					dispatch (s target, Drag, {original:e, position:position(e), origin:s origin, context:s})
			}
			next     : ["touchDrag", "touchStop"]
		}
		stop : {
			on       : [{event:Mouse Up, target:window}]
			triggers : {e,l,o,s|
				dispatch(s target, Stop, {original:e, position:position(e), origin:s origin, context:s})
				return False
			}
		}
		touchStop : {
			on       : [{event:Touch End, target:window}]
			triggers : {e,l,o,s|
				BLOCK(e)
				dispatch(s target, Stop, {original:e, position:position(e), origin:s origin, context:s})
				return False
			}
		}
		up : {
			on       : [{event:Mouse Up, target:window}]
		}
		touchUp : {
			on       : [Touch End]
		}
	}


# -----------------------------------------------------------------------------
#
# API
#
# -----------------------------------------------------------------------------

@singleton press: Press
| A singleton for single-click interactions.

@singleton doubleclick: Clicks
| A singleton for double-click interactions.
	@property event = "DoubleClick"

@singleton drag: Drag
| A singleton for drag interactions.

@function elapsed a:Event, b:Event
| Tells how much time has passed between both events (absolute)
	if a is INITIAL or b is INITIAL
		return 0
	else
		return Math abs ((a timeStamp or 0) - (b timeStamp or 0)) if (a and b) else 0

@function distance a:Event, b:Event
| Returns the distance between the two event
	if not a or not b
		return 0
	else
		let x1,y1 = position (a)
		let x2,y2 = position (b)
		let dx    = (x1 - x2)
		let dy    = (y1 - y2)
		return Math sqrt (dx * dx + dy * dy)

@function position event, origin=PAGE, element=0
| Returns the position of the given event relative tot  the @PAGE, @WINDOW
| or @SCREEN
	if event is? Array
		return event
	if not event
		return None
	if event is? window.TouchEvent
		# TODO: We might want to check if there is any touch on the target
		let tl = event targetTouches
		let ct = event changedTouches
		let t  = ct[element] or tl[element] or ct[0] or tl[0]
		if not t
			warning ("Could not find any touch object in event", event, __scope__)
			return None
		else
			event  = t
	return origin match
		is PAGE
			(event pageX, event pageY)
		is WINDOW
			(event clientX, event clientY)
		is SCREEN
			(event screenX, event screenY)

@function delta a:Event, b:Event
| Returns the delta between the position of `b` and the position of `a`
	if a type == "wheel"
		a = Mouse WheelDelta (a)
		b = Mouse WheelDelta (b) if b and b type == "wheel" else b
		if not b
			return a
	if (not a) or (not b)
		return 0
	a = position(a)
	b = position(b)
	return (b[0] - a[0], b[1] - a[1])

@function handle node, handlers, capture=False, passive=False
| Registers the given @handlers as a map of `{<event:String>:Function}` on
| the given @node. This returns the @node as-is.
	match node
		is? Node or node is window
			var o = capture
			if not capture and passive
				if Features hasPassiveEvents
					o = {passive:True}
				else
					o = False
			else
				o = bool (capture)
			handlers :: {node addEventListener (_1, _0, o)}
		else
			node :: {
				if _ is window or _ is? Node
					handle (_, handlers, capture)
				else
					error ("Node should be a node or a list of nodes, got:", node, __scope__ )
					break
			}
	return node

@function unhandle node, handlers
| The opposite of `handle`.
	match node
		is? Node or node is window
			handlers :: {v,k|
				node removeEventListener (k, v)
			}
		else
			node :: {unhandle (_, handlers)}
	return node

@function keymap mapping
| Returns a new `Keymap` with the given mapping.
	return new Keymap (mapping)

@function dispatch node, event:String, data:Any
| Creates a custom event with the given @event name and @data, and dispatches
| it to the given @node, returning the new event.
	let e = API CustomEvent (event, {detail:data})
	node dispatchEvent (e)
	return e

# EOF
