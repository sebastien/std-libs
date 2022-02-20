@feature sugar 2
@module std.ui.components
@import std.core                 as core
@import std.formats.jsxml        as jsxml
@import API from std.api.browser
@import assert, error, warning, MissingEntry, BadArgument  from std.errors
@import head, comparator, sorted, remove, removeAt, keys, values, nest  from std.collections
@import future, join as async_join      from std.io.async
@import http                    from std.io.http
@import dirname                 from std.text.path
@import Type                    from std.state.schema
@import Registry                from std.patterns.registry
@import TOptions                from std.patterns.options
@import TIdentified             from std.patterns.ids
@import Bus                     from std.patterns.pubsub
@import load as loadCSS, inject as injectCSS from std.formats.css
@import Cell, Network    from std.state.cells
@import template,replace,endsWith       from std.text
@import T                       from std.text.i18n
@import runtime
@import runtime.modules as modules
@import runtime.window  as window

@shared NORMALIZE_ACTION = {
	"mouseenter" : "mouseEnter"
	"mouseleave" : "mouseLeave"
	"keydown"    : "keyDown"
	"keyUp"      : "keyUp"
	"keyPress"   : "keyPress"
}
| A mapping used to normalize action names passed from the view layer.

# TODO: Add mount/unmount lifecycle methods


# -----------------------------------------------------------------------------
#
# COMPONENT
#
# -----------------------------------------------------------------------------

