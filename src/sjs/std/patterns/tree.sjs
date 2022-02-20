@feature sugar 2
@module  std.patterns.tree
| Defines the @Node trait that offers parent/child relationships and
| depth/breadth traversal operations.

@import  bool   from std.core
@import  remove from std.collections

# -----------------------------------------------------------------------------
#
# LEAF
#
# -----------------------------------------------------------------------------

@trait TLeaf

	@property parent:Node = Undefined

	@method hasParent:Boolean
	| Tells if the node has a parent or not
		return bool (parent)

	@method getParent:Node|Undefined
	| Returns the parent of the node
		return parent

	@method getRoot
		var p = self
		while p parent
			p = p parent
		return p

	@method isLeaf
	| Tells if the node is a leaf or not (ie. has childen)
		return True

# -----------------------------------------------------------------------------
#
# NODE
#
# -----------------------------------------------------------------------------

@trait TNode: TLeaf
| Implements a simple Node API that can be used to implement walkable
| tree structures.

	@event Add
	@event Remove

	@property children  = []
	@property sink     = Undefined
	| The sink is used to relay all events.

	@method isLeaf
		| Tells if the node is a leaf or not (ie. has childen)
		return children length == 0

	@group Accessors

		@method hasChild child:TNode
			return child in children

	@group Mutators
		
		@method addChild child:TNode
		| Adds the given child node to this node. If the child has a
		| parent, the child will be detached from the former parent.
			if child is? TLeaf
				if child parent
					child parent removeChild (child)
				child parent = self
			child sink ?= sink
			children push (child)
			self ! "Add" (child)
			sink ! "Add" (child)
			self ! "Update" ()
			child !+ "Update" (onChildUpdated)
			return child

		@method removeChild child:TNode
		| Removes the child from this node.
			children = remove (children, child)
			# NOTE: We don't remove the sink
			self ! "Remove" (child)
			sink ! "Remove" (child)
			self ! "Update" ()
			child !- "Update" (onChildUpdated)
			return child

		@method removeAllChildren
			let c = children
			children :: {_ !- "Update" (onChildUpdated)}
			children = []
			self ! "Clear" (children)
			sink ! "Clear" (children)
			self ! "Update" ()
			return c

		@method onChildUpdated

# -----------------------------------------------------------------------------
#
# LIST
#
# -----------------------------------------------------------------------------

@trait TList: TNode

	@method add value
		return addChild (value)

	@method remove value
		return removeChild (value)

	@method has value
		return hasChild (value)


# EOF
