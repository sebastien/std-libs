@feature sugar 2
@module std.io

@enum ChannelStatus     = INIT | OPEN | CLOSED | UNAVAILABLE
@enum Capability        = ADD  | LIST | HAS | UPATE | REMOVE

# NOTE: Placeholder for now
#
# @class Stream
#
# 	@method read
#
# 	@method write
#
# 	@method seek
#
# @class File: Stream

# TODO: We should merge std.io.websocket and std.api.workers here
@class Channel

	@property _status:ChannelStatus = Undefined

	@getter status
		return _status
	
	@getter isInitializing
		return _status is INIT

	@getter isOpen
		return _status is OPEN

	@method open:Future

	@method put:Future value:Any

	@method get:Future

	@method close:Boolean


@class Storage

	@method add:Future

	@method list:Future

	@method has:Future

	@method update:Future

	@method remove:Future



# @class WebSocket: Channel

