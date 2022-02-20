@feature sugar 2
@module  std.ui.render
| Implements the fundamental operations required by the JSXML rendering backend.
|
| The `Effects` class implements deferred DOM effect that minimize DOM layout
| thrashing and implements support for virtual nodes as comment nodes.
|
| The `multiple` function manages the mapping of multiple elements to correponsding
| view fragment.s

@import assert,error,warning    from std.errors
@import remove, merge           from std.collections
@import bool, len, identity     from std.core
@import now                     from std.io.time
@import Async                   from std.io.async
@import Tween, Animator, Easing from std.ui.animation

@shared DEFAULT_UNIT = {
	width         : "px"
	height        : "px"
	paddingTop    : "px"
	paddingLeft   : "px"
	paddingRight  : "px"
	paddingBottom : "px"
	marginTop     : "px"
	marginLeft    : "px"
	marginRight   : "px"
	marginBottom  : "px"
	left          : "px"
	top           : "px"
	bottom        : "px"
	right         : "px"
}

@shared NAMESPACES = {
	xlink : "http://www.w3.org/1999/xlink"
	svg   : "http://www.w3.org/2000/svg"
}

# -----------------------------------------------------------------------------
#
# EFFECTS
#
# -----------------------------------------------------------------------------

@class Effects
| Implements fast deferred DOM effect with support for comments as
| virtual nodes. This class is on the hot path and should be optimized
| for speed and minimzing the garbage collection work.

	@shared Instance = None

	@operation Get
	| Returns a singleton effects instance.
		if not Effects Instance
			Effects Instance = new Effects ()
		return Instance

	# The `domops` collect DOM mutation operations, while `styleops` collect
	# CSS level operations. Typically styleops are applied first and then
	# DOM ops are applied.
	# --
	# FIXME: We need to guard against overflow there, I don't think it's such
	# good strategy to pre-allocate like that, it's probably better to grow
	# the array based on rendering needs. The problem is that the effects 
	# are PER COMPONENT, and as a result this can become quite expensive.
	@property domops     = []
	@property styleops   = []
	@property isDeferred = False
	@property _callbacks = []
	@property _lastTime  = 0

	@method does callback, bind=True
		if bind is True
			_callbacks push (callback)
		else
			_callbacks = _callbacks ::? {_ is not callback}
		return self
	
	# =========================================================================
	# MOUNTING
	# =========================================================================
	# Mounting is by far the most complex operation done here. The key aspect
	# is that we support ‟virtual” nodes, which are comment nodes with a
	# `__mounts` attribute holding the array of their children.

	@method mount nodes, parent, previous=None, context=Undefined, mapping=Undefined
	| Creates a `_mount` operation that will mount all the given `nodes`
	| in the given `parent`, after the given `previous` node.
		# NOTE: Context and mapping are not used for now
		if not nodes
			return nodes
		elif not parent
			error ("Mounting without a parent node", nodes, "to", parent, "after", previous, __scope__)
			return nodes

		# We make sure the given nodes are as a list
		nodes    = [nodes] if nodes is? Node else nodes

		# FIXME: This does not seem to do anything relevant
		#previous = _tail (previous)

		# If the parent is a virtual node, we update the list of
		# virtual children by making sure that the nodes are in the __mounts
		# list.
		if parent nodeType is Node COMMENT_NODE
			let m = parent __mounts
			# NOTE: This will not move any node that was already added, and
			# might actually create an out-of-order organization
			# for virtual children.
			if not m
				parent __mounts = nodes
			else
				let l = []
				for n in nodes
					if n not in m
						l push (n)
				parent __mounts = m concat (l)

			# If we don't have an explicit previous node, the previous node
			# is going to be the VIRTUAL parent. It's normal: we want the
			# children nodes to be inserted in __mount order after the
			# parent. If we don't do that, the children won't be inserted
			# before the virtual nodes's siblings.
			previous = previous or parent
			# We switch the parent to the real DOM parent, which is guaranteed
			# not to be virtual.
			parent = parent parentNode

		# And now we reduce the nodes and make sure they're inserted
		# one after the other.
		let op = {_reduce (nodes, {r,n,vp|return _mount(n, parent, r, vp)}, previous)}
		if not isDeferred
			op ()
		else
			domops push (op)
		return nodes

	# NOTE: The virtualParent is mainly here for debugging purposes
	@method _mount node, parent, previous, virtualParent=Undefined
		# NOTE: At this stage, we don't have to worry about VIRTUAL nodes,
		# as the _mountNode should be called within a _reduce at that stage.
		if not parent
			pass
		elif previous and previous nextSibling
			if previous nextSibling is not node
				parent insertBefore (node, previous nextSibling)
		elif node parentNode is not parent
			parent appendChild (node)
		return node

	@method _reduce value, callback, res=Undefined, virtualParent=Undefined
	| Applies the `callback` on the given `values`. When `value`
	| contains a *comment node*, then `_reduce()` will be recursively
	| invoked on its `__mounts` value. The `__mounts` value are used
	| to keep track of nodes added as (virtual) children of the comment
	| node.
		for v,i in value
			res = callback (res, v, virtualParent)
			if not v
				error ("Expecting a node in entry",i,"of", value,"got", v, __scope__)
			elif v nodeType == Node COMMENT_NODE and v __mounts
				# NOTE: It's crucial that we update the result
				res = _reduce (v __mounts, callback, res, v)
		return res

	@method _tail node
	| Returns the tail of the given node, which means:
	| - The node itself if it is not VIRTUAL
	| - For a virtual node, the tail of its last __mount element
		var tail = node
		while node and node nodeType is Node COMMENT_NODE and node __mounts
			tail = node
			node = node __mounts [-1]
		return tail

	# =========================================================================
	# UNMOUNT
	# =========================================================================

	@method unmount node, parent=Undefined
	| Unmounts the given node, supporting VIRTUAL nodes.
		if not node
			return None
		parent ?= node parentNode
		let is_in_virtual = parent and parent nodeType == Node COMMENT_NODE
		# NOTE: We don't want to remove the node from the __mounts already, as
		# otherwise the _unmount's call to _reduce will skip some nodes. If we
		# remove nodes from the __mounts without actually removing them from
		# their physical parent, then they're not going to be unmounted unless
		# explicitely unmounted.
		let virtual_parent = parent if is_in_virtual else None
		let actual_parent  = parent parentNode if is_in_virtual else parent
		if node is? Array
			# We have an array, so we unmount each node
			let op = {node forEach {
				if _
					_unmount (_, virtual_parent, actual_parent)
			}}
			if not isDeferred
				op ()
			else
				domops push (op)
			return node
		elif node and node parentNode
			# We have a node and it is mounted
			let op = {
				if node
					_unmount (node, virtual_parent, actual_parent)
			}
			if not isDeferred
				op ()
			else
				domops push (op)
			return node
		elif node and virtual_parent and virtual_parent __mounts
			# We have a node and it is not mounted. We can readily remove
			# it from its virtual parent
			virtual_parent __mounts = virtual_parent __mounts ::? {_ is not node}
			return node
		else
			# The node is already unmounted and does not belong to a virtual
			# parent. We don't have anything to do.
			pass


	@method _unmount node, virtualParent=Undefined, actualParent=Undefined
	| An effector that unmounts the given node, handling the case where the
	| node is a virtual node.
		# We need to make sure that if the node is mounted, it is mounted on
		# the expected parent. We could have cases where as node is mounted
		# in a previous node and unmounted in a next node. If we don't do
		# the check, the node will be completely unmounted.
		# FIXME: We should also test the previous child, as in a case like
		# this:
		# <ul
		#   <li
		#       <jsx::html(value=data.node0)
		#   <li
		#       <jsx::html(value=data.node1)
		#
		# where we assign to data.node0 or data.node1 the same physical
		# node.
		if node and node parentNode
			if (not actualParent) or (node parentNode is actualParent)
				node parentNode removeChild (node)
		if virtualParent and virtualParent __mounts
			virtualParent __mounts = virtualParent __mounts ::? {_ is not node}
		if node __mounts
			_reduce (node __mounts, {r,v|
				if v parentNode
					if (not actualParent) or v parentNode is actualParent
						v parentNode removeChild (v)
			})

	# =========================================================================
	# CONTENT
	# =========================================================================

	@method children value, parent
		# NOTE: This is used by @jsx:value
		let op = {
			if value is? Array
				# TODO: Optimize this
				while parent firstChild and parent firstChild != value[0]
					parent removeChild (parent firstChild)
				if parent firstChild != value[0]
					value :: {parent appendChild (_)}
			else
				while parent firstChild and parent firstChild != value
					parent removeChild (parent firstChild)
				parent appendChild (value)
		}
		if not isDeferred
			op ()
		else
			domops push (op)

	@method text value, node
		if node nodeType is Node COMMENT_NODE
			let m = node __mounts or []
			var n = Undefined
			node __mounts = m
			# In case there are mounted nodes there, we unmount all of them
			# and try to keep the first one that is a text node.
			if m length == 1 and m[0] nodeType is Node TEXT_NODE
				n = m[0]
			elif m length > 0
				if node __mounts
					unmount (node __mounts, node)
			# If we have a text node, we set its value. Otherwise
			# we'll need to mount it
			if n
				if not isDeferred
					n textContent = "" + value
				else
					domops push {n textContent = "" + value}
			else
				n = document createTextNode ("" + value)
				m push (n)
				# And we mount the nodes
				mount (node __mounts, node)
			return value
		else
			if not isDeferred
				# NOTE: This might erase comment nodes
				node textContent = "" + value
			else
				# NOTE: This might erase comment nodes
				domops push {node textContent = "" + value}
		return value

	@method html value, node
		if node nodeType is Node COMMENT_NODE
			# Is there anything mounted, we clear it -- it's too complicated
			# to try to reuse the already mounted nodes
			if node __mounts
				# NOTE: We need to filter out the node if it's already
				# mounted as removing and then adding a node clears
				# the selection/focus.
				unmount (node __mounts ::? {_ is not value}, node)
			# Now we push the siblings
			if value is? String
				# NOTE: This might not be ideal, waybe we could just parse
				# the HTML to a dom fragment? This is possible using DOM parser,
				# but it creates a new document, which is not ideal.
				let n = document createElement "span"
				n innerHTML = "" + value
				var c = n firstChild
				let l = []
				while c
					l push (c)
					c = c nextSibling
				mount (l, node)
			else
				mount (value, node)
			return value
		else
			let effector = {
				if value is? String
					# FIXME: Ideally, we should use the same as the COMMENT_NODE branch
					node innerHTML = "" + value
				else
					while node firstChildElement and node firstChildElement is not value
						node removeChild (node firstChildElement)
					if node firstChildElement is not value
						node appendChild (value)
			}
			if not isDeferred
				effector ()
			else
				domops push effector
			return value

	# =========================================================================
	# STYLE
	# =========================================================================

	@method style name, value, node
		if value is? Node
			# That's a direct style ― ie, it's style(value,node)
			if not isDeferred
				if name is? String
					value setAttribute ("style", name)
				else
					name :: {v,k|value style setProperty (k, v)}
			else
				styleops push {
					if name is? String
						value setAttribute ("style", name)
					else
						name :: {v,k|value style setProperty (k, v)}
				}
		else
			# We normalize the value
			match value
				is? String
					pass
				is? Number
					value = value + (DEFAULT_UNIT[name] or "")
				is? Array
					value = value[0] + (value[1] or DEFAULT_UNIT[name] or "")
				is? Object
					let r = []
					for v,k in value
						r push (k)
						r push "("
						if v is? Array
							r = r concat (v)
						else
							r push (v)
						r push ") "
					value = r join ""
			# TODO: Shouldn't we remove the style if it's None?
			if not isDeferred
				node style setProperty (name, value)
			else
				styleops push {node style setProperty (name, value)}

	# =========================================================================
	# CLASS
	# =========================================================================

	@method setclass value, node
		if not isDeferred
			node className = "" + value
		else
			styleops push {node className = value}

	@method addclass value, node
		if not isDeferred
			node classList add (value)
		else
			styleops push {node classList add (value)}

	@method rmclass value, node
		if not isDeferred
			node classList remove (value)
		else
			styleops push {node classList remove (value)}

	@method toggleclass value, node
		if not isDeferred
			node classList toggle (value)
		else
			styleops push {node classList toggle (value)}

	# =========================================================================
	# ATTRIBUTES
	# =========================================================================

	# TODO: Rework to have better NS non-NS support. Right now this is a bit
	# of a cobbled-up together incomplete implementation.

	@method setattr name, value, node
		if value is Undefined
			return None
		if value is? Object
			# This takes {name:boolean, ‥} and returns all the names
			# that are true as a list.
			value = ((value ::> {r,v,k|return ((r or []) concat (k)) if v else r} or []) or []) join " "
		if value is None
			if not isDeferred
				node removeAttribute (name)
			else
				domops push {node removeAttribute (name) }
		else
			if not isDeferred
				node setAttribute (name, "" + value)
			else
				domops push {node setAttribute (name, "" + value)}

	@method setattrns namespace, name, value, node
		namespace = NAMESPACES[namespace] or namespace
		if value is Undefined
			return None
		if value is? Object
			# This takes {name:boolean, ‥} and returns all the names
			# that are true as a list.
			value = ((value ::> {r,v,k|return ((r or []) concat (k)) if v else r} or []) or []) join " "
		if value is None
			if not isDeferred
				node removeAttributeNS (namespace, name)
			else
				domops push {node removeAttributeNS (namespace, name) }
		else
			if not isDeferred
				node setAttributeNS (namespace, name, "" +value)
			else
				domops push {node setAttributeNS (namespace, name, "" + value)}

	@method rmattr name, value, node
		if not isDeferred
			_rmattr(name,value, node)
		else
			domops push {_rmattr(name,value, node)}

	@method rmattrns namespace, name, value, node
		namespace = NAMESPACES[namespace] or namespace
		if not isDeferred
			_rmattrns(namespace, name,value, node)
		else
			domops push {_rmattrns(namespace, name,value, node)}

	@method toggleattr name, value, node
		if not isDeferred
			_rmattr(name,value,node) or _addattr(name,value,node)
		else
			domops push { _rmattr(name,value,node) or _addattr(name,value,node) }

	@method addattr name, value, node
		if not isDeferred
			_addattr(name,value,node)
		else
			domops push {_addattr(name,value,node)}

	@method _rmattr name, value, node
		let v = node getAttribute (name)
		if v and v indexOf (value) >= 0
			let va = v split " "
			node setAttribute (name, va filter {_ != value} join " ")
			return True
		else
			return False

	@method _rmattrns namespace, name, value, node
		let v = node getAttributeNS (name)
		if v and v indexOf (value) >= 0
			let va = v split " "
			node setAttributeNS (namespace, name, va filter {_ != value} join " ")
			return True
		else
			return False

	@method _addattr name, value, node
		let v = node getAttribute (name)
		if not v or v length == 0
			node setAttribute (name, "" + value)
			return True
		elif v != value
			let i = v indexOf (value)
			if i < 0
				node setAttribute (name, v + " " + value)
				return True
			elif i == 0 and v[i + value length] != " "
				node setAttribute (name, v + " " + value)
				return True
			elif v[i - 1] != " " and v[i + value length] != " "
				node setAttribute (name, v + " " + value)
				return True
		return False

	# =========================================================================
	# RENDERING
	# =========================================================================

	@method render propagate=True
	| Applies the style and DOM operation registered, all in one shot, It then
	| triggers the `PostRender` event.
		# NOTE: DOM operations first yield better performance in dbmonster,
		# but conceptually it seems that preventing changes while mounted
		# is better.
		# We apply style operations first
		if isDeferred
			var i=0
			let n = styleops length
			while i < n
				styleops[i] ()
				i += 1
			styleops = []
			# And then the styling operations
			var j=0
			let m = domops length
			while j < m
				domops[j] ()
				j += 1
			domops = []
		# We don't want to propagate the callbacks/post-render when we're
		# rendering in a tight loop (ie. from a tween)
		if propagate
			if _callbacks length > 0
				let t  = now ()
				let dt = 0 if _lastTime == 0 else (t - _lastTime)
				let t0 = t if _lastTime == 0 else _lastTime
				_callbacks ::= {_(t,dt,t0)}
				_lastTime = t
			self ! "PostRender"

