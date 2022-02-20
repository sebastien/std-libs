@feature sugar 2
@module std.text
@import str, len from std.core

# TODO: Support width as well
@shared SPACES = " \t\n"
@shared DIGITS = "0123456789"
@shared ALLOWED   = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

# FIXME: Beware of sticky, not sure if it behaves as expected
@shared RE_KEY    = new RegExp ("([^A-Za-z0-9]|[_])+", "g")
@shared RE_NUMBER = new RegExp ("[^0-9\.]+", "g")
@shared RE_SPACES = new RegExp ("\s+", "g")

@shared REMAP = {
	"à" : "a"
	"á" : "a"
	"ç" : "c"
	"é" : "e"
	"è" : "e"
	"ê" : "e"
	"ë" : "e"
	"ñ" : "n"
	"í" : "i"
	"î" : "i"
	"ö" : "o"
	"ô" : "o"
	"ó" : "o"
	"ü" : "u"
	"ú" : "u"
}

@shared PROCESSORS = {}

# -----------------------------------------------------------------------------
#
# TEXT
#
# -----------------------------------------------------------------------------

# FIXME: These might we flattened. It's not clear what benefit we have
# of having them in a singleton.
@class Text
| A collection of operations that work on text strings.

	@shared RE_ENTITY = new RegExp "&#?\w+;"
	@shared RE_SPACES = new RegExp "\t+"
	@shared WIDTHS    = {}

	# FIXME: Harmonize onText, onMatch
	@operation Split text, term, onMatch=Undefined, onText=Undefined
	| Splits the given text according to the given term.
		var res = []
		Search (text, term, {
			onText  : {t|res push (onText (t) if onText else t)}
			onMatch : {m|res push (onMatch (m text, m) if onMatch else m and m text)}
		})
		return res

	@operation Wrap text, maxWidth=20, table=WIDTHS, defaultWidth=0.5
	| Wraps the given text so that the text does not exceeds `maxWidth` as
	| given in font `ems`. This uses the `table` mapping that maps
	| characters/symbols to width in `ems`.
		var res   = []
		var width = 0
		var i     = 0
		var o     = 0
		var s     = 0
		while i < text length
			var c = text[i]
			width += table[c] or defaultWidth
			if width > maxWidth
				# If we've exceeded the width, we need to wrap
				if s > o
					# If there was a space before, we cut it here
					res push (text[o:s])
					o = s
				else
					# Otherwise we cut at the beginning
					res push (text[o:i])
					s = i
					o = i
				width = 0
			# We update the last space position
			if c == " " or c == "\t" or c == "\n" or c == "\r"
				s = i
			i += 1
		if o != i
			res push (text[o:i])
		return res

	@operation Normalize text
	| Normalizes the given text, by collapsing spaces, removing entities and
	| stripping leading and trailing spaces.
		return Strip (Replace (Replace (text, RE_ENTITY, Entity), RE_SPACES, " "))

	@operation Entity
	| Returns a character corresponding to the given entity, returning a
	| space by default.
		return " "

	@operation Replace text, term, action=Undefined
		if term is? Array
			return term ::> {t=text,v|Replace(t,v,replaceWith)}
		else
			return (Split (text, term) ::= {v,i|
				if i % 2 == 1 and action != Undefined
					if action is? String
						return action
					else
						return action (v)
				else
					return v
			}) join ""

	@operation Search text, term, actions={}
		return _Search (text, term, actions)

	@operation Strip text
		return str (text) trim ()

	@operation _Search text, regexp, actions={}
	| Searches the given text (as string) for occurences of the
	| given `regexp` (as string or `RegExp` object). Actions
	| should define `onMatch` and `onText` callbacks, respectively
	| called when a match is recognized and when there is text
	| in between.
		# Possible regexp flags:
		# "i" -> case insensitive
		if not regexp
			#if actions onText (text)
			return []
		if regexp is? String
			regexp = new RegExp (regexp)
		var matches = []
		var local_o = 0
		var offset  = 0
		while text and (text length > 0)
			var m = text match (regexp)
			if m
				var n = m[0] length
				var o = offset + m index
				var res =  {
					text   : m[0]
					offset : m index + local_o
					offsets: [o, o + n]
					length : n
					groups : m
				}
				if actions onText
					actions onText (text[0:m index], o)
				if actions onMatch
					actions onMatch (res)
				matches push (res)
				offset         += m index + n
				local_o        += m index + n
				text            = text[m index + n:]
			else
				if actions onText
					actions onText (text)
				text = None
		return matches

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function slug text
| Returns a version of the given text with only letters, numbers dashes
| and underscores, all the rest will be replaced by "-", which can't occur
| twice in a row.
	if not text
		return ""
	text    = text toLowerCase ()
	let res = []
	var l = None
	var i = 0
	let n = text length
	while i < n
		var c = text[i]
		c = REMAP[c] or c
		c = c if (ALLOWED indexOf (c) >= 0) else "-"
		if (c is not "-") or (c is not l)
			l = c
			res push (c)
		i += 1
	return res join ""

