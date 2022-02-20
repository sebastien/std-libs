@feature sugar 2
@module  components.jsxml.helloworld
@import  Component from std.ui.components

@class Component: Component

	@shared STYLESHEET = False

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
			rtasks: [
				[
					{index:0,name:"design"}
				]
				[
					{index:1,name:"development"}
					{index:2,name:"testing"}
				]
				[
					{index:3,name:"documentation"}
				]
			]
			tree: [
				{label:"A", children:[
					{label:"A.1",children:[]}
					{label:"A.2",children:[]}
				]}
				{label:"B", children:[
					{label:"B.1",children:[]}
				]}
			]
		}

	@method onRerender
		_render ()
	
# EOF