# TODO: Clarify the role of OPTIONS vs the cell network
@class Component: TIdentified, TOptions
| The base class for user interface components. The component class is designed
| to be rendering-agnostic (ie. the rendering part is composed with the component
| at runtime), but is expected to work on DOM-like tree structure.
|
| Components make use of the `cells` module to create a **cell network** that
| defines their **state** and maps the part of this state that trigger a
| rendering.

	@shared OPTIONS    = {}
	| Default options for the component.

	@shared STYLESHEET = True
	| A URI or `True` (defaults to `style.css`) for the stylesheet of this
	| component.

	@property view     = Undefined
	| A function that renders the data on the UI, which is expected to be
	| a DOM-like structure, but doesn't need to be.

	@property node     = Undefined
	| The node (or object) that is used as a the root for the UI rendering.

	@property _name    = Undefined
	| The name of the component, if any. It will be automatically generated
	| if not set.

	@property parent   = Undefined
	| The parent component refernce, only for components bound as children.

	@property nodes    = {}
	| Map of nodes/references from from the view.

	@property children = {}
	| Map of children components.

	@property bindings = Undefined

	@property measures = {}
	| An object to store any dimension measured from the view, which is
	| useful to recalculate/re-arrange the layout.

	@property on = {
		initialized : future ()
		rendered    : future ()
	}
	| Lifecycle futures

	@property cache    = {}
	| A convenvience object to hold values that can be recalculated but
	| already have. Might be deprecated in the future as the cells network
	| already handles caching.

	@property network  = Undefined
	| The cells network definition

	@property state    = Undefined
	| An object that wraps named cells from the cell network and make it easy
	| to access and manipulate the object's size.

	@property type     = core type (self) __name__

	@property enabledAnimations = True
	| When `False`, running animations will directly skip to their end.

	@property hasResized = False
	| True when the component has just been resized. Automatically
	| set to false after a render.

	@property willRender = False
	| True when the component will render on the next frame.

	@property isDirectRender = False
	| When true, rendering is applied out of sync from the animation frame

	@property _renderCount = 0

	@constructor node=window document createDocumentFragment(), view=Undefined, type=Undefined
		self node = node
		self view = view (self) if view else None
		self type = type or self type
		if state is Undefined
			# We only create a cells network if no state is defined
			network = createNetwork (network)
			network as (network name or address)
			# We bind the owner, which is useful for signals.
			network owner = self
			let extra = bindNetwork (network, network cell "render", network cell "locale")
			state     = network state (extra, state)
			# NOTE: The cell network won't trigger any rendering at this
			# stage.
			network init ()
		init ()
		on initialized set (self)
		# We trigger a render
		render ()

	@getter isComponent
		return True

	@getter address
		return type toLowerCase () + "." + id

	@getter data
		return state get () if state and state get else Undefined

	@getter name
		return _name

	@setter name value
		self _name = value
		if network
			network _name = value

	@method measure
	| Override this one to measure nodes post-rendering

	@method bindNetwork network, render, locale
	| To be overriden by a component to return a map of cells to be registered
	| in the network.
		pass

	@method bindOptions options=getDefaultOptions()
	| Binds the given @options, which does the following:
	|
	| - see if there is cell with the given option name, and if so
	|   bind the option to it.
	| - if there is a cell, and the option value is a cell, then the
	|   option value is used as a delegate
	| - otherwise, if the option is know in the OPTIONS, set it there.
	|
	| This contrasts with the `setOptions` that simply updates the @self.options
	| field instead of taking into account the network as well.
		# NOTE: We inhibit the network so that we have a one-shot update
		if not options
			return self
		network inhibit ()
		# If there is a name in the option, which has no corresponding
		# cell, we set it.
		if options name
			name = options name
		for v,k in options
			setOption (k,v)
		network release ()
		return self

	@method loadComponent type
	| Utility method that gives access to the module's @load method.
		return __module__ load (type)

	@method setOption name, value
	| Individual option setting function, can be overriden by subclasses.
	| See #bindOptions for full behaviour.
		self options ?= {}
		let k = name
		let v = value
		let accept_options = keys(OPTIONS)
		if network is? Network
			let c = network cell (k)
			if c is? Cell
				if v is? Cell
					# We unbind any pre-existing cell
					if self options[k] is? Cell
						c _removeInput (options[k])
					v triggers (c)
				else
					c set (v)
				self options[k] = v
			elif (k in accept_options) and (v is not Undefined)
				self options[k] = v
		elif (k in accept_options) and (v is not Undefined)
			self options[k] = v

	@method bindNode name, node, index
	| Called by the rendering engine when a given node is rendered. By default,
	| this will store the node in @nodes
		let n0 = nodes[name]
		let n1 = n0[index] if n0 else Undefined
		if n1 is node
			# NOTE: This happens when a node in jsx::for has a ref key, it
			# will be marked as `rebindNode` first, and then `bindNode`
			return node
		_bindHelper (nodes, name, node, index)
		# We call the bindings for binding
		let b = bindings[name] if bindings else None
		if b
			if b is? Function
				b (node, index, True)
			elif b bind
				b bind (node, index)
			else
				warning ("Binding for", name, "in", address, "is neither a function nor has a `bind` property", __scope__)
		return node

	@method unbindNode name, node, index
		_unbindHelper (nodes, name, node, index)
		# We call the bindings for unbinding
		let b = bindings[name] if bindings else None
		if b 
			if b is? Function
				b (node, index, False)
			elif b unbind
				b unbind (node, index)
			else
				warning ("Binding for", name, "in", address, "is neither a function nor has an `unbind` property", __scope__)
		return node
	
	@method rebindNode name, node, index, previousIndex
		if previousIndex is Undefined
			bindNode (name, node, index)
		elif index is not previousIndex
			unbindNode (name, node, previousIndex)
			bindNode   (name, node, index)

	@method createChild name, componentModule, node=Undefined, options=Undefined
	| Creates a child component with given name, using the given component module
	| and bound to the given node.
		let model     = componentModule model
		let view      = componentModule view
		let child     = new model (node, view, componentModule type)
		child name    = name
		let o         = core merge (core merge ({}, options), child getDefaultOptions (node))
		child bindOptions (o)
		Registry addInstance (componentModule type, child)
		return child

	@method createNetwork network
		return Network Define (network, {
			"locale:value"  : Undefined
			"render:signal" : self . _render
		}, Undefined, address) as (address)

	@method bindChild name, component, index=Undefined
	| Registers the given @component as child under the given @name.
		# TODO: We might want to detect if the component is bound twice
		match _bindHelper (children, name, component, index)
			== 10
				assert (not component[name] is? Component)
		component parent = self
		# We call the bindings
		let b = bindings[name] if bindings else None
		if b
			if b is? Function
				b (component, index, False)
			elif b unbind
				b unbind (component, index)
			else
				warning ("Binding for", name, "in", address, "is neither a function nor has an `unbind` property", __scope__)
			bindings[name] bind (component, index)
		component ! "Bound" (self, name, index)
		return component

	@method unbindChild name, component, index=Undefined
		match _unbindHelper (children, name, component, index)
		if component parent is self
			component parent = None
		# We call the bindings for unbinding
		let b = bindings[name] if bindings else None
		if b
			if b is? Function
				b (component, index, False)
			elif b unbind
				b unbind (component, index)
			else
				warning ("Binding for", name, "in", address, "is neither a function nor has an `unbind` property", __scope__)
			bindings[name] bind (component, index)
		component ! "Unbound" (self, name, index)
		return component

	@method dispose
		# 1) Dispose of nodes, unbind them
		unmount ()
		# 2) Dispose of children, unbind them
		children :: {v,k|unbindChild (k,v)}
		# 3) Dispose of node
		node    = Undefined
		Registry removeInstance (type, self)
		# TODO: Should be unbind the cell network?

	@method setNode node
		if self node != node
			self node = node
			# NOTE: We do want to render here, but maybe not
			# in all the cases? To be investigated.
			_render ()

	@method getDefaultOptions node=self node
	| Returns the default options for this component, introspecting the attached
	| @node (if any), extracting its `data` attributes and trying to parse
	| them as JSON.
		let r = {}
		if node and node dataset
			let d = node dataset
			# This is a special case for the `name` option.
			if d["name"]
				r name = d["name"]
			for v,k in OPTIONS
				if d[k] is not Undefined
					let w = core safeunjson (d[k])
					if OPTIONS[k] is? Type and not (OPTIONS[k]) match (w)
						warning ("Component " + address + " option `" + k + "` does not match schema", __scope__)
					r[k] = w
			for v,k in state
				if k != "_" and r[k] is Undefined and (not (d[k] is? Undefined))
					r[k]  = core safeunjson (d[k])
		let res = core merge (r, core type(self) OPTIONS ::= {return _ ["default"] if _ is? Type else _})
		return res

	@method init
		pass

	@method action name
	| Returns the action with the given name
		name          = NORMALIZE_ACTION[name] or name
		let full_name = "on" + name[0] toUpperCase () + name[1:]
		if self[name]
			return runtime __decompose__ (self, name)
		elif self[full_name]
			return runtime __decompose__ (self, full_name)
		else
			warning (MissingEntry, [name, full_name], self type, __scope__)

	@method render data=self data
		# NOTE: We don't need to render the child components as
		# they are already managed
		willRender = False
		let res = view(data, node) if view else None
		# We always unset the hasResized flag
		hasResized = False
		return res

	@method _render
		if isDirectRender
			render ()
		elif not willRender
			willRender = True
			window requestAnimationFrame {render ()}

	@method _measure
	| Executes `PostRender` before measuring.
		# NOTE: Shouldn't we do the PostReder after the measure?
		self ! "PostRender" ()
		# NOTE: At the moment, measure can be called more than once per
		# render, especially when rendering triggers transitions. It can
		# also be triggered less than render if render is async and is called
		# twice before a browser frame render.
		measure ()
		if _renderCount == 0
			if on rendered isFinished
				warning ("Component's `on.rendered` future already set:", name, __scope__)
			else
				on rendered set (True)
		_renderCount += 1

	@method relayout
	| A convenience method that can be called to measure this component
	| as well as all its children.
		measure ()
		children :: {_ relayout ()}

	@method translate tmpl, value, index
	| Translates the given template string (see `std.text.template`) using the given
	| `{value,index}`, using the component's `locale` cell.
		let l = state locale value
		if tmpl is None or tmpl is "{_}"
			return T(value, l)
		else
			return template (T(tmpl, l), value, Undefined, {index:index, locale:l})

	@method mount node
	| Called to make sure that the component is mounted to the given
	| node on the DOM.
		# 1 as third agument means make sure it's mounted
		# FIXME: The reference was not set before, so we add it here again
		if self node and self node is not node
			unmount ()
		self node = node
		self ! "WillMount" (node)
		let res = view (data, node, 1)
		res !! "PostRender" {
			self ! "Mount"
			doChildren {_ onParentMounted (self)}
		}
		return res
	
	@method onParentMounted parent
		doChildren {_ onAncestorMounted (parent)}
	
	@method onAncestorMounted ancestor
		doChildren {_ onAncestorMounted (ancestor)}

	@method doChildren callback
	| Iterates on the children, executing the given callback on 
	| every component. This supports nested children collection.
		for c,n in children
			if c isComponent
				# We have a component
				callback (c,n,0)
			else
				# We have a nested collection, which is either
				# an array or an object.
				for child, k in c
					callback (child,n,k)
		return self
		
	# TODO: onParentUnmonted, etc.
	@method unmount node=self node
	| Called when we want to make sure the component is not mounted anymore
	| on the DOM.
		# -1 as third agument means unmount
		if node is self node
			self ! "WillUnmount" (self node)
			let res = view (data, node, -1)
			res !! "PostRender" {self ! "Unmount"}
			return res
		else
			return None

	@method _bindHelper container, name, value, index=Undefined
	| A helper that manages the binding of one or many values in a container. When
	| values are bound with an index, then composites are created to nest
	| the new values.
	|
	| The return codes identify which branch matched.
		if index is? Array
			container[name] ?= {}
			nest (container[name], index, value)
			return 1
		elif container[name]
			if (index is not Undefined) and (index is not None)
				# NOTE: There are legit situations when that might happen
				# if container[name][index] and container[name][index] is not value
				# 	warning ("Component", name, "already has a different bound child at index ", index and ("#" + index + " " or "") or "*", "named `" + name + "` = ",  container[name], __scope__)
				container[name][index] = value
				return 10
			elif container[name] is value or (not container[name])
				container[name] = value
				return 11
			else
				# NOTE: There are legit situations when that might happen
				# warning ("Component", name, "already has a different bound child", index and ("#" + index + " " or "") or "*", "named `" + name + "` = ",  container[name], __scope__)
				container[name] = value
				return -1
		else
			if (index is not Undefined) and (index is not None)
				container[name] = {}
				let c = container[name]
				container[name][index] = value
				return 20
			else
				container[name] = value
				return 21

	@method _unbindHelper container, name, value, index=Undefined
	| A helper that manages the unbinding of one or many values in a container. When
	| values are bound with an index, then composites are created to nest
	| the new values.
	|
	| The return codes identify which branch matched.
		if container[name]
			if (index is not Undefined) and (index is not None)
				container[name] = removeAt (container[name], index)
				return 10
			elif container[name] is value
				container = removeAt (container, name)
				return 11
			elif not container[name]
				return 12
			else
				warning ("Component already has a different bound child", index and ("#" + index + " " or "") or "*", "named `" + name + "` = ",  container[name], __scope__)
				return -1
		else
			if index is? Number
				return 20
			else
				return 21

	# FIXME: Needs rework, this creates a dependency with the DOM, should
	# go in the view.
	@method _dispatchUpdateEvent
		let e = API CustomEvent ("Update", {detail:{node:node,component:_}, bubbles:True, composed:False})
		node dispatchEvent (e)