# -----------------------------------------------------------------------------
#
# MULTIPLE RENDERING
#
# -----------------------------------------------------------------------------

@singleton API
| Collects all the methods uses by the JSXML delta rendering.

	@property COUNT = 0

	# =========================================================================
	# FACTORY METHODS
	# =========================================================================

	@method createTextNode text:String
		return window document createTextNode (text)

	@method createElement name:String
		return window document createElement (name)

	@method createElementNS ns:String, name:String
		return window document createElementNS (ns, name)

	@method createComment text:String
		return window document createComment (text)

	@method createViewFactory  create, update, remove=Undefined, onMount=Undefined, onUnmount=Undefined, key=Undefined
		return {component|createView(component, create, update, remove, onMount, onUnmount, key)}
	
	@method updateChild context, childContext
	| The main rendering method that manages the creation,  binding and updating
	| of children components. This is the heart of the composition mechanism
	| between components. The child context is expected to contain the folowing keys:
	|
	| - `type:String|Class|Component`
	| - `name:String` the name to which the child is bound to
	| - `index:Number|String` the key/index to which the child is bound to
	| - `component?:Boolean|Component`
	| - `binding?:Function`
	| - `unbinding?:Function`
	| - `previous{Name,Type,Index,Component,Options}`
		let parent  = context component
		let ctx     = childContext
		var child   = ctx component or None
		# FIXME: The options management is not ideal. We should get the latest
		# full snapshot.
		let options = ctx options
		# If the component is asynchronously loading, the it is set to `True`
		# (by convention), and we need to merge the options, taking the latest
		# option as the overriding values.
		if ctx component is True
			ctx options = merge (ctx options, ctx previousOptions)
		# If there is an existing child and it is of a different type, we 
		# need to ubind it from the parent and we also need to unmount it
		if child and ctx type != ctx previousType
			if child is not True
				# FIXME: I'm not sure this is right, instead of child it
				# should probably be `ctx previousComponent`
				parent unbindChild (ctx previousName, child, ctx previousIndex)
				ctx unbinding (parent state, child state) if ctx unbinding
				if child node is ctx node
					# Here we unmount the child if it still mounted on 
					# the given node. We use to call `dispose`, but it's
					# really unmount that should be called, as the component
					# might be reused later.
					child unmount ()
				child = None
				ctx previousType = None
				# In the case where the child is being replaced, we merge in the
				# original options.
				ctx options = merge (ctx options, ctx originalOptions)
		# FIXME: This if…else sequence is disjoint from the one above, but
		# it should probably not be.
		# ---
		# If there is no child component, then we need to create it
		if not child
			let type       = ctx type
			let bind_child = {ctx,parent,child|
				# FIXME: We should probably have a "bindChildren" in the render
				child view Component context _children = ctx children
				ctx component                          = child
				ctx binding (parent state, child state) if ctx binding
				parent bindChild (ctx name, child, ctx index)
				# NOTE: Here we're going to keep the original options
				# for quite some time, but it's only necessary if the
				# component is dynamic, ie. might change at runtime.
				ctx originalOptions = ctx options
				child mount (ctx node)
				return child
			}
			# FIXME: The ordering of operations (mount, options, cell binding)
			# differs between each branch. This should be harmonized.
			if type is? String
				# If the type is a string, we need to first load 
				ctx component = True
				# It's super important here to do that so that we DON'T load
				# the module too many times.
				context components[type] ?= parent loadComponent (type)
				context components[type] then {_|
					# NOTE: There's an edge case here where the component type changes BEFORE
					# the component is loaded
					# NOTE: There's an edge case where the async component is mounted but
					# the parent was unmouted. We should then do nothing here.
					let res = parent createChild (ctx name, _, ctx node, ctx options)
					bind_child (ctx, parent, res)
				}
			elif type and type isComponent
				child = type
				child bindOptions (ctx options)
				bind_child  (ctx, parent, child)
			elif type
				# This is a synchronous operation using the module. The component
				# will be initialized with the options and mounted.
				bind_child (ctx, parent, parent createChild (ctx name, type, ctx node, ctx options))
			else
				# This can actually happen when we're giving a dynamic
				# component with no reference yet.
				# warning ("Empty component type", ctx, __scope__)
				pass
		elif child is True
			# The child is still being loaded, we
			# should probably check that the options here are still valid
			pass
		else
			if ctx previousType and (ctx name != ctx previousName or ctx index != ctx previousIndex)
				parent unbindChild (ctx previousName, ctx previousComponent, ctx previousIndex)
			else
				# There's nothing to do here, the child is already bound
				pass
			if ctx options
				child bindOptions (ctx options)
			# It's important to asssign the component there
		# We returns the child's context
		return ctx

	@method mountChild parent, child, node
		child mount (node)

	@method unmountChild parent, child, node
		child unmount (node)

	@method createView component, create, update, remove=Undefined, onMount=Undefined, onUnmount=Undefined, key=Undefined
		# We create the view context, which is now bound to the component. The view context can
		# be re-attached to different nodes, in which case the context will automatically manage
		# the mount/unmount.
		#
		# The role of the view context is essentially to create a bridge between the component
		# layer and the rendering layer. This rendering module is to work with JSXML and our
		# in-house animation module.
		#
		# Before 2019-09-23, a view would create one context per node, the idea might have been that
		# one component could render itself to many different nodes. Although seducing, the
		# problem is that as soon as the component has ref'ed nodes or sub-components, things
		# fall apart.
		let context = {
			_children   : {}
			mapping     : {}
			components  : {}
			animator    : Undefined
			effects     : new Effects ()
			# The unmounter is for elements that have unmount transitions
			unmounter   : self . _getTransitionUnmounter
			translate   : component . translate if component and component translate else None
			roots       : Undefined
		}
		if component and component _measure
			context effects does {component _measure ()}
		context transition = createTransitionFactory (context)
		# We create the view itself
		let view    = { context:context, create:create, update:update, remove:remove, node:undefined}
		COUNT      += 1
		# op == -1 is UNMOUNT
		# op ==  1 forces a MOUNT
		# NOTE: The following is the rendering function
		let render = {data, node, op|

			# We determine if we need to CREATE/UPATE/MOUNT/UNMUONT
			# (sometime doing a combination of these)
			var will_create  = context roots is Undefined and op != -1
			# NOTE: It is CRUCIAL not to mount twice, as otherwise
			# the bind nodes WILL be called twice without an unbind.
			var will_mount   = (not context isMounted) and (op ==  1 or will_create)
			var will_unmount = op == -1
			var will_update  = not will_unmount

			# If the context node has differend and is defined, we
			# need to unmount from the old node first. We'll use the 
			# old data for that so as to not trigger an update.
			if context node and context node != node
				render (context data, context node, -1)
				will_mount = True

			# We update the context accordinglu.
			let c       = context
			let m       = context mapping
			c data      = data
			c component = component
			c node      = node

			# If no node is given, then we simply exit, because we've
			# already unmounted.
			if not node
				return None

			if will_create
				c roots = create (data, Undefined, node, c, m)

			if will_update
				update (data, Undefined, node, c, m)

			if will_mount
				mount  (c roots, node, Undefined, c, m)
				c isMounted = True
				if onMount
					onMount (data, Undefined, node, c, m, component)

			elif will_unmount
				unmount (c roots, node, c roots, c, m)
				c isMounted = False
				if onUnmount
					onUnmount (data, Undefined, node, c, m, component)

			# We render the effects, whatever the specific case.
			c effects render ()
			return c effects
		}
		render Component = view
		# NOTE: Not sure why...
		# render getContext = {node|return node[ckey] if node else None}
		return render

	@method createTransitionFactory context
	| Returns a `(context):Transition` functor
	| that creates a transition in the given `context`. By default this
	| uses `createTransition`.
		return {options|createTransition(context, options)}

	@method createTransition context, options
	| Creates a transition in the given `context` with the given `options`.
	| The context is expected to be like `{animator,…}` and the
	| context like `{delay,duration,easying,from,to,effector}`. This returns
	| primitives from the `std.ui.animation` module.
		if  not context animator
			# The effector of the animation renders without triggereing callbacks
			# otherwise we'll end up with too many calls to `measure`
			# with transitions.
			context animator = new Animator {context effects render (False)}
			context animator onStop {
				# On end of tween, we call a render and notify of the end
				context effects render (True)
				context animator clean ()
			}
		let a = context animator
		# FIXME: Should we re-use tweens?
		let t = new Tween ()
		return {d,i,n,c,m,phase|
			let elapsed   = a elapsed
			var processor = Undefined
			if options processor
				processor = {value,source,destination,k|
					options processor (value, source, destination, k, d, i)
				}
			t effector {options effector (_,i,n,c,m)}
			# We assign the initial (options from) value if there is no
			# value set.
			if t _lastValue is Undefined and options from
				t from (options from (d,i,n,c))
			# If we're in the unmount phase (phase < 0), then we recalculate
			# the data value to be the one defined by the `to` option.
			if phase < 0
				d = options to match
					is? Function
						options to (d, i, n, c, m)
					is Undefined
						d
					else
						options to
			if c component hasResized or (c component enableAnimations is False)
				t during  0
				t delay   0
				t process (None)
				t update  (d)
				# NOTE: Why do we render twice here?
				# t render  (a elapsed)
				t render  (elapsed)
				a remove  (t)
			else
				if True or t hasEnded (elapsed) or t lastValue is Undefined
					t ease    (_getTransitionEasing    (options))
					t during  (_getTransitionDuration  (options, d, i, n, c, m))
					t process (processor)
					let delay =_getTransitionDelay     (options, d, i, n, c, m)
					# FIXME: Setting t delay does not seem to work :/
					t update (d)
					a schedule (t, delay)
					a start  ()
				# TODO: Overlapping tweens
				# else
				# 	pass
			return t
		}

	@method _getTransitionUnmounter transitions
	| Returns the longest date where the transition ends.
		let t = transitions ::> {r,v|
			if v and ((not r) or (v ends > r ends))
				return v
			else
				return r
		}
		if len(t) == 0
			# If there's no transition to unmount, we unmount directly
			return None
		else
			# The unmounter callback will be executed
			# at the end.
			return {unmounter|t !! "End" { unmounter () }}

	@method _getTransitionEasing options
		if not options
			return Undefined
		elif options easing is? Function
			return options easing
		elif options easing
			return Easing get (options easing)
		else
			return Undefined

	@method _getTransitionDuration options, d, i, n, c, m
		if not options or not options duration
			return 500
		elif options duration is? Function
			return options duration (d, i, n, c, m)
		else
			return options duration

	@method _getTransitionDelay options, d, i, n, c, m
		if not options or not options delay
			return 0
		elif options delay is? Function
			return options delay (d, i, n, c, m) or 0
		else
			return options delay or 0

	# =========================================================================
	# UTILITY FUNCTIONS
	# =========================================================================

	@method and a, b
		return a and b

	@method or a, b
		return a or b

	@method gt a, b
		return a > b

	@method gte a, b
		return a >= b

	@method lt a, b
		return a < b

	@method lte a, b
		return a <= b

	@method changed a, b
	| Expects a and b to be arrays or false/none/null values, will
	| do a shallow compare of a and b and return true if they
	| differ.
		if a and b
			if a length == b length
				var i = 0
				let l = a length
				while i < l
					if a[i] != b[i]
						return True
					i += 1
				return False
			else
				return True
		else
			return a is not b

	# =========================================================================
	# NODE MOUNT/UNMOUNT
	# =========================================================================
	# NOTE: mount/unmount have the same interface, but `nn` is not used in unmount.

	@method mount r, n, nn, c, m
	| Mounts the nodes `r` to the parent node `n` after the optional nodes
	| `nn` using the context `c` and mapping `m`.
		c effects mount (r, n, nn, c, m)

	@method unmount r, n, nn, c, m
	| Ununts the nodes `r` from the parent node `n` using the context `c` and mapping `m`.
	| The `nn` parameter is unuesed but kept so that mount and unmount share
	| the same prototype.
		if not r
			# This WILL happen when called a the tail of a transition
			pass
		elif r parentNode and r is? Node
			c effects unmount (r, n, cm)
		elif r is? Array
			var i = 0
			let l = r length
			while i < l
				c effects unmount (r[i], n, c, m)
				i += 1


