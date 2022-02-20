@feature sugar 2
@module std.math.geom.data
| Provides encoding of structured values as array of floats, as well as a
| performance-minded implementation of point and vector function to
| work on this data.

@import error, warning, assert, BadArgument, NotImplemented from std.errors
@import sprintf, subtype, type from std.core
@import TFlyweight                          from std.patterns.flyweight
@import TPoint                              from std.math.geom.point
@import TVector                             from std.math.geom.vector

#SEE: Three BufferAttribute https://threejs.org/docs/index.html#api/core/BufferAttribute
# TODO: Abstract away the dependence to three.js

@shared X = 0
@shared Y = 1
@shared Z = 2
@shared I = 3

# -----------------------------------------------------------------------------
#
# ENCODED ARRAY
#
# -----------------------------------------------------------------------------

@class IEncodedArray
| An encoded array wraps a native array in an API that minimizes object 
| allocations and allows for pluggable encoders/decoders for the data.
| In practice, encoded arrays allows you to store different types of 
| data (points, segments, faces) in an efficient data structure and 
| accesses and manipulate this data with a high-level API.

	@shared ARRAY_TYPE = Float32Array

	@property data     = Undefined
	| The data is the array that holds the actual data

	@property _sentinel = 0
	| The sentinel is the offset of the end of the last data point
	| within data.

	@property _growth   = 100
	| The number of elements the array needs to create each time
	| it reaches its capacity.

	@property _encoding = PointEncoding
	| The default encoding for this array

	@constructor capacity=100, encoding=Undefined
		# We set the encoding, which would set the arity if not
		# defined.
		if not encoding
			pass
		elif subtype(encoding, Encoding)
			_encoding = encoding
		else
			error ("Encoding expected an Encoding subclass, got", encoding, __scope__)
		# The capacity might be a number, an array or an
		# encoded array.
		match capacity
			is? Array or capacity is? ARRAY_TYPE
				_init (capacity length)
				set (capacity)
			is? IEncodedArray
				data    = capacity data
			is? Number
				data    = new ARRAY_TYPE (capacity * arity)
			else
				error (BadArgument, "capacity", capacity, [Array, IEncodedArray, Number], __scope__)
		assert (data, "Encoded array has no data after construction")
	
	@method copy
	| Returns a copy of this array with an entirely copied data.
		let t = type(self)
		let res = new t (new ARRAY_TYPE(data), _encoding)
		res _sentinel = _sentinel
		return res

	@group TypeGetters

		@getter isIndirect
			return False

		@getter isPoints
			return _encoding IS_POINT

		@getter isEdges
			return _encoding IS_EDGE

		@getter isFaces
			return _encoding IS_FACE

	@group DataAccessors

		@getter encoding
		| Returns the current encoding for this array
			return _encoding

		@setter encoding value
		| Updates the current encoding for this array
			self _encoding = value

		@getter array
		| Returns a primitive array with `length` elements.
			return data slice (0, length)

		@getter arity
		| Returns the arity of the encoding, which is the number of physical
		| array element that span an encoded item.
			return _encoding ARITY if _encoding else 1

		@getter stride
		| The stride, which is 0 (stride is only really relevant for encodings)
			# NOTE: Right now, we don't support stride
			return 0

		@getter step
		| The step equals `arity + stride`.
			return arity + stride

		@getter capacity
		| Returns the maximum number of encoded elements that this array can contain.
			return Math floor (data length / step)

		@getter count
		| Returns the number of encoded elements currently in this array.
			return Math floor (length / step)

		@getter length
		| Returns the number of cells with data (`count * step`)
			return _sentinel

	@group Lifecycle

		@method init count=self capacity
			let n = count - self count
			if n > 0
				add (n)
			return self

		# TODO: Support the functor to initialize the new ones
		@method expand functor=Undefined
		| Expands the number of items in this array to cover its
		| full capacity.
			_sentinel = capacity * step
			return self

		@method clear erase=False
		| Clears this array. If `erase=True`, this will actually clear
		| everything, otherwise only the sentinel is reset.
			if erase
				var i = 0
				while i < data length
					data[i] = 0
					i += 1
			# We reset the sentinel to 0
			_sentinel = 0
			return self

	@group Adding

		# NOTE: It's confusing because here we're adding raw data points
		# while with grow we're adding encoded elements.
		# TODO: Maybe remove this one
		@method set args...
		| Sets the content of this array to be the given data. The interpretation
		| of the data is going to be dependent on the encoding and the type of
		| supported data depends on the array type.
			if args length == 1 and args[0] is? ARRAY_TYPE
				# We set from an existing array of the same type
				let l = args[0]
				let n = l length
				# NOTE: I think we should not copy
				# data  = new ARRAY_TYPE (n)
				# data set (l, 0)
				data      = l
				_sentinel = n
			else
				args = args[0] if args length == 1 and args[0] is? Array else args
				assert (args length % step == 0, "Given arguments expected to be a multiple of", step, "got", args length)
				# We make sure we have enough room for the args
				if not data
					_init (args length)
				else
					grow (args length)
				var i = 0
				# We copy the subset of the array
				while i < args length
					data[i] = args[i]
					i += 1
				# We update the sentinel to the next cell with data
				_sentinel = i
				return self

		# TODO: Difference between add and append?
		# TODO: Should be add functor|element, count
		# TODO: This is confusing, should be refactored
		# FIXME: This should be either `addN` or `generate`
		@method add count, functor=Undefined
		| Adds `count` elements to this array, each being
		| to be an array of the given arity
			if count is? Encoding
				pass
			if count is? Function
				return add (1, count)
			else
				let i = _add(count)
				each (functor, i, i + count, i) if functor
				return self

		# TODO: Should be a low-level function
		@method append element
		| Adds ONE element to the encoded array. The element is expected
		| to be an array of at most the given arity, if it's left
		| it will be padded with 0.
			# If we're below capacity, we grow the array. The growth
			# strategy might be a bit smarter than that.
			if count >= capacity
				grow (capacity + _growth)
			# Now we copy up to STEP values from the element array
			var o = _sentinel
			var i = 0
			let j = Math min (element length, step)
			# NOTE: We might leverage values.set
			while i < j
				# We make sure the values are 0 if not numbers
				data[o + i] = element[i] or 0
				i += 1
			# And we fill the rest with zeros
			while i < step
				data[o + i] = 0
				i += 1
			# We update the sentinel
			_sentinel = i
			return self

		# @method push element
		# | Alias to add
		# 	return add (element)

		@method grow count
		| Grows this array if needed to have `count` more elements.
			if capacity < count
				_resize (count)
			return self

	@group Accessing

		@method get index
		| Returns an `Encoding` instance for the element at the given index
		| in the array (based on the encoding)
			assert (_encoding, "IEncodedArray has no encoding attached", __scope__)
			return _encoding Create (self, index)

		@method at index
		| An alias for `get() 
			return get (index)

		@method each functor:Functor, start=0, end=self count, offset=0
		| Executes the given `functor` from `start` to `end`, passing
		| `(e,i-offset,j-offset,offset)` to the functor, with `e` as the
		| i-th encoded element of this array.
			let e = get (start)
			let j = end
			var i = start
			while i < j
				e at (i)
				functor (e,i - offset, j - offset, offset)
				i += 1
			e dispose ()
			return self

		@method map functor
			let e = get (0)
			let j = count
			var i = 0
			# FIXME: We should map to another EncodedArray
			let r = new Array (j)
			while i < j
				e at (i)
				r[i] = functor (e,i,j)
				i += 1
			e dispose ()
			return r

		# TODO: @method reduce functor
		# TODO: @method filter functor

	@group Internal

		@method _init capacity=100
			data = new ARRAY_TYPE (capacity * step)
			_sentinel = 0
			return self

		@method _add count
		| Adds `count` items to this array, leaving them unintialized.
		| This returns the number of elements before the elements were
		| added.
			let i = _sentinel
			if count > 0
				self _resize (i + count)
				_sentinel += count * step
			return i

		@method _resize capacity=self capacity
		| Resizes current array to the given capacity. Internally, the array
		| values will be copied if a bigger array is required.
			if capacity > self capacity
				let l  = capacity * step
				let v = new ARRAY_TYPE (l)
				v set (data, 0)
				data = v
			return self

# -----------------------------------------------------------------------------
#
# DIRECT ENCODED ARRAY
#
# -----------------------------------------------------------------------------

# TODO: Add encoding description
# TODO: Add support for stride in encoding

@class DirectEncodedArray: IEncodedArray
| A flat array that encodes values made of `step` elements.

	@shared ARRAY_TYPE = Float32Array

# -----------------------------------------------------------------------------
#
# INDIRECT ENCODED ARRAY
#
# -----------------------------------------------------------------------------

@class IndirectEncodedArray: IEncodedArray
| An IndexedArray does not hold values directly but instead will indirectly
| values from an underlying index. Index arrays are useful for Edges and Faces
| encoding when you're re-using an array of vertices/points.

	@shared ARRAY_TYPE = Uint16Array
	@shared INDEXED_ARITY = 3
	@property wrapped   = Undefined

	@constructor array, capacity=100, encoding=Undefined
		super (capacity, encoding)
		assert (array is? IEncodedArray, "An indexed array requires an underlying encoded array")
		self wrapped = array
	
	@getter isIndirect
		return True

	# FIXME: We should cache that, as it's going to be called failry often
	@getter arity
	| Arity is one as we're dealing with indexes
		let a = _encoding ARITY if _encoding else 1
		let k = wrapped arity    if wrapped else 1
		let r = Math floor (a / k)
		# TODO: We should assert that a / k is an integer
		return r

	@method getWrapped offset
	| A key method of the indexed array, it calculates the index for the elment
	| containing the given offset and returns its relative value.
		# FIXME: Not sure why INDEXED_ARITY is 3, we should consider
		# points, faces, etcs.
		let i = Math floor (offset / INDEXED_ARITY)
		let v = data[i] 
		let w = offset - (i * INDEXED_ARITY)
		let o = v * wrapped step  + w
		return wrapped data [o]

	@method setWrapped offset, value
		let i = Math floor (offset / INDEXED_ARITY)
		let j = offset - (i * INDEXED_ARITY)
		let o = data[i] * wrapped step  + j
		wrapped data [o] = v
		return self

	@method append element
	| Adds ONE element to the encoded array. The element is expected
	| to be an *integer*.
		assert (element is? Number, "Integer expected, got:", element, __scope__)
		# If we're below capacity, we grow the array. The growth
		# strategy might be a bit smarter than that.
		if count >= capacity
			grow (capacity + _growth)
		# Now we copy up to STEP values from the element array
		data[_sentinel] = element
		_sentinel += 1
		return self

# -----------------------------------------------------------------------------
#
# ENCODING
#
# -----------------------------------------------------------------------------

@class Encoding: TFlyweight
| The encoding is a flyweight object that wraps IEncodedArray elements in accessors/mutators. Flyweights
| are meant to have a short lifespan, so make sure to call `dispose()` once
| you don't need them anymore so that you won't strain the GC.

	@shared STRUCTURE  = []
	@shared ARITY      = 1
	@shared STRIDE     = 0
	@shared IS_FACE    = False
	@shared IS_EDGE    = False
	@shared IS_POINT   = False

	@property array:IEncodedArray
	@property _offset = 0
	@property _arity  = ARITY
	@property _stride = STRIDE
	@property _step   = ARITY + STRIDE
	@property _isIndirect = Undefined

	# NOTE: We don't need a constructor because it's a flyweight
	@method init array, index=0
		self array  = array
		_isIndirect = array isIndirect
		# FIXME
		# _arity     = arity
		# _stride    = stride
		_step      = _arity + _stride
		at (index)

	@getter index
		return Math floor (_offset / _step)

	@getter start
		return _offset

	@getter end
	| The end excludes the stride
		return _offset + _arity

	@getter hasNext
		return _offset + _step + _step <= array length 

	@method next
	| Decreases the offset by the step if the parent,
	| returning `True` if the parent array has the capacity.
		if _offset + _step + _step <= array length 
			_offset += _step
			return True
		else
			return False

	@method previous
	| Increases the offset by the step if the parent,
	| returning `True` if the parent array has the capacity.
		if _offset >= _step
			_offset -= step
			return True
		else
			return False

	@method at index=Undefined
		self _offset = (index or 0) * _step
		return self

	@method set args...
	| Sets the values corresponding to this encoding in the underlying
	| encoded array. This implies that the given arguments cannot
	| be more than the encoded values.
		# We set from an a list of values
		assert (args length < ARITY, "Args cannot be longer than arity")
		# TODO: Should we make a different with the indirect vs direct?
		var i = 0
		var j = _offset
		while i < args length
			let v = args[i]
			if v is not None and v is not Undefined
				array[j] = v
			i += 1
			j += 1
		return self

	@method get
	| Returns a single array with the extracted values
		return array data slice (start, end)

# -----------------------------------------------------------------------------
#
# POINTS ENCODING
#
# -----------------------------------------------------------------------------

# NOTE: Here the `array data` indirection is necessary for now as 
# the IEncodedArray's data might change, so unless we find a way to notify
# the PointEncoding that the array has changed, we have to pay that extra cost.

@class PointEncoding: Encoding, TPoint
| Defines the encoding of points in 3D space as `X | Y | Z`.

	@shared ARITY     = 3
	@shared STRUCTURE = ("x", "y", "z")
	@shared IS_POINT  = True

	@getter x
		if not array
			return Undefined
		elif array isIndirect
			return array getWrapped (_offset + 0)
		else
			return array data [_offset]

	@setter x value
		if not array
			return Undefined
		elif array isIndirect
			array setWrapped (_offset + 0, value)
		else
			array data [_offset] = value

	@getter y
		if not array
			return Undefined
		elif array isIndirect
			return array getWrapped (_offset + 1)
		else
			return array data [_offset + 1]

	@setter y value
		if not array
			return Undefined
		elif array isIndirect
			array setWrapped (_offset + 1, value)
		else
			array data [_offset + 1] = value

	@getter z
		if not array
			return Undefined
		elif array isIndirect
			return array getWrapped (_offset + 2)
		else
			return array data [_offset + 2]

	@setter z value
		if not array
			return Undefined
		elif array isIndirect
			array setWrapped (_offset + 2, value)
		else
			array data [_offset + 2] = value

# -----------------------------------------------------------------------------
#
# EDGE ENCODING
#
# -----------------------------------------------------------------------------

@class EdgeEncoding: Encoding

	@shared ARITY     = 6
	@shared STRUCTURE = ("x0", "y0", "z0", "x1", "y1", "z1")
	@shared IS_EDGE = True

	# TODO: Should we return point encoding?
	@getter p0
		return [x0, y0, z0]

	@getter p1
		return [x1, y1, z1]
	
	@setter p0 value
		x0 = value[0] or value x or x0
		y0 = value[1] or value y or y0
		z0 = value[2] or value z or z0

	@setter p0 value
		x1 = value[0] or value x or x1
		y1 = value[1] or value y or y1
		z1 = value[2] or value z or z1

	@getter x0
		if array isIndirect
			return array getWrapped (_offset + 0)
		else
			return array data [_offset + 0]

	@setter x0 value
		if array isIndirect
			array setWrapped (_offset + 0, value)
		else
			array data [_offset] = value

	@getter y0
		if array isIndirect
			return array getWrapped (_offset + 1)
		else
			return array data [_offset + 1]

	@setter y0 value
		if array isIndirect
			array setWrapped (_offset + 1, value)
		else
			array data [_offset + 1] = value

	@getter z0
		if array isIndirect
			return array getWrapped (_offset + 2)
		else
			return array data [_offset + 2]

	@setter z0 value
		if array isIndirect
			array setWrapped (_offset + 2, value)
		else
			array data [_offset + 2] = value

	@getter x1
		if array isIndirect
			return array getWrapped (_offset + 3)
		else
			return array data [_offset + 3]

	@setter x1 value
		if array isIndirect
			array setWrapped (_offset + 3, value)
		else
			array data [_offset + 3] = value

	@getter y1
		if array isIndirect
			return array getWrapped (_offset + 4)
		else
			return array data [_offset + 4]

	@setter y1 value
		if array isIndirect
			array setWrapped (_offset + 4, value)
		else
			array data [_offset + 4] = value

	@getter z1
		if array isIndirect
			return array getWrapped (_offset + 5)
		else
			return array data [_offset + 5]

	@setter z1 value
		if array isIndirect
			array setWrapped (_offset + 5, value)
		else
			array data [_offset + 5] = value

	@method from x=0, y=Undefined, z=Undefined
		if x is? TPoint
			z ?= x z
			y ?= x y
			x  = x x
		x ?= 0 ; y ?= 0 ; z ?= 0
		x0 = x
		y0 = y
		z0 = z
		return self

	@method to x=0, y=Undefined, z=Undefined
		if x is? TPoint
			z ?= x z
			y ?= x y
			x  = x x
		x ?= 0 ; y ?= 0 ; z ?= 0
		x1 = x
		y1 = y
		z1 = z
		return self

	@method relto x=0, y=Undefined, z=Undefined
		let old = x
		if x is? TPoint
			z ?= x z
			y ?= x y
			x  = x x
		x ?= 0 ; y ?= 0 ; z ?= 0
		x1 = x0 + x
		y1 = y0 + y
		z1 = z0 + z
		return self
	
	@method repr
	| Returns a nicely formatted representation of the edge.
		return sprintf("edge(%0.2f, %0.2f, %0.2f)→(%0.2f, %0.2f, %0.2f)", x0, y0, z0, x1, y1, z1)

# -----------------------------------------------------------------------------
#
# FACE ENCODING
#
# -----------------------------------------------------------------------------

@class FaceEncoding: EdgeEncoding

	@shared ARITY     = 9
	@shared STRUCTURE = ("x0", "y0", "z0", "x1", "y1", "z1", "x2", "y2", "z2")
	@shared IS_EDGE   = False
	@shared IS_FACE   = True

	@getter p2
		return [x2, y2, z2]
	
	@setter p2 value
		x2 = value[0] or value x or x2
		y2 = value[1] or value y or y2
		z2 = value[2] or value z or z2

	@getter x2
		if array isIndirect
			return array getWrapped (_offset + 6)
		else
			return array data [_offset + 6]

	@setter x2 value
		if array isIndirect
			array setWrapped (_offset + 6, value)
		else
			array data [_offset + 6] = value

	@getter y2
		if array isIndirect
			return array getWrapped (_offset + 7)
		else
			return array data [_offset + 7]

	@setter y2 value
		if array isIndirect
			array setWrapped (_offset + 7, value)
		else
			array data [_offset + 7] = value

	@getter z2
		if array isIndirect
			return array getWrapped (_offset + 8)
		else
			return array data [_offset + 8]

	@setter z2 value
		if array isIndirect
			array setWrapped (_offset + 8, value)
		else
			array data [_offset + 8] = value

	@method repr
	| Returns a nicely formatted representation of the face.
		return sprintf("face(%0.2f, %0.2f, %0.2f),(%0.2f, %0.2f, %0.2f),(%0.2f, %0.2f, %0.2f)", x0, y0, z0, x1, y1, z1, x2, y2, z2)

# -----------------------------------------------------------------------------
#
# HIGH-LEVEL API
#
# -----------------------------------------------------------------------------

@function points n=100
	return new DirectEncodedArray (n, PointEncoding) expand ()

@function edges n=100
	return new DirectEncodedArray (n, EdgeEncoding) expand ()

@function faces n=100
	return new DirectEncodedArray (n, FaceEncoding) expand ()

# EOF
