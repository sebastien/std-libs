/**
 * {{{
 * == LambdaFactory JavaScript object runtime library.
 *
 * This JavaScript module defines a set of primitives that provide support
 * for object-oriented programming, covering the following apsects:
 *
 * - Class-based inheritance
 * - Class methods and properties
 * - Setters and getters
 * - Traits (weave-in)
 * - Singletons
 *
 * Classes, traits and singletons are delcared using `declare.{Class,Trait,Singleton}`
 * top-level functions and all take a declarative structure as follows:
 *
 * ```
 * {
 * 		name:"module.ClassName",
 * 		parent:module.ParentClass,
 * 		traits:[module.Trait1, module.Trait2],
 * 		shared:{‥},
 * 		operations:{‥},
 * 		constructor:function(){‥},
 * 		properties:{‥},
 * 		accessors:{‥},
 * 		mutators:{‥},
 * 		methods:{‥}
 * }
 * ```
 * }}}
*/

// START:UMD_PREAMBLE
(function (global, factory) {
	"use strict";
	if (typeof define === "function" && define.amd) {
		return define(["require", "exports" , "runtime"], factory);
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
	const runtime = require("runtime");
	const __modules__ = typeof(exports)==='undefined' ? {} : exports;
// END:UMD_PREAMBLE

	if (runtime && runtime.oop){
		console.warn("runtime.oop already loaded");
		return runtime.oop;
	}

exports = exports || {};
const NOTHING = new Object();

// Safari Mobile does not have Object.setPrototypeOf, but instead
// uses the `__proto__` property.
const HAS_SET_PROTOTYPE = typeof(Object.setPrototypeOf) != "undefined";

// NOTE: For IE10 https://github.com/babel/babel/pull/3527

/*
 * Merges the `sourceObject` into the `targetObject`. If `targetObject` is
 * undefined/null then it will return a new object with `sourceObject`
 * as prototype. The properties are transferred using `getOwnPropertyDescriptor`
 * and `defineProperty`.
*/
function merge( targetObject, sourceObject ) {
	if (!sourceObject) {return targetObject;}
	targetObject = targetObject || {};
	// NOTE: We use getOwnPropertyNames and not Object.keys here.
	Object.getOwnPropertyNames(sourceObject).forEach(function(k){
		const desc = Object.getOwnPropertyDescriptor(sourceObject, k);
		// FIX_CONF
		// NOTE: Configurable allows for redefinition and prevents
		// this https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cant_redefine_property
		desc.configurable = true;
		if (desc) {
			Object.defineProperty(targetObject, k, desc);
		} else {
			targetObject[k] = sourceObject[k];
		}
	});
	return targetObject;
}

function walk(declaration, callback) {
	if (declaration.traits){
		for (var i=declaration.traits.length - 1; i>=0 ; i-- ) {
			var d = declaration.traits[i];
			walk(d.__declaration__, callback);
			callback(d);
		}
	}
	if (declaration.parent){
		var d = declaration.parent;
		walk(d.__declaration__, callback);
		callback(d);
	}
}

function Class (declaration) {

	//  +----------------+    +-----------------+              +--------------------+
	//  |                |    |                 |              |                    |
	//  |  CLASS OBJECT  |    |  CLASS INSTANCE |---[proto]--->|  CLASS PROTO       |
	//  |                |    |                 |              |                    |
	//  +----------------+    +-----------------+              +--------------------+
	//  | @shared        |    | @properties     |              | @methods           |
	//  +................+    |                 |              +....................+
	//  | constructor    ---->|                 |              | __runtime__init__  |
	//  +----------------+    +-----------------+              +--------------------+
	//
	//  var o = new module.ClassName();
	//  Object.getPrototypeOf(o) === <CLASS PROTO> // CLASS PROTO is actually not accessible
	//  Object.getPrototypeOf(o).constructor = module.ClassName // CLASS OBJECT
	//  Object.getPrototypeOf(module.ClassName) = <PARENT CLASS>
	//
	//  It's a good idea to read this StackOverflow thread
	//  <https://stackoverflow.com/questions/38740610/object-getprototypeof-vs-prototype>
	//  as it explains the subtleties of the prototype chain and functions.

	// ========================================================================
	// CLASS OBJECT
	// ========================================================================

	// The class object is a constructor function that takes the new
	// object `this` as argument. The class object will then be used
	// as a prototype for the new instance.
	
	const class_initializer = function() {
		// If there are traits, we make sure that they are initialized
		// in reverse order so that the latest one override the first ones
		if (declaration.traits) {
			for (var i=declaration.traits.length - 1; i>=0 ; i-- ) {
				declaration.traits[i].__init__.apply(this, arguments);
			}
		}
		// And now we call the constructor, defaulting to the parent
		// constructor if no dedicated constructor is defined.
		if (declaration.initialize) {
			declaration.initialize.apply(this, arguments);
		} else if (declaration.parent) {
			declaration.parent.apply(this, arguments);
		}
	}

	const properties_initializer = function() {
		// FIXME: If we guard from this.__is_initialized__ here,
		// then some of the properties won't be initialized, but 
		// it's hard to know why.
		// ---
		// Like for the class initializer, we initialized traits in 
		// reverse order.
		if (declaration.traits) {
			for (var i=0 ; i<declaration.traits.length ; i++ ) {
				var f = declaration.traits[i].__init_properties__;
				if (f) {f.apply(this)};
			}
		}
		// Then the parent
		if (declaration.parent && declaration.parent.__init_properties__) {
			declaration.parent.__init_properties__.apply(this);
		}
		// And finally this class.
		if (declaration.properties){
			declaration.properties.apply(this);
		}
		// OK, so here is the deal: we ensure that the properties are
		// only initialized ONCE from the top-most constructor. Because
		// constructors of parent classes will also call their own
		// properties initializers, and that these constructors are called
		// AFTER the properties are initialized, settin this
		// property to true wil always guard it.
		this.__is_initialized__ = true;
	}

	const class_constructor = function(context){
		// We skip the initialization of properties if we're given the
		// class as first argument. This is used to create an uninitialized
		// object to be used as a prototype in subclasses. See below
		// with `instance_proto`.
		if ( context !== NOTHING ) {
			// We guard against an already initialized object
			if (!this.__is_initialized__){
				properties_initializer.apply(this);
			}
			// Normally, a trait initializer should dynamically inject
			// its methods.
			class_initializer.apply(this, arguments);
		}
	};

	// This trick allows us to create a named function with the class
	// name (with `_` instead of `.`) which will be super useful for
	// debugging.
	const code = "(function(){return function " + declaration.name.split(".").join("_") + "(){return class_constructor.apply(this, arguments);}})()"
	const class_object = eval(code);

	// We make sure to have a parent if we have traits, which might happen
	// when we declare a construct with only traits.
	const parent = declaration.parent || (declaration.traits ? declaration.traits[0] : null);
	const traits = declaration.parent ? declaration.traits : (declaration.traits ? declaration.traits.slice(1) : null);

	// We register the `__parents__` list in the type. It's important for
	// the runtime `__isa__` and `__specializes__` methods, but is only
	// relevant for traits as classes are all reachable throught the
	// prototype chain.
	class_object.__parents__         = [];
	class_object.__init__            = class_initializer;
	class_object.__init_properties__ = properties_initializer;
	class_object.__name__            = declaration.name;
	class_object.__declaration__     = declaration;

	// We set the prototype of the class object to the parent. This means
	// that any property defined in the parent's class object will be
	// accessible in this one.
	if (parent) {
		if (HAS_SET_PROTOTYPE) {
			Object.setPrototypeOf(class_object, parent);
		} else {
			class_object.__proto__ = parent;
		}
		class_object.__parents__.push(parent);
	}
	if (traits) {
		class_object.__parents__ = class_object.__parents__.concat(traits);
	}

	// TODO: We need to merge the class-level elements such as operations
	// and shared from the parents recursively.
	walk(declaration, function(v){
		var d = v.__declaration__;
		merge(class_object, d.operations);
		merge(class_object, d.shared);
	})
	// And now we merge in the operations and shared directly.
	merge(class_object, declaration.operations);
	merge(class_object, declaration.shared);

	// ========================================================================
	// CLASS PROTOTYPE
	// ========================================================================

	// Now we create the prototype, which will be used to define methods
	// inherited by new instances.
	const class_proto = declaration.parent ?
		new declaration.parent(NOTHING) : {}
	;

	// We merge the traits's methods into the current class prototype.
	// We don't need to recurse up the chain as the prototype contains everythin.
	if (declaration.traits) {
		for (var i=declaration.traits.length - 1; i>=0 ; i-- ) {
			merge(class_proto, declaration.traits[i].prototype);
		}
	}
	merge(class_proto, declaration.methods);

	// We take care of accessors/mutators
	Object.keys(declaration.accessors||{}).concat(
		Object.keys(declaration.mutators||{})
	).forEach(function(k,i){
		// SEE: FIX_CONF
		const p = {configurable:true};
		if (declaration.accessors && declaration.accessors[k]) {p.get = declaration.accessors[k];}
		if (declaration.mutators  && declaration.mutators[k])  {p.set = declaration.mutators [k];}
		p.writable == p.set ? true : false;
		Object.defineProperty(class_proto, k, p);
	});

	// OK, so here it's important to understand that the `class_object` is
	// primarily a *function* that is invoked using the `new` keyword. In that
	// case, the `class_object.prototype` value will become the new instance's
	// prototype (accessible through `Object.getPrototypeOf(instance)`, which
	// is **different from `instance.prototype`**. Because this prototype is
	// initialized using the `class_object` function, it is assigned as 
	// constructor.
	//
	// +---------------+                     +-------------+
	// | CLASS OBJECT  | ---[prototype  ]--> | CLASS PROTO +
	// |               | <--[constructor]--- |             |
	// +---------------+                     +-------------+

	class_object.prototype  = class_proto;
	class_proto.constructor = class_object;

	return class_object;
}

const Singleton = function(declaration){
	// Singletons are instances of an anonymouns/unbound class
	const class_object = Class(declaration);
	const singleton = new class_object();
	return singleton;
}

const Trait = function(declaration) {
	// Right now, traits are just classes
	return Class(declaration);
}

exports.NOTHING = NOTHING;
exports.Class = Class;
exports.Singleton = Singleton;
exports.Trait = Trait;

// We trigger a RuntimeModuleLoaded event
if (typeof window !== "undefined") {
	// IE11 does not allow the direct creation of custom events.
	if (window.document && window.document.head) {
		var event = undefined;
		var detail = {name:"runtime.oop", exports:exports};
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
