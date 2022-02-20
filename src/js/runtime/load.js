/**
 * Bootstraps StLib's runtime system by loading the `runtime/*.js` files,
 * and loading a list of initial modules.
 *
 * To use this script, put it in as script tag with the following attributes:
 *
 * - `id=std-runtime-load` so that the script can retrieve the information it contains
 * - `class=FEATURES` (optional) the name of each additional feature to load (typically `oop` and `path`)
 * - `data-modules="MODULE MODULE‥" the space-separated list of modules to preload
 * - `data-onload="EXPR", an expression that will be evaluated on load
 * - `data-runtime-bind="NAME" the name to which the runtime should be bound.
 *
 * Additionally, a `PREFIX__runtime_call__(symbol,slot,rest‥)` function is provided
 * and can be used to asynchronously call a function defined in a module. It
 * can be used as an onload handler for images to trigger events or insertion
 * of elements:
 *
 * ```
 * <img(src="../lib/images/load.png",alt="Loading component",onload="__runtime_call__('mmm.components','bind',event.target)")
 * ```
*/
((function(global,factory){
	// NOTE: This is a bit of a hack to enable passing the module's options
	// as the invocation TARGET. This is really only relevant for the
	// `stdkit-packager` tool, as otherwise communication/options is made 
	// by a global node.
	return factory(global);
})(this, function(options){
	"use strict"
	// =======================================================================
	// GLOBAL PARAMETERS
	// =======================================================================
	// The NAMESPACE is where the runtime module is bound
	const NAMESPACE = "";
	// The FEATURES indicate which scripts are loaded in which order `runtime.FEATURE.js`.
	const FEATURES  = ["", "modules", "oop", "conf", "window"];
	// The loa
	const ELEMENT_ID = "std-runtime-load"

	// =======================================================================
	// ELEMENT CONFIGURATION EXTRACTION
	// =======================================================================
	// TODO: This would not work with XML
	const head      = document.head;
	var   origin    = document.getElementById(ELEMENT_ID);
	// Now we get the prefix, ie. the base where all the scripts are installed
	const prefix    = origin ? origin.src.split("runtime/load.js")[0] : (function(){
		var s = (""+window.location).split();
		s.pop();
		return s.join("/");
	})();

	// We extract the list of features defined in the class list.
	var   features     = [];
	if (origin) {
		features = (origin.getAttribute("class")||"").split(" ").concat((origin.getAttribute("data-features")||"").split(" "));
	} else if (options && options.features) {
		features = options.features;
	} else {
		features = FEATURES;
	}
	features = features.filter(function(_){return _ && FEATURES.indexOf(_)>=0;});
	
	// The base is meant to be the base for the data files.
	const base    = (options && options.base ? options.base : "") || "";
	// We extract the list of modules
	const modules = origin         ?  (origin.getAttribute("data-modules") || "").split(" ").filter(function(_){return _}) :
		options && options.modules ?  options.modules : [] ;

	// We extract the list of preloaded modules
	const preloaded    = options && options.preloaded ? options.preloaded : 
			window[(origin ? origin.getAttribute("data-preloaded") : null) || "__runtime_preloaded__"];

	// We extract the name to which the runtime should be bound
	const runtime_name = options && options.bind ? options.bind :
			origin ? origin.getAttribute("data-runtime-bind") : null;

	const on_load = options && options.load ? options.load :
			origin ? origin.getAttribute("data-onload") : null;

	// =======================================================================
	// RUNTIME STATE VARIABLES
	// =======================================================================
	
	var   isReady    = false;
	var   hasFailed  = false;
	var   event_node = origin || document.body || document;
	const onReady    = [];
	const onFail     = [];
	const loading    = {};
	// NOTE: We'll use the `loaded` as as global registry of loaded runtime
	// modules.
	const loaded    = {};
	if (features.length == 0){features=["", "modules"]}

	// The runtime object will be dynamically set using events ― we don't
	// want to pollute the global namespace, so we use DOM events to communicate
	// the exported objects.
	var runtime    = null;

	// =======================================================================
	// CALLBACKS
	// =======================================================================

	// Loads a runtime module/feature, executing callback once it's ready
	// FIXME: This does not guarantee that the modules will be instanciated in
	// sequence.
	const load_runtime_feature = function(feature, callback) {
		feature = feature || "runtime";
		const module_name = feature == "runtime" ? feature : "runtime." + feature;
		if (preloaded && preloaded[module_name]) {
			loading[feature] = "preloaded:" + module_name;
			// NOTE: We don't need to pass any argument there.
			preloaded[module_name].apply(loaded);
			// We can safely call the callback here as no runtime module should
			// have dependencies.
			if (callback) {callback()};
		} else if (loading[feature]) {
			return true;
		} else {
			const n = document.createElement("script");
			const p = prefix + "runtime" + (feature !== "runtime" ? "/" + feature : "") + ".js";
			loading[feature] = p;
			n.onload = function(){
				// Same things as above, this is safe.
				if (callback) {callback()};
			};
			n.setAttribute("src", p);
			head.appendChild(n);
		}
	}

	// Waits for joined to be the same lenght as the expected array, then
	// invokes the callback.
	const join  = function(joined,expected,callback){
		joined.length == expected.length && callback();
	}; 

	// Dynamically loads the given `symbol` (module), resolves
	// the given `slot` (function) and invokes it with the rest of the arguments.
	const runtime_call = function(symbol, slot) {
		const rest = Array.prototype.slice.call(arguments, 2);
		if (!isReady) {
			onReady.push(function(){runtime_call.apply(this,[symbol,slot].concat(rest))});
		} else {
			runtime.modules.load(symbol, function(m){
				const f = m[slot];
				if (f) {
					f.apply(m, rest);
				} else {
					console.warn("runtime/load: Slot `" + slot + "` not defined in symbol `" + symbol + "`");
				}
			});
		}
	}

	// Registers the given callback for execution when the runtime is ready.
	const runtime_ready = function(callback) {
		if (!isReady) {
			onReady.push(function(){return callback(runtime)});
		} else {
			callback(runtime);
		}
	}

	// Called when there is a problem loading the runtime. This is propably
	// more likely to happen on unsupported/older browsers, so you
	// can use the callback to ask for an upgrade.
	const runtime_failed = function(callback) {
		var pathname = window.location.pathname.split("/");
		while (pathname[pathname.length - 1] == "") {pathname.pop();}
		pathname.pop();
		pathname = pathname.join("/");
		if (!hasFailed) {
			onFail.push(function(){return callback(pathname,runtime)});
		} else {
			callback(runtime);
		}
	}

	// Triggers a failure of loading the runtime.
	const do_runtime_fail = function(){
		hasFailed = true;
		while (onFail.length) {var c = onFail.pop();c && c();}
	}

	/**
	 * @function
	 * Invoked when the runtime is FULLY loaded, meaning all the runtime features have been
	 * properly loaded and initialized.
	*/
	const on_runtime_loaded = function(){
		// The runtime is now loaded
		isReady = true;
		// We update the path for resolving
		if (!runtime){console.error("runtime.load: `runtime` module is missing");return false;}
		if (!runtime.modules){console.error("runtime.load: `runtime.modules` is missing");return false;}
		// The prefix is where the source code is located, and then
		// the base is where the data files/assets are located.
		runtime.PREFIX=prefix;
		runtime.BASE=base;
		const m = runtime.modules;
		// We register the prefix
		m.paths.splice(0,0,prefix + "*.js");
		// And the components, which are typically at ../../components
		// TODO: We might not want to override stuff defined in the optional
		// conf runtime module.
		m.path["!component"] = prefix + "components";
		m.path["!css"]       = prefix + "../css";
		// We execute the onReady callbacks
		while (onReady.length) {
			var c = onReady.pop();
			c && c();
		}
		// We fire the Ready event
		var event = undefined;
		var event_detail = {runtime:runtime};
		// IE11 does not allow the direct creation of custom events.
		try {
			event = new CustomEvent("RuntimeReady", {detail:event_detail});
		} catch (e) {
			event = document.createEvent("CustomEvent");
			event.initCustomEvent("RuntimeReady", true, false, event_detail);
		}
		event_node.dispatchEvent(event);
		// If we have a data-onload attribute, we evaluate it.
		// We load the modules
		const on_modules_loaded = function(){
			if (on_load) {
				if (on_load instanceof Function){on_load(runtime);}
				else {eval("(function(runtime){var r=" + on_load + ";if (r instanceof Function){r(runtime);}})")(runtime);}
			}
			try {
				event = new CustomEvent("RuntimeModuleLoaded");
			} catch (e) {
				event = document.createEvent("CustomEvent");
				event.initCustomEvent("RuntimeModuleLoaded", true, false, {});
			}
			event_node.dispatchEvent(event);
		}
		if (modules.length == 0) {
			on_modules_loaded();
		} else {
			var loaded_count = 0;
			// We load th modules
			modules.forEach(function(_){
				m.load(_, function(){
					loaded_count+=1;
					if (loaded_count == modules.length) {
						on_modules_loaded();
					}
				});
			});
		}
	}

	// NOTE: We might be able to pass that to the runtime directly
	window[NAMESPACE + "__runtime_call__" ]   = runtime_call;
	window[NAMESPACE + "__runtime_ready__"]   = runtime_ready;
	window[NAMESPACE + "__runtime_failed__"]  = runtime_failed;

	// This slightly convoluted function makes sure of the following
	// - '' (aka 'runtime') is always loaded first
	// - 'modules' is always loaded second if declared
	// - the rest is pretty much loaded as-is. 
	// This makes it semi-deterministic in the sense that the main two
	// features are guaranteed to load in order, while the rest can load
	// out of order.
	document.head.addEventListener("RuntimeModuleLoaded", function(e){
		if (!e || !e.detail || !e.detail.name) {
			do_runtime_fail();
		}
		var detail     = e.detail;
		var event_name = detail ? detail.name : undefined;
		if (event_name == "runtime") {
			// We get the runtime reference from the custom event detail
			// If the runtime is not loaded first.
			if (runtime) {console.warn("runtime.load: RuntimeModuleLoaded event has already been fired");}
			runtime = detail.exports;
			// We register the runtime in the "loaded" entry.
			loaded["runtime"] = runtime;
			// We bind the preloaded modules.
			runtime.preloaded = preloaded;
			if (!runtime) {console.error("runtime.load: RuntimeModuleLoaded event is missing the exports detail")}
			const rest = features.filter(function(_){return ["", "modules"].indexOf(_) == -1});
			// We only load the rest once the runtime is loaded
			const load_rest = function(){
				if (rest.length > 0) {
					const joined = [];
					rest.forEach(function(_){
						load_runtime_feature(_, function(){
							joined.push(_);
							join(joined, rest, on_runtime_loaded)
						});
					});
				} else {
					on_runtime_loaded();
				}
			}
			if (features.indexOf("modules") >= 0) {
				load_runtime_feature("modules", load_rest)
			} else {
				load_rest();
			}
			// We bind the runtime if a name is provided
			if (runtime_name) {
				console.log("⌘ Runtime bound to `window." + runtime_name + "`");
				window[runtime_name] = runtime;
			}
		} else if (event_name == "runtime.modules") {
			if (!runtime) {console.error("runtime.load: runtime/modules.js loaded before runtime.js is available")};
			const modules = detail.exports;
			modules.setRuntime(runtime);
			runtime.modules = modules;
		} else if (event_name.indexOf("runtime.") == 0) {
			if (!runtime) {console.error("runtime.load: `" + event_name + "` loaded before runtime.js is available")};
			const name = event_name.split(".")[1];
			runtime[name] = detail.exports;
			runtime.modules.loaded[event_name] = runtime[name];
		} else {
			console.warning("runtime.load: Unsupported module `" + event_name + "`");
		}
	})
	load_runtime_feature("");
}))/*EOF*/
