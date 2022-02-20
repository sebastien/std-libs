@feature sugar 2
@import  Component from std.ui.components
@import  All from std.util.testing
@import  group from std.collections

@class Component: Component

	@shared STYLESHEET = True

	@property network = {
		"nodes" : {
			"-inputs" : {
				"test:value": All
			}
			"-reducers" : {
				"tests:reduce": reduceTests
				"status:reduce": reduceStatus
			}
		}
		"edges" : [
			"(test)->tests"
			"(tests)->status"
			"(status,tests)->render"
		]
	}

	@method reduceTests test
		let g = group (test walk (), {_ statusName}, True)
		return (g["WAITING"] or []) concat (g["SUCCESS"] or []) concat (g["FAILURE"] or [])

	@method reduceStatus tests
		let is_waiting = 0
		let is_success = 0
		for t in tests
			if t isFailure
				return {overall:"failure"}
			elif t isWaiting
				is_waiting += 1
			elif t isSuccess
				is_success += 1
		return {overall:"waiting" if is_waiting else "success"}

# EOF
