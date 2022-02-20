@feature sugar 2
@import  Component from std.ui.components
@import  All, Unit from std.util.testing

@class Component: Component

	@property network = {
		nodes : {
			"test:value"   : None
			"value:reduce" : {_|return _ if _ is? Unit else All join (_)}
		}
		edges : [
			"(test)->value"
			"*->render"
		]
	}

# EOF
