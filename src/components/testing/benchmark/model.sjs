@feature sugar 2
@import  Component from std.ui.components
@import  All, Benchmark       from std.util.testing

@class Component: Component

	@shared OPTIONS = {
		test : "#default"
	}

	@getter data
		if options test == "#default"
			let r = []
			All walk {r push (_) if _ is? Benchmark}
			return r[0]
		else
			return All get (options test)

	@method onRun
		data run ()
		render ()

	@method render data=self data, rdv=False
		# We schedule another render when the data is finished.
		# if not rdv
		# 	rdv = data join ()
		# 	rdv partial {render(self data, True)} then {render (self data, True)}
		let metrics = {
			min : Undefined
			max : Undefined
			avg : Undefined
		}
		for _,i in data events
			if metrics min is Undefined
				metrics min = _ duration
				metrics max = _ duration
			else
				metrics min = Math min (metrics min, _ duration)
				metrics max = Math max (metrics max, _ duration)
			_ metrics = metrics
		metrics minmax = [metrics min, metrics max]
		super render {results:data, metrics}

# EOF
