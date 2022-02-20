@feature sugar 2
@import  Component from std.ui.components
@import  len, bool from std.core
@import  access, nest from std.collections
@import  Traversal from std.api.dom

@class Component: Component

	@shared STYLESHEET = True

	@property network = {
		"nodes" : {
			"-group" : {
				"value:value" : []
				"level:value" : 1
				"selection:value" : {}
				"label:value" : None
			}
			"-reducers" : {
				"visible:reduce" : reduceVisible

			}
		}
		"edges" : [
			"(value,level,selection)->visible"
			"(visible)->render"
		]
	}

	@method set value:Any
		state value set (value)
		return self
	
	@method get
		return state value value

	@method reduceVisible value, level, selection
		return _reduceVisibleHelper (value, selection)

	@method _reduceVisibleHelper value, selection
		if value is? Object or value is? Array
			if bool (selection and selection["*"])
				return {
					expanded : True
					type     : "array" if value is? Array else "object"
					length   : len(value)
					values   : value ::= {v,k|
						_reduceVisibleHelper (v, selection and selection[k])
					}
				}
			else
				return {
					expanded : False
					length   : len(value)
					type     : "array" if value is? Array else "object"
					values   : value ::= {v|
						return v match
							is? Object    -> Object
							is? Array     -> Array
							is? Function  -> Function
							else          -> v
					}
				}
		else
			return value

	@method onToggleValue event
		let n = event target
		var t = Traversal first (n, "<<", {_ getAttribute "data-composite" is "true"})
		if t
			let path = t getAttribute "data-path" split "." ::? {return _}
			path push "*"
			let sel  = state selection value or {}
			let m    = nest (sel, path, not bool (access (sel, path)))
			state selection set (m, True)


# EOF
