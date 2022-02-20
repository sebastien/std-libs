@feature  sugar 2
@module   std.text.layout
| Helpers functions to deal with text layout

@import   stripend, previous from std.text
@import   len from std.core

@shared MEASURE = {len(_)}
| The naive measuring function counts the number of characters in the given
| text.

@function wrap text, width, measureWidth=MEASURE
| Wraps the given text in an array of lines so that the no line
| measures more than the given width. The `measureWidth` function takes
| a string and returns its rendered width.
	if not text or text length == 0
		return [text]
	let total_width   = measureWidth (text)
	let min_lines     = total_width / width
	let char_per_line = Math max (5, Math floor (text length / min_lines))
	if min_lines <= 1
		return [text]
	else
		var i = 0
		var j = 0
		let l = text length
		let r = []
		while i < l
			# [i] : start of line
			# [j] : end of line
			j = Math min (l, i + char_per_line)
			# We look for the previous separator just before
			# the end of line.
			while True
				# We handle the case where we have the last line
				let o = previous (text, " ", j) if j < l else l
				# We haven't found a previous sperator after [i], so
				# we're going to take the full line
				if o <= i or o == j
					break
				# We have found a separator, so we set the end of line
				# to it.
				j = o
				# We break the iteration if the line is short enough.
				let tw = measureWidth (text[i:j])
				if tw <= width
					break
			# We trim the leading and trailing spaces
			while text[i] == " " and i < l
				i += 1
			# while text[j] == " " and i < j
			# 	j -= 1
			# We add the line
			r push (text[i:j])
			i = j + 1
		return r

@function wrapcut text, size, lineHeight=(size * 1.35), measureWidth=MEASURE, ellipsis="‥"
| Wraps the text to fit `size[0]` and cuts the last line if all the lines
| don't fit.
	let lines = wrap (text, size[0], measureWidth)
	var res   = []
	lineHeight = lineHeight or size * 1.35
	var i     = Math floor (size[1] / lineHeight)
	if i == 0
		return []
	elif i > lines length
		return lines
	else
		let res = lines[:i]
		res[i - 1] = stripend (res[i - 1], " \n,.:!?-") + ellipsis
		return res

@function fit text, size, measure={_ length}
| Returns the scaling factor that would make the given `text` fit
| in the given `size:[w,h]`, using the `measure` function returning
| a `[w,h]` size.
	let s = measure (text)
	return Math min (size[0] / s[0], size[1]/s[1])

@function cut text, width, measureWidth=MEASURE, ellipsis="‥"
| Cuts the given text as soon as it exceeds the given width:
	# We measure the width of the ellipsis [ew]
	let ew = measureWidth (ellipsis)
	# and get the remaining width [w]
	let w  = width - ew
	# If the remaining width is less than the ellipsis, we return nothing
	if w < ew
		return ""
	# Now we measure the whole text
	var tw = measureWidth (text)
	# If it's less than the width, we return it as-is
	if tw < width
		return text
	# Otherwise we try to find the character that is close to the
	# end. This is not the most accurate way, but it's quite fast.
	let i = Math floor (text length * width / tw)
	var t = Undefined
	while i > 0
		# We skip trailing spaces
		while i > 0 and text[i] == " "
			i -= 1
		# We get the substring
		t  = text[:i]
		# Measure it
		tw = measureWidth (t)
		if tw >= w
			# If it's bigger, we continue the iteration
			# NOTE: We could improve the speed by increasing the step
			# and converging to the right position.
			i -= 1
		else
			# Or we return the substring with the ellipsis
			return t + ellipsis
	return ellipsis

# EOF - vim: ts=4 sw=4 noet
