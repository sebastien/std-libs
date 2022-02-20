@feature sugar 2
@import Component as UIComponent, Registry from std.ui.components
@import signal, network, Input from std.state.cells
@import std.math.random as random
@import std.state.cells as cells
@import Frame from std.io.time
@import str,type as coretype,typename from std.core
@import Measure from std.api.dom
@import d3
# TODO: Import CSS

@class Component: UIComponent

	@shared STYLESHEET = True
	@shared OPTIONS = {
		iterations      : 100
		network         : None
		listComponents  : True
		listCells       : True
		height          : 400
	}

	@property network    = {
		nodes : {
			"-inputs"         : {
				"components:list" : []
				"listComponents"  : True
				"listCells"       : True
				"height"          : Undefined
			}
			"-internal"       : {
				"network:reducer" : {c|
					let res = c match
						is? cells.Network -> c
						is? UIComponent     -> c state _network
						is? Object          -> c _network
						else                -> None
					bindNetwork   (res)
					return res
				}
				"cells:reducer"   : {n|return n cells if n else []}
				"viz:reducer"     : {n|return createNetworkVisualization(n) if n else None}
			}
			"-focus" : {
				"component:value" : None
				"cell:value"      : None
			}
			"-signals" : {
				"animate:signal" : {start()}
			}
		}
		edges : [
			"(component)->network"
			"(network)->viz"
			"(network)->cells"
			"(viz)->animate"
			"(cells,components,component,cell)->render"
		]
	}

	@method init
		super init ()
		# state cell    unwraps (False)
		# state cells   unwraps (False) does {
		# 	if children cells
		# 		children cells scrollToY 0
		# }
		# state network unwraps (False)
		# state viz     unwraps (False)
		# state components does {
		# 	if not state component value
		# 		state component set (_ value [0])
		# }

		# We update the components list when they are added
		Registry !+ "Update" {updateComponents()}
		updateComponents ()

	@method listComponents
		return Registry all ::> {r,e,i|
			(r or []) concat (e instances)
		}

	@method updateComponents
		state components set (listComponents())

	@method start
		console log ("START")
		Frame bind (self . step)

	@method setComponent component
		state component set (component)
		return self

	@method setNetwork network
		state component set (network)
		return self

	@method getNetwork
		return state network value

	@method createNetworkVisualization network
		# We initialize the random seed to be the same
		console log ("VIZ NETWORK", network)
		random seed 0
		let index = {}
		let nodes = network cells ::= {n,i|
			let t       = typename(coretype(n)) split "." [-1]
			index[n id] = i
			return {
				type : t
				index: i
				id   : i
				name : n name
				x    : 200 + random integer (0,10)
				y    : 200 + random integer (0,10)
				data : n
				cell : n
			}
		}
		let links = network cells ::> {r,n,i|
			r ?= []
			for t in n _outputs
				r push {
					index  : r length
					source : index[n id]
					target : index[t id]
				}
			return r
		}
		# SEE: https://github.com/d3/d3-force/blob/master/README.md#forceSimulation
		# SEE: https://bl.ocks.org/shimizu/e6209de87cdddde38dadbb746feaf3a3
		let l = d3 forceLink     (links) :
			distance {150}
		let sim = d3 forceSimulation (nodes) ...
			force ("charge", d3 forceManyBody ())
			force ("center", d3 forceCenter   (200, 200))
			force ("collide", d3 forceCollide (30))
			force ("links" , l)
		sim tick ()
		let viz = {
			sim, nodes, links, network, iterations:options iterations
		}
		return viz

	@method bindNetwork network
		unbindNetwork (state network value) if state and state network
		if network
			network !+ "Update"  (self . render)

	@method unbindNetwork network
		if network
			network !- "Update"  (self . render)

	@method onPickNode event
		let i = parseInt (event target getAttribute "data-index")
		let c = nodes[i] data

	@method onMouseEnter event
		var focus = event target getAttribute "data-focus"
		var index = event target getAttribute "data-index"
		if focus
			let cell = state viz value network cells [index]
			if cell
				state cell set (cell)
		else
			state cell set (None)

	@method onComponentClick event
		var index = parseInt (event currentTarget getAttribute "data-index")
		var c     = state components raw [index]
		state component set (c)

	@method measure
		super measure ()
		if children
			children :: {_ measure ()}
		if nodes graph
			let d = Measure dimension (nodes graph)
			nodes svg setAttribute ("width", "" + d[0])
			nodes svg setAttribute ("height", "" + d[1])

	@method step
		let viz = state viz value
		if viz
			viz sim tick ()
			render ()
			viz iterations -= 1
			if viz iterations <= 0
				Frame unbind (self . step)
		else
			Frame unbind (self . step)

# EOF
