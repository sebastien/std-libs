/**
 *
 * This module provides dynamic module loading for JavaScript with the following
 * features:
 *
 * - Support for UMD modules
 * - Dynamic resolution of modules based on URL templates
 * - Dynamic resolution using URL schemes
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
	const modules = typeof(exports)==='undefined' ? {} : exports;
// END:UMD_PREAMBLE

	if (runtime && runtime.modules){
		console.warn("runtime.modules already loaded");
		return runtime.modules;
	}

	// ----------------------------------------------------------------------------
	//
	// MODULES
	//
	// ----------------------------------------------------------------------------

	modules.options   = {
		resolveTimeout: 15 * 1000,
		/* IE11 on older windows version has some issues with making HEAD
		   requests. To circumven that, we provide options to override
		   this behaviour.
		*/
		existsMethod: "HEAD",  /* HTTP method to test if a URL exists */
		loadMethod  : "GET",   /* HTTP method to actually load a module by URL */
		unsafeEval  : false    /* When true, does not wrap the module eval in a try..catch */
	};
	modules.runtime   = runtime;
	modules.defaults  = {}; /* Module configuration options */
	modules.loading   = {}; /* The map of modules currently being loaded */
	modules.preloaded = (runtime ? runtime.preloaded : {}) || {}; /* The map of preloaded modules, if any */
	modules.loaded    = {
		"runtime"         : runtime,
		"runtime.oop"     : runtime ? runtime.oop : undefined,
		"runtime.modules" : modules,
		"runtime.window"  : (typeof(window) !== "undefined") ? window : typeof(self) !== "undefined" ? self : undefined,
	}; /* The map of modules already loaded */
	modules.baseURL   = (typeof(window) !== "undefined") ?
		window.location.origin    +
		window.location.pathname.substr(0,window.location.pathname.lastIndexOf("/"))
		: undefined;
	modules.imports    = {}; /* Lists modules that import a given module */
	modules.normalizer = {}; /* Maps a normalized name for the given module */
	modules.resolver   = {}; /* Maps a custom resolver for the scheme in 'name!scheme' */
	modules.loader     = {}; /* Maps a custom loader for the scheme in 'name!scheme' */
	modules.parser     = {}; /* Maps a custom parser for the scheme in 'name!scheme' */
	modules.path       = {}; /* Per-module predefined path */
	modules.fixes      = {}; /* Per-module loading fixes, for non-AMD/UMD compatible modules */
	modules.paths      = [   /* Default lookup path */
		"lib/sjs/*.sjs",
		"lib/js/*.js",
		"//unpkg.com/@"
	];
	modules.isLoading = 0;
	modules.sourcesStack  = [];


/**
 * @function
 * Returns the default configuration for the given module
*/
modules.configure = function(name, value) {
	const o = modules.defaults[name] || {};
	const v = Object.create(value);
	Object.keys(o).forEach(function(k){v[k] = o[k];})
	return o;
}

/**
 * @function
 * Declares that the module with the given @name is expected to be loaded
*/
modules.expects = function(name, exports) {
	exports = exports || {};
	name = modules._parseName(name).name;
	if (name && !modules.loading[name] && !modules.loaded[name] ) {
		modules.isLoading += 1;
		// Here we store the exports, which is going to be
		// populated once the module is satisfied.
		modules.loading[name] = exports;
	} else if (exports && modules.loading[name] != exports) {
		// We make sure the exports are well defined
		modules.loading[name] = exports;
	}
}

