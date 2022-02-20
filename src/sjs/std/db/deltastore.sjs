@feature sugar 2
@module  std.db.deltastore
@import  cmp, json, unjson, typename, type, list, sprintf from std.core
@import  error, warning, assert, NotImplemented from std.errors
@import  websocket                     from std.io.websocket
@import  future                        from std.io.async
@import  timestamp                     from std.io.time
@import  remove                        from std.collections
@import  World, Delta, DeltaGroup, Op  from std.state.tree
@import  Logger, LogLevel              from std.util.logging

# TODO: When a disconnect is detected at the websocket level,
# deltastore should reconnect, AUTH, SUB, etc. to get fully back
# in sync.

# TODO: A snapshot should only be gradually/lazily converted to delta
# objects based on access. This means that the delta world/context nodes
# have a snapshot  that is then detached and transferred to datum objects
# with a lazy loading. It would be even better to be able to transform
# the snapshot objects directly instead of adding new ones.
@shared DELTA_OPCODES = ["INIT", "SET", "INSERT", "ADD", "REMOVE", "CLEAR"]

# -----------------------------------------------------------------------------
#
# MESSAGE
#
# -----------------------------------------------------------------------------

@class Message
| Represents the serialized messages used by the Deltastore protocol. It's
| a simple wrapper around a `[[]]` data structure, offering parsing, serialization
| an converstion to proper delta to be merged into the delta-enabled world.

	@shared COUNTER    = 0
	@shared FIELD_SEP  = String fromCharCode 30
	@shared ITEM_SEP   = String fromCharCode 31
	@shared RECORD_SEP = "\n"

	@property inbound       = False
	@property parsedLength  = 0
	@property fields        = []

	@operation Primitive value
		return World Unwrap (value)

	@operation FromDelta delta, session=0
		return delta opcode match
			is Op INIT    -> Protocol INIT   (delta path, [delta timestamp, session, delta rev], json(Primitive(delta v0)))
			is Op ADD     -> Protocol ADD    (delta path, [delta timestamp, session, delta rev], json(Primitive(delta v0)))
			is Op SET     -> Protocol SET    (delta path, [delta timestamp, session, delta rev], json(delta v0), json(Primitive(delta v1)))
			is Op INSERT  -> Protocol INSERT (delta path, [delta timestamp, session, delta rev], json(delta v0), json(Primitive(delta v1)))
			is Op REMOVE  -> Protocol REMOVE (delta path, [delta timestamp, session, delta rev], json(delta v0))
			else          -> None

	@operation Parse data, start=0, count=-1, fields=-1
	| Parses a journal's data and returns the extracted messages. The parsing
	| algorithm can parse more than one message at once, but can also
	| parse only `count` messages, or only `fields` fields of the first message.
		var i   = 0
		var f   = 0
		let l   = data length
		var o   = start
		var s   = start
		let mo  = start
		var msg = new Message ()
		let res = [msg]
		while o < l
			let c = data[o]
			match c
				== RECORD_SEP
					# NOTE: We guard against empty lines
					if s != o
						msg set (f,i,data[s:o])
					msg parsedLength = (o + 1) - mo
					if res[-1] fields length > 0
						msg = new Message ()
						res push (msg)
					f  = 0
					i  = 0
					s  = o + 1
					mo = s
				== FIELD_SEP
					msg set (f,i,data[s:o])
					f += 1
					i  = 0
					s  = o + 1
				== ITEM_SEP
					msg set (f,i,data[s:o])
					i += 1
					s = o + 1
			o += 1
			# We break out of the loop if we've reached the max number of
			# messages
			if count >=0 and res length > count
				break
			# Or if the current mesage has reached the max number of fields
			if fields >=0 and f >= fields
				break
		if s != o
			msg set (f,i,data[s:o])
		# We update the parsed length of the message
		msg parsedLength = (o + 1) - mo
		if res length == 0
			return res
		elif count == 1 or fields > 0
			# When a fields limit is set, we always return the first result
			return res[0]
		elif count > 1
			# When a count limit is set, we return the subset
			return res[:count]
		elif res[-1] fields length == 0
			return res[:-1]
		else
			return res

	@constructor fields...
		for v in fields
			match v
				is? Array
					self fields push (v)
				else
					self fields push ([v])

	@method init fields
		self fields = fields
		return self

	@method response
	| Returns a new message that contains the response fields. This asserts
	| that the opcode is `REP`.
		assert (fields[0][0] == "REP")
		return new Message () init (self fields[2:])

	@method request id=Undefined
	| Returns a new message that wraps the current message in a request
	| with the given id.
		id ?= "RQ" + COUNTER
		COUNTER += 1
		return new Message () init ([["REQ"], [id]] concat (self fields))

	@method ensureField field
		while fields length <= field
			fields push ([])
		return fields[field]

	@method ensureItem field, item
		field = ensureField (field)
		while field length <= item
			field push (Undefined)
		return field[item]

	@method get field, item=Undefined
		field = fields[field]
		if item is Undefined
			return field
		else
			return field[item] if field else None

	@method set field, item, value
		ensureItem (field, item)
		fields[field][item] = value
		return self

	@method serialize
		let f = (fields ::= {
			return (_ ::= {
				return _ match
					is? Number
						"" + _
					is? String
						_
					is? Array
						json (Primitive(_))
					is? Object
						json (Primitive(_))
					else
						"0"
			}) join (ITEM_SEP)
		}) join (FIELD_SEP)
		return f

	@method toDelta
		# A delta message is like this
		# 0      1                      2      3     4
		# OPCODE REV                    PATH   V0    V1
		#        timestamp,session,rev  str‥   json  json
		let opcode = fields[0][0]
		let delta = opcode match
			== "INIT"
				Delta Init   (fields[2], unjson(fields[3][0]))
			== "ADD"
				Delta Add    (fields[2], unjson(fields[3][0]))
			== "SET"
				Delta Set    (fields[2], unjson(fields[3][0]), unjson(fields[4][0]))
			== "INSERT"
				Delta Insert (fields[2], unjson(fields[3][0]), unjson(fields[4]))
			== "REMOVE"
				Delta Remove (fields[2], unjson(fields[3][0]))
			else
				error (NotImplemented)
		if delta
			delta timestamp  = parseInt(fields[1][0])
			delta rev        = parseInt(fields[1][2])
			delta inbound   = inbound
		return delta

