@feature sugar 2
@module std.util.matching
| A set of functions and classes to help match elements

@import lower,escape, strip from std.text
@import bool,len from std.core
@import TFlyweight from std.patterns.flyweight


# TODO: Implement Fuzzy Matching
# SEE: https://github.com/forrestthewoods/lib_fts/blob/master/code/fts_fuzzy_match.js

# -----------------------------------------------------------------------------
#
# MATCH
#
# -----------------------------------------------------------------------------

@class Match: TFlyweight
| A flyweight object that wraps a match as returned from a `Matcher`.

	@operation Wrap value
		return value if value is? Match else Match Create (value)

	@property score = 0
	@property index = -1
	@property exact = False
	@property value = Undefined

	@method init value=Undefined, score=0, exact=False
		self value = value
		self score = score
		self exact = False
		self index = -1
	
	@method setExact value=True
		exact = bool (value)
		return self

# -----------------------------------------------------------------------------
#
# MATCHER
#
# -----------------------------------------------------------------------------

@class Matcher
| Creates a matcher that uses a regexp for matchin, which guarantees a 
| better performace than plain JavaScript.

	@property _regexp  = Undefined
	@property _text    = ""
	@property isActive = False

	@constructor text
		setSubstring (text)

	@method set text
		return setSubstring (text)

	@method setSubstring text, flags="i"
		text  = strip(text or "")
		_text = text
		if len(text) == 0
			_regexp = Undefined
			isActive = False
		else
			text    = escape(text)
			_regexp = new RegExp (".*(" + text + ").*", flags)
			isActive = True
		return self

	@method setStrictSubstring text
		return setSubstring (text, "")

	@method match value
		# TODO: Match should probably return a score, and optionally
		# a subset to show what matches
		if value is _text
			return Match Wrap (value) setExact ()
		elif not _regexp
			return True
		else
			return _regexp test (value)

@function matcher text 
	return new Matcher (text)
	
# EOF