/**
 * Parses the given module source text, calling the given callback when
 * the module is loaded.
 *
 * @param text ― the source code for the module
 * @param name ― the module name
 * @param callback ― callback to be invoked when the module is loaded
 * @param source ― the module source URI
*/
modules.parse = function(text, name, callback, source) {
	name      = name || ("__anonymous__" + Date.now()) ;
	// NOTE: We need to register the callback before the eval, as the eval
	// might trigger the event.
	if (callback) { 
		if (modules.loading[name] && Object.keys(modules.loading[name]) > 0) {
			console.warn("runtime: module already loading", name)
		} else if (modules.loaded[name] && Object.keys(modules.loaded[name]) > 0) {
			console.warn("runtime: module already loaded", name)
		} else {
			// SEE: #LOAD_NOTIFY
			modules.runtime.__once__( modules, name, callback );
		}
	}

	// NOTE: The callback will be called by the modules.define function.
	// NOTE: The UMD module might not be an expression, for instance D3
	// is a statement <unpkg.com/d3>
	// ANCHOR:PARSE_DEFINE
	const prefix = "(function(){" +
		"function define(deps,factory){" +
			"return modules.define('" + name + "', deps, factory)" +
		"};define.amd=true;/*PREFIX*/\n"

	// SEE: https://blog.getfirebug.com/2009/08/11/give-your-eval-a-name-with-sourceurl/
	// SEE: https://bugzilla.mozilla.org/show_bug.cgi?id=583083
	// NOTE: FF will allow to browse sources directly from the traceback
	// if the path is an URL.
	var srcurl = (source||name);
	if (srcurl.indexOf("//") == -1) {
		const l = "" + window.location;
		srcurl = l.substr(0,l.lastIndexOf("/")) + "/" + srcurl;
	}
	const suffix = "\n/*SUFFIX*/;})()\n"
		+ "//# sourceURL=" + (srcurl) + "\n";

	// Some modules, like Firebase have a structure where
	// there is leading comment section and then a global-scoped variable
	// definition. In that case we need to wrap the module so that it actually
	// defines the symbol.
	const fixes = modules.fixes[name];
	if (fixes) {
		if (typeof(fixes.exports) === "string") {
			// Fixes the case where the module defines a variable like
			// `var {fixes.exports} = <MODULE OBJECT}`. Firebase
			// is one example that is defined like that.
			const text_prefix = "define([],function(){";
			const text_suffix =  "\n;return " + fixes.exports + " ;});";
			text = text_prefix + text + text_suffix;
		} else {
			console.error("runtime.module: fixes.exports type not supported", fixes.exports)
		}
	}

	// NOTE: This will call `define` again and while it will
	// directly evaluate to the `exports`, the exports won't be
	// initialized until the dependencies given to  define
	// are resolved.
	const module_text = prefix + text + suffix;

	// FIXME: This won't work for module that do not update an export, such
	// as: https://unpkg.com/inferno-create-element@3.6.3/dist/inferno-create-element.js
	var result = undefined;
	modules.sourcesStack.push({name:name, source:source});
	if (modules.options.unsafeEval) {
		result = eval(module_text);
	} else {
		try {
			result = eval (module_text);
		} catch (exception) {
			if (exception instanceof SyntaxError) {
				console.warn("runtime.module: Syntax error while parsing module `" + srcurl + "` at line " + exception.lineNumber + ": " + exception.message, exception);
			} else {
				console.warn("runtime.module: Exception while parsing module " + srcurl, exception);
			}
			modules.sourcesStack.pop();
			throw exception;
		}
	}
	modules.sourcesStack.pop();
	return null;
}

/**
 * @function @internal
 * Implements the main logic to load the module with the given `name`.
 *
 * @param name ― the module name, including any loading scheme
 */
