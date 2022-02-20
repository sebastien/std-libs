@feature sugar 2
@module  std.db.flat.objects
@import  ObjectStorage,  mount as objectMount from std.state.objects
@import  assert from std.errors

# -----------------------------------------------------------------------------
#
# FLAT STORAGE
#
# -----------------------------------------------------------------------------

@class FlatStorage: ObjectStorage

	@shared   PROPERTIES_KEY = "-p"
	@shared   RELATIONS_KEY  = "-r"
	@property _name          = ""

	@getter prefix
		return _name

# -----------------------------------------------------------------------------
#
# FLAT STATIC STORAGE
#
# -----------------------------------------------------------------------------

@class FlatStaticStorage: FlatStorage
| A variant of the flat storage where static files are retrieved instead
| of the dynamic conuterpart.

	@method _getPropertiesPath object
		return _getObjectPath (object) + "/-p/data.json"

	@method _getRelationValuesPath object, name
		return _getRelationPath (object, name) + "/-v/data.json"

# -----------------------------------------------------------------------------
#
# HIGH LEVEL API
#
# -----------------------------------------------------------------------------

@function mount types, db, binding=Undefined, static=False
| Returns a new *pool* connected to the given Flat connector (from
| `std.db.firebase`) with the given `types` defined a JSON/primitive DSL
| description.
	let storage = new FlatStaticStorage (db) if static else new FlatStorage (db) 
	return objectMount (types, storage, binding)

# EOF