# -----------------------------------------------------------------------------
#
# PROTOCOL
#
# -----------------------------------------------------------------------------

@class Protocol
| A factory-like interface to create messages of the Deltastore protocol. This
| is the preferred way of creating messages as it ensures that the data is
| valid.

	@operation Path path
		return path match
			is? Array  -> path
			is? Number -> [Math floor (path)]
			is? String -> ("" + path) split "."
			else       -> Undefined

	@operation JRNL path, limit=0
		return new Message ("JRNL", path, limit)

	@operation AUTH token
		return new Message ("AUTH", token)

	@operation INIT path, rev, value
		return new Message ("INIT", rev, Path(path), value)

	@operation ADD path, rev, value
		return new Message ("ADD", rev, Path(path), value)

	@operation SET path, rev, index, value
		return new Message ("SET", rev, Path(path), index, value)

	@operation INSERT path, rev, index, value
		return new Message ("INSERT", rev, Path(path), index, value)

	@operation REMOVE path, rev, index
		return new Message ("REMOVE", rev, Path(path), index)

	@operation SWAP path, rev, i, j
		return new Message ("SWAP", rev, Path(path), i, j)

	@operation SUB path, context=-1, since=Undefined
		return new Message ("SUB", Path(path), context, since)

	@operation SNAP path
		return new Message ("SNAP?", Path(path))

	@operation UNSUB path
		return new Message ("UNSUB", Path(path))

	@operation REORDER path, rev, i, j
		return new Message ("REORDER", rev, Path(path), i, j)

	# TODO
	# @operation MOVE src, dst
	# 	return new Message ("MOVE", Path(src), Path(dst))

# -----------------------------------------------------------------------------
#
# CONNECTOR
#
# -----------------------------------------------------------------------------

