@feature sugar 2
@module  std.db.firebase.objects
| An object storage backend using Firebase. The implementation stores
| relations and properties in two separate fields (`-r` and `-p`, respectively).

@import  ObjectStorage,  mount as objectMount from std.state.objects
@import  assert from std.errors

# -----------------------------------------------------------------------------
#
# FIREBASE STORAGE
#
# -----------------------------------------------------------------------------

@class FirebaseStorage: ObjectStorage
| The object storage backend for Firebase Realtime Database. The encoding
| follows `/{VERSION}/{TYPE}/{ID}/(-p|-r)/{NAME}` for most types. When
| a type is part of a nested relation then, the parent's relation name
| will be used as a prefix. Nested relations allow to follow relations
| on a per-object basis.

	@shared  RELATIONS_KEY          = "-r"
	@shared  PROPERTIES_KEY         = "-p"
	@shared  RELATION_OBJECTS_KEY   = "-o"
	@shared  RELATION_VALUES_KEY    = "-v"

	# =========================================================================
	# IDS
	# =========================================================================

	@method nextID
		return _db nextID ()

# -----------------------------------------------------------------------------
#
# HIGH LEVEL API
#
# -----------------------------------------------------------------------------

@function mount types, db, binding=Undefined
| Returns a new *pool* connected to the given Firebase connector (from
| `std.db.firebase`) with the given `types` defined a JSON/primitive DSL
| description.
	let storage = new FirebaseStorage (db)
	return objectMount (types, storage, binding)

# EOF
