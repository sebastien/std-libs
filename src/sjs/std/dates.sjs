@feature sugar 2
@module  std.dates
@import  sprintf from std.core
@import  warning, assert, error from std.errors
@import  runtime.window as window

# TODO: Add rounding to AggregateTo*, like in AggreateToWeek
# TODO: Although this is not fun, the whole module should minimize the use
# of arrays and use floats (gregorian) whenever possible for fast computation.
# The goal should not be utmost accuracy, but rather fast computation.
@enum By = YEAR | MONTH | WEEK | DAY

@class Gregorian

	@shared TIMEZONE_OFFSET = (new window Date () getTimezoneOffset ()) / (60 * 24)
	@shared YEAR    = 365
	@shared MONTH   = 30
	@shared WEEK    = 7
	@shared DAY     = 1
	@shared SECOND  = 1 / (60 * 60 * 24)
	@shared MINUTE  = 1 / (60 * 24)
	@shared HOUR    = 1 / 24

	@operation Hour value
		let v = gregorian (value)
		return Math floor (v / HOUR) % 24

	@operation Minute value
		let v = gregorian (value)
		return Math floor (v / MINUTE)  % 60

	@operation Second value
		let v = gregorian (value)
		return Math floor (v / SECOND) % 60

@class Date
| Dates calculation that do not rely on platform-specific date library but instead
| use an UTC, ISO date format and simple arithmetic calculations.

	@shared TIMEZONE_OFFSET   = new window Date () getTimezoneOffset ()
	@shared PERIOD_OVERALL    = "O"
	@shared PERIOD_YEAR       = "Y"
	@shared PERIOD_MONTH      = "M"
	@shared PERIOD_MONTH_HALF = "MH"
	@shared PERIOD_WEEK_2     = "W2"
	@shared PERIOD_WEEK       = "W"

	@shared SECONDS_PER_MINUTE = 60
	@shared SECONDS_PER_HOUR   = 60 * 60
	@shared SECONDS_PER_DAY    = 60 * 60 * 24
	@shared SECONDS_PER_WEEK   = 60 * 60 * 24 * 7

	@shared YEAR    = 0
	@shared MONTH   = 1
	@shared DAY     = 2
	@shared HOUR    = 3
	@shared MINUTES = 4
	@shared SECONDS = 5

	@operation IsLeapYear year
		# REF: http://algor.chez.com/date/date.htm
		if year % 4 == 0
			if (year % 100 == 0) and (year % 400 != 0)
				return False
			else
				return True
		else
			return False

	@operation Now
		return Ensure (new window Date ())

	@operation Today delta=0
		var today = AggregateToDay (Ensure (new window Date ()))
		if delta != 0
			today = AddDays (today, delta)
		return today

	@operation Compare a, b
		a = Gregorian (a) ; b = Gregorian (b)
		return a - b

	@operation Equals a, b
		return Compare (a, b) == 0

	@operation Before a, b
	| Does a strict comparison of the dates
		return Compare (a,b) < 0

	@operation After a, b
	| Does a strict comparison of the dates
		return Compare (a,b) > 0

	@operation Between date, a, b, strict=False
		if Before (date, a)
			return False
		if After  (date, b) or (strict and Equals (date, b))
			return False
		else
			return True

	@operation Max a, b
	| Returns the latest date between `a` and `b`
		return a if Compare (a, b) > 0 else b

	@operation Min a, b
	| Returns the earliest date between `a` and `b`
		return a if Compare (a, b) <= 0 else b

	@operation FromISOTimestamp ymd
	| Returns a '[y,m,d]' triple from the given YMD timestamp expressed
	| in the format 'YYYY-MM-DD'
		ymd = ymd split "-"
		var res = []
		res push (parseInt(ymd[0]))
		if ymd[1][0] == "0"
			res push (parseInt(ymd[1][1:]))
		else
			res push (parseInt(ymd[1]))
		if ymd[2][0] == "0"
			res push (parseInt(ymd[2][1:]))
		else
			res push (parseInt(ymd[2]))
		# FIXME: Should support more TMM:SS:mm +TZ
		return res
	
	@operation ToISOYMD ymd
		let date = Date Ensure (ymd)
		return sprintf ("%04d-%02d-%02d", ymd[0] or 0, ymd[1] or 1, ymd[2] or 1)

	@operation Gregorian y:Int, m:Int=1, d:Int=1, h:Int=0, mn:Int=0, s:Int=0
	| Returns the number of the given day
		if y is? Number and arguments length == 1
			return y
		if y is? Array
			y = Ensure(y)
			return Gregorian (y[0], y[1], y[2], y[3], y[4], y[5])
		# If m > 12, we add the corresponding values in years
		if m > 12
			y += 1 * Math floor (m / 12)
			m  = m % 12
		d = Math max (d, 1)
		# REF: http://alcor.concordia.ca/~gpkatch/gdate-algorithm.html
		m        = (m + 9) % 12
		var y    = y - Math floor (m/10)
		var rest = ((h * 60.0 + mn) * 60.0 + s) / SECONDS_PER_DAY
		return 365 * y + Math floor (y/4) - Math floor (y/100) + Math floor (y/400) + Math floor ((m*306 + 5)/10) + ( d - 1 ) + rest

	@operation FromGregorian g:Int
	| Returns the date '[y,m,d]' for the given day number
		var hms = g - Math floor (g)
		g       = Math floor (g)
		var y   = Math floor ((10000 * g + 14780)/3652425)
		var ddd = g - (365*y + Math floor(y/4) - Math floor (y/100) + Math floor (y/400))
		if ddd < 0
			y = y - 1
			ddd = g - (365*y + Math floor (y/4) - Math floor (y/100) + Math floor (y/400))
		var mi = Math floor ((100*ddd + 52)/3060)
		var mm = (mi + 2) % 12 + 1
		y      = y + Math floor ((mi + 2)/12)
		var dd = ddd - Math floor ((mi * 306 + 5)/10) + 1
		var s  = hms % (3600) % 60
		var m  = Math floor ((hms % 3600) / 60)
		var h  = Math floor (hms / 3600)
		return [y, mm, dd, h, m, s]

	# SEE: https://wikicoding.org/wiki/c/Tomohiko_Sakamoto%27s_Algorithm/
	@operation WeekDay year, month, day, firstDay=0
	|  the day number for this date 0==Monday, 6==Sunday
		if year is? Number and arguments length == 1
			year = Ensure (year)
		if year is? Array
			return WeekDay (year[0], year[1], year[2], month)
		assert (year >= 1582,               "Algorithm only valid for dates > 1582, got:" + year)
		assert (month >= 1 and month <= 12, "Month must be between 1-12 inclusive, got:" + month)
		if month <= 2
			month += 12
			year  -= 1
		# FIXME: It would be nice to have a little bit more background about that
		var s    = Math floor (year / 100)
		var sday = 1720996.5 - s + Math floor (s / 4) + Math floor (365.25 * year) + Math floor (30.6001 * (month + 1)) + day
		sday     = sday - Math floor (sday / 7) * 7
		var wday = (Math floor (sday) + 1) % 7
		# We adjust based on the first day. In US calendars, the first day
		# is Sunday (==6), so we shift the result by one day, as there
		# is now 1 more day to reach Monday (the canonical 0).
		return (wday + (7 - firstDay)) % 7

	@operation Day date=Now()
		return Ensure (date) [2]

	@operation Month date=Now()
		return Ensure (date) [1]

	@operation Year date=Now()
		return Ensure (date) [0]

	@operation DaysInMonth year, month
	| Returns the number of days in the given month
		if year is? Array
			return DaysInMonth (year[0], year[1])
		if month == 12
			return Gregorian(year + 1,1)      - Gregorian(year, month)
		else
			return Gregorian(year, month + 1) - Gregorian(year, month)

	@operation EnsureYMD date
		return Date Ensure (date) [0:3]

	@operation Ensure date
	| Returns the current date as a time tuple
		var res = date
		if date is? Array
			# Date is a Python struct-time
			# 0	tm_year	(for example, 1993)
			# 1	tm_mon	range [1, 12]
			# 2	tm_mday	range [1, 31]
			# 3	tm_hour	range [0, 23]
			# 4	tm_min	range [0, 59]
			# 5	tm_sec	range [0, 61]; see (1) in strftime() description
			# 6	tm_wday	range [0, 6], Monday is 0
			# 7	tm_yday	range [1, 366]
			# 8	tm_isdst	0, 1 or -1; see below
			date = date concat ()
			while date length < (9 - 3)
				date push 0
			while date length < 9
				date push (Undefined)
			if res[1] <= 0 or res[1] > 12
				res[1] = Undefined
			if res[2] <= 0
				res[2] = 1
			res = date
		elif date is? window.Date
			return Ensure([date getUTCFullYear(), date getUTCMonth() + 1, date getUTCDate(), date getUTCHours (), date getUTCMinutes (), date getUTCSeconds(), date getUTCDay(), Undefined, 0])
		elif date is? Number
			return FromGregorian (date)
		else
			assert (False, "Unsupported date type:", date)
		return res

	@operation EnsureUNIXTimestamp date
	| Returns the current date in milliseconds
		return _EnsureJSDate (date) getTime () / 1000.0

	@operation _EnsureJSDate date
	| Private function that returns the date as a JavaScript date
		var date = Ensure (date)
		var year, month, day, hour, minute, second, wday, yday, is_dst = date
		var res = new window Date ()
		# FIXME: We should do it at once instead
		res setUTCDate     (1)
		res setUTCFullYear (year)
		res setUTCMonth    (month - 1)
		res setUTCDate     (day)
		res setUTCMinutes  (minute)
		res setUTCSeconds  (second)
		return res

	@operation AggregateTo date, granularity, rounding=-1
		return granularity match
			is By YEAR  → AggregateToYear  (date)
			is By MONTH → AggregateToMonth (date)
			is By WEEK  → AggregateToWeek  (date)
			is By DAY   → AggregateToDay   (date)
			else     → error ("Unsupported granularity type", granularity, __scope__)

	@operation AggregateToDay date
	| Returns a date that corresponds to the start of the day (0:00:00) of the
	| given date.
		date = Ensure(date)
		var year, month, day, hour, minute, second, wday, yday, is_dst = date
		return [year, month, day, 0, 0, 0, Undefined, Undefined, Undefined]

	@operation AggregateToWeek date, rounding=-1
	| Returns a date that corresponds to the start of the week of the
	| given date.
		date = Ensure(date)
		var year, month, day, hour, minute, second, wday, yday, is_dst = date
		var week_day = WeekDay (year, month, day)
		if week_day > 0
			let delta = rounding match
				< 0
					0 - week_day
				> 0
					7 - week_day
				else
					(week_day > 3) and (7 - week_day) or (0 - week_day)
			return AggregateToDay(AddDays(date, delta))
		else
			 return AggregateToDay(date)

	@operation AggregateToWeekEnd date
		return AggregateToWeek (date, 1)

	@operation AggregateToMonth date
	| Returns a date that corresponds to first day of the month of the given
	| given date.
		date = Ensure(date)
		var year, month, day, hour, minute, second, wday, yday, is_dst = date
		return [year, month, 1, 0, 0, 0, Undefined, Undefined, Undefined]

	@operation AggregateToMonthEnd date
	| Returns a date that corresponds to last day of the month of the given
	| given date.
		date = Ensure(date)
		var year, month, day, hour, minute, second, wday, yday, is_dst = date
		return [year, month, DaysInMonth(date), 0, 0, 0, Undefined, Undefined, Undefined]

	@operation AggregateToYear date
	| Returns a date that corresponds to first day of the year of the given
	| given date.
		date = Ensure(date)
		var year, month, day, hour, minute, second, wday, yday, is_dst = date
		return [year, 1, 1, 0, 0, 0, Undefined, Undefined, Undefined]

	@operation AggregateToYearEnd date
	| Returns a date that corresponds to last day of the year of the given
	| given date.
		date = Ensure(date)
		var year, month, day, hour, minute, second, wday, yday, is_dst = date
		return [year, 12, 31, 0, 0, 0, Undefined, Undefined, Undefined]

	@operation AggregateToPeriod date, start, duration
	| Returns the number of the period that starts on the given 'start' date, and lasts
	| 'duration' days.
		date  = Ensure(date)
		start = Ensure(start)
		var start_day    = Gregorian (start)
		var date_day     = Gregorian (date)
		var delta        = date_day - start_day
		var padded_delta = Math floor (delta / duration) * duration
		return FromGregorian (start_day + padded_delta)

	@operation DeltaInSeconds a, b
		a = EnsureUNIXTimestamp (a)
		b = EnsureUNIXTimestamp (b)
		return b - a

	@operation Min a, b
		if Compare (a, b) < 0
			return a
		else
			return b

	@operation Max a, b
		if Compare (a, b) > 0
			return a
		else
			return b

	@operation DeltaIn a, b, granularity
		return granularity match
			is By YEAR  → DeltaInYears  (a, b)
			is By MONTH → DeltaInMonths (a, b)
			is By WEEK  → DeltaInWeeks  (a, b)
			is By DAY   → DeltaInDays   (a, b)
			else     → error ("Unsupported granularity type", granularity, __scope__)

	@operation DeltaInDays a, b
		a = AggregateToDay (a)
		b = AggregateToDay (b)
		return Math floor (DeltaInSeconds(a, b) / SECONDS_PER_DAY)

	@operation DeltaInMonths a, b
		a = AggregateToMonth(a)
		b = AggregateToMonth(b)
		var am = a[0] * 12 + a[1]
		var bm = b[0] * 12 + b[1]
		return bm - am

	@operation DeltaInWeeks a, b
		a = Gregorian (a)
		b = Gregorian (b)
		return (b - a) / 7.0

	@operation DeltaInYears a, b
		a = AggregateToYear(a)
		b = AggregateToYear(b)
		return b[0] - a[0]

	@operation Copy date
	| Copies the given date object
		return [] concat (Ensure (date))

	@operation AddTo date, delta, granularity
		return granularity match
			is By YEAR  → AddYears  (date, delta)
			is By MONTH → AddMonths (date, delta)
			is By WEEK  → AddWeeks  (date, delta)
			is By DAY   → AddDays   (date, delta)
			else     → error ("Unsupported granularity type", granularity, __scope__)

	@operation AddSeconds date, delta
		return Add (date, [0,0,0,0,0,delta])

	@operation AddMinutes date, delta
		return Add (date, [0,0,0,0,delta])

	@operation AddHours date, delta
		return Add (date, [0,0,0,delta])

	@operation AddDays date, delta
		return FromGregorian(Gregorian (date) + delta)

	@operation AddWeeks date, delta
		return AddDays (date, delta * 7)

	@operation AddYear date, delta
		return Add (date, [delta, 0, 0])

	@operation AddMonths date, delta
		return Add (date, [0, delta])

	@operation AddYears date, delta
		date = Ensure (date)
		date[0] += delta
		return date

	@operation Add date, delta, factor=1
		date  = Ensure (date)
		delta = Ensure (delta)
		# We normalize the delta
		var dy   = (delta[0] or 0) * factor
		var dm   = (delta[1] or 0) * factor
		var dd   = (delta[2] or 0) * factor
		var dh   = (delta[3] or 0) * factor
		var dmn  = (delta[4] or 0) * factor
		var ds   = (delta[5] or 0) * factor
		# We propagate the months to the years and
		# calculate the final month `nm` and year `ny` for
		# the date.
		var nm   = (date[1] + dm) - 1
		dy      += Math floor (nm / 12)
		nm       = (nm % 12) + 1
		var ny   = date[0] + dy
		# Now we normalize the delta according to seonds, minutes and
		# hours so that everything is propagated to days.
		dmn     += Math floor (ds  / 60)
		ds       = ds % 60
		dh      += Math floor (dmn / 60)
		dmn      = dmn % 60
		dd      += Math floor (dh  / 24)
		dh       = dh % 24
		# Finally we get the base date in [Y,M,D,h,m,s] format, convert
		# it to gregorian and add teh `dd` (delta days) that we calculated
		# above.
		# FIXME: Hours are not propagated back properly in the result
		var d  = [ny, nm, date[2], date[3] + dh, date[4] + dmn, date[5] + ds]
		return FromGregorian (Gregorian (d) + dd)

	@operation Remove date, delta
		return Add (date, delta, -1)

	@operation ListYears a, b, inclusive=False
	| Lists the months contained between the given two dates, where the first month
	| will be the month of date a and the last month will be the month of date b,
	| inclusively.
		# FIXME: Should determine wether this should be inclusive or not
		a = AggregateToYear(a)
		b = AggregateToYear(b)
		let res = []
		var y = a[0]
		while y < b[0]
			res push ([y,1,1])
			y += 1
		if inclusive
			res push [b[0], 1, 1]
		return res

	@operation ListMonths a, b
	| Lists the months contained between the given two dates, where the first month
	| will be the month of date a and the last month will be the month of date b,
	| inclusively.
		# FIXME: Should determine wether this should be inclusive or not
		a = AggregateToMonth(a)
		var d = DeltaInMonths(a,b)
		if d == 0
			return [a]
		var y   = a[0]
		var m   = a[1]
		var res = [a]
		while Math abs (d) > 0
			if d < 0
				m -= 1
				d += 1
			else
				m += 1
				d -= 1
			if m == 0
				m  = 12
				y -= 1
			elif m == 13
				m  = 1
				y += 1
			res push (Ensure([y, m, 1]))
		return res

	@operation ListWeeks a, b
		a = AggregateToWeek (a)
		var c = DeltaInWeeks (a,b)
		if c == 0
			return [a]
		else
			var a = Copy (a)
			let r = []
			while c > 0
				r push (a)
				a = AddWeeks (a, 1)
				c -= 1
			return r

	@operation ListGregorianDays a, b
		a = Gregorian (a)
		b = Gregorian (b)
		return (a)..(b)

	@operation ListDays a, b
		a = Gregorian (a)
		b = Gregorian (b)
		return (a)..(b) ::= {FromGregorian(_)}

	@operation ListPeriods a, b, durationOrType, truncate=Undefined
	| A wrapper around `ListPeriodsWithName` and `ListPeriodsWithDuration` that
	| will dispatch to one or the other depending on the type of `durationOrType` (number
	| for `ListPeriodsWithDuration` and string for `ListPeriodsWithName`)
		if durationOrType is? Number
			return ListPeriodsWithDuration (a,b,durationOrType)
		else
			return ListPeriodsWithName (a,b,durationOrType,truncate)

	@operation ListPeriodsWithDuration a, b, duration
	| This method is useful when you want to decompose a time lapse in periods
	| with having the same duration (in days)
		var start_day = Gregorian (a)
		var end_day   = Gregorian (b)
		var days      = end_day - start_day
		var res       = [FromGregorian(start_day)]
		while Math abs (days) > 0
			if days > 0
				start_day += duration
				days      -= duration
				if start_day < end_day
					res push (FromGregorian(start_day))
				else
					days   = 0
			else
				start_day -= duration
				days      += duration
				if start_day > end_day
					res push (FromGregorian(start_day))
				else
					days   = 0
		return res

	# FIXME: Merge this with ListPeriod
	# FIXME: This seems quite complicated and would need some review
	@operation ListPeriodsWithName a, b, periodType, truncate=True
		# FIXME: Shoudl be add period name/id?
		var res                = []
		var start_date         = Ensure (a)
		var end_date           = Ensure (b)
		if periodType == PERIOD_OVERALL
			res push {
				type      : periodType
				startDate : start_date
				endDate   : end_date
				duration  : DeltaInDays(start_date, end_date)
			}
		elif periodType == PERIOD_MONTH
			var months = ListMonths (start_date, end_date)
			for date in months
				var duration        = DaysInMonth(date)
				var rest            = DeltaInDays(date, end_date)
				var entire_end_date = AddDays (date, duration - 1)
				if truncate and (rest < duration)
					var period_end_date = AddDays (date, rest)
					res push {
						type:           periodType
						startDate:      date
						endDate:        period_end_date
						duration:       rest + 1
						entireEndDate:  entire_end_date
						entireDuration: duration
					}
				else
					res push {
						type:           periodType
						startDate:      date
						endDate:        entire_end_date
						duration:       duration
						entireEndDate:  entire_end_date
						entireDuration: duration
					}
		elif periodType == PERIOD_MONTH_HALF
			var dates = ListMonths (start_date, end_date)
			for month_date in dates
				var first_half  = month_date
				var second_half = AddDays (month_date, 15)
				for date in [first_half, second_half]
					var rest     = DeltaInDays(date, end_date)
					var duration = 15
					if date[2] >= 15
						duration = DaysInMonth (date) - 15
					if rest >= 0
						var entire_end_date = AddDays (date, duration - 1)
						if trunc and (rest < duration)
							var period_end_date = AddDays (date, rest)
							res push {
								startDate:      date
								duration:       rest + 1
								endDate:        period_end_date
								entireDuration: duration
								entireEndDate:  entire_end_date
								type:           periodType
							}
						else
							res push {
								startDate:      date
								endDate:        entire_end_date
								duration:       duration
								entireDuration: duration
								entireEndDate:  entire_end_date
								type:           periodType
							}
		elif periodType == PERIOD_WEEK or periodType == PERIOD_WEEK_2
			var duration = 7
			if periodType == PERIOD_WEEK_2
				duration = 14
			var dates    = ListPeriods (start_date, end_date, duration)
			for date in dates
				var rest            = DeltaInDays(date, end_date)
				var entire_end_date = AddDays (date, duration - 1)
				if truncate and (rest < duration)
					var period_end_date = AddDays (date, rest)
					res push {
						type:           periodType
						startDate:      date
						duration:       rest + 1
						endDate:        period_end_date
						entireDuration: duration
						entireEndDate:  entire_end_date
					}
				else
					res push {
						type:           periodType
						startDate:      date
						endDate:        entire_end_date
						duration:       duration
						entireDuration: duration
						entireEndDate:  entire_end_date
					}
		else
			error ("Unexpected period type:" + periodType)
			return []
		res sort ()
		return res


	@operation Timestamp date=(Date Now())
		date  = Ensure (date)
		var yr = (date[0]     ) * Math pow (10, 12)
		var mo = (date[1] or 1) * Math pow (10, 10)
		var da = (date[2] or 1) * Math pow (10, 8)
		var ho = (date[3] or 0) * Math pow (10, 6)
		var mn = (date[4] or 0) * Math pow (10, 4)
		var se = (date[5] or 0) * Math pow (10, 2)
		var ms = (date[6] or 0) * Math pow (10, 0)
		return (yr + mo + da + ho + mn + se + ms)

	@operation FromTimestamp timestamp
	| The timestamp is a number like YYYYmmDDHHMMSSuu
		if timestamp is? String
			timestamp = parseInt(timestamp)
		var t  = timestamp
		var r  = []
		for f,i in [12, 10, 8, 6, 4, 2, 0]
			var k = Math pow (10, f)
			var v = Math floor (t / k)
			r push (v)
			t -= v * k
		return r

	@operation ToString date
		date = Copy (Ensure (date))
		while not date[-1]
			date pop ()
		return (date ::= {_|return "" + (_ or 0)}) join "-"

	@operation FromString date
		return Ensure ((("" + date) split "-") ::= {_|return parseInt(_)})

