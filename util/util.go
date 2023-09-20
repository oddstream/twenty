package util

import (
	"image"
	"math"
)

// InRect returns true if px,py is within Rect returned by function parameter
func InRect(x, y int, fn func() (int, int, int, int)) bool {
	x0, y0, x1, y1 := fn()
	return x > x0 && y > y0 && x < x1 && y < y1
}

// RectEmpty returns true if rect is empty
func RectEmpty(x0, y0, x1, y1 int) bool {
	return x0 == x1 || y0 == y1
}

// Lerp see https://en.wikipedia.org/wiki/Linear_interpolation
func Lerp(v0, v1, t float64) float64 {
	if t > 1.0 {
		t = 1.0
	}
	return (1-t)*v0 + t*v1
}

// Smoothstep see http://sol.gfxile.net/interpolation/
func Smoothstep(A, B, v float64) float64 {
	// cards that have spun off the screen may have -ve position
	if A < 0.0 {
		A = 0.0
	}
	if B < 0.0 {
		B = 0.0
	}
	if v > 1.0 {
		v = 1.0
	}
	v = v * v * (3 - 2*v)
	X := (B * v) + (A * (1.0 - v))
	return X
}

// Smootherstep see http://sol.gfxile.net/interpolation/
func Smootherstep(A, B, v float64) float64 {
	// cards that have spun off the screen may have -ve position
	if A < 0.0 {
		A = 0.0
	}
	if B < 0.0 {
		B = 0.0
	}
	if v > 1.0 {
		v = 1.0
	}
	v = v * v * v * (v*(v*6-15) + 10)
	X := (B * v) + (A * (1.0 - v))
	return X
}

// func EaseInSine(A, B, v float64) float64 {
// 	v = 1.0 - math.Cos((v*math.Pi)/2.0) // easings.net
// 	return (B * v) + (A * (1.0 - v))
// }

func EaseInCubic(A, B, v float64) float64 {
	v = v * v * v
	if A < 0.0 {
		A = 0.0
	}
	if B < 0.0 {
		B = 0.0
	}
	if v > 1.0 {
		v = 1.0
	}
	return (B * v) + (A * (1.0 - v))
}

func EaseInQuad(A, B, v float64) float64 {
	v = v * v * v * v
	if A < 0.0 {
		A = 0.0
	}
	if B < 0.0 {
		B = 0.0
	}
	if v > 1.0 {
		v = 1.0
	}
	return (B * v) + (A * (1.0 - v))
}

// Normalize is the opposite of lerp. Instead of a range and a factor, we give a range and a value to find out the factor.
func Normalize(start, finish, value float64) float64 {
	return (value - start) / (finish - start)
}

// MapValue converts a value from the scale [fromMin, fromMax] to a value from the scale [toMin, toMax].
// It’s just the normalize and lerp functions working together.
func MapValue(value, fromMin, fromMax, toMin, toMax float64) float64 {
	return Lerp(toMin, toMax, Normalize(fromMin, fromMax, value))
}

// Clamp a value between min and max values
func Clamp(value, _min, _max float64) float64 {
	return math.Min(math.Max(value, _min), _max)
}

// ClampInt a value between min and max values
func ClampInt(value, _min, _max int) int {
	return Min(Max(value, _min), _max)
}

// Abs returns the absolute value of x
func Abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// Max returns the largest of it's two int parameters
func Max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// Min returns the smallest of it's two int parameters
func Min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Pow returns x ** y
func Pow(x, y int) int {
	return int(math.Pow(float64(x), float64(y)))
}

// Distance finds the length of the hypotenuse between two points.
func Distance(p1, p2 image.Point) float64 {
	first := math.Pow(float64(p2.X-p1.X), 2)
	second := math.Pow(float64(p2.Y-p1.Y), 2)
	return math.Sqrt(first + second)
}

// DistanceFloat64 finds the length of the hypotenuse between two points.
// Formula is the square root of (x2 - x1)^2 + (y2 - y1)^2
// func DistanceFloat64(x1, y1, x2, y2 float64) float64 {
// 	first := math.Pow(x2-x1, 2)
// 	second := math.Pow(y2-y1, 2)
// 	return math.Sqrt(first + second)
// }

// DistanceInt finds the length of the hypotenuse between two points.
// Formula is the square root of (x2 - x1)^2 + (y2 - y1)^2
func DistanceInt(x1, y1, x2, y2 int) int {
	first := math.Pow(float64(x2-x1), 2)
	second := math.Pow(float64(y2-y1), 2)
	return int(math.Sqrt(first + second))
}

// OverlapArea returns the intersection of two rectangles
// func OverlapArea(x1, y1, x2, y2, X1, Y1, X2, Y2 int) int {
// 	xOverlap := Max(0, Min(x2, X2)-Max(x1, X1))
// 	yOverlap := Max(0, Min(y2, Y2)-Max(y1, Y1))
// 	return xOverlap * yOverlap
// }

// OverlapAreaFloat64 returns the intersection of two rectangles
// func OverlapAreaFloat64(x1, y1, x2, y2, X1, Y1, X2, Y2 float64) float64 {
// 	xOverlap := math.Max(0, math.Min(x2, X2)-math.Max(x1, X1))
// 	yOverlap := math.Max(0, math.Min(y2, Y2)-math.Max(y1, Y1))
// 	return xOverlap * yOverlap
// }

func IndexOf[T comparable](elems []T, v T) int {
	for i, s := range elems {
		if v == s {
			return i
		}
	}
	return -1
}

func Contains[T comparable](elems []T, v T) bool {
	for _, s := range elems {
		if v == s {
			return true
		}
	}
	return false
}
