@feature sugar 2
@module std.text.i18n
| Offers support for managing different string collections for different locales.

@import error        from std.errors
@import len          from std.core
@import first, keys, sorted from std.collections
@import runtime.window as window

@shared LANG   = (window navigator language split "-" [0]) or "en"
@shared REGION = (window navigator language split "-" [1]) or "*"

# -----------------------------------------------------------------------------
#
# TRANSLATIONS
#
# -----------------------------------------------------------------------------

@class Translations
| A collection of strings mapped to a locale identifier. The `strings`
| attribute is organized as `{<STRINGID>:{<LANGUAGE>:{<REGION>:<TRANSLATION>}}}`
|
| By default, the translation singleton returned by `Translations.Get`
| is shared by all locales.

	@shared ALL

	@operation Get
		ALL ?= new Translations ()
		return ALL

	@operation Merge values, language="*", region="*"
		return Get () merge (values, language, region)

	@property strings  = {}

	@method set id:String, translation:String, language:String="*", region:String="*"
	| Sets the given `translation` for the string with the given `id`
	| and `locale`.
		strings[id] ?= {}
		strings[id][language] ?= {}
		strings[id][language][region] = translation
		return self

	@method get id, language="*", region="*", strict=False
	| Returns the string previously registerd with the given `id` using the
	| given `locale`. If no string is found, then the method will look
	| for alternatives using locales specified @defaults, unless `strict`
	| is `true`.
		let s = strings[id]
		if not s
			return Undefined
		# We get the language
		var sl = s[language]
		if not sl and strict
			return Undefined
		elif not sl
			sl = s["*"]
		# It's possible that there is no entry
		if not sl
			return Undefined
		# We get the region
		var sr = sl[region]
		if not sr and strict
			return Undefined
		elif not sr
			sr = sl["*"]
		return sr

	@method has id, language="*", region="*"
		return get (id, language, region, True) is not Undefined

	@method set id, value, language="*", region="*"
		let s = strings
		s[id]                   ?= {}
		s[id][language]         ?= {}
		s[id][language][region] = value
		return value

	@method merge values, language="*", region="*"
		for v,k in values
			set (k, v, language, region)
		return values

	@method getLocales
	| Returns the list of `(language, country)` locales defined
	| In this
		let res = []
		for ka, v in strings
			for kb in keys (v)
				res push ([ka, kb])
		return sorted(res)

	@method list
	| Return the string ids
		return keys(strings)

# -----------------------------------------------------------------------------
#
# LOCALE
#
# -----------------------------------------------------------------------------

@class Locale
| Represents a locale locale, composed of a `language` and a `region`. THe
| locale wraps a `translations` string collection.

	@shared   ALL          = {}
	@property language     = "*"
	@property region       = "*"
	@property translations = Undefined

	@operation Get lang=None, region=None
	| Returns the locale for the given `(lang,region)`, creating it if
	| necessary.
		lang       = lang or "*"
		ALL[lang] ?= {}
		region     = "*" if ((not region) or lang == "*") else region
		ALL[lang][region] ?= new Locale (lang, region)
		return ALL[lang][region]

	@constructor language, region, translations=(Translations Get ())
		self language     = language or "*"
		self region       = region   or "*"
		self translations = translations or Translations Get ()

	@method get id
	| Returns the string with the given `id` translated for the given
	| language and region.
		return translations get (id, language, region)

	@method set id, value=Undefined
	| Sets the translations for the string and locale with the given id to
	| to the given value.
		match id
			is? Object
				id :: {set(_1, _0)}
				return id
			is? String
				return translations set (id, value, language, region)
			else
				return error ("Expecting Map or String, got", id, __scope__)

# -----------------------------------------------------------------------------
#
# API
#
# -----------------------------------------------------------------------------

@function setLanguage lang
	LANG = lang
	return LANG

# FIXME: Lang should be either `LANG` or `[LANG, REGION]`.
@function locale lang=LANG
| Returns the `Locale` corresponding to the given `lang` and `region`. Returns
| the default locale when no arugments.
	# TODO: Implement retrieving different locales
	return Locale Get (lang)

@function T id, lang=Undefined, default=Undefined
| A translation function that resolves strings from the given locale. If `id`
| is an array, then the first available translation will be used.
	default ?= id
	# NOTE: What's the use case for that?
	if id is? Array
		let j = len (id) - 1
		for v, i in id
			let t = T(v, lang, "")
			if t
				return t
		return id[-1]
	elif id is? Object
		return S (id, lang, default)
	else
		return (locale (lang) get (id) or default)

@function TS id, lang=Undefined
	return locale (lang) has (id)

@function S object, lang, default=Undefined
| Translates an I18N object, which is a `{<LANG>:String}` map.
	return object match
		is? String -> T(object, lang, default)
		else -> object[lang] or object[LANG] or first (object) or default

# EOF
