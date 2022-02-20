@feature sugar 2
@module std.patterns.scopes

# FIXME: Merge with hierarchy
@trait Scope

	@property parent:Scope

	@method getParent:Scope
		return parent

	@method setParent scope:Scope
		if parent
			parent unbind (scope)


@trait NamedScope: Scope

	@property name:String

	@method getName:String
		return name

	@method setName name:String
		self name = name


# EOF
