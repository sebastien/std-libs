@feature sugar 2
@module  std.api.gl.camera
@import  error, NotImplemented from std.errors
@import  TUpdatable from std.patterns.updatable
@import  lerp, abs, deg, sin, cos, PI from std.math
@import  pt      from std.math.geom.point
@import  vec     from std.math.geom.vector

# -----------------------------------------------------------------------------
#
# CAMERA
#
# -----------------------------------------------------------------------------

@class Camera: TUpdatable
| A generic abstract camera class. By default, this camera has
| no specificy behaviour, but it returns the `focus`, `position`
| and `up` vectors.
|
| Note that is is left up to you to generate a matrix if you'd like
| to generate a projection from the camera settings.

	@property position       = pt (0, 0,-1)
	@property focus          = pt (0, 0, 0)
	@property up             = vec(0,-1, 0)
	@property isOrthographic = False

	@property _isDirty       = True
	@property _fov           = 20
	@property _distance      = 4

	@constructor
		position !+ "Update" (setDirty)
		focus    !+ "Update" (setDirty)
		up       !+ "Update" (setDirty)

	@getter isDirty
		return _isDirty

	@getter fov
		return _fov

	@setter fov value
		if _fov != value
			_fov = value
			setDirty ()

	@getter distance
		return _distance

	@setter distance value
		if _distance != value
			_distance = value
			setDirty ()

	@method moveTo x, y, z
		position set (x,y,z)
		return self

	@method lookAt x, y, z
		focus set (x,y,z)
		return self

	@method setDirty
		_isDirty = True
		# FIXME: The problem might be that in that case we're triggering
		# an update whil the state has not been recomputed 100%
		doUpdate ()
		return self

	# NOTE: This is a lazy update
	@method update view
	| Sets `isDirty` to false and triggers the `Update`
		if _isDirty
			_isDirty = False
			_update (view)

	@method _update view

# -----------------------------------------------------------------------------
#
# TWEENED CAMERA
#
# -----------------------------------------------------------------------------

# TODO: Would be nice
# @class TweenedCamera: Camera
# | A camera that interpolates between two given cameras
# 
# 	@property cameraA
# 	@property cameraB
# 	@property _k = 0.5
# 
# 	@constructor cameraA, cameraB
# 		self cameraA = cameraA
# 		self cameraB = cameraB
# 		bindCamera (cameraA)
# 		bindCamera (cameraB)
# 
# 	@setter k value
# 		_k  = value
# 		onCameraUpdated ()
# 
# 	@getter k
# 		return _k
# 
# 	@method bindCamera camera
# 		camera !+ "Update" (onCameraUpdated)
# 		return self
# 
# 	@method unbindCamera camera
# 		camera !- "Update" (onCameraUpdated)
# 		return self
# 	
# 	@method onCameraUpdated
# 		position lerp (cameraA position, cameraB position, _k)
# 		lookAt   lerp (cameraA lookAt,   cameraB lookAt,   _k)
# 		# FIXME: Not usure about that
# 		up       lerp (cameraA up,       cameraB up,       _k) unit ()

# EOF
