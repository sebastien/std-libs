@feature sugar 2
@module std.text.format
@import sprintf from std.core
@import TSingleton from std.patterns.oo
@import frac from std.math


@class NumberFormat: TSingleton

	@shared GROUP_SEPARATOR    = ","
	@shared DECIMAL_SEPARATOR  = "."
	@shared THOUSAND_SEPARATOR = ","
	@shared DECIMAL_PRECISION  = 3


	@shared ROMAN              = [
		"","C","CC","CCC","CD","D","DC","DCC","DCCC","CM"
		"","X","XX","XXX","XL","L","LX","LXX","LXXX","XC"
		"","I","II","III","IV","V","VI","VII","VIII","IX"
	]

	@shared UNITS = {
		"thousand"      : {
			single : {en:"thousand", fr:"mille", es:"mil"}
			multi  : {en:"thousand", fr:"mille", es:"mil"}
		}
		"million"    : {
			single : {en:"million",  fr:"million",  es:"millón"}
			multi  : {en:"million",  fr:"millions", es:"millones"}
		}
		"billion" : {
			single : {en:"billion",  fr:"milliard", es:"mil millones"}
			multi  : {en:"billion",  fr:"milliards", es:"mil millones"}
		}
	}

	# TODO: All thse should be parametered based on the locale

	@method integer value, sep=(THOUSAND_SEPARATOR)
	| Formats the given number as an integer
		value = Math floor (value) if value is? Number else parseInt (value)
		let is_neg = value < 0
		let n   = Math abs (value)
		var s   = "" + n
		var r   = ""
		var i   = 0
		while i < s length
			var c = s[s length - 1 - i]
			# FIXME: Does not work for negative numbers
			if (i > 0) and (i < (s length - 1)) and (((i + 1) % 3) == 0)
				r = sep + c + r
			else
				r = c + r
			i += 1
		if is_neg
			r = "-" + r
		return r
	
	@method decimal value, precision=DECIMAL_PRECISION
	| Returns the decimal part of the given number
		value = parseFloat(value) if value is? String else value
		value = Math round (Math abs (frac (value) * Math pow (10,precision)))
		return "" + value
	
	@method float value, precision=DECIMAL_PRECISION, mil=THOUSAND_SEPARATOR, dec=DECIMAL_SEPARATOR
	| Formats the given number as a floating point number
		value = parseFloat(value) if value is? String else value
		if precision <= 0
			return integer (value, mil)
		else
			return integer (value, mil) + dec + decimal (value, precision)

	@method percentage value, precision=DECIMAL_PRECISION, mil=THOUSAND_SEPARATOR, dec=DECIMAL_SEPARATOR
		value = parseFloat(value) if value is? String else value
		return percentage100(100 * value, precision, mil, dec)

	@method percentage100 value, precision=DECIMAL_PRECISION, mil=THOUSAND_SEPARATOR, dec=DECIMAL_SEPARATOR
		value = parseFloat(value) if value is? String else value
		return float (value, precision, mil, dec) + "%"


@class DateFormat: TSingleton

	@shared MONTHS        = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
	@shared MONTHS_SHORT  = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	@shared DAYS          = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
	@shared DAYS_SHORT    = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

	@method monthYear date
		return monthName(date) + " "+ year (date)

	@method shortMonthYear date
		return monthShortName(date) + " "+ year (date)

	@method year date
		return "" + date[0]

	@method monthName date
		return MONTHS [(date[1] % 12) - 1]

	@method monthShortName date
		return MONTHS_SHORT [(date[1] % 12) - 1]
	
	@method ymd date
		return sprintf("%d-%02d-%02d", date[0], date[1], date[2])

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function integer value, separator=Undefined
	return NumberFormat Get () integer (value, separator)

@function float value, precision=Undefined, mil=Undefined, dec=Undefined
	return NumberFormat Get () float (value, precision, mil, dec)

@function percentage value, precision=Undefined, mil=Undefined, dec=Undefined
	return NumberFormat Get () percentage (value, precision, mil, dec)

@function percentage100 value, precision=Undefined, mil=Undefined, dec=Undefined
	return NumberFormat Get () percentage100 (value, precision, mil, dec)

# EOF
