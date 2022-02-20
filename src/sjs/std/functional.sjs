@feature sugar 2
@module std.functional
| A collection of functions that help writing functional-style programs.

@import cmp from std.core

@group Applications

	@function map value, producer
		return value ::= producer

	@function map1 value, producer
		return value ::= arg1 (producer)

	@function map2 value, producer
		return value ::= arg2 (producer)

	@function filter value, predicate
		return value ::? predicate

	@function reduce value, predicate, initial=Undefined
		return __reduce__( value, predicate, initial )

	@function curry functor, args...
	| Curries the given `functor` by the number of arguments. For instance,
	| `curry(f(a,b),1) → f(a,1)`, while  `curry(f(a,b),1,2) → f(1,2)`
		let a = args
		return {_|
			let ca = [_] concat (a)
			return functor apply (target, ca)
		}

	@function seq a, rest‥
		return rest[-1]

	@function arg0 functor
		return {functor()}

	@function arg1 functor
		return {functor(_)}

	@function arg2 functor
		return {functor(_, _1)}

	@function arg3 functor
		return {functor(_, _1, _2)}

	@function arg3 functor
		return {functor(_, _1, _2)}

	@function arg4 functor
		return {functor(_, _1, _2, _3)}

	@function arg5 functor
		return {functor(_, _1, _2, _3, _4)}

	@function arg6 functor
		return {functor(_, _1, _2, _3, _4, _5)}

	@function arg7 functor
		return {functor(_, _1, _2, _3, _4, _5, _6)}

	@function arg n, functor
		return {
			n match
				0 -> functor ()
				1 -> functor (_)
				2 -> functor (_, _1)
				3 -> functor (_, _1, _2)
				4 -> functor (_, _1, _2, _3)
				5 -> functor (_, _1, _2, _3, _4)
				6 -> functor (_, _1, _2, _3, _4, _5)
				7 -> functor (_, _1, _2, _3, _4, _5, _6)
				8 -> functor (_, _1, _2, _3, _4, _5, _6, _7)
				9 -> functor (_, _1, _2, _3, _4, _5, _6, _7, _8)
				_ -> functor apply (this, arguments[0:n])
		}

	@function product a, b, callback
	| Applies the given `callback(res, ai, bj, i, j)` for
	| `ai` in `a` and `bi` in `b`.
		var res = Undefined
		for va, i in a
			for vb, j in b
				res = callback (res, va, vb, i, j)
		return res

	@function fixpoint values, functor, condition, limit=-1
	| Applies the `functor` to the given `value` and then
	| applies the `functor` to the result until the
	| fixpoint `condition` returns `True`.
		var found = False
		var prev = functor (values)
		while limit != 0
			let cur = functor (prev)
			if condition (prev, cur)
				return cur
			else
				prev = cur
			if limit > 0
				limit -= 1
		return prev


@group Collections
| Equivalents to `std.collections` but without modifying the input

	@function comparator extractor:Function, comparator=cmp
	| Returns a comparator function that will comparethe values of
	| each argument extracted by @extractor. In other words, it does
	| `{a,b|comparator(extractor(a), extractor(b))}`
		return {comparator(extractor(_), extractor(_1))}

@group Computation
| Functional versions of math operations

	@function mul a, b
		return a * b

	@function div a, b
		return a / b

	@function add a, b
		return a + b

	@function sub a, b
		return a - b

@group Trigonometry

	@function cos a
		return Math cos (a)

	@function sin
		return Math sin (a)

	@function tan
# EOF

