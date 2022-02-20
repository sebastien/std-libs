@feature sugar 2
@module std.patterns.visitor


# @adapter Visitable[T]
#
# 	@abstract @method hasNext node:T
#
# 	@abstract @method hasPrevious node:T
#
# 	@abstract @method next node:T
#
# 	@abstract @method previous node:T
#
# 	@abstract @method parent node:T
#
# @end

@class Visitor


@class BreadthFirstVisitor

@class DepthFirstVistor

