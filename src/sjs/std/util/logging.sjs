# -----------------------------------------------------------------------------
# Project           : StdLibs
# -----------------------------------------------------------------------------
# Author            : Sébastien Pierre
# License           : BSD License
# -----------------------------------------------------------------------------
# Creation date     : 2016-08-18
# Last modification : 2017-02-06
# -----------------------------------------------------------------------------
@feature  sugar 2
@module   std.util.logging
@version  0.0.1
| A loagging module that allows for per-component
| logging, while providing a simple high-level API

@import insert from std.collections
@import sprintf from std.core

@shared LICENSE = "http://ffctn.com/doc/licenses/bsd"

@enum   LogLevel= SILENT | ERROR | WARNING | LOG | INFO | TRACE | DEBUG

@shared FORMATS = {
	(SILENT)  : ""
	(ERROR)   : "[%s] [!]"
	(WARNING) : "[%s]    "
	(LOG)     : "[%s]"
	(INFO)    : "[%s]"
	(TRACE)   : "[%s]"
	(DEBUG)   : "[%s]"
}

@class Report

	@property events


@class Logger

	@property writer = ConsoleWriter Get ()
	@property name   = None
	@property format = None
	@property _level = DEBUG

	@constructor name:String
		self name = name

	@method level value:Number=Undefined
		if value is? Undefined
			return _level
		else
			_level = value
			return self

	@method debug
		let m = _message (DEBUG, arguments)
		writer debug apply (self, m) if m else null

	@method trace
		let m = _message (TRACE, arguments)
		writer trace apply (self, m) if m else null

	@method info
		let m = _message (INFO, arguments)
		writer info apply (self, m) if m else null

	@method log
		let m = _message (LOG, arguments)
		return writer log apply (self, m) if m else null

	@method warn
		return warning apply (self, arguments)

	@method warning
		let m = _message (WARNING, arguments)
		return writer warning apply (self, m) if m else null

	@method error
		let m = _message (ERROR, arguments)
		return writer warning apply (self, m) if m else null

	@method _message level, args
		if level <= _level
			var n = new Array ()
			var a = 0..(args length) ::= {args[_]}
			if format
				a = format (name, a)
			elif name
				a = insert (a, 0, sprintf(FORMATS[level], name))
			return a
		else
			return None

@class ConsoleWriter

	@shared Instance

	@operation Get
		ConsoleWriter Instance ?= new ConsoleWriter ()
		return ConsoleWriter Instance

	@method trace
		console trace apply (console, arguments)

	@method debug
		console debug apply (console, arguments)

	@method log
		console log apply (console, arguments)

	@method info
		console log apply (console, arguments)

	@method warn
		return warning apply (self, arguments)

	@method warning
		console warn apply (console, arguments)

	@method error
		console error apply (console, arguments)

@function bind name
	return new Logger (name)

# EOF - vim: ts=4 sw=4 noet
