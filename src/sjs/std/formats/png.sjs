@feature  sugar 2
@module   std.formats.png
@import   future from std.io.async
@import   runtime.window as window

@function load url
	let img = window document createElement "img"
	let f   = future ()
	img setAttribute ("src", url)
	img addEventListener ("load", {f set (img)})
	return f

# EOF - vim: ts=4 sw=4 noet
