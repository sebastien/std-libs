@feature sugar 2
@import  Component       from std.ui.components
@import  safekey         from std.text
@import  str, cmp, bool  from std.core
@import  access, merge   from std.collections
@import  test, event     from std.util.testing

# Features:
# - Log (text,value) pairs
# - Fulfill expected values or events (id, value)
@class Component: Component

	@shared STYLESHEET = True

	@property network = {
		"nodes" : {
			"-group" : {
				"label:value"     : None
				"expected:value"  : None
				"value:value"     : Undefined
				"test:value"      : None
				"collapsed:value" : True
			}
			"-reducers" : {
				"status:reduce"    : reduceStatus
				"event:reduce"     : reduceEvent
				"valueType:reduce" : reduceValueType
			}
		}
		"edges" : [
			"(expected,value)->status"
			"(status,test)->event"
			"(value)->valueType"
			"*->render"
		]
	}

	# @method init
	# 	super init ()
	# 	network debug ()

	@method bindOptions options
		options = merge(options, {})
		options test ?= test (address)
		return super bindOptions (options)

	@method reduceStatus expected, actual
		if actual is Undefined
			return "waiting"
		elif cmp (actual, expected) == 0
			return "ok"
		else
			return "different"

	@method reduceEvent status, test, event
		if test and not event
			let n = address + ".status"
			event = test ensureEvent (n)
		if event
			match status
				is "waiting"
					event wait    ()
				is "ok"
					event succeed ()
				is "different"
					event fail    ()
		return event

	@method reduceValueType value
		if value is? Object or value is? Array
			return "composite"
		else
			return "simple"

	@method onToggleCollapsed
		state collapsed set (not bool (state collapsed value))

# EOF