modules._load = function(name) {
	var n = modules._parseName(name);
	var fullname = n.fullname;
	var scheme   = n.scheme;
	// NOTE: This is left to undefined but might be used to force a resolution
	// in the future.
	var url      = undefined;
	// Note that here the name is normalized.
	name         = n.name;

	if (!modules.loading[name] && !modules.loaded[name]) {
		// The module is NOT loading, and NOT loaded.
		if (modules.preloaded[name]) {
			// The module is PRELOADED
			modules.runtime.__send__(modules, "loading", name);
			modules.expects(fullname, new_module);
			// This is the same as in `modules.parse`. See #PARSE_DEFINE
			var module_define = function(deps, factory){return modules.define(name, deps, factory)};
			module_define.amd = true;
			modules.preloaded[name](modules.require, module_define);
		} else {
			// The module is not PRELOADED
			var new_module = {};
			var timeout    = false;
			modules.runtime.__send__(modules, "loading", name);
			// We register that we expect this module to load
			modules.expects(fullname, new_module);
			var on_resolved = function(url){
				// We resolved the timeout. Note that sometimes resolve
				// executes synchronously. so that's why we test for true and false.
				if (timeout !== false && timeout !== true) {window.clearTimeout(timeout)}
				if (url === false) {
					console.error("modules.load: Could not resolve module `" + name + "`, not found in", modules.paths);
					return false;
				}
				timeout = true;
				// We define an `on_load` callback that will parse the loaded
				// value, taking into account any `parser` defined.
				var on_load = function(response) {
					// If there's a custom parser for the module, then we call it here.
					if (modules.parser[scheme]){
						modules.parser[scheme](response, name, null, url);
					} else {
						// This is where the module parsed. This will first try
						// to parse (and patch, if necessary), the module's source
						// code, and then will call `modules.define` to define
						// the module and its dependencies.
						modules.parse(response instanceof String ? response : response.responseText, name, null, url);
					}
				}
				// If there is a custom loader for the scheme, we use it.
				if (modules.loader[scheme]) {
					modules.loader[scheme](url,name,on_load)
				} else {
					// NOTE: We don't want to use fetch as it doesn't
					// process XML properly.
					const r = new XMLHttpRequest();
					r.addEventListener("load", function(_){on_load(_.target)});
					// This does a `GET` (by default) requrest.
					r.open(modules.options.loadMethod, url);
					r.send();
				}
			}
			// If we already have a URL (ie. it is a relative-path module), 
			// then we can skip the resolution.
			if (url) {
				on_resolved(url);
			} else {
				modules.resolve(fullname, on_resolved);
			}
			// We log an error if we don't managed to resolve the module after
			// the timeout time.
			if (timeout === false && modules.options.resolveTimeout > 0) {
				timeout = window.setTimeout(function(){
					if (timeout !== true) {
						console.warn("modules: Failed to resolve module `" + name + "` within " + (Math.floor(modules.options.resolveTimeout/10)/100)  + "s");
					}
				},modules.options.resolveTimeout);
			}
			return new_module;
		}
	} else {
		// Otherwise the module is loading. or loaded.
		return modules.loaded[name] || modules.loading[name];
	}
}

/**
 * Tries to loads the module with the given name, calling
 * `callback` when the module is defined. If the module
 * is not already loaded, this will  call `_load(…)`, which
 * does most of the job of finding and loading the module.
*/
modules.load = function(name, callback) {
	var n = modules._parseName(name);
	name = n.name;
	if (name === "require") {
		// Require is already defined in this module, so it
		// does not need to be loaded.
		callback && callback(modules.require)
		return modules.require;
	} else if (name === "exports") {
		// The exports is the given exports map
		callback && callback(modules.exports || {});
		return modules.exports;
	} else if (name === "window" || name === "runtime.window") {
		// That's the global window object.
		if (typeof (window) !== "undefined") {
			callback && callback(window);
			return window;
		} else {
			console.error("Attempting to require undefined window object via runtime.modules.load()");
			console.error("Are you in a Node enviroment? Use native require()");
			callback && callback(undefined);
			return undefined;
		}
	} else if (modules.loaded[name]) {
		// An already loaded module is already there
		callback && callback(modules.loaded[name]);
		return modules.loaded[name];
	} else {
		// Or the module is not loaded yet.
		// NOTE: We need to register the callback BEFORE calling
		// `_load` as if the module is preloaded and has no dependency,
		// the event will be triggered synchronously.
		// --
		// And we register a callback to be triggered once when
		// the module is initiliazed (which is different from loaded).
		// SEE: #LOAD_NOTIFY
		callback && modules.runtime.__once__(modules, name, callback);
		// Otherwise we make sure the module is being loaded
		var res = modules._load(n.fullname);
		return res;
	}
}

