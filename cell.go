package main

import "image"

// Cell is a location in a Grid. A Cell can contain a Tile object.
type Cell struct {
	grid  *Grid
	x, y  int
	edges [4]*Cell // links to neighbours 0=N, 1=E, 2=S, 3=W
	pos   image.Point
	tile  *Tile
}

func NewCell(grid *Grid, x, y int) *Cell {
	c := &Cell{grid: grid, x: x, y: y}
	// pos not set until game.Update()
	return c
}
