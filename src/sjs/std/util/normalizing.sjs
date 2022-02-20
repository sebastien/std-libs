@feature sugar 2
@module std.util.normalizing
| A set of functions used to normalize values of all sorts.
@import len,copy,identity,str from std.core
@import merge,head from std.collections
@import safekey from std.text

# TODO: Move this to collections?
@function oneof list, value, default=(head (list))
| Ensures that the given value is in the list, or returned the default value
| which defaults to the head of the list
	return value if value in list else default

@function items values, defaults={}, processor=safekey, withEmpty=False
| Takes a list of strings or partial {value,label} and returns
| `[{value,label,index}]`.
	processor = processor or identity
	return values ::> {r=[],v,i|
		if v is? String
			r push (merge (defaults[v], {value:processor(v), label:v, index:len(r)}))
		elif v
			var value  = v value
			value     ?= processor (v label)
			value     ?= i
			var label  = v label
			label     ?= str(v value)
			label     ?= str(len(r))
			# NOTE: The copying here will lose the original prototype
			r push (merge (copy(v), {value:value, label:label, index:len(r)}))
		elif withEmpty
			r push ({value:v, label:None, isEmpty:True, index:len(r)})
		return r
	}
@where
	options () == []
	options ("a") == {value:"a", label:"a"}
	options ({value:"a"}) == {value:"a", label:"a"}
	options ({value:"a",label:"A"}) == {value:"a", label:"A"}

# EOF