@function unquote text, quotes="'\""
	if len(text) > 2 and text[0] == text[-1] and quotes indexOf (text[0]) >= 0
		return text[1:-1]
	else
		return text

@function replace text, lookFor, replaceWith
	if text
		return text split (lookFor) join (replaceWith)
	else
		return text

@function insert text, at, fragment
	return text[0:at] + fragment + text[at:]

@function remove text, start, end
	return text[0:start] + text[end:]

@function padl text, count, char=" "
	var t = text or ""
	var n = t length
	while n < count
		t = char + t
		n += 1
	return t

@function next text, value, index=0
| Returns the index of the next occurence of `value` after `index`. If `value`
| is an array it will returns the closest occurence of all of them. This
| returns -1 if none is found.
	if value is? Array
		return value ::> {r,v|
			let i = next (text, v, index)
			if i >= 0 and (r is Undefined or i < r)
				return i
			else
				return r
		}
	else
		return text indexOf (value, index)

@function previous text, value, index=0
| Returns the index of the previous occurence of `value` before `index`. If `value`
| is an array it will returns the closest occurence of all of them. This
| returns -1 if none if found.
	# FIXME: We probably should not return -1
	if value is? Array
		return value ::> {r,v|
			let i = previous (text, v, index)
			if i >= 0 and (r is Undefined or i > r)
				return i
			else
				return r
		}
	else
		return text[0:index] lastIndexOf (value)

@function chars text
| Returns the given text as an array of characters
	var i = 0
	let n = len(text)
	let r = new Array (n)
	while i < n
		r[i] = text [i]
		i += 1
	return r

@function words text
| Returns the given text as an array of words.
	return Text Split (text, RE_SPACES)

@function lines text, max=10
| Returns lines with up to `max` words.
	let res = []
	var l   = []
	for w,i in words (text)
		l push (w)
		if l >= max
			res push (l)
			l = []
	if l length > 0
		res push (l)
	return res

@function normstart text, replace=" ", chars=SPACES
| Keeps only the first of @chars at the start of @text, if any
	if text
		let s = text[0]
		let i = chars indexOf (s)
		if i >= 0
			return (replace or chars[i]) + stripstart (text, chars)
		else
			return text
	return text

@function normend text, replace=" ", chars=SPACES
| Keeps only the last of @chars at the end of @text, if any
	if text
		let s = text[-1]
		let i = chars indexOf (s)
		if i >= 0
			return stripend (text, chars) + (replace or chars[i])
		else
			return text
	return text

@function strip text, chars=SPACES
	if text
		return stripstart (stripend(text, chars), chars)
	else
		return ""

@function stripstart text, chars=SPACES
| Strips any character from @chars at the start of @text
	while text and text length > 0 and chars indexOf (text[0]) != -1
		text = text substr (1)
	return text

@function stripend text, chars=SPACES
| Strips any character from @chars at the end of @text
	if text
		var n = text length - 1
		while n > 0 and chars indexOf (text[n]) != -1
			n -= 1
		return text substr (0, n + 1)
	return text

@function capitalize text
| Capitalize the first character of the given text
	text = str(text)
	return text[0] toUpperCase () + text[1:]

@function safekey text
| Returns the given text as a safe, spaceless, lowercase key-able string
	return ("" + text) replace (RE_KEY, "") replace (RE_SPACES, "_") toLowerCase () trim ()

@function lower text
	return text toLowerCase () if text else text

@function upper text
	return text toUpperCase () if text else text

@function letters text
| Converts the given text as an array of letters.
	return text match
		is? String
			0..(text length) ::= {text[_]}
		else
			None