# -----------------------------------------------------------------------------
#
# BUS
#
# -----------------------------------------------------------------------------

@singleton Bus: Bus
| An event bus that allows for component-wide communication


# -----------------------------------------------------------------------------
#
# REGISTRY
#
# -----------------------------------------------------------------------------

@singleton Registry: Registry
| Holds a registry of all component instances created. It is mostly
| useful for debugging purposes. Have a look at `std.patters.Registry`
| for more information.

	@method list index=Undefined
		match index
			is? Number
				return values(list())[index]
			is? String
				return list()[index]
			_
				return error (BadArgument, "index", index, [Number, String], __scope__)
			else
				return all ::= {
					return _ instances length match
						== 0 -> Undefined
						== 1 -> _ instances [0]
						else -> _ instances
				}

	@method addInstance name, instance
		# FIXME: This seems to be only necessary when directly instanciating
		# component, but I don't see where instances is created otherwise.
		all [name] ?= {instances:[]}
		all [name] instances push (instance)
		self ! "InstanceAdded" (self, name, instance)
		return instance

	@method removeInstance name, instance
		all [name] = remove (all [name], instance)
		self ! "InstanceRemoved" (self, name, instance)
		return instance

	@method join name
		if name is? Array or name is? Object
			return async_join (name ::= join)
		elif name is? String
			let f = future ()
			# Can we find a component right away?
			let c = withName (name) or withType (name)
			if c
				f set (c)
			else
				# If not, we'll wait until one matches
				let on_component_added = {
					let r,n,c = _
					if c name == name or c type == name
						f set (c)
				}
				f then {self !- "InstanceAdded" (on_component_added)}
				self !+ "InstanceAdded" (on_component_added)
			return f
		else
			return future () set ([])

	@method withName name
		var found = None
		Registry walk {
			if _ name == name
				found = _
				return False
		}
		return found

	@method withType name
		var found = None
		Registry walk {
			if _ type == type
				found = _
				return False
		}
		return found

