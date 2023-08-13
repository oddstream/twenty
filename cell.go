package main

import (
	"fmt"
	"image"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"oddstream.games/grot/util"
)

// Cell is a location in a Grid. A Cell can contain a Tile object.
type Cell struct {
	grid   *Grid
	x, y   int
	edges  [4]*Cell // links to neighbours 0=N, 1=E, 2=S, 3=W
	pos    image.Point
	hitbox image.Rectangle
	tile   *Tile
}

func NewCell(grid *Grid, x, y int) *Cell {
	c := &Cell{grid: grid, x: x, y: y}
	// pos not set until game.Update()
	return c
}

func (c *Cell) setPos(x, y int) {
	c.pos = image.Point{x, y}
	c.hitbox = util.MakeHitbox(c.pos, c.grid.cellSize)
}

func (c *Cell) draw(screen *ebiten.Image) {
	str := fmt.Sprintf("%d,%d ", c.x, c.y)
	mid := c.grid.cellSize / 2
	if c.edges[0] != nil {
		str = str + "N"
	}
	if c.edges[1] != nil {
		str = str + "E"
	}
	if c.edges[2] != nil {
		str = str + "S"
	}
	if c.edges[3] != nil {
		str = str + "W"
	}
	ebitenutil.DebugPrintAt(screen, str, c.pos.X+mid, c.pos.Y+mid)
}