# -----------------------------------------------------------------------------
#
# MULTIPLE RENDERING
#
# -----------------------------------------------------------------------------

# NOTE: The prototype of this function is a little bit too big now.
@function multiple component, data, key, node, context, mapping, create, update, remove, onMount, onUnmount, mount, unmount, extractor=identity, comparator=None
| The main function of the rendering module that manages an 1-N mapping. This function is on the hot path,
| so it needs to be fast and reliable. Here is it how it works:
|
| - `data` is the data to be renderered
| - `key` is the current key in the parent (nested `multiple` calls)
| - `node` is the DOM node to which we'll add/remove elements
| - `context` is the object representing the data context (wher shared variables are available)
| - `mapping` is the mapping of nodes, allowing rendering function to access nodes directly
| - `create/update/remove` are the `(data,index,context,mapping)` functions executed
|    when nodes are added/updated/removed
| - `mount/unmount` are the functions to mount or unmount nodes from `node`,
|   which is typically done at `create/update`
| - `extractor` extracts individual values to be mapped from the given data (defaults to `identity`)
| - `comparator` can be overriden to detect changes between values
|
| Extractor and comparator are for advanced cases where you need extra data
| transformations.
|
| The mapping will be updated with the folowing keys:
|
| - `recycled:[]` listing the removed nodes available to be re-used
| - `existing:{}` the mapping between data keys and {node,children,cycle}
|
| These keys are pretty much opaque: the actual node rendering functions
| should not try to access/reuse them.
	# In this first pass, we identify the nodes that need to be mounted
	let to_mount      = []
	# Here we manage the recycling of elements. When an element is
	# UNMAPPED (ie. it was not part of this current data), it
	# will have a different CYCLE value from the current one.
	# We remove these values from the `mapping.existing` and
	# move them to the `mapping.recycled` stack.
	mapping existing ?= {}
	mapping recycled ?= []
	let mapping_cycle    = (mapping cycle or 0) + 1
	let mapping_existing = mapping existing
	let mapping_recycled = mapping recycled
	mapping cycle        = mapping_cycle
	# === Which nodes should we mount?
	for v,k in data
		var existing = mapping_existing[k]
		# We update the context so that the callbacks will have the
		# current value bound.
		context[key] = v
		# 1) There is no previous binding, so we create a new one
		if not existing
			if mapping_recycled length > 0
				existing = mapping_recycled pop ()
				update (v, k, existing node, context, existing children)
			else
				let c    = {}
				let n    = create (v, k, node, context, c)
				existing = {
					node     : n
					children : c
					value    : v
					cycle    : 0
				}
				update (v, k, n, context, c)
			# In both cases, we update the mapping
			mapping_existing[k] = existing
			if onMount
				onMount (v, k, existing node, context, existing children, component)
		# 2) There is a previous binding, so we extract the value and
		# compare it to the existing value. If it's not the same, we
		# update it. If it's the same, no update is necessary
		elif (not comparator) or (comparator(extractor(v,k), existing value))
			update (v, k, existing node, context, existing children)
		# In all cases me mount the nodes and them to the result
		let r          = existing node
		existing cycle = mapping_cycle
		to_mount       = to_mount concat (r)
	# === Which nodes should we unmount?
	# We cap the recycling stack at 1000 elements.
	for m,k in mapping_existing
		# Any node that does not have this mapping cycle was not created
		# or updated, and then must be removed.
		if m cycle != mapping_cycle
			let n = m node
			# We update the context so that the remove callback
			# has the inforamtion it needs.
			context[key] = m value
			# We execute the remove callback if provided
			remove    (m value, k, n, context) if remove
			# Now we can have *deferred* unmounting, which happens when you
			# have exit transitions. The `onUnmount` callback can return another
			# callback that received the unmounting effector and should be executed
			# once the transition ends. This only happens when the element has
			# an exit transition.
			let unmounter = onUnmount and onUnmount (m value, k, n, context, m children, component)
			if unmounter
				let f = {_multipleUnmountHelper (unmount, k,m,n, node, context, mapping_existing, mapping_recycled)}
				unmounter (f)
			else
				_multipleUnmountHelper (unmount, k,m,n, node, context, mapping_existing, mapping_recycled)

	# === We now proceed with the mounting
	if to_mount length > 0
		mount (to_mount, node, Undefined, context, mapping_existing)

@function _multipleUnmountHelper unmount, key, mapped, node, parent, context, existing, recycled
| A helper function that implements the effector for the `multiple` unmount
| when given to a a deferred unmounter.
	# We unmount the node
	# FIXME: Should clarify the prototype and why the second
	# argument is Undefined.
	unmount (node, parent, Undefined, context, existing)
	# We remove the key from the existing mapping, so that it's
	@embed JavaScript
		delete (existing[key]);
	# We add the mapping to recycled mappings if it's not above
	# capacity.
	if recycled and recycled length < 1000
		recycled push (mapped)

# EOF
