@feature sugar 2
@module std.state.schema
@import len from std.core
@import TDescribed from std.patterns.ids
@import BadArgument, error, assert from std.errors
@import runtime.window as window

@class Type: TDescribed

	@property _default   = Undefined
	@property isRequired = True

	@method match value
		return True

	@method required
		isRequired = True
		return self

	@method optional
		isRequired = False
		return self

	@method setDefault value=Undefined
		if value is Undefined
			return _default
		else
			assert (match (value), "Value does not match type description", value, self, __scope__)
			_default = value
		return self

@class List: Type

	@property _type

	@method of type
		_type = type
		return self

@class String: Type

	@method match value
		if not value and not isRequired
			return True
		return value is? String

@class Subset: Type

	@property _values    = None
	@property isMany     = True

	@constructor values
		super ()
		set (values)

	@method set values
		self _values = values
		return self

	@method cardinality type
		match type
			== "?"
				isMany = False ; isRequired = False
			== "1"
				isMany = False ; isRequired = True
			== "*"
				isMany = True ; isRequired = False
			== "+"
				isMany = True ; isRequired = True
			else
				error (BadArgument, "type", type, "?1*+", __scope__)
		return self

	@method from values
		self _values = values
		return self

	@method match value
		if isRequired and len (value) == 0
			return False
		elif (not isMany) and value is? Array and len (value) >  1
			return False
		elif isMany
			return value ::? {_ not in _values} length == 0
		else
			return value in _values

@function oneof values
	return new Subset (values) cardinality "1"

@function string
	return new String ()

# EOF
