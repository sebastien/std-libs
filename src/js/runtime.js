/**
 * {{{
 * == LambdaFactory JavaScript/ECMAScript backend runtime library.
 *
 * This JavaScript module defines a set of primitives that provide support
 * for LambdaFactory <https://github.com/sebastien/lambdafactory> ECMAScript
 * backend. It covers the following aspects:
 *
 * - cross-datatypes access, iteration, map, reduce, filter
 * - event binding, unbinding and triggering
 * - AMD-compatible module resolution and loading
 *
 * }}}
*/


// START:UMD_PREAMBLE
(function (global, factory) {
	"use strict";
	if (typeof define === "function" && define.amd) {
		return define(["require", "exports"], factory);
	} else if (typeof exports !== "undefined") {
		return factory(require, exports);
	} else {
		var _module  = {exports:{}};
		var _require = function(_){
			_=_.split(".");_.reverse();
			var c=global;
			while (c && _.length > 0){c=c[_.pop()]}
			return c;
		}
		factory(_require, _module.exports);
		global.actual = _module.exports;
		return _module.exports;
	}
})(this, function (require, exports) {
	const __modules__ = exports = typeof(exports)==='undefined' ? {} : exports;
// END:UMD_PREAMBLE

/**
 * @symbol __BREAK__
*/
const __BREAK__    = new String("break");

/**
 * @symbol __CONTINUE__
*/
const __CONTINUE__ = new String("continue");

/**
 * @constructor __RETURN__
**/
const __RETURN__   = function(value){this.value=value;return this;};

const __set_name__ = function(value, name){
	value.__name__ = name;
	return value;
}

const __NOTHING__ = new String("Nothing");

/**
 * @function __specializes__
 *
 * A predicate that tells if the given @type specializes the other @parentType
*/
// OK, something to know abour our dear IE11:
// Object.getPrototypeOf(Element) != Node
// Object.getPrototypeOf(Element.prototype) == Node.prototype
var __specializes__ = function( type, superType ) {
	if (type === superType) { return false; }
	if (!type) { return false; }
	// SEE: https://stackoverflow.com/questions/18939192/how-to-test-if-b-is-a-subclass-of-a-in-javascript-node/18939541#18939541
	if (type.prototype instanceof superType) {return true;}
	const parents = type.__parents__;
	if (parents) {
		for (var i=0 ; i < parents.length ; i++ ) {
			if (parents[i] === superType) { return true; }
		}
		for (var i=0 ; i < parents.length ; i++ ) {
			if (parents[i] != type && __specializes__(parents[i], superType)) { return true; }
		}
	}
	return false;
}

/**
 * @function __isa__
 *
 * Tells if the given @value is of the given @type. This also returns
 * true if @value is @type.
 *
 * It handles special cases for `null` and `undefined`.
*/
const __isa__ = function( value, type ) {
	// Special cases for type
	if (type === null || type === undefined || type === false || type === true) {
		return value === type;
	}
	// Special cases for null and undefined
	if (value === null) {
		return type === null || type === "null";
	} else if (value === undefined) {
		return type === undefined || type === "undefined";
	}
	// Now do we have a string type or a class type?
	const type_type = typeof(type)
	// NOTE: Here again this is an IE11 weirdness. Classes
	// are objects, not functions. Should be (type instanceof Function)
	if (type_type === "function" || type_type === "object") {
		// Here type is a constructor
		if (value instanceof type) {
			return true;
		} else {
			// The value might not be an object, IE11 complains
			// about instanceof with non-objects.
			return typeof(value) === "object" ? __specializes__(Object.getPrototypeOf(value).constructor, type) : false;
		}
	} else {
		// Or in this case the type is a generic string
		const value_type = typeof(value);
		switch (type) {
			case "boolean":
				return value_type === type || value instanceof Boolean;
			case "number":
				return (value_type === type || value instanceof Number) && !isNaN(value);
			case "string":
				return value_type === type || value instanceof String;
			case "object":
				return value_type === type || value instanceof Object;
			default:
				return false;
		}
	}
}

function __instanceof__( instanceObject, classObject ) {
	return typeof(instanceObject) === "object" && instanceObject instanceof classObject;
}

/**
 * @function __access__(value, index)
 *
 * Accesses the slot @index within the @value. This supports negative
 * values for the @index when @value is an `Array`, `String` or
 * has a `length` property.
**/
const __access__ = function(value, index) {
	if (value instanceof Array || typeof value === "string" || value && typeof value.length === "number" ) {
		if (index < 0) {
			var i = value.length + index;
			return i >= 0 ? value[i] : undefined;
		} else {
			return value[index];
		}
	} else {
		return value ? value[index] : undefined;
	}
}

// NOTE: Gotcha: not like JS's in (it iteratates over values)
/**
 * @function __in__
 * @param collection
 * @param value
*/
var __in__ = function(collection, value) {
	if (collection instanceof Array) {
		return collection.indexOf(value) >= 0;
	} else if (collection instanceof Object) {
		for ( var k in collection ) {
			if (collection[k] === value) {
				return true;
			}
		}
		return false;
	} else {
		return false;
	}
}

/**
 * @function __slice__
 * @param value
 * @param start
 * @param end
*/
var __slice__ = function(value, start, end) {
	if (value instanceof Array || typeof value === "string") {
		return value.slice(start, end) ;
	} else if (value && typeof(value.length) === "number") {
		// We support objects with a `length` attribute, such as
		// arguments.
		const l = value.length;
		start   = start ? (start >= 0 ? start : l + start) : 0;
		end     = end   ? (end   >= 0 ? end   : l + end  ) : l;
		const s = start <= end ? start : end;
		const e = start <= end ? end   : start;
		// NOTE: The pre-allocated version seems slower, oddly enough
		// var res = new Array( e - s);
		// for (var i=s ; i<e ; i++) {res[i-s]=(value[i]);}
		var res = [];
		for (var i=s ; i<e ; i++) {res.push(value[i]);}
		return res;
	} else {
		return undefined;
	}
}


/**
 * @function __range__
 * @param start
 * @param end
 * @param step
*/
var __range__ = function(start, end, step) {
	var r=[];
	step = typeof step === "undefined" ? 1 : step;
	for (var v=start ; v<end ; v+=step) {r.push(v);}
	return r;
}

/**
 * @function __apply__
 * @param target
 * @param slot
 * @param arguments
*/
var __apply__ = function(target, slot, args) {
	return target[slot].apply(target, args);
}

/**
 * @function __iterate__
 * @param value
 * @param callback
 * @param context
*/
var __iterate__ = function(value, callback, context) {
	if (context === undefined) {context=undefined;}
	if (!value) {return;}
	// NOTE: Switched from getOwnPropertyNames to keys
	var keys = (value instanceof Array || (typeof(value) === "object" && value && isFinite(value.length)))
		? value
		:(value instanceof Object
			? Object.keys(value||{})
			: []);
	var l    = keys.length;
	for (var i=0 ; i<l ; i++){
		var k = (keys==value) ? i : keys[i];
		var v = value[k];
		var r = callback(v, k);
		if (r === __BREAK__) {
			break;
		} else if (r instanceof __RETURN__) {
			return r;
		}
	}
	return value;
}

var __map__ = function(value, callback) {
	if (value instanceof Array) {
		return value.map(callback);
	} else if (typeof(value) === "object" && value && isFinite(value.length)) {
		var res = new Array(value.length);
		for (var i=0 ; i<value.length ; i++) {
			res[i] = callback(value[i], i);
		}
		return res;
	} else if (value instanceof Object) {
		var res = {};
		// NOTE: Switched from getOwnPropertyNames to keys
		Object.keys(value).forEach(function(k,i,c){
			res[k]=callback(value[k], k);
		});
		return res;
	} else {
		return undefined;
	}
}

var __filter__  = function(value, callback) {
	if (value instanceof Array) {
		return value.filter(callback);
	} else if (typeof(value) === "object" && value && isFinite(value.length)) {
		var res = new Array();
		for (var i=0 ; i<value.length ; i++) {
			var v = value[i]
			if (callback(v, i)) {
				res.push(v);
			}
		}
		return res;
	} else if (value instanceof Object) {
		var res = {};
		// NOTE: Switched from getOwnPropertyNames to keys
		Object.keys(value).forEach(function(k,i,c){
			var v = value[k];
			if (callback(v, k)) {
				res[k]=v;
			}
		});
		return res;
	} else {
		return undefined;
	}
}

var __reduce__  = function(value, callback, initial) {
	if (value instanceof Array) {
		if (value.length == 0 && (initial === null || initial === undefined)) {return [];}
		else {return value.reduce(callback, initial);}
	} else if (typeof(value) === "object" && value && isFinite(value.length)) {
		var r = initial;
		for (var i=0 ; i<value.length ; i++) {
			r = callback(r, value[i], i);
		}
		return r;
	} else if (value instanceof Object) {
		// NOTE: Switched from getOwnPropertyNames to keys
		return Object.keys(value).reduce(function(r,v,k){
			return callback(r,value[v],v,value);
		}, initial);
	} else {
		return undefined;
	}
}

var __reduce_right__  = function(value, callback, initial) {
	if (value instanceof Array) {
		if (value.length == 0 && (initial === null || initial === undefined)) {return [];}
		else {return value.reduceRight(callback, initial);}
	} else if (typeof(value) === "object" && value && isFinite(value.length)) {
		var r = initial;
		for (var i=value.length-1 ; i>=0 ; i--) {
			r = callback(r, value[i], i);
		}
		return r;
	} else if (value instanceof Object) {
		// NOTE: Switched from getOwnPropertyNames to keys
		return Object.keys(value).reduceRight(function(r,v,k){
			return callback(r,value[v],v,value);
		}, initial);
	} else {
		return undefined;
	}
}

// ----------------------------------------------------------------------------
//
// EVENTS
//
// ----------------------------------------------------------------------------
//
// FIXME: We have to be careful about leaking objects that might register
// callbacks. Here's en example:
//
// A fires "Update"
//
// f() returns a short-lived object that wraps A and forwards the `Update`
// event.
// 
// There might be a use for a WeakMap so that the binding callback
// disappears


// NOTE: The one missing piece here is the ability to trigger an event only
// once, and to trigger it with the last value if the last value already
// exists.
const __on_key__ = "__on__"
var __bind__ = function( object, event, callback ) {
	if (object instanceof Object) {
		if (!object[__on_key__]) {
			// NOTE: This little trick makes sure that
			// we don't have the __on_key__ appear when
			// iterating.
			Object.defineProperty(object, __on_key__, {
				value:{},
				enumerable:false
			});
		}
		var events=object[__on_key__];
		if (callback instanceof Function) {
			if(!events[event]) {events[event] = [callback];}
			else {events[event].push(callback);}
		} else {
			__iterate__(callback, function(v,k) {__bind__(object,k,v);});
		}
	}
	return object;
}

var __once__ = function( object, event, callback ) {
	const once = function() {
		// NOTE: Do we need to copy?
		// const a = new Array(arguments.length);
		// var i=0;while(i<arguments.length){a[i]=arguments[i];i++};
		const res = callback.apply(undefined, arguments);
		__unbind__( object, event, once);
		return res;
	}
	return __bind__(object, event, once);
}


var __unbind__ = function( object, event, callback ) {
	if (object instanceof Object) {
		if (!object[__on_key__]) {return object;}
		var events=object[__on_key__];
		if (!events || !events[event]) {return object};
		var l=events[event];
		if (callback === "*") {
			l.splice(0,l.length);
		} else if (callback instanceof Function) {
			events[event] = l.filter(function(v){return v!==callback;});
		} else {
			__iterate__(callback, function(v,k) {__unbind__(object,k,v);});
		}
	}
	return object;
}

var __send__ = function( object, event, value, origin ) {
	if (object instanceof Object) {
		if (!object[__on_key__]) {return object;}
		var events=object[__on_key__];
		if (!events || !events[event]) {return object};
		var l = events[event];
		for (var i=0;i<l.length;i++) {
			// We exit at the first handler returning false
			if (l[i](value, origin) === false) {
				break;
			}
		}
	}
	return object;
}

// ----------------------------------------------------------------------------
//
// CALLBACKS
//
// ----------------------------------------------------------------------------

/**
 * @function __decompose__ object:Any, key:String
 *
 * Accesses the property @key of the given @object and returns its value
 * *bound* to the @object if it is a function. This ensures that callback
 * targets are preserved. If the decomposed value is a function, the
 * bound value will be cached as `key + "__bound__` so that further
 * calls to decompose will return the exact same value (great to unbind
 * callbacks).
*/
var __decompose__ = function( object, key ) {
	if (object) {
		const v = object[key];
		if (v instanceof Function) {
			const k = "__bound__" + key;
			var w = object[k];
			if (!w) {
				w = v.bind(object);
				object[k] = w;
			}
			return w;
		} else {
			return v;
		}
	} else {
		return undefined;
	}
}

exports.__BREAK__        = __BREAK__;
exports.__CONTINUE__     = __CONTINUE__;
exports.__RETURN__       = __RETURN__;
exports.__NOTHING__      = __NOTHING__;
exports.__isa__          = __isa__;
exports.__instanceof__   = __instanceof__;
exports.__specializes__  = __specializes__;
exports.__set_name__     = __set_name__;
exports.__access__       = __access__;
exports.__decompose__    = __decompose__;
exports.__in__           = __in__;
exports.__slice__        = __slice__;
exports.__range__        = __range__;
exports.__apply__        = __apply__;
exports.__iterate__      = __iterate__;
exports.__map__          = __map__;
exports.__filter__       = __filter__;
exports.__reduce__       = __reduce__;
exports.__reduce_right__ = __reduce_right__;
exports.__bind__         = __bind__;
exports.__once__         = __once__;
exports.__send__         = __send__;
exports.__unbind__       = __unbind__;

if (typeof window !== "undefined") {
	// IE11 does not allow the direct creation of custom events.
	if (window.document && window.document.head) {
		var event = undefined;
		var detail = {name:"runtime", exports:exports};
		try {
			event = new CustomEvent("RuntimeModuleLoaded", {detail:detail});
		} catch (e) {
			// NOTE: This is a deprecated way of doing so
			event = window.document.createEvent("CustomEvent");
			event.initCustomEvent("RuntimeModuleLoaded", true, false, detail);
		}
		window.document.head.dispatchEvent(event);
	}
}

// START:UMD_POSTAMBLE
return exports;})
// END:UMD_POSTAMBLE
/* EOF */
