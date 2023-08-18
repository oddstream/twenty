package main

import (
	"image"

	"github.com/hajimehoshi/ebiten/v2"
	"oddstream.games/grot/util"
)

// Cell is a location in a Grid. A Cell can contain a Tile object.
type Cell struct {
	grid   *Grid
	x, y   int
	N, S   *Cell // links to North and South cells
	pos    image.Point
	hitbox image.Rectangle
}

func NewCell(grid *Grid, x, y int) *Cell {
	c := &Cell{grid: grid, x: x, y: y}
	// pos not set until game.Update()
	return c
}

func (c *Cell) setPos(x, y int) {
	c.pos = image.Point{x, y}
	c.hitbox = util.MakeHitbox(c.pos, c.grid.tileSize)
}

func (c *Cell) update() error {
	return nil
}

func (c *Cell) draw(screen *ebiten.Image) {

	// if DebugMode {
	// str := fmt.Sprintf("%d,%d ", c.x, c.y)
	// mid := c.grid.cellSize / 2
	// if c.N != nil {
	// 	str = str + "N"
	// }
	// if c.S != nil {
	// 	str = str + "S"
	// }
	// ebitenutil.DebugPrintAt(screen, str, c.pos.X+mid, c.pos.Y+mid)
	// }
}
