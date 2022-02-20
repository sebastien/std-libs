@feature sugar 2
@module  std.patterns.updatable

@trait TUpdatable

	@property isInhibited = 0

	@method inhibit
		isInhibited = 1
		return self

	@method doUpdate
		if isInhibited == 0
			self ! "Update" (arguments)
		else
			isInhibited += 1
		return self

	@method release updates=True
		if isInhibited
			let n = isInhibited - 1
			isInhibited = 0
			doUpdate () if updates and n > 0
		return self

# EOF - vim: ts=4 sw=4 noet
