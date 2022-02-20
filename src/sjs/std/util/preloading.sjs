@feature sugar 2
@module std.util.preloading
@import runtime.window as window
@import TSingleton from std.patterns.oo
@import http from std.io.http
@import delayed from std.io.time
@import future, join from std.io.async
@import warning, assert from std.errors

@enum Mode = IMAGE | FILE

@shared MODES = {
	jpeg : IMAGE
	jpg  : IMAGE
	gif  : IMAGE
	png  : IMAGE
	ico  : IMAGE
	svg  : IMAGE
	eot  : FILE
	woff : FILE
	ttf  : FILE
	css  : FILE
	vert : FILE
	frag : FILE
}

# -----------------------------------------------------------------------------
#
# PRELOADER
#
# -----------------------------------------------------------------------------

@class Preloader: TSingleton

	@method supports url
	| Tells if the given URL can be preloaded. Images extensions and files
	| available on the local server are both supported.
		var ext = url split "." [-1]
		if MODES[ext]
			return True
		else
			let prefix = window location protocol + "//" + window location host
			return (url indexOf "://" == -1) or (url indexOf (prefix) == 0)

	@method preload url, timeout=10s
	| Preloads the given `url`, determining wether it should be loaded
	| through an image or through a request.
		let ext = url split "." [-1]
		return MODES[ext] match
			is IMAGE
				image (url, timeout)
			is FILE
				file (url, timeout)
			else
				future () fail ()

	@method file url
	| Loads the given file through an HTTP request. This is meant to
	| populate the cache.
		return http get (url)

	@method image url
	| Preloads the image at the given URL,returning a future that will be set
	| once the image is loaded.
		let res = future ()
		var img = window document createElement "img"
		img addEventListener ("load", {
			# From: http://stackoverflow.com/questions/1977871/check-if-an-image-is-loaded-no-errors-in-javascript
			if img complete
				res set (img)
		})
		img setAttribute ("src", url)
		return res

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function preload urls, timeout=10s
| Preload the assets at the given URLS, returning a future that will be set
| if all the assets are loaded before the timeout. The future's value will
| be a map of URL --> loaded data. Loaded data will be image objects
| for images, JavaScript objects for JSON and text otherwise.
	assert (urls)
	# We filter the URLs so that only the ones we can load are present.
	let preloader = Preloader Get ()
	if urls is? String
		if preloader supports (urls)
			return preloader preload (urls)
		else
			warning ("Preloader does not support URL", urls, __scope__)
			return future () fail ()
	else
		let res = join ( urls ::> {r={},v,k|
			if preloader supports (v)
				r[k] = preloader preload (v)
			else
				warning ("Preloader does not support URL", v, ":", k, __scope__)
			return r
		})
		let t = delayed ({
			if not res isSuccess
				res fail ()
		}, timeout) push ()
		res then {t cancel ()}
		return res

@function preloaded urls, timeout=10s
| Like `preload` but returns a boolean set to `True` in once the
| assets are preloaded or the timeout has expired.
	let f = preload (urls, timeout)
	let res = future ()
	f then   {res set (True)}
	f failed {res set (True)}
	return res

# EOF - vim: ts=4 sw=4 noet
