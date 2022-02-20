@feature sugar 2
@module  std.patterns.oo

@trait TSingleton
| Provides a class `Get` operation that returns a global singleton instance.

	@shared    Instance

	@operation Get
		if not self Instance
			self Instance = new self ()
		return self Instance

# EOF