@class Connector

	@shared   MATCH_AGAIN      = "MATCH_AGAIN"
	@shared   COUNTER          = 0

	@property ws               = websocket {fallback : self . _onWebSocketFrame }
	@property session          = -1
	@property world            = Undefined
	@property journalTimestamp = None
	@property journalOffset    = None
	@property logging          = new Logger "Deltastore" level (LogLevel INFO)
	@property serverPeers      = []
	@property serverPub        = []
	@property serverSub        = []
	@property _messageHooks    = {}
	@property isInhibited      = False
	@property outgoing         = []
	@property _mounted         = {}

	@constructor url=Undefined, world=new World()
	| Creates a new connector to the WebSocket service running at the given
	| `url` (optional).
		self world = world
		if url
			open (url)

	@method open url, token="ANON"
	| Opens a websocket connection to the given `url` and directly sends
	| an `AUTH` command
		# FIXME: We would probably need to reset the world at this stage
		serverPeers  = []
		serverPub    = []
		serverSub    = []
		_mounted     = {}
		ws open (url)
		return ws then () chain {
			_joinRequest(Protocol AUTH (token)) chain {
				# NOTE: We might want to process some of the messages
				return self
			}
		}

	@method load
	| Returns all the messages available from the server
		# FIXME: We might need to re-order or at least detect
		# the answers
		return ws request (Protocol JRNL () serialize ())

	# =========================================================================
	# SUBSCRIBE
	# =========================================================================

	@method subscribe path, since=Undefined
		_send (Protocol SUB (Delta Path(path), Undefined, since))
		return self

	@method unsubscribe path
		_send (Protocol UNSUB (Delta Path(path)))
		return self

	@method snapshot path
	| Returns a future that will be set with all the messages
	| resulting form the request.
		return _joinRequest (Protocol SNAP (Delta Path (path)))

	@method isMounted path
		return _mounted[Delta Path (path) join "/"] and True or False

	@method mount path
	| Mounts the given path, retrieving the latest snapshot and
	| subscribing to updates.
		path = Delta Path (path) join "/"
		if not isMounted (path)
			return snapshot (path) then {msg|
				for m in msg
					if m get (0,0) == "SNAP"
						# We subscribe to the given path
						subscribe (m get (1), m get (2,0))
						_mounted [m get 1 join "/"] = True
			}
		else
			return future (True)

	@method unmount path
	| Unmounts the given path, unsubscribing from updates and unmounting
	| the path from the world. Returns `true` if the path was already
	| mounted.
		if isMounted (path)
			let root = Delta Path (path) join "/"
			for _,p in mounted
				if p indexOf (root) == 0
					unsubscribe (p)
			world unmount (path)
			return True
		else
			return False


	# =========================================================================
	# SERVER CONFIGURATION
	# =========================================================================

	@method addServerSub path, context=0
		let s = world schema (path, True)
		s setContextRequirement (context or 0)
		s addRule ( self . push )
		serverSub push (s)

	@method addServerPub path
		serverPub push (path)

	@method addServerPeer url
		serverPeers push (url)

	# =========================================================================
	#
	# =========================================================================

	@method inhibit value=True
	| Inhibits/deinhibits the sending of message through the websocket. Don't
	| forget to call flush if you have pending messages.
		isInhibited = value and True or False
		return self

	@method flush
	| Flushes any `outgoing` message left.
		let q = outgoing
		outgoing = []
		q :: _send
		return self

	# =========================================================================
	# DELTAS
	# =========================================================================

	@method push deltas
	| Push the given delta to the server. This won't push any remote delta.
		if deltas is? Delta
			let delta = deltas
			if delta isLocal and not delta isPublished
				let m = Message FromDelta (deltas, session)
				delta isPublished = True
				_send (m)
		elif deltas is? DeltaGroup
			deltas all :: push
		else
			deltas :: push

	@method merge changes
	| Merges the given list of changes with the world. This accepts `Delta`,
	| `DeltaGroup` and list/maps of them.
		if changes is? Delta
			return world merge (changes)
		elif changes is? DeltaGroup
			return changes all ::= {world merge (changes)}
		else
			return changes ::= {world merge (_)}

	# =========================================================================
	# MESSAGE/PROTOCOL
	# =========================================================================

	@method send opcode, args...
	| Syntax sugar to create a new message with the given `opcode` and `args`
	| as fields. It's probably better to use `Procolol` operations.
		return _send (new Message (opcode, ...args))

	@method _send message
	| Sends the given message (`Message`, `Delta`, `DeltaGroup` and `String` accepted)
	| through the websocket.
	|
	| If there is any pending `outgoing` and the connector is not inhibited,
	| the outgoing messages will be flushed first.
		if isInhibited
			outgoing push (message)
			return
		elif outgoing length > 0
			flush ()
		elif message is? Message
			# console log ("<<[msg]", message serialize ())
			ws send (message serialize ())
		elif message is? String
			# console log ("<<[raw]", message)
			ws send (message)
		elif message is? Delta
			let m = Message FromDelta (deltas)
			_send (m)
		elif message is? DeltaGroup
			message all :: push
		else
			message :: _send

	@method _joinOK message=Undefined, result=Undefined
	| Returns a future that will be triggered after an OK or an
	| OK..DONE pair if OK has a sequence number.
		# NOTE: We can send the message before registering the OK
		# because there is going to be a network delay
		if message
			_send (message)
		let f = future ()
		# and register message hooks for when the operation is
		# done.
		_onceMessage("OK",   {
			# We get the sequence number from the OK
			let seq = _ get (1,0)
			if seq
				f _sequence = seq
				# And we wait for a DONE message
				_onceMessage ("DONE", {
					if _ get (1,0) == seq
						f set (result or _)
					else
						return MATCH_AGAIN
				})
			else
				f set (result or _)
		})
		return f

	@method _joinRequest message
	| Returns a future that will contain the list of messages that correspond
	| to the response to the request with the given `id`. The given `message`
	| will be sent first and is expected to be a request.
		if not message get (0,0) == "REQ"
			message = message request ()
		_send (message)
		let rid = message get (1,0)
		assert (rid, "Request must have an id")
		let f   = future ()
		let oks = []         # Stores the list of OK ids received
		let msg = []         # Stores the list of messages received
		_onceMessage("REP", {m|
			let id    = m get (1,0)
			if rid == id
				m =  m response ()
				# When the message is a REP with a matching id
				let opcode  = m get (0,0)
				# We tentatively extract the OK/DONE IDENTIFIER. The OK/DONE
				# will not be part of the msgs, except if it's a single OK.
				let ok_code = m get (1,0)
				if opcode == "OK" and ok_code
					oks push (ok_code)
				elif opcode == "DONE"
					assert (ok_code in oks)
					oks = remove (oks, ok_code)
				else
					msg push (m)
				if oks length == 0
					# console log ("===[req:" + rid + "]", msg)
					# If we don't have any pending OK, the we're done
					f set (msg)
				else
					# Otherwise we have a partial result and we need to
					# match again.
					# console log ("‥‥‥[req:" + rid + "]", msg, "/", oks length)
					f setPartial (msg)
					return MATCH_AGAIN
			else
				return MATCH_AGAIN
		})
		return f


	@method _onceMessage opcode, predicate, timeout=10m
	| Registers a predicate/callback that will be evaluated when a message
	| with the given opcode is received.
		_messageHooks[opcode] ?= []
		_messageHooks[opcode] push {predicate:predicate, timeout:timeout, registered:new Date () getTime ()}
		return self

	@method _applyMessageHooks message
	| Applies the hooks registered on this message.
		let opcode     = message get (0,0)
		let to_remove  = []
		let now        = new Date () getTime ()
		# NOTE: The predicate might register new hooks so we don't want to
		# create a new hook while we iterate -- we might otherwise lose hooks
		# registered in the meantime.
		for hook,i in _messageHooks[opcode]
			let elapsed = now - hook registered
			if  elapsed > hook timeout
				to_remove push (hook)
				logging log (sprintf ("Hook on %s timed out after %0.2s, removing", elapsed / 1s))
			elif hook predicate (message) != MATCH_AGAIN
				to_remove push (hook)
		# We filter out at once
		_messageHooks[opcode] = _messageHooks[opcode] ::? {_ not in to_remove}
		return message

	@method _onWebSocketFrame event
	| Hook invoked when a frame/message is received through the websocket.
		_parseWebSocketFrame (event data)

	@method _parseWebSocketFrame data
	| Parses one or more messages from the given data. This supports special
	| messages such as `JRNL` to embed some data.
		var offset = 0
		let end    = data length
		let res    = []
		# logging info ("Received " + data length + "b payload")
		# logging info ("=== " + data)
		while offset < end
			let m      = Message Parse (data, offset, 1)
			var om     = m
			let opcode = m get (0,0)
			let ref    = None
			res push (m)
			# We increment the offset
			if m parsedLength <= 0
				return error ("Error in parsing algorithm, aborting parsing messages at offset", offset, "/", data length, __scope__)
			else
				offset    += m parsedLength
			# We unwrap responses
			if opcode == "REP"
				ref    = m get (1,0)
				om     = m
				m      = m response ()
				opcode = m get (0, 0)
			else
				ref    = None
			# console log (">>[msg]", opcode, m fields, "[" + ref + "]" if ref else "")
			# And interpret the commands
			if opcode == "JRNL"
				# 1 = PATH
				let p = parseInt(m get (1))
				# 2.0 = LENGTH
				let l = parseInt(m get (2,0))
				logging log (sprintf ("JRNL %0.2fKb", l/1024))
				var c = 0
				var s = 0
				let start = new Date () getTime ()
				let parsed = Message Parse (data[offset:offset+l])
				for jm in parsed
					let jm_opcode = jm get (0,0)
					jm inbound = True
					res push (jm)
					if jm_opcode in DELTA_OPCODES
						let d = jm toDelta ()
						let r = merge (d)
						if r is True
							s += 1
						else
							warning ("Could not merge delta", d, ":", r)
						c += 1
					else
						warning ("Unrecognized journal command", jm, __scope__)
				logging log ("―― received " + c + " deltas, merged " + s + ", " + (c - s) + " skipped", sprintf("[%0.2fs]", (new Date () getTime () - start) / 1000))
				offset += l
			elif opcode == "SNAP"
				# 1 = PATH
				let p = m get (1)
				# 2.0 = TIMESTAMP
				let t = parseInt(m get (2,0))
				# 3.0 = LENGTH
				let l = parseInt(m get (3,0))
				let payload = data[offset:offset+l]
				let now = new Date () getTime ()
				let restored = unjson (payload)
				let now2 = new Date () getTime ()
				world restore (p, restored, Undefined, t)
				let ela = new Date () getTime () - now
				let par = now2 - now
				logging info (sprintf ("Restored %0.2fkb in %0.2fs, %0.2fkb/s, %d%% for parsing, at %s", l / 1000, ela / 1000, (l / 1000) / (ela / 1000), 100 * par/ela, p join "/"))
				offset += l
			elif opcode in DELTA_OPCODES
				merge (m toDelta ())
			elif opcode == "UPDT"
				journalTimestamp = m get (1,0)
				journalOffset    = m get (2,0)
				logging log ("Journal is currently at", journalTimestamp, "@", journalOffset)
			elif opcode == "OK"
				logging debug ("Received OK from server", m get (1,0))
			elif opcode == "DONE"
				logging debug ("Received DONE from server", m get (1,0))
			elif opcode == "PONG"
				logging debug ("Received PONG from server")
			elif opcode == "SUB"
				addServerSub (m get (1), m get (2,0))
			elif opcode == "SESSION"
				session = m get (1,0)
				logging log ("Server assigned session #" + session)
			elif opcode == "PUB"
				addServerPub (m get (1))
			elif opcode == "PEER"
				addServerPeer (m get (1))
			else
				warning ("Unsupported opcode", opcode, ":", m)
			# We apply the message hook
			_applyMessageHooks (om, ref)
		return res

# EOF
