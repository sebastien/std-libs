@feature sugar 2
@module  components.jsxml.helloworld
@import  Component from std.ui.components

# TODO: Add data generation
# TODO: Add window perfMonitor dynamic loading
@class Component: Component

	@method init
		if window perfMonitor
			window perfMonitor startFPSMonitor()
			window perfMonitor startMemMonitor()
			window perfMonitor initProfiler("render")
		update ()

	@method update
		requestAnimationFrame (update)
		render ()

	@getter data
		if window ENV
			return window ENV generateData() toArray ()
		else
			return None

	@method render data, node
		if window perfMonitor
			window perfMonitor startProfile "render"
			super render (data, node)
			window perfMonitor endProfile "render"
		else
			super render (data, node)

# EOF
