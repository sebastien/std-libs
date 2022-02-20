@feature sugar 2
@module  components.jsxml.helloworld
@import  Component from std.ui.components

@class Component: Component

	@getter data
		return {
			message: "Lorem ipsum"
		}

