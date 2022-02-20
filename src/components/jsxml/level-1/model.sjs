@feature sugar 2
@module  components.jsxml.helloworld
@import  Component from std.ui.components

@class Component: Component

	@getter data
		return {
			project: "Sample project"
			company: {
				name: "ACME, inc"
				url: "http://acme.inc"
			}
			tasks: [
				{index:0,name:"design"}
				{index:1,name:"development"}
				{index:2,name:"testing"}
				{index:3,name:"documentation"}
			]
		}

