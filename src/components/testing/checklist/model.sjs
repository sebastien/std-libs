@feature sugar 2
@import  Component from std.ui.components
@import  safekey   from std.text
@import  str, cmp, merge  from std.core
@import  access    from std.collections
@import  test      from std.util.testing

# Features:
# - Log (text,value) pairs
# - Fulfill expected values or events (id, value)
@class Component: Component

	@shared STYLESHEET = True
	@property network = {
		"nodes" : {
			"-group" : {
				"label:value"  : None
				"expected:list": []
				"actual:map"   : {}
				"test:value"   : None
			}
			"-reducers" : {
				"complete:reduce": {e,a|
					return []
				}
				"items:reduce|force": reduceItems
			}
		}
		"edges" : [
			"(expected,actual,test)->items"
			"(expected,actual)->complete"
			"*->render"
		]
	}

	@method bindOptions options
		options = merge(options, {})
		options test ?= test (address)
		return super bindOptions (options)

	@method reduceItems expected, actual, test
		return expected ::= {e,i|
			let label = e label or str(i)
			let id    = e id or safekey (label)
			let v     = True if e value is Undefined else e value
			let w     = actual[id]
			var s     = "waiting"
			if w is not Undefined
				s = "same" if cmp(v,w) == 0 else "different"
			return {
				label      : label
				id         : id
				expected   : v
				actual     : w
				status     : s
				test       : test
				isComplete : s is not "waiting"
			}
		}

		@method set key, value=True
			state actual set (key, value)

# EOF
