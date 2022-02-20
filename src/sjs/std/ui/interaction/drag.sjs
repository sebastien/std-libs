@feature sugar 2
@module std.ui.interaction.drag
@import TOptions from std.patterns.options
@import drag, handle, unhandle, position, SWALLOW, Mouse, Drag from std.ui.interaction
@import identity from std.core

# TODO: Implement the start option which would enable/disabled the starting
#       of the interaction.
# TODO: Clarify the options and their arguments.
@class Draggable: TOptions
| A behaviour that maps drag events to (x,y) properties, making it
| easier to make element draggable.
|
| Most of the callbacks take the following arguments:
|
| - `[e]vent` the event to which the behaviour was bound
| - `[n]ode` the node to which the behaviour was bound
| - `[o]origin` the origin value, as `(x,y)` or `x|y|z`
| - `[d]elta` the delta, as `(x,y)` or `x|y|z`
| - `[p]position`, as `(x,y)`
| - `[c]ontext`, the persistent context for the interaction
| - `[h]andler`, this draggable handler
|
| A callback is then usuall `{e,n,o,d,p,c,h|…}`

	@shared OPTIONS = {

		# Called when the dragging starts, if it returns False
		# the dragging is cancelled.
		start   : Undefined
		# Called when the dragging end
		end     : Undefined
		# Invoked at start, drag and stop
		does    : Undefined

		# Can transform the context passes to the coordinate
		# callbacks.
		prepare : {e,n,o,d,p,c,h|return c}

		# Producers for the [O]rigin [X],[Y] & [Z] coordinates
		ox      : Undefined
		oy      : Undefined
		oz      : Undefined
		oxy     : Undefined

		# Callbacks for the dragged [X], [Y], [XY] and [XYZ] coordinates
		x       : Undefined
		y       : Undefined
		z       : Undefined
		xy      : Undefined
		xyz     : Undefined

		# Producers for the [D]estination [X],[Y] & [Z] coordinates
		dx      : Undefined
		dy      : Undefined
		dz      : Undefined
		dxy     : Undefined
		dxyz    : Undefined

		# TODO: Support mouse/touch enabling
		mouse   : True
		touch   : True
		clearSelection : False

		threshold : Undefined
	}

	@property _action  = Undefined
	@property _handler = {
		DragStart  : self . onDragStart
		Drag       : self . onDrag
		DragStop   : self . onDragStop
		mousewheel : self . onWheel
		wheel      : self . onWheel
		drag       : SWALLOW
		dragstart  : SWALLOW
	}

	@property _drag = drag
	@property _bound = []

	@constructor options
		set (options)

	@method set options
	| Takes {ox,oy, x,y, dx, dy} so that
	| {ox,oy} are initial accessors/mutators for the original
	| x,y values generated on drag start. {x,y} are mutators
	| triggered on drag and {dx,dy} are triggered on drag end.
		setOptions (options)
		# If ther is a change in any of the drag options, we create a new
		# drag object.
		# if options threshold != _drag threshold or options touch != _drag touch or options mouse != _options mouse
		# 	let bound = [] concat (_bound)
		# 	unbind (_bound)
		# 	_drag = new Drag {threshold:options threshold, mouse:options mouse, touch:options touch}
		# 	bind (bound)
		return self

	@method bind nodes...
		for node in nodes
			if node
				drag bind (node)
				handle (node, _handler)
				_bound push (node)
		return self

	@method unbind nodes...
		for node in nodes
			drag unbind (node)
			unhandle (node, _handler)
		_bound = _bound ::? {_ not in nodes}
		return self

	@method onDragStart event
		let c = event detail context
		let n = event target
		let o = event detail origin
		let p = event detail position
		let d = [p[0] -o [0], p[1] - o[1]]
		c event = event
		# FIXME: Should refactor this
		if options start and options start (event,n,o,d,p,c, self) is False
			c isEnabled = False
			return False
		else
			c isEnabled = True
		let pc = options prepare (event,n,o,d,p,c,self) or c
		c ox = options ox (event, n,o,d,p,pc,self) if options ox else o[0]
		c oy = options oy (event, n,o,d,p,pc,self) if options oy else o[1]
		c oz = options oz (event, n,o,d,p,pc,self) if options oz else 0
		options xy   and options xy   (event,n, [c ox, c oy],d,p,pc,self)
		options does and options does ("start", event,n,o,d,p,pc,self)
		# This is a fix as sometimes (or should I say, often) the dragging
		# selects stuff even when it's not meant to. It's a hack, and
		# it would be nice to see why that happens.
		if options clearSelection
			let sel = window getSelection ()
			sel removeAllRanges ()
		return SWALLOW


	@method onDrag event
		let c = event detail context
		if not event detail context isEnabled
			return None
		c event = event
		let n = event target
		let o = event detail origin
		let p = event detail position
		let d = [p[0] -o [0], p[1] - o[1]]
		let pc = options prepare (event, n,o,d,p,c,self) or c
		options x      and options x  (event,n,c ox,d[0],p,pc,self)
		options y      and options y  (event,n,c oy,d[1],p,pc,self)
		options xy     and options xy (event,n, [c ox, c oy],d,p,pc,self)
		options does and options does ("drag", event, n,o,d,p,pc,self)
		return SWALLOW

	@method onDragStop event
		if not event detail context isEnabled
			return None
		let c = event detail context
		c event = event
		let n = event target
		let o = event detail origin
		let p = event detail position
		let d = [p[0] -o [0], p[1] - o[1]]
		let pc = options prepare      (event,n,o,d,p,c,self) or c
		options dx   and options dx   (event,n,c ox,d[0],p,pc, self)
		options dy   and options dy   (event,n,c oy,d[1],p,pc,self)
		options dxy  and options dxy  (event,n,[c ox, c oy],d,p,pc,self)
		options does and options does ("end", event, n,o,d,p,pc,self)
		options end  and options end  (event, n,o,d,p,pc,self)

	@method onWheel event
		let n = event target
		let c = event detail context
		if options z
			# FIXME: We might want to rework that one
			let d = Mouse WheelDelta (event)
			let p = position(event)
			options z (event, n, Undefined, d, p, c, self)
			options does and options does ("wheel", event, n,Undefined,d,p,pc,self)
			SWALLOW (event)

@function draggable options
	return new Draggable (options)

# EOF - vim: ts=4 sw=4 noet