# -----------------------------------------------------------------------------
#
# LOADER
#
# -----------------------------------------------------------------------------

@singleton Loader
| Dynamically loads parts of a component.

	@property _cache = {}

	@method load name
	| Loads the component with the given name, returning a `{model,view,style}`
	| object wrapped in an async value.
		# We guard against concurrent loading
		let key = name
		if _cache[key]
			return _cache[key]
		# We need to load the component.
		let res = _resolveView (name) chain {payload|
			# We start by loading the VIEW
			payload type = name
			payload instances = []
			# We only want the `View` class of the view module
			let on_success = {
				payload model     = _ Component
				# NOTE: We need to set `component` as well so that
				# `@import Component from "component:controls/list"` works
				payload Component = _ Component
				return payload
			}
			if payload viewType is "jsxml"
				return _loadModuleFromURL (dirname (payload viewURL) + "/model.js") chain  (on_success)
			else
				# TODO: Should timeout, or we should have a `resolve` that does
				# not fail but instead returns an empty URL.
				return _loadModuleFromRuntime (payload viewParent + ".model") chain (on_success)
		} chain {payload|
			# The we proceed to load the MODEL
			let css_type = payload model STYLESHEET
			if  css_type
				if payload viewType is "jsxml"
					let css_url = dirname (payload viewURL) + "/" + ("style.css" if css_type is True else css_type)
					return loadCSS (css_url) chain {
						payload style = _
						return payload
					}
				else
					let k = "css:components/" + name + "/style.css"
					# If the CSS is preloaded, we can inject it in the document
					if modules preloaded [k]
						injectCSS (Undefined, modules preloaded [k])
						payload style = True
					return payload
			else
				payload style = None
				return payload
		} then {
			Registry set (name, _)
			modules join (name, _)
		}
		# We store the RDV in the cache
		_cache[key] = res
		return res

	@method _resolveView name
	| Resolves the view for the component with the given name. Looking in the
	| runtime module loading system first or then trying to dynamically load the
	| using JSXML.
		let module_root = "components." + replace(name, "/", ".")
		let module_name = module_root + ".view"
		if modules preloaded [module_name] or modules loaded [module_name] or modules loading [module_name]
			# If the module is preloaded, loaded or loading, then we use the module system to 
			# get the view.
			return _loadModuleFromRuntime (module_name) chain {
				{viewType:"module", viewName:module_name, viewParent:module_root, view:_ View}
			}
		else
			# Otherwise we need to resolve the JSXML and load it as a module in the runtime.
			return jsxml resolve (name) chain {url|
				jsxml load (url, False) onFail {
					error ("An error occured while loading JSXML at", url, __scope__)
				} chain {
					{viewType:"jsxml", viewURL:url, view:_ View}
				}
			}

	@method _loadModuleFromRuntime name
	| Loads the module with the given `name` that is expected to be available or
	| loadable from the runtime system.
		let f = future ()
		modules load (name, {f set (_)})
		return f

	@method _loadModuleFromURL url
	| Loads the JavaScript module defined at the given `url`
		return http get (url) always () chain {f|
			# This makes the presence of the model optional
			if f isSuccess
				let v = f get ()
				let g = future ()
				modules parse (v, url, g.set)
				return g
			else
				warning ("model found at <" + url +"> for `" + name + "`, using default Component class", __scope__ )
				return future () set (__module__)
		}

