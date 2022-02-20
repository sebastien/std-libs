@feature sugar 2
@module  std.api.twgl
| A thin OO wrapper around the fantastic [TWGL library](https://twgljs.org/).
| The purpose of this module is to offer an intermediate abstraction layer
| somewhere between TWGL and [THREE](https://threejs.org/), in a similar way as [REGL](http://regl.party/)
@import  Measure                                  from std.api.dom
@import  pt                                       from std.math.geom.point
@import  vec                                      from std.math.geom.vector
@import  TIdentified                              from std.patterns.ids
@import  merge                                    from std.collections
@import  BadArgument,assert,warning,error      from std.errors
@import  now, frame                               from std.io.time
@import  rad, deg from std.math
@import  runtime.window as window
@import  DirectEncodedArray, IndirectEncodedArray from std.math.geom.data
@import  Camera as GLCamera from std.api.gl.camera
@import  twgl

# SEE: https://twgljs.org/docs/

# https://www.khronos.org/opengl/wiki/Primitive
@enum RenderType = POINTS | LINES | TRIANGLES

@shared VERTEX_SHADER   = "attribute vec4 position;void main(){gl_Position = position;}"
@shared FRAGMENT_SHADER = "precision mediump float; void main() { gl_FragColor = vec4(0.0,0.0,0.0,1.0); }"
# -----------------------------------------------------------------------------
#
# RENDER PASS
#
# -----------------------------------------------------------------------------

@class RenderPass: TIdentified
| A pass wraps arrays, uniforms and a vertex & fragment shaders ready to be
| applied to a view.

	@property _type           = TRIANGLES
	@property arrays          = {
		position: new Float32Array (3)
		color   : new Float32Array (4)
	}
	@property _uniforms       = {}
	@property _fragment       = Undefined
	@property _vertex         = Undefined

	@property view           = Undefined
	@property _programInfo    = Undefined
	@property _bufferInfo     = Undefined
	@property isShaderDirty   = True
	@property isArrayDirty    = True

	# =========================================================================
	# INTERNAL BINDINGS
	# =========================================================================

	@method bind view:View
	| Binds this pass to the given view.
		if self view is not view
			self view = view
			_programInfo  = None
			_bufferInfo   = None
			isShaderDirty = True
			isArrayDirty  = True
		return self

	@method unbind view:View
		self view = Undefined
		_programInfo  = None
		_bufferInfo   = None
		isShaderDirty = True
		isArrayDirty  = True
		return self

	# =========================================================================
	# HIGH-LEVEL API
	# =========================================================================

	@method of type
	| Sets the type of rendering pass (points, lines, triangles) 
		_type = type
		return self

	@method uniform name, value=Undefined
	| Sets the uniforms that will be used in this pass.
		if name is? String
			if value is Undefined
				return _uniforms [name]
			else
				_uniforms[name] = value
				return self
		else
			for v, k in name
				_uniforms[k] = v
			return self

	@method attr name, value=Undefined
	| Gets/sets a single attribute or many attributes. Attributes can
	| be either regular arrays or `std.math.geom.data` arrays.
		if attr is? String
			if value is Undefined
				return arrays[name]
			else
				arrays[name] = value
				isArrayDirty = True
		else
			for v,k in name
				arrays[k] = v
			isArrayDirty = True
		return self
	
	@method vertex shader
		assert (shader,  " Vertex shader shader is not defined", shader)
		_vertex = _extractShaderText (shader)
		assert (_vertex,  "Vertex shader has not text defined:", _vertex)
		isShaderDirty   = True
		return self

	@method fragment shader
		assert (shader, "Fragment shader is not defined", shader)
		_fragment       = _extractShaderText (shader)
		assert (_fragment,  "Fragment shader has not text defined:", _fragment)
		isShaderDirty   = True
		return self

	# =========================================================================
	# INTERNALS
	# =========================================================================

	@method update
	| Updates the buffer and program information if they are dirty.
		if isArrayDirty
			_updateBufferInfo  ()
		if isShaderDirty
			_updateProgramInfo ()
		return self

	# =========================================================================
	# TWGL WRAPPERS
	# =========================================================================
	
	@method _extractShaderText shader
		# Here we need to create DOM nodes for TWGL. We leverage the fact
		# that render passes are identified and that script nodes are hidden.
		# We always extract the text content from given nodes.
		if shader is? String and shader[0] == "#" and shader indexOf "\n" == -1
			let n = document getElementById (shader[1:])
			assert (n, "Cannot find " + type + " shader node '" + shader + "' in document")
			shader = n innerText
		let text = shader match
			is? Node   → shader innerText
			is? String → shader
			_          → error (BadArgument, "shader", shader, [Node, String], __scope__)
			else       → None
		if text and text indexOf "\n" == -1
			# TWGL will assume a text without an EOL is a node id
			return text + "\n"
		else
			return text

	@method _updateProgramInfo
		assert (view, "Pass has no view, use `pass bind (view)` before")
		# We create default vertex and fragment shaders here
		vertex   (VERTEX_SHADER)   if not _vertex
		fragment (FRAGMENT_SHADER) if not _fragment
		if view gl
			# We need to support environments without WebGL
			_programInfo = twgl createProgramInfo (
				view gl
				[_vertex, _fragment]
				["position", "color"]
				[0, 1]
			)
		else
			_programInfo = None
		isShaderDirty = False
		return _programInfo

	@method _updateBufferInfo
		# This takes care of expanding {Direct,Indirect}EncodedArray
		# into native arrays that TWGL can process
		let v = arrays ::= {
			return _ match
				is? DirectEncodedArray
					# NOTE: We use ALL the data here, disregarding
					# the sentinel.
					{
						numComponents : _ step
						data          : _ data
					}
				is? IndirectEncodedArray
					error ("Indirect encoded array not supported yet", _, __scope__)
				else
					_
		}
		# We can create the buffer arrays and set the dirty flag to false.
		_bufferInfo = twgl createBufferInfoFromArrays (view gl, v) if view gl else None
		isArrayDirty = False
		return _bufferInfo
	
	@method _applyUniforms t, dt, t0, value=self _uniforms
		# TODO: We might want to prevent recursion beyond level 2
		if value is? Object or value is? Array
			return value ::= {v,k|
				let r = v match
					is? Function → v(t, dt, t0, self)
					is? Array    → v
					is? Object   → v ::= {_applyUniforms (t, dt, t0, _)}
					else         → v
				return r
			}
		else
			return value

	# =========================================================================
	# MAIN RENDERING
	# =========================================================================

	@method apply t, dt, t0, i=0
	| Applies the given pass.
		# We update everything to make sure the shaders and program are
		# up to date.
		update ()
		let gl = view gl
		let fb = view _fallback
		# We prepare the uniforms
		_uniforms = merge (_uniforms, view uniforms, True)
		let u  = view _camera updateUniforms (_applyUniforms (t, dt, t0, _uniforms))
		u t   ?=  t
		u dt  ?= dt
		u t0  ?= t0
		u width ?= view width
		u height ?= view height
		# FIXME: There is no way to see the last rendered uniforms at this stage.
		# TODO: Should we enalbe GL options?
		# gl.enable(gl.DEPTH_TEST);
		# gl.enable(gl.CULL_FACE);
		if gl
			# FIXME: This should be cached
			# We prepare the pass type (we might want to calcualte that only
			# when the _type changes)
			let t  = _type match
				is POINTS     → gl POINTS
				is LINES      → gl LINES
				is TRIANGLES  → gl TRIANGLES
				else          → Undefined
			gl useProgram                (_programInfo program)
			twgl setBuffersAndAttributes (gl, _programInfo, _bufferInfo)
			twgl setUniforms             (_programInfo, u)
			twgl drawBufferInfo          (gl, _bufferInfo, t)
		elif fb
			fb (self, t, dt, t0, i)

# -----------------------------------------------------------------------------
#
# CAMERA
#
# -----------------------------------------------------------------------------

# TODO: This should be abstracted out into a GL module maybe?
@class Camera: GLCamera
| An abstract camera class that works for both orthographic and perspective
| projections.

	# NEW
	@property _perspectiveM     = twgl m4 identity ()
	| The perspective matrix, identify for orthographic.

	@property _projectionM      = twgl m4 identity ()
	| The projection to the view

	@property _cameraM          = twgl m4 identity ()
	| The projection to the camera plane

	@property _viewM           = twgl m4 identity ()
	| The inverse projection from the camera

	@property isOrthographic  = True
	@property _fov            = 50
	@property _distance       = 4

	@getter projectionMatrix
		return _projectionM
	
	@method updateUniforms uniforms
	| Updates the given uniforms by assigning the matrices defined
	| in the camera.
		# NEW
		uniforms projectionM    ?= _projectionM
		uniforms cameraM        ?= _cameraM
		uniforms viewM          ?= _viewM
		uniforms cameraPosition ?= position xyzw
		return uniforms

	@method _update view
		let aspect  = view aspect
		let w       = view width
		let h       = view height
		let x       = position x
		let y       = position y
		let z       = position z
		let eye     = position xyz
		let look_at = focus    xyz
		let up      = self up  xyz
		# SEE: https://gamedev.stackexchange.com/questions/150173/lookat-with-orthographic-camera-gl-matrix
		if isOrthographic
			let p_scale  = Math tan (rad (_fov / 2)) * _distance
			twgl m4 ortho (
				(0 - p_scale) * aspect
				(0 + p_scale) * aspect
				(0 - p_scale)
				(0 + p_scale)
				400, -400, _perspectiveM
			)
		else
			twgl m4 perspective(rad(_fov), aspect, 0.1, 1000.0, _perspectiveM)
		# There are some pretty good explanations of how that works.
		twgl m4 lookAt   (eye, look_at, up, _cameraM)
		# Inverse the operation for camera movements, because we are actually
		# moving the geometry in the scene, not the camera itself.
		twgl m4 inverse  (_cameraM,      _viewM)
		# We apply the perspective matrix to the view matrix to get
		# the projection matrix.
		twgl m4 multiply (_perspectiveM, _viewM, _projectionM)


# -----------------------------------------------------------------------------
#
# VIEW
#
# -----------------------------------------------------------------------------

@class View
| The view wraps a canvas node, the render passes and a camera/projection. It 
| is the main interface to this module's functionality.

	@property _node     = Undefined
	@property _aspect   = 0
	@property _t0       = Undefined
	@property _tn       = Undefined
	@property _updater  = Undefined

	# Public API
	@property version   = 1.0
	@property gl        = Undefined
	@property _fallback = Undefined
	| A function that is called with `(view|pass,t,dt,t0,index)` when WebGL
	| is not available.

	@property _camera   = new Camera ()
	@property enableCameraUpdate = True
	@property isRunning = False
	@property uniforms  = {}
	@property size      = [0,0]
	@property _passes   = []

	@constructor node:Node, version=1
		self version = version
		if node is? Node
			setNode (node)
		_camera !+ "Update" (onCameraUpdate)
	
	# =========================================================================
	# ACCESSORS
	# =========================================================================

	@getter camera
		return _camera
	
	@setter camera value
		if _camera != value
			_camera !- "Update" (onCameraUpdate)
			value   !+ "Update" (onCameraUpdate)
			_camera = value

	@getter aspect
		return _aspect

	@getter width
		return size[0]

	@getter height
		return size[1]

	@method setNode node, width=Undefined, height=Undefined
		assert (node is? Node, "Expecting a Node, got:", node)
		assert (node getContext, "Node has no `getContext` method", node)
		_node = node
		let gl_version = "webgl2" if version >= 2 else "webgl"
		# SEE:https://stackoverflow.com/questions/39341564/webgl-how-to-correctly-blend-alpha-channel-png
		gl   = node getContext (gl_version, {premultipliedAlpha: False})
		if not gl
			warning ("WebGL not available on given node", node, __scope__)
		else
			pass
			# gl pixelStorei (gl UNPACK_PREMULTIPLY_ALPHA_WEBGL, True)
			# gl enable (gl BLEND)
			# gl blendFunc   (gl SRC_ALPHA, gl ONE_MINUS_SRC_ALPHA)
		resize (width, height)
		return self

	# =========================================================================
	# HIGH-LEVEL API
	# =========================================================================

	@method clear
	| Removes any previously registered pass
		_passes :: {_ unbind (self)}
		_passes = []
		return self

	@method add index=-1
	| Adds a new rendering pass to this view
		let p = new RenderPass () bind (self)
		if index < 0 or index >= _passes length
			_passes push (p)
		else
			_passes splice (index, 0, p)
		return p
	
	@method remove renderPass
		if renderPass
			renderPass unbind (self)
			_passes = _passes ::? {_ is not renderPass}
		return renderPass

	@method set uniforms
	| Sets the uniforms used in this view
		# TODO: We might want to normalize that
		self uniforms = uniforms
		return self
	
	@method points index=-1
	| Returns a new POINTS pass, inserted a the given `index` (optional).
		return add (index) of (POINTS)

	@method triangles index=-1
	| Returns a new TRIANGLES pass, inserted a the given `index` (optional).
		return add (index) of (TRIANGLES)
	
	@method does updater:Function
	| Sets the callback that will be invoked each time the view is rendered
		_updater = updater
		return self
	
	@method fallback renderer:Function
	| Sets the callbakc that will be invoked to render when WebGL is not
	| available.
		_fallback = renderer
		return self
	
	# =========================================================================
	# CAMERA
	# =========================================================================

	@method scale pixels
		return fit (1.0, pixels)

	@method fit world=1.0, projected=1.0
	| Updates the `fov` so that the given world `width` covers the
	| view's width.
		if _camera isOrthographic
			let a      = aspect
			# We want `width` world units to span the width of the view with
			# the current distance.
			let s       = projected / self width
			let theta   = 2 * Math atan ((world / 2) / _camera _distance) / aspect
			_camera fov = deg(theta / s)
			render ()
		else
			warning ("Not implemented for non-orthographic camera", __scope__)
		return self

	@method fitWidth world=1.0, width=self width
		return fit (world, width)

	@method fitHeight world=1.0, height=self height
		return fit (world, height)

	# =========================================================================
	# ANIMATION
	# =========================================================================

	@method start
		if isRunning is False
			isRunning = True
			step ()
		return self

	@method step
		render ()
		if isRunning
			frame (step)
	
	@method stop
		isRunning = False
		return s

	# =========================================================================
	# HANDLERS
	# =========================================================================

	@method onCameraUpdate
	| Automatically renders the view if the camera has changed and the view
	| `enableCameraUpdate` is true.
		if enableCameraUpdate
			render ()

	# =========================================================================
	# RENDERING
	# =========================================================================
	
	@method resize width=Undefined, height=Undefined
		if width is Undefined
			let s =  Measure size (_node)
			width   = s[0]
			height  = s[1]
		if width != size[0] or height != size[1]
			_node setAttribute ("width",  width)
			_node setAttribute ("height", height)
			if gl
				twgl resizeCanvasToDisplaySize (gl canvas)
			elif _node
				# If there's not GL canvas, then we assume we have a canvas
				# and set the properties
				_node width = width
				_node height = height
				_node setAttribute ("width", width)
				_node setAttribute ("height", height)
			size[0] = width
			size[1] = height
			_aspect = size[0] / size[1]
			_camera setDirty ()
			return True
		else
			return False

	@method render t, dt, t0
		# This ensures that (t,dt,t0) is properly set
		t   ?= now ()
		t0  ?= t if _t0 is Undefined else _t0
		_t0 ?= t0
		t  -= t0
		_tn ?= t
		# NOTE: We might want to cap the dt
		dt  ?= t - _tn
		_tn  = t
		# We invoke the updater
		_updater (t, dt, t0, self) if _updater
		# We update the camera (ie. the projection matrices)
		_camera update (self)
		# FIXME: Is this necessary ?
		# This sets the coordinates of the drawing area within the canvas
		if gl
			gl viewport (0, 0, size[0],size[1])

			# TODO: We should parameter that
			gl clearColor(0.0, 0.0, 0.0, 0.0)
			gl clear (gl COLOR_BUFFER_BIT)
			# FIXME: On firefox, the blending creates artifacts
			# gl enable (gl BLEND)
			# gl blendFunc (gl SRC_ALPHA, gl SRC_ALPHA)
		elif _fallback 
			_fallback (self, t, dt, t0, -1)
		# We successively apply each pass
		for p,i in _passes
			p apply (t, dt, t0, i)
		return self

# EOF - vim: ts=4 sw=4 noet
