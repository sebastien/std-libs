@feature sugar 2
@module std.db.flat
@import future,join,Retry         from std.io.async
@import HTTP                      from std.io.http
@import Operation                 from std.state.journal
@import keys,remove as col_remove from std.collections
@import list,len,json,unjson,merge,sprintf from std.core
@import delayed                   from std.io.time
@import assert,error,warning      from std.errors
@import runtime.window as window

# TODO: Subscriptions should not be tied to the feed, as the subscriptions
# might exist even if there is no feed at the moment.

# -----------------------------------------------------------------------------
#
# FLAT CONNECTOR
#
# -----------------------------------------------------------------------------

@class FlatConnector

	# FIXME: Not sure why these are protected
	@property options = {
		prefix        : "/api/flatdb/"
		database      : "default/0.0"
		encoding      : "application/json"
		readonly      : False
		realtime      : True
		# Logs messages received through  the feed
		debugFeed     : False
		debugRequests : False
		retries       : [100ms, 250ms, 500ms, 1s, 2s, 5s, 10s]
	}

	@property http           = new HTTP {credentials:True}
	@property channelID      = sprintf("C%d%04d", Math floor (new Date () getTime ()),  Math floor (Math random () * 1000))
	@property _feed          = None

	@property _subscriptions = new Subscriptions () does (self . onSubscriptionUpdate)
	| The subscriptions manages the subscribed path in a way that prevents
	| too many requests to be made at once. When a parent is subscribed, 
	| children won't be subscribed unil the parent is unsubscribed.

	@method connect options=self options
		configure (options)
		return future (self)

	@method configure options
		if options is not self options
			self options = merge(options, self options)
		return self

	@method has path
		return http head (_url(path, False)) always {_ isSuccess} failed (self . onRequestFailure)

	# NOTE: Get methods DO NOT have a trailing slashawait request.data()await request.data()
	@method get path
		return http get (_url(path, False)) failed (self . onRequestFailure)

	@method mget path, values
	| Does a multiple get (mget) of the given values at the
	| given path.
		if options readonly
			if values is? Array 
				return join (values ::= {http get (_url(path + "/" + _)) failed (self . onRequestFailure)})
			else
				warning ("Values should be an array, got", values, __scope__)
				return future ([])
		else
			return http post (_url(path, False), _serialize (values), Undefined, options encoding) failed (self . onRequestFailure)

	# NOTE: List methods DO have a trailing slash
	@method list path
		return http get (_url(path, True)) failed (self . onRequestFailure)

	@method update path, value
		# NOTE: We call `set`, so no need to set the path or value.
		if options readonly
			return future (False)
		else
			let v = _serialize (value)
			if options debugRequests
				console log ("[FlatDB] update/PATCH", path, v)
			return http patch (_url(path, False), v, Undefined, options encoding) failed (self . onRequestFailure)

	@method set path, value
		if options readonly
			return future (False)
		else
			let v = _serialize (value)
			if options debugRequests
				console log ("[FlatDB] set/PUT", path, v)
			return http put (_url(path, False), v, Undefined, options encoding) failed (self . onRequestFailure)

	@method add path, value
		if options readonly
			return future (False)
		else
			let v = _serialize (value)
			if options debugRequests
				console log ("[FlatDB] add/PATCH", path, v)
			return http patch (_url(path, False), v, Undefined, options encoding) failed (self . onRequestFailure)

	@method remove path, value
		if options readonly
			return future (False)
		else
			let v = _serialize (value)
			if options debugRequests
				console log ("[FlatDB] remove/DELETE", path, v)
			return http delete (_url(path, False), v, Undefined, options encoding) failed (self . onRequestFailure)

	@method removeAt path, index
		if options readonly
			return future (False)
		else
			return http delete (_url(path + "/" + index)) failed (self . onRequestFailure)

	# =========================================================================
	# FEED SUBSCRIPTION AND MANAGMEENT
	# =========================================================================

	# TODO: We should have a way to not oversubsribe to paths, meaning that
	# if we detect that we're already subscribing to a parent, we don't need
	# to subsribe to the children unless we unsub from the parent.
	@method onChange path
	| Subscribes to changes in the database happening at the given path
		if options realtime is False
			return future ()
		else
			# TODO: We could use a delayed to batch subscriptions so that
			# we avoid too many subscriptions at once.
			let res = future () 
			let sub = _addFeedSubscription ({(path):res})
			sub cancelled {_removeFeedSubscription ({(path):sub})}
			# NOTE: We don'T return the subscription, we return the future
			# that is associated with the path and that will be removed then.
			return res

	@method _addFeedSubscription paths
	| Internal method to register/add a subscription to the current feed.
	| Paths should be a `{<string>:Future}` map.
		if options readonly
			return future ()
		else
			let feed = ensureFeed ()
			assert (feed connection, "The feed is missing its connection")
			return feed connection chain {
				let feed_url = feed url
				# We register the futures in the feed subscriptions, which
				# will then be used to notify the clients.
				for v,k in paths
					feed subscriptions[k] ?= []
					feed subscriptions[k] push (v)
				# And then we sub, which may return a future with the
				# actual subscription operation.
				return _subscriptions sub (keys(paths))
			}
	
	@method _removeFeedSubscription paths
	| Removes/unregisters subscriptions from the current feed/channed.
		assert (_feed, "Feed is not available, `ensureFeed` should have been called.")
		if options readonly
			return future ()
		else
			for v,k in paths
				feed subscriptions[k] = col_remove (feed subscriptions[k], v)
				if feed subscriptions[k] length == 0
					feed_subscriptions = col_remove (feed_subscriptions, k)
			return _subscriptions unsub (keys(paths))

	@method ensureFeed
	| Ensures that the EvenSource feed (ie. serverd by the channel interface)
	| is connected to.
		if not _feed
			assert (channelID, "Ensure feed without a channel ID.")
			let url        = _url("/-c/" + channelID, False)
			# NOTE: If the payload has an `event` field, then it won't
			# be a message.
			let feed  = {channelID, url,connection:None,source:Undefined, subscriptions:{}, resub:None, delayed:delayed {connectFeed(feed)}}
			_feed     = connectFeed (feed)
		return _feed

	@method connectFeed feed
	| Connects the feed to the event source.
		assert (feed, "Feed should already exist")
		if len(feed subscriptions) > 0
			if feed resub
				feed resub cancel ()
				feed resub = None
		# TODO: We might want to cancel/fail the future for the feed connection
		# We make sure to close the existing source
		if feed source
			feed source onmessage = None
			feed source onerror   = None
			feed source onopen    = None
			feed source close ()
		if feed connection and not feed connection isFinished
			feed connection cancel ()
		# And now we can create a new connection
		feed connection   = future ()
		let source        = new window EventSource (feed url, {withCredentials:True})
		feed source       = source
		source onmessage  = self . onFeedMessage
		source onerror    = self . onFeedError
		source onopen     = self . onFeedOpen
		return feed

	@method onFeedOpen
		let feed = _feed
		assert (feed, "self._feed was not assigned before", __scope__, "was called")
		assert (feed connection, "self._feed has no connection, it should have one")
		assert (not feed connection isFinished, "Feed connection has finished, it should not have")
		_feed connection set (feed)
		# And now we make sure that the channel is subscribed
		# to the notifications we've sent. This only happens
		# if the connection was a success.
		doFeedResubscribe ()
	
	@method doFeedResubscribe
		let feed = _feed
		if not feed
			return warning (__scope__, "is expecting a feed to be available, none found.")
		if feed resub
			feed resub cancel ()
			feed resub = None
		# We schedule a retry over the given times, in case we have reconnection issues
		feed resub = Retry Times ([500ms, 500ms, 1s, 2s, 3s, 4s], {
			let payload = feed subscriptions ::= {return True}
			http patch (feed url, payload)
		}) failed {
			error ("Giving up on reconnecting to the feed, amoutn of retries exceeded", __scope__)
		}

	@method onFeedError 
	| Tries a reconnection up until the moment the feed's retries
	| quota is exceedeed.
		let feed = _feed
		# We use the delayed's iteration as a counter.
		# NOTE: We're using min here so that we're always reconnecting
		let i = Math min (feed delayed iteration or 0, options retries length - 1)
		# On Chrome, the EventSource might try to reconnect. Here we close
		# the stream and then try to reconnect with a new one.
		if i < options retries length
			let t = options retries[i]
			feed delayed set (t) push ()
			feed source onerror = None
			return True
		else
			# TODO: We might want to trigger some event
			warning ("Lost connection to the backend FlatDB connector.", __scope__)
			return False

	# FIXME: This one is not used, but should be
	@method onFeedDisconnect
		if _feed
			let feed = _feed
			feed source close ()
			feed delayed cancel ()
			_feed    = Undefined
			# TODO: Should we really clear the subscriptions? We might
			# want to reopen the channel. To be investigated.
			# ---
			# We clear the subscriptions, which might send a last
			# update, but we might just as well close the channel.
			# _subscriptions clear ()

	@method onFeedMessage message
		let event = unjson (message data)
		let feed  = _feed
		# NOTE: We create a bridge between the FlatDB event format
		# and the journal format, but they're pretty much the same.
		if options debugFeed
			console log ("[FlatDB] Received channel event", event)
		let op    = event op match
			is "INIT"
				Operation Init   (Undefined, event value, event key)
			is "SET"
				Operation Set    (Undefined, event value, event key)
			is "UPDATE"
				Operation Update (Undefined, event value, event key)
			is "ADD"
				Operation Add    (Undefined, event value, event key)
			is "REMOVE"
				Operation Remove (Undefined, event value, event key)
			is "INSERT"
				Operation Insert (Undefined, event value, event key)
			is "CLEAR"
				Operation Clear  (Undefined, event value, event key)
			_
				error ("Operation not supported:", event, __scope__)
			else
				# There's no op, so we ignore.
				None
		if op
			var path  = event scope
			var scope = []
			# NOTE: This might be problematic if the op is reused or stored,
			# but that should not be the case.
			op scope  = scope
			# We walk up the path of subsriptions and dispatch the operation
			while path
				for sub in feed subscriptions[path]
					sub setPartial (op)
				# We get the prefix of the path
				let i = path lastIndexOf "/"
				if i == -1
					break
				else
					scope splice (0,0, path substring (i +1))
					path  = path substring (0, i)

	# =========================================================================
	# SUBSCRIPTIONS
	# =========================================================================
	
	@method onSubscriptionUpdate subs
	| Patches the feed with the subscription update when necessary. This
	| method is controlled by the subscription object.
		if not subs
			return True
		else
			return http patch (ensureFeed () url, subs) failed (self . onRequestFailure) 

	# =========================================================================
	# HANDLERS
	# =========================================================================

	@method onRequestFailure event
		# We simply forward the event, then listeners are free to 
		# subscribe.
		self ! "RequestFailure" (event)

	# =========================================================================
	# HELPERS
	# =========================================================================

	@method _url path, slash=Undefined
		if slash if True
			if not path[-1] == "/"
				path += "/"
		elif slash is False
			if path[-1] == "/"
				path = path[:-1]
		let res = options prefix + options database + path
		return res

	@method _serialize value
		return json (value)

