@feature sugar 2
@module std.util.reloading
@import http from std.io.http
@import strip from std.text
@import warning from std.errors
@import runtime.window as window

@function watch
	# SEE: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
	let path = window location pathname split "/" [2:] join "/"
	if window EventSource
		let source = new window EventSource ("/api/watch/" + path)
		source onmessage = {
			source close ()
			window location reload ()
		}
# EOF
