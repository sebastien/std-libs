# -----------------------------------------------------------------------------
# Project           : StdLibs
# -----------------------------------------------------------------------------
# Author            : Sébastien Pierre
# License           : BSD License
# -----------------------------------------------------------------------------
# Creation date     : 2016-03-31
# Last modification : 2018-05-10
# -----------------------------------------------------------------------------
@feature sugar 2
@module std.struct.quadhash
@import floor, log10 from std.math
@import remove from std.collections
@import copy     from std.core
@import assert, error from std.errors

# TODO: Update QuadHash to support 3D coordinates
# TODO: Update QuadHash to support the geom.Point interface

@class QuadHash
| The _quadhash_ is a spatial indexing data structure similar to quadtrees,
| except that it supports the following features:
|
| - *Infinite*: there is no need to specify bounds;
| - *Updateable*: points can be moved;
| - *Sparse*: regions are only created when they are needed;
| - *Configurable*: regions can be tweaked for performance using;
|   parameters such as capacity, step and depth limit.
|
| In essence, the _quadhash_ aims at being an alternative to quadtrees, better
| suited to interactive applications. The quadhash works by computing a hash
| key given an (x,y) position and a depth (in the quadhash).
|
| Internally, a quadhash is a map of strings to the following types:
|
| ```
| Node  :String                         # The string is the node's parent hash
| Leaf  :[parenthash:String, Point]     # The leaf contains points
| Point :{position:[x:Int,y:Int], value:Any}
| ```

	@property step       = [100, 100]
	@property base       = 2
	@property bucketSize = 5
	@property depthLimit = 10
	@property count      = 0
	@property _bounds    = [0,0,0,0]
	@property _quads     = new Map ()
	| Quads is the sparse array containing the points

	@constructor step=Undefined, bucketSize=Undefined
		if bucketSize
			self bucketSize = bucketSize
		if step
			self step[0] = step[0]
			self step[1] = step[1]

	@method clear
	| Removes all the points in this quad hash
		count = 0
		_quads = new Map ()
		return self

	# =========================================================================
	# CONTENT
	# =========================================================================

	@method add position, value, depth=0, parent="_"
	@when position
	| Adds the given value to be bound at the given position.
	| The `depth` is for internal use, so you should omit it
	| when calling.
		var cell = None
		# FIXME: Test when adding more than bucketSize points
		# with the exact same position
		# FIXME: add a depth limit as well
		_bounds[0] = Math min (_bounds[0], position[0])
		_bounds[1] = Math min (_bounds[1], position[1])
		_bounds[2] = Math max (_bounds[2], position[0])
		_bounds[3] = Math max (_bounds[3], position[1])
		while (cell is None) and (depth <= depthLimit)
			let h = hash (position[0], position[1], depth)
			let q = _quads get (h)
			if q is Undefined
				# NOTE: This is where we *create a new leaf region*
				# There is no quad cell, so we create one. A quad
				# cell starts with the parent hash.
				cell = [parent]
				_quads set (h, cell)
			elif q is? String
				# NOTE: This is equivalent to `_isNode`
				# There is a quad, but it is just a node, so
				# we need to increase the depth
				depth += 1
			elif ((q length + 1) < bucketSize) or (depth is depthLimit)
				# If it's a quad cell, then we ensure it does
				# not exceeds the size if we can still break it down
				cell = q
			else
				# Otherwise we empty the cell and redispatch
				# everything. This is where we *convert a leaf into a node*.
				_quads set (h, parent)
				# The first element is always the parent's hash
				while q length > 1
					var e  = q pop ()
					count -= 1
					add (e position, e value, depth + 1, h)
				depth += 1
		assert (cell, "could not locate cell at position", position)
		cell push {position:position, value:value}
		count += 1
		return value

	@method move a, value,  b
	| Moves the give `value` from point `A` to point `B`.
		var res = remove (a, value)
		if res
			add (b, value)
		else
			error (__scope__, "can't remove point", value, ": not found at", a, __scope__)
		return res

	@method remove position, value, t=0.1
	| Removes the given `value` at the given `position` with a threshold
	| of `t=0.1`. Returns the corresponding `value`, or `None` if the value
	| was not found.
		var result = None
		# Query callback is value,point,index,list,hash,depth
		var x = position[0]
		var y = position[1]
		onPointsWithin (x - t, y - t, x + t, y + t, {v,p,i,l,h,d|
			if value is v
				# We've found the region that holds the point
				l splice (i, 1)
				result = p
				# TODO: We should remove the region altogether, but
				# for this we'll need to walk up and get all the parents.
				if l length == 1
					_removeLeaf (position[0],position[1],h,d)
				return False
		})
		return result

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _removeLeaf x,y, hash, depth
	| Removes the leaf region at the given position, hash and depth. This is
	| an internal method.
		# We get the region
		var q = _quads get (hash)
		# We get the parent hash
		var p = q[0]
		_quads delete (hash)
		_removeNode (x,y, depth - 1)

	@method _removeNode x,y, depth
	@when   depth >= 0
	| Removes the node region at the given position and depth.
		if not _hasChildren (x,y, depth)
			_quads delete (hash(x,y,depth))
			if depth > 0
				_removeNode (x,y, depth - 1)

	@method _hasChildren x,y, depth
	| Tells if the region at the given `position` and `depth` has any children;
		var cd = depth + 1
		var sx = step[0] / Math pow (base, depth)
		var sy = step[1] / Math pow (base, depth)
		var ox = Math floor (x / sx) * sx
		var oy = Math floor (y / sy) * sy
		var dx = step[0] / Math pow (base, cd)
		var dy = step[1] / Math pow (base, cd)
		return not (_isHashEmpty(hash(ox, oy, cd)) and _isHashEmpty(hash(ox + dx, oy, cd)) and _isHashEmpty (hash(ox, oy + dy, cd)) and _isHashEmpty (hash(ox + dx, oy + dy, cd)))

	@method _isHashEmpty hash
	| Returns `True` if there is neither a node or leaf region for the given
	| `hash`.
		return not _quads has (hash)

	# =========================================================================
	# QUERYING
	# =========================================================================

	# FIXME: Disabled for now
	# @method corner x, y, depth=0
	# | Returns the upper-left corner of the region of the given `depth` containing
	# | the given `x,y` point.
	# 	var sx = step[0] / Math pow (base, depth)
	# 	var sy = step[1] / Math pow (base, depth)
	# 	return [
	# 		Math floor (x / sx) * sx
	# 		Math floor (y / sy) * sy
	# 	]
	# @end

	@method onPointsAway cx,cy, dmin, dmax, callback, depth=0
	| Invokes the calback for each point that is within `[dmin,dmax]` range
	| of point `[cx,cy]`
	|
	| The callback takes the same arguments as `onPointsWithin`
		# We get the min and max square distances.
		let sd_min = dmin * dmin
		let sd_max = dmax * dmax
		onPointsWithin (cx - dmax, cy - dmax, cx + dmax, cy + dmax, {v, p, i, q, h, depth|
			let pp = p position
			let dx = cx - pp[0]
			let dy = cy - pp[1]
			# We don't need to find the square root as we only need a range.
			let d = dx * dx + dy * dy
			if d >= sd_min and d <= sd_max
				if callback (v, p, i, q, h, depth) is False
					return False
		}, depth)

	@method listPointsAway cx,cy, dmin, dmax, depth=0
		let r = []
		onPointsAway (cx, cy, dmin, dmax, {r push (_)}, depth)
		return r

	@method hasPointsAway cx,cy, dmin, dmax, depth=0
		var found = False
		onPointsAway (cx, cy, dmin, dmax, {found = True;return False}, depth)
		return found

	@method onPointsWithin x1,y1, x2,y2, callback, depth=0
	| Invokes the callback for all the points within `p1=[x1,y1]` and `p2=[x2,y2]`.
	|
	| The callback will have the following argumnent:
	| - the point's `value`
	| - the point's `x,y` coordinates
	| - the point's `index` in the region's list
	| - the region's `list of points`
	| - the region's `hash` (as a number)
	| - the region's `depth` (as a number)
		# The depth will determine the step for which we iterate
		# on the positions
		var d  = depth
		var sx = step[0] / Math pow (base, d)
		var sy = step[1] / Math pow (base, d)
		var rx1 = Math floor (x1 / sx) * sx
		var ry1 = Math floor (y1 / sy) * sy
		var rx2 = Math ceil  (x2 / sx) * sx
		var ry2 = Math ceil  (y2 / sy) * sy
		var qx  = rx1 ; var qy = ry1
		# We use while loops for performance
		while qy < y2
			var qx = rx1
			while qx < x2
				var h = hash (qx, qy, depth)
				var q = _quads get (h)
				if q is? String
					# This is a NODE
					# If the region has children, we recurse, but we make sure
					# to not expand the x1,y1,x2,y2 bounds.
					onPointsWithin (
						Math max (qx,    x1)
						Math max (qy,    y1)
						Math min (qx+sx, x2)
						Math min (qy+sy, y2)
						callback
						depth+1
					)
				elif q
					# This is a LEAF.
					# If the region is a leaf, then we iterate on the
					# points
					# NOTE: We start at 1 because the first element of a region
					# is always the parent's hash
					var i = 1
					var l = q length
					var c = True
					while c and (i < l)
						# We invoke the callback only if the point is
						# within the range
						var p  = q[i]
						var px = p position [0]
						var py = p position [1]
						if (px >= x1) and (px <= x2) and (py >= y1) and (py <= y2)
							# If the callback returns False, we break
							c = not (callback (p value, p, i, q, h, depth) is False)
						i += 1
					# If the callback returned False, then we exit.
					if c is False
						return self
				qx += sx
			qy += sy
		return self

	@method listPointsWithin x1,y1, x2,y2
		let r = []
		onPointsWithin (x1,y1, x2,y2, {r push (_)})
		return r

	@method listPoints
		return listPointsWithin (_bounds[0], _bounds[1], _bounds[2], _bounds[3])

	@method onRegionsWithin x1,y1, x2,y2, callback, depth=0
	| Walks all the regions between x1,y1,x2,y2
		# The depth will determine the step for which we iterate
		# on the positions
		var d  = depth
		# We get the step, which is going to decrease as the the depth
		# increases.
		var sx = step[0] / Math pow (base, d)
		var sy = step[1] / Math pow (base, d)
		# If the depth is 0 we round the given bounds to the step. We should
		# to it for ever depth, but depth is not really meant to be changed
		# by a client code. We need to have the bounds aligned on the step,
		# otherwise the hashes won't match.
		if depth == 0
			x1 = Math floor (x1/sx) * sx
			y1 = Math floor (y1/sy) * sy
			x2 = Math ceil  (x2/sx) * sx
			y2 = Math ceil  (y2/sy) * sy
		# We initialize our query point (QX,QY)
		var qx = x1 ; var qy = y1
		# While QY is within bounds
		while qy < y2
			# We move QX over [X1,X2[
			var qx = x1
			while qx < x2
				# We get the region hash
				var h = hash (qx, qy, depth)
				let q = _quads get (h)
				if q is? String
					# It's a NODE, which means it's a REGION
					callback (qx,qy,sx,sy,h,depth,True)
					onRegionsWithin (qx,qy,qx+sx,qy+sy, callback, depth + 1)
				elif q
					# IS LEAF
					callback (qx,qy,sx,sy,h,depth,False)
				qx += sx
			qy += sy
		return self

	@method onRegions callback
		return onRegionsWithin (_bounds[0], _bounds[1], _bounds[2], _bounds[3], callback)

	@method listRegionsWithin x1,y1, x2,y2
		let r = []
		onRegionsWithin (x1,y1, x2,y2, {qx,qy,sx,sy,h,d,c|c and r push [qx,qy,sx,sy]})
		return r

	@method listRegions
		return listRegionsWithin (_bounds[0], _bounds[1], _bounds[2], _bounds[3])

	# =========================================================================
	# HASHING
	# =========================================================================

	@method hash px, py, depth=0
	| Returns the hash corresponding to the given position at the
	| given depth. The hashing function is the key feature of the quadhash
	| data structure.
		var d  = depth
		var f  = Math pow (base, d)
		var x  = Math floor (px / (step[0] / f)) * 10
		var y  = Math floor (py / (step[1] / f)) * 10
		# If x/y is negative, e add an extra 1 at the end
		if x < 0
			x = Math abs (x)
			x += 1
		if y < 0
			y = Math abs (y)
			y += 1
		# We prepare the generation of the hash. Here we have
		# to be c
		let lx = x and (Math floor (log10 (x)) + 1) or 1
		let ly = y and (Math floor (log10 (y)) + 1) or 1
		let ld = d and (Math floor (log10 (d)) + 1) or 1
		# We want to create a number that is like
		# 1 XXXX.. YYYYY.. DDDD.. LD LY
		# where II is the number of digits of D
		# and LY is the number of digits of Y
		var r = ly ; var o = 2
		r    += ld * Math pow (10,o) ; o += 2
		r    +=  d * Math pow (10,o) ; o += ld
		r    +=  y * Math pow (10,o) ; o += ly
		r    +=  x * Math pow (10,o) ; o += lx
		r    +=  1 * Math pow (10,o)
		# And now we have the number that we can hash
		return r

# -----------------------------------------------------------------------------
#
# API
#
# -----------------------------------------------------------------------------

@function quadhash nodes, steps=Undefined, bucket=Undefined
| Creates a new quadhash filled with the given nodes. Each node should have
| either a `position:[x,y]` attribute or `x:number,y:number` attributes.
	var q = new QuadHash (steps, bucket)
	nodes :: {v,i|
		if _ is? Array
			# NOTE: Not sure why we set a copy here
			q add (copy(v), v)
		elif _ position
			# NOTE: Not sure why we set a copy here
			q add (copy (v position), v)
		else
			q add ([v x, v y], v)
	}
	return q

# EOF - vim: ts=4 sw=4 noet
