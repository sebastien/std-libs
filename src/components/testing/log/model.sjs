@feature sugar 2
@import  Component from std.ui.components
@import  All from std.util.testing
@import  group from std.collections

@class Component: Component

	@shared STYLESHEET = True

	@property network = {
		"nodes" : {
			"-inputs" : {
				"value:list": []
				"label:value": None
			}
		}
		"edges" : [
			"(label,value)->render"
		]
	}

	@method log text
		state value add (text)

# EOF
