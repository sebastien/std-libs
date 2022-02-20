@feature sugar 2
@module  std.patterns.zoomable
| Defines a trait that implements mechanisms to manage zooming and panning
| on a 2D space from a view space. This pattern is useful for any code that
| need to manage a scaling and translation projection from a view
| to a world.

# TODO: define std.math.geom.rect
# TODO: Might merge in the Mappable in here, or at least something that
#       manages a set of elements by a zoom level.

@class TZoomable

	@shared   ZOOM_LEVELS =[]

	@property _zoom        = 0
	@property _zoomLevels  = Undefined
	@property _viewBounds  = [0,0,0,0]
	@property _worldBounds = [0,0,0,0]
	@property _viewFocus   = [0, 0]
	@property _worldFocus  = [0, 0]
	@property _projection  = Undefined

	# =========================================================================
	# HIGH LEVEL API
	# =========================================================================

	@method setZoom factor, fixpoint

	@method zoomIn fixpoint

	@method zoomOut fixpoint

	@method focus viewFocus=_viewFocus, worldFocus=_wordFocus
	| Adjusts the focus point so that the the projection of the worldFocus
	| on the view ends up at the viewFocus position in the view. In other
	| words `normalizedUnproject(worldFocus) == viewFocus` and
	| `normalizedProject (viewFocus) == worldFocus`.

	@method pan deltaView
	| Moves by delta units in the *view referential*.

	@method move positionWorld
	| Moves to the given position in the *world referential*.

	# =========================================================================
	# PROJECTION API
	# =========================================================================

	@method project viewPosition
	| Returns the projected position from the *view* into the *world*.

	@method unproject worldPosition
	| Returns the proejcted position from the *world* into the *view*.

	@method normalizedProject viewPosition
	| Returns the normalized position from the *view* referential to the *world* referential. A noramlized
	| position will always have its components within `{0…1}`.

	@method normalizedUnproject worldPosition
	| Returns the normalized position from the *view* referential to the *world* referential. A noramlized
	| position will always have its components within `{0…1}`.

	@method normalizeInView viewPosition
	| Returns the normalized position in the *view referential*.
	| A normalized position will always have its components within `{0…1}`.

	@method denormalizeInView viewPosition
	| Returns the denormalized position in the *view referential*.
	| A normalized position will always have its components within `{0…1}`.

	@method normalizeInWorld worldPosition
	| Returns the normalized position in the *view referential*.
	| A normalized position will always have its components within `{0…1}`.

	@method denormalizeInWorld worldPosition
	| Returns the denormalized position in the *view referential*.
	| A normalized position will always have its components within `{0…1}`.

# EOF
