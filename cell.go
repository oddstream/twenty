package main

import (
	"bytes"
	_ "embed" // go:embed only allowed in Go files that import "embed"
	"image"
	"log"

	"github.com/hajimehoshi/ebiten/v2"
	"oddstream.games/grot/util"
)

//go:embed assets/particles.png
var particlesBytes []byte

var particlesImage *ebiten.Image

const tileSize = 150
const tilesAcross = 6
const tilesDown = 3

var particleSubImages = [tilesAcross * tilesDown]*ebiten.Image{}

func init() {
	// Decode an image from the image file's byte slice
	img, _, err := image.Decode(bytes.NewReader(particlesBytes))
	if err != nil {
		log.Fatal(err)
	}
	particlesImage = ebiten.NewImageFromImage(img)
	for i := 0; i < tilesAcross*tilesDown; i++ {
		var sx int = tileSize * (i % tilesAcross)
		var sy int = tileSize * (i / tilesAcross)
		r := image.Rect(sx, sy, sx+tileSize, sy+tileSize)
		particleSubImages[i] = particlesImage.SubImage(r).(*ebiten.Image)
	}
}

// Cell is a location in a Grid. A Cell can contain a Tile object.
type Cell struct {
	grid          *Grid
	x, y          int
	N, S          *Cell // links to North and South cells
	pos           image.Point
	hitbox        image.Rectangle
	particleFrame int
}

func NewCell(grid *Grid, x, y int) *Cell {
	c := &Cell{grid: grid, x: x, y: y, particleFrame: -1}
	// pos not set until game.Update()
	return c
}

func (c *Cell) setPos(x, y int) {
	c.pos = image.Point{x, y}
	c.hitbox = util.MakeHitbox(c.pos, c.grid.cellSize)
}

func (c *Cell) startParticles() {
	c.particleFrame = 0
}

func (c *Cell) update() error {
	if c.particleFrame != -1 {
		c.particleFrame += 1
		if c.particleFrame > 17 {
			c.particleFrame = -1
		}
	}
	return nil
}

func (c *Cell) draw(screen *ebiten.Image) {

	i := c.particleFrame
	if i >= 0 && i <= 17 {
		op := &ebiten.DrawImageOptions{}
		sz := float64(c.grid.cellSize)
		op.GeoM.Scale(sz/tileSize, sz/tileSize)
		op.GeoM.Translate(float64(c.pos.X), float64(c.pos.Y))
		screen.DrawImage(particleSubImages[i], op)
	}
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