/**
 * @function
 * Expands the `*` characters in @template with @name first
 * as-is, then with `.` replaced by `/`.
*/
modules._expandPaths = function( template, name ) {
	const n = name.split(".").join("/");
	return [template.split("@").join(name).split("*").join(n)];
}

/**
 * @method modules.exists
 * @param url:String
 * @param callback:Function
 *
 * The #callback is called with `true`, `false` otherwise.
*/
modules.exists = function( url, callback ) {
	const r = new XMLHttpRequest();
	r.addEventListener("load",  function(_){callback(_.target.status < 400 ? url : false);})
	r.addEventListener("error", function(_){callback(false);})
	try {
		// FIXME: IE has problems with HEAD requests, for some reasons,
		// so we need to use GET requests instead.
		r.open(modules.options.existsMethod, url);
		r.send();
	} catch(e) {
		console.warn("__module__.exists: Exception occured when requesting URL " + modules.options.existsMethod + " " + url, e);
		callback(false);
	}
}

/**
 * @function
 * Parses the module name and returns a `{fullname,name,scheme}` 
 * data structure matching the text.
 */
modules._parseName = function(name) {
	var i = (name || "").indexOf(":");
	var fullname = name;
	var scheme = undefined;
	if (i >= 0) {
		scheme = name.substring(0,i);
		name   = name.substring(i+1);
	}
	var j = (name || "").indexOf("!");
	if (j >= 0) {
		scheme = name.substring(j+1);
		name   = name.substring(0,j);
	}
	return {fullname:fullname, name:name, scheme:scheme}
}

// TODO: Resolve should not fail but return an empty URL
// when not found.

/**
 * @function
 * Resolves the module with the given @name and invokes @callback
 * if found.
*/
modules.resolve = function(name, callback){
	// TODO: Implement support for formats and paths
	var n = modules._parseName(name);
	var fullname = n.fullname;
	var scheme   = n.scheme;
	name         = n.name;
	if (modules.path[fullname] || modules.path[name]) {
		// If there is an exact path for the module, we return it
		const path = modules.path[fullname] || modules.path[name];
		callback && callback(path, fullname);
	} else if (modules.resolver[scheme]) {
		// If there is a resolver for the scheme, then we use it
		var res = modules.resolver[scheme];
		if (res instanceof Function) {res = res(name); }
		res = modules._expandPaths(res, name);
		callback && callback(res[0], fullname);
	} else {
		// Otherwise, we iterate on the module.paths and try to find one
		// that matches.
		var p = modules.paths.reduce(function(r,e){
			if (typeof(e)=="function") {
				e = e(name);
			};
			if (typeof(e)=="string") {
				e = modules._expandPaths(e, name);
			}
			return r.concat(e);
		}, []);
		p = p.reduce(function(r,e){if (r.indexOf(e) == -1) {r.push(e);}; return r;}, []);
		var f = function(i){
			if (i < p.length) {
				var m = p[i];
				modules.exists(m, function(v){
					if (v) {
						// NOTE: We don't need to fail if callback is not defined
						if (callback) {
							callback(v, fullname);
						}
					} else {
						f(i+1);
					}
				});
			} else {
				// NOTE: This might not be clear but this is actually sequentially
				// executed, for each element of p.
				if (callback) {
					callback(false);
				} else {
					console.error("modules.resolve: Could not resolve module `" + name + "`, not found in", p);
				}
			}
		}
		f(0);
	}
}

modules.ready = function( callback ) {
	if (Object.keys(modules.loading).length == 0) {
		callback();
	} else {
		// SEE:#LOAD_NOTIFY
		modules.runtime.__once__(modules, "loaded", callback);
	}
}

