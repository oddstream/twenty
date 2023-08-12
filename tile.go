package main

import (
	"fmt"
	"image"
	"image/color"
	"time"

	"github.com/fogleman/gg"
	"github.com/hajimehoshi/ebiten/v2"
	"oddstream.games/grot/util"
)

const aniSpeed = 0.6

type TileValue int

type TileLerp struct {
	dst                    *Cell
	srcX, srcY, dstX, dstY float64 // positions for lerp
	lerpstep               float64
	beingDragged           bool
	dragStart              image.Point
}

type Tile struct {
	// pos of card on grid
	pos image.Point

	// lerping things
	src           image.Point
	dst           image.Point
	lerpStartTime time.Time
	isLerping     bool

	// dragging things
	dragStart    image.Point
	beingDragged bool

	// TileLerp
	cell  *Cell
	value TileValue
}

var tileColorMap = map[TileValue]color.RGBA{
	1: {R: 0xFF, G: 0xD7, B: 0x00, A: 0xFF}, // Gold
	2: {R: 0xDC, G: 0x14, B: 0x3C, A: 0xFF}, // Crimson
	3: {R: 0x00, G: 0xCE, B: 0xD1, A: 0xFF}, // DarkTurquoise
	4: {R: 0x1E, G: 0x90, B: 0xFF, A: 0xFF}, // DodgerBlue
	5: {R: 0xEE, G: 0x82, B: 0xEE, A: 0xFF}, // Violet
	6: {R: 0x00, G: 0xFF, B: 0x00, A: 0xFF}, // Lime
	7: {R: 0xFF, G: 0xDA, B: 0xB9, A: 0xFF}, // PeachPuff
	8: {R: 0x80, G: 0x00, B: 0x80, A: 0xFF}, // Purple
}

func NewTile(cell *Cell, value TileValue) *Tile {
	t := &Tile{cell: cell, pos: cell.pos, value: value}
	return t
}

func (t *Tile) makeTileImg() *ebiten.Image {
	isz := t.cell.grid.cellSize
	if isz == 0 {
		return nil
	}
	fsz := float64(isz)
	fsz10 := fsz / 10.0
	dc := gg.NewContext(isz, isz)

	var colLight color.RGBA
	var ok bool
	if colLight, ok = tileColorMap[t.value]; !ok {
		colLight = color.RGBA{0x80, 0x80, 0x80, 0xFF}
	}
	var r, g, b uint8
	if colLight.R > 0x10 {
		r = colLight.R - 0x10
	} else {
		r = colLight.R
	}
	if colLight.G > 0x10 {
		g = colLight.G - 0x10
	} else {
		g = colLight.G
	}
	if colLight.B > 0x10 {
		b = colLight.B - 0x10
	} else {
		b = colLight.B
	}
	colDark := color.RGBA{R: r, G: g, B: b, A: 0xFF}

	dc.SetColor(colDark)
	dc.DrawRoundedRectangle(0, fsz10, fsz, fsz-fsz10, fsz10)
	dc.Fill()
	dc.SetColor(colLight)
	dc.DrawRoundedRectangle(0, 0, fsz, fsz-fsz10, fsz10)
	dc.Fill()
	dc.Stroke()
	if t.value == 1 {
		dc.SetColor(color.RGBA{0x80, 0x80, 0x80, 0xff})
	} else {
		dc.SetColor(color.RGBA{0xff, 0xff, 0xff, 0xff})
	}
	dc.SetFontFace(TileFontFace)
	dc.DrawStringAnchored(fmt.Sprint(t.value), fsz/2, fsz/2, 0.5, 0.3)
	dc.Stroke()
	return ebiten.NewImageFromImage(dc.Image())
}

func (t *Tile) lerpTo(dst image.Point) {
	if t.dst.Eq(t.pos) {
		t.isLerping = false
		return
	}
	if t.isLerping && dst.Eq(t.dst) {
		return // repeat request tp lerp to dst
	}
	t.isLerping = true
	t.src = t.pos
	t.dst = dst
	t.lerpStartTime = time.Now()
}

func (t *Tile) startDrag() {
	if t.isLerping {
		t.dragStart = t.dst
	} else {
		t.dragStart = t.pos
	}
	t.beingDragged = true
}

func (t *Tile) dragBy(dx, dy int) {
	t.pos = t.dragStart.Add(image.Point{dx, dy})
}

func (t *Tile) stopDrag() {
	t.beingDragged = false
}

func (t *Tile) cancelDrag() {
	t.beingDragged = false
	t.lerpTo(t.dragStart)
}

func (t *Tile) wasDragged() bool {
	return !t.pos.Eq(t.dragStart)
}

func (t *Tile) update() error {
	if t.isLerping {
		if !t.pos.Eq(t.dst) {
			// secs will start at nearly zero, and rise to about the value of AniSpeed,
			// because aniSpeed is the number of seconds the tile will take to transition.
			// with aniSpeed at 0.75, this happens (for example) 45 times (we are at @ 60Hz)
			var tm float64 = time.Since(t.lerpStartTime).Seconds() / aniSpeed
			t.pos.X = int(util.Smoothstep(float64(t.src.X), float64(t.dst.X), tm))
			t.pos.Y = int(util.Smoothstep(float64(t.src.Y), float64(t.dst.Y), tm))
		} else {
			t.isLerping = false
		}
	}

	return nil
}

func (t *Tile) draw(screen *ebiten.Image) {
	img, ok := TileImgLib[t.value]
	if !ok {
		img = t.makeTileImg()
		if img == nil {
			return
		}
		TileImgLib[t.value] = img
	}

	op := &ebiten.DrawImageOptions{}
	op.GeoM.Translate(float64(t.pos.X), float64(t.pos.Y))
	screen.DrawImage(img, op)
}
