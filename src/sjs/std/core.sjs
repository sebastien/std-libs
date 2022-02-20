@feature sugar 2
@module std.core
| A collection of general-purpose functions that you will probably want
| to import in most modules. This is a port of [Extend](https://github.com/sebastien/extend)'s
| library, and was initially inspired by Python's core functions.

@import runtime

# @import OutOfBounds from std.errors
# TODO: Switch from getOwnPropertyNames to Object.keys

@enum Types = NUMBER | UNDEFINED | NONE | STRING
| Enumeration for litteral types as returned by @type

@function type value
| Returns the type for the given @value. For litteral values, the type will
| be one of @Types, otherwise it will be the prototype's constuctor.
	return value match
		is? Number
			NUMBER
		is? Array
			Array
		is? Object
			Object getPrototypeOf (value) constructor
		is? String
			STRING
		is None
			NONE
		else
			UNDEFINED

@function typename value
	match value
		is Undefined or value is UNDEFINED
			return "undefined"
		is None or value is NONE
			return "null"
		is Number or value is NUMBER
			return "number"
		is Array
			return "[]"
		is Object
			return "{}"
		is String or value is STRING
			return "string"
	if (not value constructor)
		value = type (value)
	if value __name__
		return value __name__
	else
		for v,k in window
			if v is value
				return k
		return _ toString ()

@function subtype type, parent
| Tells if the given @type is a subtype of @parent
	return runtime __specializes__ (type, parent)

@function freeze value
	return Object freeze (value)

@function derive value
| Derives the given value by assigning it as the prototype of a new one. This
| only works for objects.
	if value is? Object
		return Object create (value)
	else
		return value

@function str value:Any
| Returns a string representation of the given value. This returns a JSON-like
| representation of the object, but will not escape string and will use
| a `toString` method if defined.
	return value match
		is Undefined
			"undefined"
		is None
			"null"
		is True
			"true"
		is False
			"false"
		is Infinity
			"Infinity"
		is? String
			value
		is? Number
			"" + value
		is? Array
			"[" + ( (value ::= str) join ", ") + "]"
		is? Object and value toString is not Object prototype toString
			value toString ()
		else
			"{" + ((value ::> {r,e,i|
				let v = '"{0}":{1}' % (i, e)
				if r
					r push (v)
				else
					r = [v]
				return r
			}) or []) join "," + "}"
@where
	str(None)      == "null"
	str(Undefined) == "undefined"
	str(1)         == "1"
	str(1.0)       == "1.0"
	str("hello")   == "hello"
	str([])        == "[]"
	str([0])       == "[0]"
	str([0,1])     == "[0,1]"
	str(True)      == "true"
	str(False)     == "false"
	str({})        == "{}"


@function float value
	return value match
		is? Number -> value
		_          -> 1.0
		else       -> 0.0

@function int value
	return value match
		is? Number -> Math floor (value)
		_          -> 1.0
		else       -> 0.0

@function def value, defaultValue
| Returns `defaultValue` when `value` is not defined, otherwise returns
| `value`
	return defaultValue if value is Undefined else value

@function iterable value:Any
| Ensures that the given value is iterable (ie. either array or object), or wraps
| it in a list.
	return value match
		is? Array  -> True
		is? Object -> True
		else       -> value if (value and value length is? Number) else ([value] if value else [])

@function list value:Any
| Ensures that the given value is a list.
	return value match
		is? Array     → value
		is? Object and value and typeof(value length) == "number" → value ::> {r,e,i|r = r or [];r push (e);r}
		else          → [value] if isDefined (value) else []

@function unlist value:Any
| If the given value is a list with zero element, None is returned,
| if it has one element then the first element is returned, otherwise the
| @value is returned as-is.
	return value match
		is? Array
			value length match
				0    → None
				1    → value[0]
				else → value
		else
			value

@function dict value
| Creates an object (dictionary) from the given items as `[[key,value]]` or `[{key,value}]`
	return value match
		is? Array
			value reduce ({r,e,i|
				e = e (i) if e is? Function else e
				match e
					is? Array
						r[e[0]] = e[1]
					is? Object
						r[e key] = e value
					else
						error (BadArgument, "value." + i, e, [Array, Object], __scope__)
				return r
			}, {})
		is? Object
			value
		_
			{_:value}
		else
			value

@function num value
| Returns 1 if the value is true or defined, false otherwise, or the value
| itself if it's a number.
	return value match
		is  True   → 1
		is  False  → 0
		is? Number → value
		_          → 1
		else       → 0

@function bool value:Any
| Returns `True` if the value evaluates to true, `False` otherwise. If
| `value` equals the `"true"` string, then `True` is returned, if it
| equals `"false"` then `False` is returned.
	return value match
		== "true"  → True
		== "false" → False
		_          → True
		else       → False
@where
	bool(True)      is True
	bool(False)     is False
	bool("true")    is True
	bool("false")   is False
	bool(0)         is False
	bool(1)         is True
	bool("")        is False
	bool("1")       is True
	bool(Undefined) is False
	bool(None)      is False
	bool([])        is False
	bool({})        is False
	bool([1])       is True
	bool({a:1})     is True

@function wrap scope, callable
| When @callable is a @Function, this will ensure that the function
| is called with @scope as target (`this`).
	return callable match
		is? Function
			{callable apply (scope, arguments)}
		else
			callbable

@function asNone
| A function that returns `None`
	return None

@function asFalse
| A function that returns `False`
	return False

@function asTrue
| A function that returns `True`
	return True

# FIXME: This is ill-named
@function isDefined value
| Returns `True` if the value is neither `None` nor `Undefined`
	return not ((value is None) or (value is Undefined))

@function swap a,b
| Returns `(b,a)`
	return [b,a]

@function identity value
| A function that returns the  value itself
	return value

@function copy value, depth=1
| Returns a copy of the given value the given `depth` (default 1).
| A depth of 0 is the value itself (ie. no copy), a value of `1` is
| a shallow copy and a value of `-1` is a full depth copy.
	if depth == 0
		return value
	else
		return value match
			is? Array   → value ::= {copy(_, depth - 1)}
			is? Object  → value ::= {copy(_, depth - 1)}
			else        → value

@group Events

	@function relay event:String, a:Object, b:Object
	| Relays the given `event` from `a` to `b`, returning the relay
	| function.
		if not a or not b
			return Undefined
		let f = {b ! event (_)}
		a !+ event (f)
		return f

	@function unrelay callback:Function, event:String, a:Object, b:Object
	| Stops the relaying of given `event` from `a` to `b`, made by the
	| given `callback` (created by `relay`).
		if not callback
			return callback
		else
			a !- event (callback)
			return callback

@group Serialization

	@function safeunjson value:String, defaultValue=Undefined
	| A safe version of #unjson that returns the #value as-is in case
	| the parsing fails.
		try
			return JSON parse (value)
		catch
			return value if defaultValue is Undefined else defaultValue

	@function unjson value:String
	| Parses the given string as JSON
		if not value
			return None
		else
			return JSON parse (value)

	@function json value
	| Converts the given data as JSON. You might want to pass the value
	| through `prim` first if it's a non-primitive compound.
		return "null" if value is Undefined else JSON stringify (value)

	@function prim value
	| Ensures that the given value is a primitive. This will ensure that the
	| data is serializable -- but the data needs not to be recursive.
		return value match
			is? Array
				value ::= prim
			is? Date
				[
					value getUTCFullYear()
					value getUTCMonth () + 1
					value getUTCDate ()
					value getUTCHours ()
					value geUTCMinutes ()
					value getUTCMilliseconds ()
					value getTimezoneOffset ()
				]
			is? window.String
				value toString ()
			is? Object
				value ::= prim
			is? Number
				value
			is? String
				value
			_
				str (value)
			else
				value

# FIXME: Move to collections
@group Collections

	@function find:Number|String collection:Array|Object, value:Any
	| Returns the index of the given @value in the @collection, returning
	| `-1` when not found.
		console warn ("core.find is deprecated in favor of collections.indexOf")
		# TODO: This should probably be `index`
		match collection
			is? Array
				return collection indexOf (value)
			is? Object
				for v,k in collection
					if value is v
						return k
				return -1
			else
				return -1

	@function rfind:Number|String collection:Array|Object, value:Any
	| Like find, but from the right.
		# TODO: This should probably be `rindex`
		match collection
			is? Array
				var i = collection length - 1
				while i >= 0
					if collection[i] is value
						return i
					i -= 1
				return -1
			is? Object
				let k = keys(collection)
				var i = k length - 1
				while i >= 0
					if collection[k[i]] is value
						return i
					i -= 1
				return -1
			else
				return -1

	@function len value
	| Returns the length of the given @value, 0 being the default. This supports
	| lists, strings, objects with `length` as number and general objects,
	| in which case the length will be the number of own properties.
		return value match
			is? Array or value is? String or value is? Object and value length is? Number
				value length
			is? Object
				Object keys (value) length
			else
				0
	@where
		len(None)       == 0
		len(Undefined)  == 0
		len(1)          == 1
		len("")         == 0
		len("a")        == 1
		len("ab")       == 2
		len([])         == 0
		len([0])        == 1
		len({})         == 0
		len({a:1})      == 1


	@function set value:Any, name:String|Number, v:Any
	| Functional equivalent of `value[name] = v`. This supports
	| negative indexes for @name when @value is an array, and will
	| throw an @ff.errors.OutOfBounds if the index is out of bounds.
		match value
			is? Array
				let l = value length
				match name
					is? Number and name > 0 and name < l
						value[name] = v
					is? Number and name < 0 and name > -l
						value[l + name] = v
					else
						throw OutOfBounds (value, name)
			is? Object
				value [name] = v
		return value
	@where
		set ({},  "name", "John Doe") == {name:"John Doe"}
		set ([0], 0, "John Doe")      == ["John Doe"]
		set ([0], 0, "John Doe")      == ["John Doe"]
		throws ({set ([0], "John Doe")}, OutOfBounds)

	@function merge value:Array|Object, source:Array|Object, replace=False
	| Merges @source into @value, skipping values already defined in @source
	| unless @replace is true.
		match value
			is? Array
				source :: {value push (_) if find (value, _) == -1}
			is? Object
				source :: {v,k|set (value, k, v) if value[k] is? Undefined or replace}
		return value
	@where
		merge ([],  [])  == []
		merge ([],  [1]) == [1]
		merge ([0], [1]) == [0,1]
		merge ([0], [0]) == [0]
	@where
		merge ({},  {})             == {}
		merge ({a:1},  {b:2})       == {a:1, b:2}
		merge ({a:1},  {a:2})       == {a:1}
		merge ({a:1},  {a:2},True)  == {a:2}

	@function identical a, b
		return a is b

	@function equals a, b, depth=-1
	| A smart equals function that introspects array and maps. It is similar
	| in structure to `cmp`, except that it is faster as it only needs
	| to say wether the values are roughly equal or not.
		# NOTE: We actually don't want to test equality using == as
		# for instance `["all"] == "all"`. JavaScript is so flawed it's 
		# unbelievable.
		if a is b
			return True
		elif a is? Array
			if b is? Array
				if a length != b length
					return False
				else
					if depth == 0
						return a is b
					else
						for v,i in a
							if (v is a) and (b[i] is b)
								# We avoid an infinite recursion
								pass
							elif not equals (v, b[i], depth - 1)
								return False
						return True
			else
				return False
		elif a is? Function or b is? Function
			return a is b
		elif a is? Object
			if b is? Object
				let ka = Object keys (a)
				let kb = Object keys (b)
				if ka length != kb length
					return False
				elif ka length == 0 and kb length == 0
					# This happens when comparing functions, for instance
					# NOTE: This used to be a == b, but a is b should work
					# just as well.
					return a is b
				else
					for k,i in ka
						if k != kb[i]
							return False
					if depth == 0
						return a is b
					else
						for k,i in ka
							if a[k] is a and b[k] is b
								# We avoid an infinite recursion
								pass
							elif not equals (a[k], b[k], depth - 1)
								return False
						return True
			else
				return False
		else
			# We already have tested for a is b
			return False

	@function cmp a, b, depth=-1
	| A smart comparison function that works with lists, objects and strings.
	| Returns `-1` when `a < b`, `0` when `a == b` and `1` otherwise.
		# FIXME: Implement list
		if a is? Array and depth != 0
			if b is? Array
				var la  = len(a)
				var lb  = len(b)
				var l   = Math max (la, lb)
				var res = 0
				var i   = 0
				while (res == 0) and (i < l)
					if not (a[i] is b[i])
						res = cmp (a[i], b[i], depth - 1)
					i  += 1
				return res
			elif len(a) > len(b)
				return 1
			else
				return -1
		elif a is? Function and depth != 0
			if a is b
				return 0
			else
				return 1
		elif a is? Object and depth != 0
			if b is? Object
				var res = 0
				if a is b
					return 0
				for va,k in a
					var vb = b[k]
					if va is? Undefined
						res = -1
					if vb is? Undefined
						res = 1
					elif (a is va) and (b is vb)
						# We avoid a recursion with the same arguments
						pass
					else
						res = cmp (va, vb, depth - 1)
					if res != 0
						break
				if res == 0
					# FIXME: This is inefficient as it might go over
					# the same keys twice
					for vb, k in b
						var va = a[k]
						if va is? Undefined
							res = -1
						elif vb is? Undefined
							res = 1
						elif (a is va) and (b is vb)
							# We avoid a recursion with the same arguments
							pass
						else
							res = cmp (va, vb, depth - 1)
						if res != 0
							break
				return res
			elif len(a) > len(b)
				return 1
			else
				return -1
		elif a is? String and b is? String and (a localeCompare)
			return a localeCompare (b)
		elif a is None
			if b is None
				return 0
			elif b is Undefined
				return 1
			else
				return -1
		elif a is Undefined
			if b is Undefined
				return 0
			else
				return -1
		else
			if a is b
				return 0
			if a == b
				return 0
			if a is None
				return -1
			if b is None
				return 1
			if a > b
				return 1
			if a < b
				return -1
			if b is? Undefined
				return 1
			if a is? Undefined
				return -1
			else
				# We return -2 in that unsupported case
				return -2

@function sprintf
	@embed JavaScript
		var str_repeat  = function(i, m){ for (var o = []; m > 0; o[--m] = i) {}; return(o.join(''));};
		var i = 0, a, f = arguments[i++], o = [], m, p, c, x;
		while (f) {
			if (m = /^[^\x25]+/.exec(f)) {
				o.push(m[0]);
			} else if (m = /^\x25{2}/.exec(f)) {
				o.push('%');
			} else if (m = /^\x25(?:(\d+)\$)?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosuxX])/.exec(f)) {
				if (((a = arguments[m[1] || i++]) == null) || (a == undefined)) {
					return console.error("std.core.sprintf: too few arguments, expected ", arguments.length, "got", i - 1, "in", arguments[0]);
				}
				if (/[^s]/.test(m[7]) && (typeof(a) != 'number')) {
					return console.error("std.core.sprintf: expected number at", i - 1, "got",a, "in", arguments[0]);
				}
				switch (m[7]) {
					case 'b': a = a.toString(2); break;
					case 'c': a = String.fromCharCode(a); break;
					case 'd': a = parseInt(a); break;
					case 'e': a = m[6] ? a.toExponential(m[6]) : a.toExponential(); break;
					case 'f': a = m[6] ? parseFloat(a).toFixed(m[6]) : parseFloat(a); break;
					case 'o': a = a.toString(8); break;
					case 's': a = ((a = String(a)) && m[6] ? a.substring(0, m[6]) : a); break;
					case 'u': a = Math.abs(a); break;
					case 'x': a = a.toString(16); break;
					case 'X': a = a.toString(16).toUpperCase(); break;
				}
				a = (/[def]/.test(m[7]) && m[2] && a > 0 ? '+' + a : a);
				c = m[3] ? m[3] == '0' ? '0' : m[3].charAt(1) : ' ';
				x = m[5] - String(a).length;
				p = m[5] ? str_repeat(c, x) : '';
				o.push(m[4] ? a + p : p + a);
			} else {
				return console.error("std.core.sprintf: reached state that shouldn't have been reached.");
			}
			f = f.substring(m[0].length);
		}
		return o.join('');

# EOF