/**
 * Returns a list of imports of #module, this even includes
 * modules that transitively import the symbol.
*/
modules.importer = function( moduleName, result ) {
	result = result === undefined ?  [] : result;
	var d  = modules.imports[moduleName];
	if (d) {
		d.forEach(function(m){
			if (result.indexOf(m) == -1) {
				result.push(m);
				modules.importer(m, result);
			}
		});
	}
	return result;
}

/**
 * Called by `define` once a module is properly loaded and all its
 * dependencies are resolved. This triggers events that will in turn
 * trigger callbacks registered previously through `load(…)`
*/
// SEE: #MODULE_JOIN
modules.join = function (id,value) {
	if (id) {
		modules.loaded[id] = value;
		// We only decrease the counter here
		if (modules.loading[id]) {
			delete modules.loading[id];
			modules.isLoading -= 1;
			if (modules.isLoading == 0) {
				modules.runtime.__send__(modules, "loaded", value);
			}
		}
		// And send the `load` events
		// ANCHOR:LOAD_NOTIFY
		modules.runtime.__send__(modules, id,     value);
		modules.runtime.__send__(modules, "load", value);
	}
}

/**
 * One of the most important (and complex) function of this module, along
 * with `_load`. It defines the module with the given `id`, created by the
 * given `factory` function, once all the `dependencies` are properly 
 * loaded.
*/
modules.define = function( id, dependencies, factory ) {
	factory      = factory || dependencies || id;
	factory      = factory instanceof Function ? factory : undefined;
	dependencies = dependencies instanceof Array ? dependencies : id instanceof Array ? id : [];
	id           = typeof id === "string" ? id : modules.__current__;
	modules.__current__ = null;

	// We normalize the dependencies in case they're relative
	var parent      = modules.sourcesStack[modules.sourcesStack.length - 1];
	var parent_name = parent ? parent.name.split("/") : []; parent_name.pop();
	dependencies = dependencies.map(function(name,i){
		if (parent_name && name.indexOf(".") == 0) {
			name = name.split("/").reduce(function(r,v){
				if      (v == "..") { r.pop(); }
				else if (v != "." ) { r.push(v); }
				return r;
			}, [].concat(parent_name)).join("/");
		};
		return modules.normalizer[name]||name;
	});

	// The exports, require, and runtime modules are pre-loaded by default.
	var required     = dependencies.filter(function(_){return _ != "exports" && _ != "require" && _ != "runtime";});
	var satisfied    = [];
	var this_module  = modules.loading[id] || {};
	var loaded       = {
		exports : this_module,
		require : modules.require,
		runtime : modules.runtime,
	};

	// We register the module as loading
	if (id) { modules.loading[id] = this_module; }

	// === MODULE CREATION ================================================
	// NOTE: This is declared now, but is actually executed at the very
	// end, once all the dependencies are satisfied.
	// SEE:#MODULE_COMPLETE
	var on_complete = function(){
		// We convert the list of dependencies into reference to
		// actual imported modules. 
		var imported = dependencies.map(function(name){return loaded[modules._parseName(name).name];});

		// If the module has factory function, we execute it (sometimes
		// modules don't...)
		if (factory) {
			// NOTE: Some modules (for instance https://unpkg.com/react@15.6.1/dist/react.js)
			// do not rely on 'exports' and instead return the exported 
			// symbols.
			var module_result = factory.apply(this_module, imported);
			if (module_result && module_result !== this_module) {
				if (module_result instanceof Function) {
					if (Object.keys(this_module).length == 0) {
						this_module = module_result;
					} else {
						console.warn("Modules: module '" + id + "' returns a function instead of an exports map, and the current module is not empty:", this_module);
						this_module = module_result;
					}
				} else {
					if (Object.keys(this_module).length == 0) {
						this_module = module_result;
					} else {
						Object.keys(module_result).forEach(function(k,i){
							this_module[k] = module_result[k];
						});
					}
				}
			}
			this_module.__name__ = this_module.__name__ || id;
		}

		// We log the imported modules
		this_module.__imported__ = (this_module.__imported__ || []).concat(imported);

		// If the module has a name, then we can mark it as loaded.
		// ANCHOR:MODULE_JOIN
		modules.join(id, this_module);
	}

	// === MODULE DEPENDENCIES ============================================
	required.forEach(function(d){
		// If the currently defined module has a name, we add it as 
		// an **importer** of the required module `d`
		if (id) {
			modules.imports[d] = modules.imports[d] || [];
			modules.imports[d].push(id);
		}
		// NOTE: Again, this is only executed when the required module `d`
		// is loaded -- it is async.
		// --
		// Registers the given module object in `loaded` (local)
		// and in the `satisfied` list of dependencies.
		var on_dependency_loaded = function(moduleObject){
			var name = modules._parseName(d).name || moduleObject.__name__;
			if (name) {
				loaded[name] = moduleObject;
			} else {
				console.warn("modules: loaded module has no name or __name__ attribute : `" + d + "`", moduleObject);
			}
			// We mark the dependency as satisfied. Note that we don't prune
			// duplicates here.
			satisfied.push(d);
			// If all the dependencies have been satisfied
			if (required.length == satisfied.length) {
				// ANCHOR:MODULE_COMPLETE
				on_complete();
			} 
		}

		// We detect a circular dependency
		if (modules.importer(id).indexOf(d) >= 0) {
			// TODO: I'm leaving this for now to see if there's any side effect
			// introduced by this strategy. If there are problems, we should
			// introduce options to allow per-module circular dependency.
			on_dependency_loaded(modules.loading[d]);
		} else {
			modules.load(d, on_dependency_loaded);
		}
	});

	// If there is no required dependency, then we complete the
	// definition of the module.
	// ANCHOR:MODULE_COMPLETE
	if (required.length==0) {on_complete();}

	return this_module;
}

