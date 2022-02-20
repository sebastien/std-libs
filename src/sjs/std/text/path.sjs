@feature sugar 2
@module  std.text.path

@function dirname:String path:String
| Returns the directory name of the given path.
	if not path
		return ""
	path = path split "/"
	if path[-1] == ""
		path pop ()
	path pop ()
	return path join "/"

@function basename:String path:String
| Returns the basename of the given `path`
	let i = path lastIndexOf "/"
	if i == -1
		return path
	else
		return path[i+1:]

@function filename:String path:String
| Returns the filename of the given `path`
	let i = path lastIndexOf "."
	if i == -1
		return path
	else
		return path[0:i]

@function fileext:String path:String
| Returns the fileext of the given `path`
	let i = path lastIndexOf "."
	if i == -1
		return None
	else
		return path[i+1:]

@function relpath:String path:String, base:String
| Returns the given path relative to the given base.
	if path[0] == "/" or not base
		return path
	path = path split "/" if path else []
	base = base split "/" if base else []
	# TODO: Make more tests for that
	path reverse ()
	if base[-1] == ""
		base pop ()
	while path and path length > 0
		let p = path pop ()
		match p
			== ".."
				base pop ()
			== "."
				pass
			else
				base push (p)
	return (base join "/")

# EOF
