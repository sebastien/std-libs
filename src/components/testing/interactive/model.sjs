@feature sugar 2
@import  Component from std.ui.components
@import  All       from std.util.testing

@class Component: Component

	@property _test = Undefined

	@getter data
		return _test

	@method init
		super init ()
		_test = All get (options source)

	@method run
		if _test
			_test run (nodes output)

	@method toggleItem event
		console log ("EVENT", event)
# EOF
