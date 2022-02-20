@feature sugar 2
@module  std.db.gapi.sheets
@import  assert, warning, error from std.errors
@import  future from std.io.async
@import  len from std.core
@import  GAPIConnector from std.db.gapi

# -----------------------------------------------------------------------------
#
# GOOGLE SHEETS CONNECTOR
#
# -----------------------------------------------------------------------------

# TODO: At some point, it abstract the Google API loading to `std.db.gapi`

@class SheetsConnector
| A wrapper class that manages a connection to Google Sheets using
| Google API.

	@shared RE_SHEET_ID = new RegExp("/spreadsheets/d/([a-zA-Z0-9-_]+)")
	@property _connector = Undefined

	# =========================================================================
	# CONSTRUCTOR
	# =========================================================================

	@constructor connector=Undefined
	| Creates a new Google Sheets connector from the given connector
	| or connector configuration (seet `std.db.gapi.GAPIConnector`).
		_connector = connector match
			is? GAPIConnector
				connector
			is? Object
				new GAPIConnector (connector)
			else
				new GAPIConnector ()

	# =========================================================================
	# DATA API
	# =========================================================================

	# TODO: Specify why the sheets object should be like
	# TODO: Make the sheets optionals
	@method get url, sheets
	| Loads the given `sheets` from the spreadsheet at the given URL, returning
	| either a single table or an array of tables.
		assert (url,    "Missing URL or Google Sheets id")
		assert (sheets, "For now, you'll need to give a sheet name or a list of sheet names")
		return _connector then () chain {
			let api      = _ gapi client sheets spreadsheets values
			let sheet_id = _extractSheetID (url)
			let f        = future ()
			# NOTE: The GAPI returns Promise-like objects, which are not
			# actual promises
			if sheets is? Array
				# If its an array we do a "batch get"
				api batchGet {spreadsheetId:sheet_id, ranges:sheets} then (
					{f set (_ result valueRanges ::= {v,i|v values})}
					{f fail (_)}
				)
			else
				# Here it's a simple get
				api get {spreadsheetId:sheet_id, range:sheets} then (
					{f set (_ result values)}
					{f fail (_)}
				)
			# We return the future
			return f
		}

	@method _extractSheetID url
	| Extracts the Google Sheets ID from a URL like
	| `https://docs.google.com/spreadsheets/d/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/edit`
	| resulting in a string like `"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"`.
	|
	| The implementation uses the
	| [method described here](https://developers.google.com/sheets/api/guides/concepts#spreadsheet_id).
		if url is? String and len(url) == 44
			return url
		else
			let m = RE_SHEET_ID exec(url)
			return m[1] if (m and m length > 1) else None

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function sheets configuration
	return new SheetsConnector (configuration)

# EOF