modules.require = function(id, callback) {
	// If we require the runtime module, then it's the default pre-imported runtime!
	if (id === "runtime") {
		if (callback) {callback(modules.runtime)};
		return modules.runtime;
	} else {
		const m = modules.loaded[id];
		if (m) {
			if (callback) {callback(m)};
			return m;
		} else {
			return modules.load(id, callback);
		}
	}
}

// We register the runtime as runtime.modules ― We need to do
// that when using webworkers, as the environment is different.
if (runtime){
	if (!runtime.modules){runtime.modules = exports;}
}
modules.setRuntime = function(runtime) {
	// We register the runtime as runtime.modules
	if (runtime && runtime != modules.runtime){
		modules.runtime = runtime;
		modules.loaded["runtime"] = runtime;
		modules.loaded["runtime.modules"] = modules;
		if (!runtime.modules){runtime.modules = exports;}
	}
}
// We register a handler for when the runtime is available.
if (window.document && window.document.body ) {
	window.document.body.addEventListener("RuntimeReady", function(event){
		modules.setRuntime(event.detail.runtime);
	});
}

if (typeof(window) !== "undefined") {
	// IE11 does not allow the direct creation of custom events.
	if (window && window.document && window.document.head) {
		var event = undefined;
		var detail = {name:"runtime.modules", exports:exports};
		try {
			event = new CustomEvent("RuntimeModuleLoaded", {detail:detail});
		} catch (e) {
			// NOTE: This is a deprecated way of doing so
			event = window.document.createEvent("CustomEvent");
			event.initCustomEvent("RuntimeModuleLoaded", true, false, detail);
		}
		window.document.head.dispatchEvent(event);
	}
} else if (typeof(module) !== "undefined") {
	// Node require() uses module.exports as return value
	module.exports = modules;
}
// START:UMD_POSTAMBLE
return exports;})
// END:UMD_POSTAMBLE
/* EOF */
