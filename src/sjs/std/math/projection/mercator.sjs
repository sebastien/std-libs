@feature sugar 2
@module std.math.projection.mercator

@class Mercator
| Implements a normalized mercator projection. All values are projected
| to and from a normalized ℝ² space {x,y}∊[0…1].

	@shared Instance        = Undefined

	@shared DEG_TO_RAD      = 180 / Math PI
	@shared RAD_TO_DEG      = Math PI / 180
	@shared PIXEL_TO_DEGREE = 1 / 360.0
	@shared PIXEL_TO_RADIAN = 1 / (2 * Math PI)

	@operation Get
		Instance ?= new Mercator ()
		return Instance

	@property _center = [0.5, 0.5]

	@method project lat, lng, scaling=1
		if lat is? Array
			lng = lat[1]
			lat = lat[0]
		let x = _center[0] + (lng * PIXEL_TO_DEGREE)
		let f = Math min (
			Math max (Math sin ( lat * RAD_TO_DEG), -0.9999)
			0.9999
		)
		let y = _center[1] + 0.5 * Math log((1 + f) / (1 - f)) * (0 - PIXEL_TO_RADIAN)
		return [x * scaling, y * scaling]

	@method unproject nx, ny, scaling=1
	| Converts from a normalized (`nx`, `ny`) point to a (`lat`, `lng`) pair
		if nx is? Array
			ny = nx[1]
			nx = nx[0]
		let lng = ((nx/scaling) - _center[0]) / PIXEL_TO_DEGREE
		let lat = (2 * Math atan (Math exp (((ny/scaling) - _center[1]) / ( 0 - PIXEL_TO_RADIAN))) - (Math PI / 2)) * DEG_TO_RAD
		return [lat, lng]


@function mercator lat, lng, scaling=1
	return Mercator Get () project (lat, lng, scaling)

@function unmercator x, y, scaling=1
	return Mercator Get () unproject (x, y, scaling)

# EOF - vim: ts=4 sw=4 noet
