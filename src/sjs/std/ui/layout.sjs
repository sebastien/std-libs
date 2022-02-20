@feature  sugar 2
@module   std.ui.layout
| A collection of functions that work with `{x,y,w,h}` objects and help
| with laying them out.
|
| In this module, `anchor` and `region` parameters are expected to be
| in *normalized relative* coordinates, which means that they
| are expected to be between `0` and `1`, and the scaling will be made
| based on the given `source:{x,y,w,h}` object.

# FIXME: It's probably best to use [x,y,w,h] actually, especially as otherwise
# these position attributes are going to be mixed with the others, and it's
# a pain for transitions.
@shared ANCHORS = {
	O  : [0.0,  0]
	N  : [0.5,  0]
	S  : [0.5,  1]
	E  : [1.0,  0.5]
	W  : [0.0,  0.5]
	C  : [0.5,  0.5]
	NE : [1.0,  0.0]
	NW : [0.0,  0.0]
	SE : [1.0,  1.0]
	SW : [0.0,  1.0]
}

@function grid size, step
	let r = []
	for y in 0..size[1]
		for x in 0..size[0]
			r push {x:x * step[0], y:y * step[1]}
	return r

@function position source, anchor=[0, 0]
| Returns the `{x,y}` position of the  given `[xo,yo]` anchor, where
| `xo` and `yo` are relative to the `source.w` and `source.h`.
	anchor = ANCHORS[anchor] if anchor is? String else anchor
	return {
		x : (source x or 0) + ((source w or 1) * (anchor[0] or 0))
		y : (source y or 0) + ((source h or 1) * (anchor[1] or 0))
	}

@function relposition source, anchor=[0, 0]
| Returns the actual `{x,y}` position of the `anchor` relative
| to the source `{x,y}` coordinates.
	anchor = ANCHORS[anchor] if anchor is? String else anchor
	return {
		x : (source w or 0) * (anchor[0] or 0)
		y : (source h or 0) * (anchor[1] or 0)
	}

@function subset source, region=[0,0,1,1], offset=[0,0,0,0]
| Returns the `{x,y,w,h}` rectangle of `source` that cover the given `[rx,ry,rw,rh]`
| region given in normalized relative coordinates.
	return {
		x : (source x or 0) + ((source w or 0) * (region[0] or 0)) - (offset[0] or 0)
		y : (source y or 0) + ((source h or 0) * (region[1] or 0)) - (offset[1] or 0)
		w : (source w or 1) * (region[2] or 0) - (offset[2] or 0)
		h : (source h or 1) * (region[3] or 0) - (offset[3] or 0)
	}

@function place source, sourceAnchor, target, targetAnchor, offset=Undefined
| Updates `source` so that the position of its `sourceAnchor` is at the
| position of the `targetAnchor` on the target.
	sourceAnchor = ANCHORS[sourceAnchor] if sourceAnchor is? String else sourceAnchor
	targetAnchor = ANCHORS[targetAnchor] if targetAnchor is? String else targetAnchor
	let s = relposition (source, sourceAnchor)
	let t = position    (target, targetAnchor)
	source x = t x - s x
	source y = t y - s y
	if offset
		source x += offset[0] or 0
		source y += offset[1] or 0
	return source


# EOF - vim: ts=4 sw=4 noet
