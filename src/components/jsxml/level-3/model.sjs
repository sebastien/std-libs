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
				{name:"design"}
				{name:"development"}
				{name:"testing"}
				{name:"documentation"}
			]
			todo: [
				{name:"item 1"}
				{name:"item 2",children:[
					{name:"item 2.1"}
					{name:"item 2.2"}
				]}
			]
		}

