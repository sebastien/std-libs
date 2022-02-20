@feature sugar 2
@module std.util.clustering
| A clustering algorithm that

@import pt            from std.math.geom.point
@import quadhash      from std.struct.quadhash
@import len, sprintf  from std.core
@import head, concat, comparator, sorted, unique from std.collections
@import fixpoint from std.functional
@import Update   from std.api.dom
@import project  from std.math.projection.mercator
@import std.formats.svg as svg

# TODO: When the precision is too low, we'll end up with clsuters that don't match anything
# NOTE: This module is a bit experimental, still

@class Clustering
| Generates a list of clusters and points given a list of points
| and a threshold ratio.

	@method run points, radius=5, precision=0.01
	| Runs the clustering algorithm, returning the list of identifiers clusters.
	| list in this object.
		# We run `iterate` up until the point where we only have clusters left
		points = points ::= {pt (_)}
		let p,c = fixpoint ([points, []], {
			let r = iterate (_[0], radius)
			[r[0], _[1] concat (r[1])]
		}, {
			# NOTE: If the radius is too small, then we might end up with
			# as many clusters as points, but where all clusters are empty.
			return len(_[0]) == 0 or len(_[0]) <= len(_[1])
		})
		# Now we have the list of clusters, so we can put them in quad hash
		let q = quadhash (c)
		let m = points ::> {r=(new Map ()),p,i|
			# TODO: We should sort by distance from the point if the length
			# is greater than 1.
			let l = q listPointsAway (p x, p y, 0, radius)
			let c = head (l)
			# NOTE: The undefined cluster will have all the lone points
			if r has (c)
				r get (c) push (i)
			else
				r set (c, [i])
			return r
		}
		let r = []
		m forEach {v,k|r push {cluster:k, points:v}}
		return r

	@method iterate points, radius=2
	| Runs an iteration of the clustering algorithm on the given `points` with
	| the given `radius`. This returns a couple `(points, clusters)`.
		# We find the ideal number of clusters by recursively applying the
		# clusters on the points.
		# This gets the centroids for each point
		# Now we reduce the cendroids until we find a fixpoint
		if radius <= 0
			return [[], points]
		else
			# NOTE: Here we have just one iteration of clusters, and in
			# cases where the points have multiple clusters that are clustered
			# together, but with centroids slightly bigger than the radius, then
			# we might end up with extra clusters.
			let c = fixpoint (points, {_findClusters(_, radius)}, {a,b|a length == b length})
			return _partitionPoints (points, c, radius)

	@method _findClusters points, radius=5, precision=0.01
	| Returns the list of centroids that have one or more points within
	| a `radius` radius. The centroids might overlap.
		if radius <= 0
			return points
		# We register the points in the quadhash
		let q = quadhash (points)
		# We find the groups of points that are within 5 units of the point
		let g = sorted (points ::= { q listPointsAway (_ x, _ y, 0, radius) }, comparator {len(_)}, True)
		# We calculate the centroids and average them to 0.01 precision
		return unique (g ::= {pt () centroid (_) round (precision)}, {a,b|a x == b x and a y == b y})

	@method _partitionPoints points, clusters, radius=5
	| Returns the (leftover points, clusters) where leftover points
	| are not  within `radius` of any cluster.
		let q = quadhash (clusters)
		#let p = quadhash (points)
		return [
			points   ::? {return not q hasPointsAway (_ x, _ y, 0, radius)}
			# TODO: We should also filter the clusters so that only the clusters
			# with points are kept, but his seems to also create problems.
			clusters
		]

# EOF