# -----------------------------------------------------------------------------
#
# HIGH LEVEL API
#
# -----------------------------------------------------------------------------

@function load:Future name:String
| Loads the component with the given @name, first looking if it is
| already available in the @Registry. This returns a future with
| `{model,view}` where `model` is the @Component subclass and
| `view` is the view factory function that takes the @Component
| instance as argument.
	return Loader load (name)

@function list value=Undefined
| Returns a list of components grouped by type.
	return Registry list (value)

@function get name=0
| Returns the first component that matches the given `name`, it will
| try to match the exact name first, then look for a component that
| ends with the given name and then contains the given name. If no
| component is found, then it will either return the first component
| or output a list of componetns.
	if name is? String
		let m = []
		let lname = name toLowerCase ()
		Registry walk {
			# NOTE: We don't use the name, just the type
			let cname = "" + (_ type)
			let clname = cname toLowerCase ()
			if not cname
				return True
			if cname == name
				m push {score:0, component:_}
				return False
			elif  endsWith (cname, name)
				m push {score:1, component:_}
			elif endsWith (clname, lname)
				m push {score:2, component:_}
			elif  cname indexOf (name) >= 0
				m push ({score:3, component:_})
			elif  clname indexOf (lname) >= 0
				m push {score:4, component:_}
		}
		if m length > 0
			let sm = sorted (m, comparator {_ score})
			return head (sm) component
	return Registry list (name or 0)

