@feature sugar 2
@module  std.util.traversal
@import  TFlyweight from std.patterns.flyweight
@import  TSingleton from std.patterns.oo

@enum Direction = BREADTH | DEPTH

# -----------------------------------------------------------------------------
#
# TRAVERSAL ADAPTER
#
# -----------------------------------------------------------------------------

@class TraversalAdapter
| A generic traversal adapter that works wit any clas that implements TLeaf
| or TNode

	@method getParent node
		return node parent

	@method getChildren node
		return node children if node else []
	
	@method getChildrenAt node, index
		if not node
			return None
		else
			let c = getChildren (node)
			return c[index]

	@method getChildrenIndex node, child
		return find (getChildren (node), child) if node else -1
	
	@method eachChild node, callback
		if not callback or not node
			return self
		for c in getChildren (node)
			if callback (c) is False
				return self
		return self

# -----------------------------------------------------------------------------
#
# A TRA
#
# -----------------------------------------------------------------------------


@class Traversal: TFlyweight, TSingleton

	@property _adapter = new TraversalAdapter ()

	@method roots node, callback=Undefined
		if not callback
			let r = [] ; callback = {r push (_) if _ not in r}
			roots (node, callback)
			return r
		elif node is? Array
			var r = Undefined
			node :: {r = roots (_, callback)}
			return r
		elif node
			var root   = Undefined
			while root is Undefined
				let parent = _adapter getParent (node)
				if not parent
					root = node
				else
					node = parent
			return callback (root)
		else
			return None

	@method ancestors node, callback
		if node is? Array
			node :: {ancestors(_, callback)}
			return self
		else
			return node and ancestorsOrSelf (node parent, callback)

	@method ancestorsOrSelf node, callback
		var index = 0
		if node is? Array
			node :: {ancestorsOrSelf(_, callback)}
		else
			while node
				if callback (node, index) is False
					node = None
					return False
				else
					node   = _adapter getParent (node)
					index += 1
		return self

	@method descendants node, callback
		if node is? Array
			node :: {descendants(_, callback)}
			return self
		else
			return node and descendantsOrSelf (node, callback)

	@method descendantsOrSelf node, callback
		var index = 0
		if node is? Array
			node :: {descendantsOrSelf(_, callback)}
		else
			if callback (node) is not False
				walkDepth (node, callback)
			return self

	@method walk node, callback:Function, direction=DEPTH
	| Walks the subtree in @BREADTH or @DEPTH traversal using
	| the given @callback.
	|
	| - @callback takes `f(node)` and will stop the traversal
	|   on the first `False` returned.
		if not callback
			let l = []
			walk (node, {l push (_);True}, direction)
			return l
		else
			return direction match
				is BREADTH
					walkBreadth (node, callback)
				is DEPTH
					walkDepth   (node, callback)
	
	@method path tree, node, context=[]
	| Performs a depth-first search for the given node
		if (node is tree) or (node is? Function and node(tree, context))
			return context
		for child in tree children
			let res = path (child, node, context concat ([tree]))
			if res
				return res
		return Undefined

	@method walkBreadth node, callback:Function
	| Breadth-first traversal, see @walk
		# FIXME: This is not a true breadth-first in the sense
		# that it does not do iteration per level.
		if node is? Array
			node :: {walkBreadth (n, callback)}
			return self
		elif node
			let l = []
			_adapter eachChild (node, {
				if callback (_) is not False
					l push (_)
			})
			l :: {walkBreadth (_, callback)}
			return self
		else
			return self

	@method walkDepth node, callback:Function
	| Depth-first traversal, see @walk
		if node is? Array
			node :: {walkDepth (_, callback)}
			return self
		else
			_adapter eachChild (node, {walkDepth (_, callback) if callback (_) is not False})
			return self

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL
#
# -----------------------------------------------------------------------------

@function walk node, callback
	Traversal Get () walk (node, callback)

@function path tree, node
	return Traversal Get () path (tree, node)

# EOF