# -----------------------------------------------------------------------------
#
# SUBSCRIPTIONS
#
# -----------------------------------------------------------------------------

@class Subscriptions
| Manages subscriptions to path, making sure that child subscriptions
| are not made if the parent is subscribed to.

	@property separator  = "/"
	@property attributes = "@"
	@property root       = {}

	@property _doUpdateSubscription = Undefined

	@method does callback
		_doUpdateSubscription = callback
		return self

	@method clear
		let subs = {}
		walkDepth (root, {node,path|
			if _getAttribute (node, "sub")
				subs[path] = False
				return False
		})
		root = {}
		return doUpdateSubscription (subs)

	@method sub paths
	| Requests a subscription to the given path. If a parent is already
	| subscribed, then no subscription order will be executed.
		paths = list(paths)
		let subs = {}
		var has_subs = False
		for path in paths
			# We detect if the given path has a parent that is already
			# subscribed.
			var is_subbed = False
			let node      = ensurePath (path, {
				if _getAttribute (_, "sub")
					is_subbed = True
			})
			# TODO: When  subscribing to a parent AFTER having subscribed
			# to the child, we might want to effectively unsub.
			_setAttribute (node, "sub", _getAttribute (node, "sub", 0) + 1)
			# If a parent is already sub'ed, we have nothing to do, but
			# if there is none, we do need to subscribe.
			if not is_subbed
				subs[path] = True
				has_subs = True
		# We add unsubscriptions to nested paths. This could be
		# an option.
		for is_subbed,path in subs
			let node = resolveNode (path)
			let prefix = path + separator
			walkDepth (node, {n,p|subs[prefix + p] = False}) if is_subbed
		return doUpdateSubscription (subs if has_subs else None)

	@method unsub paths
	| Requests an unsubscription of the given path. Any child path was
	| subscribed to will then generate a subscription order.
		paths = list (paths)
		let subs = {}
		for path in paths
			# Any descendant of the node at the given path that has a
			# "sub" attribute that is defined and not 0 is then aggregated
			# in the `subbed` list.
			let node   = resolveNode (path)
			_setAttribute (node, "sub", _getAttribute (node, "sub") - 1)
			# We start by unsubscibing the parent
			subs[path] = False
			# And now we get the nodes that we need to unsubscribe from.
			walkBreadth (node, {n,p|
				if _getAttribute (n, "sub")
					subs[path + separator + p] = True
			})
		return doUpdateSubscription (subs)

	@method walkPath path, callback
	| Walks all the registered elements in the given path
		let p      = parsePath (path)
		var prefix = ""
		var node   = root
		if p length == 0
			callback (None, 0)
			return self
		else
			for k,i in p
				if node[k] is Undefined
					return self
				else
					node   = node[k]
					prefix = k if i == 0 else prefix + sep + k
					if callback (prefix, i) is False
						return self
	
	@method walkBreadth node, callback, prefix=None
	| Does a breadth first search.
		# NOTE: We might prefer to have something like a per-level
		# iteration.
		for v,k in node
			if k is not attributes
				let p = k if prefix is None else prefix + separator + k
				if callback (v, p) is False
					return False
		for v,k in node
			if k is not attributes
				let p = k if prefix is None else prefix + separator + k
				if walkBreadth (v, callback, p) is False
					return False
		return self

	@method walkDepth node, callback, prefix=None
		for v,k in node
			if k is not attributes
				let p = k if prefix is None else prefix + separator + k
				if callback (v, p) is not False
					walkDepth (v, callback, p)
		return self

	@method resolveNode path
	| Returns the node at the given path, if any.
		var node = root
		for k,i in parsePath (path)
			if node[k] is Undefined
				return None
			node = node[k]
		return node

	@method ensurePath path, callback
	| Ensures that all the elements of the given path exist,
	| and return the very last one.
		var node = root
		for k,i in parsePath (path)
			node[k] ?= {}
			node = node[k]
			if callback 
				callback (node, i)
		return node
	
	@method listSubscribed full=False
		let res = []
		walkDepth (root, {node,path|
			if _getAttribute (node, "sub")
				res push (path)
				return full
		})
		return res
	
	@method parsePath path:String
	| Parses the given `path`, returning an array of path elements.
		return path if path is? Array else path split (separator)
	
	@method _setAttribute node, name, value
	| Helper to set the attribute with the given `name` to the given `value`
	| within the given `node`.
		node[attributes] ?= {}
		node[attributes][name] = value
		return value
	
	@method _getAttribute node, name, value
	| Helper to get the value of the  attribute with the given `name`
	| within the given `node`, returning `value` if no such attribute is defined.
		node[attributes] ?= {}
		let v = node[attributes]
		let w = v[name] if v else Undefined
		return value if w is Undefined else w

	# =========================================================================
	# ACTIONS
	# =========================================================================

	@method doUpdateSubscription paths
		if _doUpdateSubscription
			return _doUpdateSubscription (paths)
		else
			return self

# -----------------------------------------------------------------------------
#
# MAIN
#
# -----------------------------------------------------------------------------

@function connect config
	return new FlatConnector () connect (config)

# EOF
