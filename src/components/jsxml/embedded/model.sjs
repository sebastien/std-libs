@feature sugar 2
@module  components.jsxml.embedded
@import  Component from std.ui.components

@class Component: Component

	@property _data = {
		text:"Default text value for the embedded component."
	}

	@getter data
		return _data

	@method bindOption name, value
		if name == "text"
			_data text = value
		return super bindOption (name, value)
