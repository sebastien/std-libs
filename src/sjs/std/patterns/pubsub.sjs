@feature sugar 2
@module std.patterns.pubsub
@import len,bool from std.core
@import assert from std.errors
@import removeAt,keys from std.collections

# -----------------------------------------------------------------------------
#
# EVENT
#
# -----------------------------------------------------------------------------

@class Event

	@property current = None
	@property origin = None
	@property propagates = True

	@constructorname:str, data:Any
		self name = name
		self data = data

	@getter path
		return current path if origin else None

	@method dispatch topic:Topic
		assert (self.origin is None, "Cannot trigger event twice")
		origin  = topic
		current = topic
		while propagates and current
			_dispatch()
			current = current parent

	@method stop:Event
		propagates = False
		return self

	@method _dispatch
		assert (self.current)
		let handlers = current._handlers
		let event_handlers   = handlers[name] or []
		let default_handlers = handlers["*"]  or []
		for handler in event_handlers
			handler (self)
		if name != "*"
			for handler in default_handlers
				handler(self)

# -----------------------------------------------------------------------------
#
# TOPIC
#
# -----------------------------------------------------------------------------

@class Topic

	@property _name     = ""
	@property _parent   = None
	@property _children = {}
	@property _handlers = {}

	@getter parent
		return _parent

	@getter root
		return _parent root if _parent else self

	@getter path
		return _parent path + "/" + _name if _parent else _name

	# =========================================================================
	# HANDLERS
	# =========================================================================

	@method bind name:str, handler
		assert (name)
		_handlers[name] ?= []
		let handlers = _handlers[name]
		if handler not in handlers
			handlers push (handler)
		return self

	@method unbind name:str, handler
		assert (name)
		handlers = _handlers[name] ::? {_ is not handler}
		return self

	@method trigger name:str, data:Optional
		let event = new Event (name,data)
		event dispatch(self)
		return event

	# =========================================================================
	# CHILDREN
	# =========================================================================

	@method ensure path:str
	| Ensures that the given path exists
		let topic = self
		for p in path split "/"
			if not p
				continue
			elif not topic has (p)
				let t = new Topic()
				topic set (p,t)
				topic = t
			else
				# It's a safe case, as we know that the topic exists
				topic = topic get (p)
		return topic

	@method get name:str 
		return _children[name]

	@method has name:str
		return bool(_chilren[name])

	@method set name:str, topic:Topic
		let res = _children[name]
		topic _name = name
		topic _parent = self
		_children[name] = topic
		return res

	@method remove name:str
		let res = children[name]
		children = removeAt (children, name)
		return res

	@method events
		return keys (_handlers)

	@method registered
		return events ::= {len(_)}

# -----------------------------------------------------------------------------
#
# BUS
#
# -----------------------------------------------------------------------------

@class Bus

	@property toot = Topic ()

	@method pub path:str, event:str="update", data:Optional=None
		let topic = root ensure (path)
		assert (event is? String)
		return topic trigger (event, data)

	@method sub path:str, event:str, callback:Callable
		let topic = root ensure (path)
		return topic bind (event, callback)

	@method unsub path:str, event:str, callback:Callable
		let topic = root ensure (path)
		return topic unbind (event, callback)
	
	# @method request path

	# @method binds

# EOF - vim: ts=4  sw=4 noet