@function before text, substring
	if not text
		return text
	let i = text indexOf (substring)
	if i == -1
		return text
	else
		return text[:i]

@function after text, substring
	if not text
		return text
	let i = text indexOf (substring)
	if i == -1
		return text
	else
		return text[i+len(substring):]

@function endsWith text, string
	if (not text) or (not string)
		return False
	else
		let i = text length - string length
		return text indexOf (string)  == i

@function split text, substring, count=-1, offset=0
	if (not text) or (offset >= text length) 
		return []
	elif count == 0
		return [text] if offset == 0 else [text[offset:]]
	else
		let i = text indexOf (substring, offset)
		if i == -1
			return [text] if offset == 0 else [text[offset:]]
		else
			return [text[offset:i]] concat (split (text, substring, count - 1, i + 1))

# TODO
# @function rsplit text, substring, count=-1, offset=0

@function escape text, chars=".*+?()[]", escape="\\"
| Escapes any occurence of `chars` with the given `escape`
| character.
	if not text
		return text
	var i = 0
	let n = text length
	let res = []
	var o = 0
	while i < n
		let c = text[i]
		if chars indexOf (c) >= 0
			res push (text[o:i])
			res push (escape + c)
			o = i + 1
		i += 1
	if o < n
		res push (text[o:])
	return res join ""

@function wrap text, maxWidth=20, table=Undefined, defaultWidth=0.5
| An alias to Text.Wrap
	return Text Wrap (text, maxWidth, table, defaultWidth)

@function processors extra=Undefined
| Registers the given set of processors to be used when procesing template
| strings.
	if extra is not Undefined
		extra :: {v,k|PROCESSORS[k] = v}
	return PROCESSORS

# TODO: add regular expression split
# TODO: Support for context
# FIXME: When date is undefined, the text is returned as-is
@function template text:String, data:Object=None, processors=PROCESSORS, context:Object=None
| Takes an input string template containing `{NAME|PROCESSOR|‥}` expressions, which
| will be replaced by `data[NAME]` and the result piped through the chain of
| processors.
	let res = []
	var o   = 0
	let n   = text length
	let d   = data match
		is? Object
			data
		is None or data is Undefined
			{}
		else
			# NOTE: At some point this was [data], but it's not necessarily warranted
			# to do so.
			data
	# TODO: Change the resolution: "_" ==> value otherwise it's form the context
	while o < n
		# (i,j) match the closest `{` and `}`
		var i = text indexOf ("{", o)
		var j = text indexOf ("}", o)
		while i > 0 and text[i - 1] == "\\"
			# The musn't be escaped
			i = text indexOf ("{", i + 1)
		while i >= 0 and j > 0 and text[j - 1] == "\\"
			j = text indexOf ("{", j + 1)
		if i >= 0 and i < j
			# We now have found a template expresssion {…}
			let expr = text[i+1:j] split "|"
			let k    = expr[0]
			res push (text[o:i])
			# This does resolution within the data
			var ki = 0
			let kl = k length
			var value = d
			# An empty key or `_` means it's the current object
			if k == "_" or k == ""
				value = value
			else
				# Now we iterate on the resolve expression, which
				# should be dot-separated
				while ki >= 0 and ki < kl and value is not Undefined
					# We look for a dot in the current key
					let kj = k indexOf (".", ki)
					let kk = k[ki:] if kj == -1 else k[ki:kj]
					if kk == "_" or kk == ""
						value = value
					elif (value is not Undefined) and (value[kk] is not Undefined)
						value = value[kk]
					else
						value = Undefined
					# We break if we haven't found a dot
					ki = kl if kj == -1 else (kj + 1)
			# We apply the processors to extract the value
			if processors
				value = (expr[1:] reduce ({r,v|return processors[v] (r, data) if processors[v] else r}, value))
			if value is not Undefined
				res push (str(value))
			o = j + 1
		else
			res push (text[o:])
			o = n
	return res join ""
@where
	template "" == ""
	template ("{}", "hello") == "hello"
	template ("{_}", "hello") == "hello"
	template ("{a}", {a:"hello"}) == "hello"
	template ("{a}", {a:1})       == "1"
	template ("a={a}", {a:1})     == "a=1"

# We register default processors
PROCESSORS lower = lower
PROCESSORS upper = upper
PROCESSORS capitalize = capitalize

# EOF
