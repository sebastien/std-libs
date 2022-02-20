@feature sugar 2
@module std.patterns.ids

@import type from std.core

@trait TIdentified
| Generates sequential IDs based on a global counter starting at 0.

	@property id  = nextID ()

	@method nextID
	| Returns the next ID, starting at 0
		let t  = getIDSource ()
		let id = t ID or 0
		t ID   = id + 1
		return id

	@method getID
		return id

	@method getIDSource
		return type (self)

@trait TNamed

	@property name = None

	@method as name
		self name = name
		return self

@trait TDescribed

	@property description = None

	@method describe description
		self description = description
		return self

# EOF