@function instanciate model, view=Undefined, node=Undefined, name=Undefined
| Instanciates the given component model with the given view on the given
| node.
	if view is Undefined and model model and model view and model type
		view  = model view
		model = model model
		name ?= model type
		node  = document createElement "div"
	if not model
		warning ("Component has no model, using default component class", __scope__)
	if not view
		return error ("Cannot instanciate component without a view", __scope__)
	if not node
		return error ("Cannot instanciate component without a node", __scope__)
	name ?= core typename (model)
	Component ! "Loaded" (name)
	let should_replace = node getAttribute "data-replace" is "true"
	let mount_node     = document createElement "div" if should_replace else node
	let c = new (model or Component) (mount_node, view, name)
	c bindOptions (c getDefaultOptions (node))
	# We replace the node if necessary but only after the first render, as 
	# oterwise we might replace the node with an empty node.
	if should_replace
		c !! "PostRender"  {node parentNode replaceChild (mount_node, node)}
	# If there is a `data-onload` attribute, we eval and execute the code
	let on_load = node getAttribute "data-onload"
	if on_load
		let f = eval ("(function(component,node,name){" + on_load + "})")
		f (c, node, name)
		# catch
		# 	warning ("Error evaluating", a, __scope__)
	Component ! "Bound" (name, node, c)
	# FIXME: Maybe this should be done at instanciation?
	Registry addInstance (name, c)
	c render ()
	return c

# TODO: Return a soft RDV
@function bind scope=Undefined, query=True
| Processes `.component[data-component]` nodes and @{load}s the
| component denoted by `@data-component. By default, this
| does a document-wide query.
	if scope is Undefined
		# NOTE: We can't do document.firstChild, as it returns the DOCTYPE
		# in Edge, and Edge has no firstChildElement.
		scope = window document childNodes [0]
		while scope and scope nodeType != Node ELEMENT_NODE
			scope = scope nextSibling
		assert (scope, "Could not resolve a global scope", __scope__)
	if scope is? String
		return bind (window document querySelectorAll (scope))
	elif scope is? window.Node
		if (scope classList and scope classList contains "component")
			let name = scope getAttribute "data-component"
			# TODO: Support in place
			let in_place = scope getAttribute "data-component"
			if not name
				error (".component node missing @data-component attribute:", scope, "in", scope, __scope__)
			else
				return load (name) chain {instanciate (_ model, _ view, scope, name)}
		elif query
			# NOTE: Query selector is case-insensitive
			return scope querySelectorAll ".component" ::> {r,e|
				r     = r or []
				let v = bind (e, False)
				if v
					r push (v)
				return r
			}
	else
		error (BadArgument, "scope", scope, [String, window.Node], __scope__)

# FIXME: Use runtime module
modules resolver ["component"] ?= "components/*"
modules loader   ["component"] ?= {url,name,callback|load (name) then {callback (_) if callback}}
modules parser   ["component"] ?= {response,name,_,url|return _}

# EOF
