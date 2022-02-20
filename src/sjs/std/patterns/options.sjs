@feature sugar 2
@module std.patterns.options
@import merge, type from std.core

@trait TOptions

	@property options = Undefined

	@constructor
		setOptions (getDefaultOptions ())

	@method setOption name, value
		self options ?= {}
		self options[name] = value
		return self

	@method setOptions options=Undefined
		updateOptions (merge(options or {}, getDefaultOptions ())) 
		return self

	@method updateOptions options
		options :: {v,k|setOption(k,v)}
		return self

	@method getDefaultOptions
		return type (self) OPTIONS

	@method getOptions
		return options

# EOF
