@feature sugar 2
@module  std.math.render

# http://web.engr.oregonstate.edu/~mjb/prman/shaderfunctions.html

@function nsin v
	return (Math sin (v) + 1) / 2

@function ncos v
	return (Math sin (v) + 1) / 2


@function smoothstep v
| The classic smoothstep interpolator
| <https://en.wikipedia.org/wiki/Smoothstep>
	var vv = v * v
	return 3 * vv - 2 * v * vv

# sin( r )
# asin( s )
# cos( r )
# acos( c )
# tan( r )
# atan( t )
# atan( y, x )
# PI
# radians( d )
# degrees( r )
# sqrt( v )
# pow( x, y )
# exp( v )
# log( v )
# mod( v, b )
# abs( v )
# sign( v )
# min( a, b )
# max( a, b )
# clamp( v, min, max )
# ceil( v )
# floor( v )
# round( v )
# step( m, v )
# smoothstep(min, max, val )
# mix( c0, c1, t )
# printf( "string", v1, v2, ... )

# noise(p)
# xcomp(p)
# ycomp(p)
# zcomp(p)
# setxcomp(p,v)
# setycomp(p,v)
# setzcomp(p,v)
# texture( "name", s, t )
# length(V)
# distance( P1, P2 )
# area(P)
# depth(P)
# calculatenormal(P)
# normalize(V)
# faceforward(V,I)
# ambient()
# diffuse(N)
# specular( N, eye, roughness )
# reflect( I, N )
# refract( I, N, eta )
