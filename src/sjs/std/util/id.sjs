@feature sugar 2
@module  std.util.ids
@import toBase from std.math

@shared COUNTERS = {}
@shared LETTERS  = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

@function timestamp
	return new Date() getTime ()

@function letters number=timestamp(), alphabet=LETTERS
	# FIXME: Not working
	return toBase (number, alphabet) join ""

@function next category="default"
	COUNTERS[default] ?= 0
	let r = COUNTERS[default]
	COUNTERS[default] += 1
	return r

# EOF
