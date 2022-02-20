/**
 * Submodule that detects Javascript enviroment (Node or browser).
 *
 * Returns browser window object if a browser is detected.
 * If Node environment is detected, returns jsdom implementation
 * of a browser `window` object.
 */
(function(exports){
    "use strict"
	exports = exports || {}

	// Returns true if `this`===window, indicating a Browser environment, else false
	// `this` in  a new Function() declaration will always return the global namespace
	const is_browser = new Function("try {return this===window;}catch(e){ return false;}")();

	// Returns true if `this`===global, indicating a Node environment, else false
	const is_node = new Function("try {return this===global;}catch(e){return false;}")();

	if (is_browser) {
		return window;
	} else if (is_node) {
		const jsdom = require("jsdom");
		const JSDOM = jsdom;
		const html = '<!DOCTYPE html><head><meta charset="utf-8"></head><body><p>jsdom browser emulator test</p></body></html>';
		const jsdomOptions = {
			// Add elements to the window object before parsing HTML
			// TODO (?): Shims to enable Node cross-compatibility
			// See https://github.com/jsdom/jsdom#intervening-before-parsing
			beforeParse : function(window) {
				window.env   = "Node";
				window.isNode = true;
			},
			// Allows for certain "visual browser" emulation elements e.g. `window.requestAnimationFrame()`
			pretendToBeVisual: false
		}
		const dom = new JSDOM(html, jsdomOptions);
		// require() will return module.exports regardless of return statement
		module.exports = dom.window;
		return module.exports;
	} else {
		console.error("Unable to detect either Node or browser Javascript environment.");
		return undefined;
	}
})(typeof(exports) !== "undefined" ? exports : undefined)

/* EOF */
