@module std.text.url
@import relpath, dirname from std.text.path
@import str from std.core

@function relURL url, base
	url  = parseURL (url) if url is? String else url
	base = parseURL (base) if base is? String else base
	if url protocol and base protocol and url protocol != base protocol
		# It is absolute
		return url
	if url server   and base server   and url server   != base server
		# It is absolute
		return url
	return {
		protocol : Undefined
		server   : Undefined
		path     : relpath (url path, dirname (base path))
		hash     : url query
		query    : url query
	}


@function parseURL url
	var res = {
		protocol : None
		server   : None
		path     : None
		hash     : None
		query    : None
	}
	var   o     = 0
	let i_proto = url indexOf "://"
	if i_proto >= 0
		res protocol = url[:i_proto]
		let i_path   = url indexOf ("/", i_proto + 3)
		if i_path == -1
			# NOTE: Early exit here
			return res
		else
			res server = url[i_proto + 3:i_path]
			o = i_path
	let i_port = url indexOf (":", o)
	let i_path = url indexOf ("/", o)
	if i_port >= 0
		if i_path >= 0
			res server = url[o:i_path]
			o = i_path
		else
			res server = url[o:]
			# NOTE: Early exit here
			return res
	# We strip the query
	let i_query = url indexOf ("?", o)
	if i_query >= 0
		res query = url[i_query+1:]
		url = url[:i_query]
	# We strip the hash
	let i_hash  = url indexOf ("#", o)
	if i_hash >= 0
		res hash = url[i_hash+1:]
		url = url[0:i_hash]
	# We now have the path
	res path = url[o:]
	return res

# EOF