# -----------------------------------------------------------------------------
#
# PERIOD
#
# -----------------------------------------------------------------------------

@class Period

	@shared FOREVER = {period:"forever"}

	@operation Days period
		if len(period) == 0
			return 0
		elif len(period[0]) == 0 or len(period[1]) == 0
			return Infinity
		else
			return Date DeltaInDays (period[0], period[1])

	@operation Years period
		if len(period) == 0
			return 0
		elif len(period[0]) == 0 or len(period[1]) == 0
			return Infinity
		else
			return Date DeltaInYears (period[0], period[1])

	@operation Normalize period
		if (not period) or period is FOREVER or (not period[0]) or (not period[1])
			return period
		else
			return [Date Min (period[0], period[1]), Date Max (period[0],period[1])]

	@operation Equals a, b, level=3
		var as = a[0]
		var ae = a[1]
		var bs = b[0]
		var be = b[1]
		if as
			as = Date Ensure (as)[0:level]
		if ae
			ae = Date Ensure (ae)[0:level]
		if bs
			bs = Date Ensure (bs)[0:level]
		if be
			be = Date Ensure (be)[0:level]
		return cmp(as,bs) == 0 and cmp(ae, be) == 0


	@operation Week delta=0, count=1
		var week = Date AggregateToWeek (Date Today ())
		week     = Date AddWeeks (week, delta)
		return [
			week
			Date AddWeeks(week, count)
		]

	@operation Month delta=0, count=1
		var month = Date AggregateToMonth (Date Today ())
		month = Date AddMonths (month, delta)
		return [
			month
			Date AddMonths (month, count)
		]

	@operation Year delta=0, count=1
		var year = Date AggregateToYear (Date Today ())
		year = Date AddYears (year, delta)
		return [
			year
			Date AddYears (year, count)
		]

	@operation Contains period, date
		if not period
			return False
		elif period is FOREVER
			return True
		else
			return Date Between (date, period[0], period[1])

	@operation Past delta
		var now = Date Now ()
		return [Date Remove (now, delta), now]

	@operation PastYears count
		return Past [count, 0, 0]

	@operation PastMonths count
		return Past [0, count, 0]

	@operation PastDays count
		return Past [0, 0, count]

	@operation LastYears count
		var now = Date AggregateToYear (Date Now ())
		return [
			Date AddYears (now, 0 - count)
			Date AddYears (Date AggregateToYearEnd (now), -1)
		]

	@operation LastMonths count
		var now = Date Now ()
		return [
			Date AddMonths (Date AggregateToMonth    (now), 0 - count)
			Date AddMonths (Date AggregateToMonthEnd (now), -1)
		]

	@operation LastDays count
		var now = Date AggregateToDay (Date Now ())
		return [
			Date AddDays (now, 0 - count)
			now
		]

	@operation Within period, a
		return Contains(period, a[0]) and Contains(period, a[1])


@function today
	return Date Today ()

@function now
	return Date Now ()

@function gregorian date=now()
	return Date Gregorian (date)

# TODO: Deprecate in favor of date
@function fromGregorian date
	warning ("fromGregorian is deprecated, use `std.dates.ymd` instead")
	return Date FromGregorian (date)

@function ymd date
	return Date FromGregorian (date) if date is? Number else Date Ensure (date)

# EOF
