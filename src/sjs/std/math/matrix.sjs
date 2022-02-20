@feature sugar 2
@module  std.math.matrix

# SEE: https://webglfundamentals.org/webgl/lessons/webgl-2d-matrices.html
# SEE: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Matrix_math_for_the_web
# SEE: http://glmatrix.net/

@class Matrix

	@property _rows = 4
	@property _cols = 4
	@property data  = None

	@operation Translate2D dx, dy
		return new Matrix (3,3, [
			1,  0, 0
			0,  1, 0
			dx, dy, 1
		])
	
	@operation Scale2D sx, sy
		return new Matrix (3,3, [
			sx,  0, 0
			0,  sy, 0
			0,   0, 1
		])

	@constructor rows=4, cols=4, values=None
		_rows = rows
		_cols = cols
		data  = new Float64Array (_rows * _cols)

	@method identity
		var y = 0
		var o = 0
		while y < _rows
			var x = 0
			while x < _cols
				data[o] = 1 if x == y else 0
				o += 1
				x += 1
			y += 1
		return self
	
	@method inverse
		# https://www.mathsisfun.com/algebra/matrix-inverse.html

	@method values values=Undefined
		if values is Undefined
			return data
		else
			var i = 0
			let l = Math min (data length, values length)
			while i < l
				data[i] = values[i]
				i += 1
			return self
	
	@method repr
		return data

@class Matrix3: Matrix

	@constructor
		super (3, 3)
	
	@method translate x=0, y=0
		data[6] = x
		data[7] = y
		return self
	
	@method scale x=1, y=x
		data[0] = x
		data[4] = y
		return self

@class Matrix4: Matrix

	@constructor
		super (4, 4)


@function mat3
	return new Matrix3 ()

@function mat4
	return new Matrix4 ()

# EOF
