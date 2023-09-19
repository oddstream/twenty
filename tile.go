package main

import (
	_ "embed" // go:embed only allowed in Go files that import "embed"
	"math"

	"bytes"
	"fmt"
	"image"
	"image/color"
	"log"
	"time"

	"github.com/fogleman/gg"
	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"oddstream.games/twenty/util"
)

//go:embed assets/particles.png
var particlesBytes []byte

var particlesImage *ebiten.Image

const (
	particleTileSize    = 150
	particleTilesAcross = 6
	particleTilesDown   = 3
)

var particleSubImages = [particleTilesAcross * particleTilesDown]*ebiten.Image{}

func init() {
	// Decode an image from the image file's byte slice
	img, _, err := image.Decode(bytes.NewReader(particlesBytes))
	if err != nil {
		log.Fatal(err)
	}
	particlesImage = ebiten.NewImageFromImage(img)
	for i := 0; i < particleTilesAcross*particleTilesDown; i++ {
		var sx int = particleTileSize * (i % particleTilesAcross)
		var sy int = particleTileSize * (i / particleTilesAcross)
		r := image.Rect(sx, sy, sx+particleTileSize, sy+particleTileSize)
		particleSubImages[i] = particlesImage.SubImage(r).(*ebiten.Image)
	}
}

const aniSpeed = 0.25

type Tile struct {
	grid *Grid
	// pos of card on grid
	pos         image.Point
	row, column int

	// lerping things
	src           image.Point
	dst           image.Point
	lerpStartTime time.Time
	isLerping     bool

	// dragging things
	dragStart    image.Point
	beingDragged bool

	// gravity things
	velocity int // y axis velocity (otherwise it would be velocitx)

	value         int
	links         uint32
	particleFrame int
}

type TileColors struct {
	face, text, footer color.RGBA
}

var tileColorMap = map[int]TileColors{
	1:  {face: color.RGBA{0xff, 0xff, 0x99, 0xff}, text: color.RGBA{0x8c, 0x8c, 0x00, 0xff}, footer: color.RGBA{0xc6, 0xc6, 0x00, 0xff}},
	2:  {face: color.RGBA{0xff, 0x24, 0x24, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0xd6, 0x00, 0x00, 0xff}},
	3:  {face: color.RGBA{0x00, 0xf2, 0xae, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x00, 0xcb, 0x92, 0xff}},
	4:  {face: color.RGBA{0x2c, 0x8b, 0xff, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x00, 0x62, 0xd9, 0xff}},
	5:  {face: color.RGBA{0xdd, 0xa5, 0xfa, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0xc8, 0x6e, 0xa7, 0xff}},
	6:  {face: color.RGBA{0x37, 0xea, 0x00, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x31, 0xd1, 0x00, 0xff}},
	7:  {face: color.RGBA{0xff, 0xd3, 0xbd, 0xff}, text: color.RGBA{0xff, 0x55, 0x01, 0xff}, footer: color.RGBA{0xff, 0xa3, 0x75, 0xff}},
	8:  {face: color.RGBA{0x9f, 0x00, 0xf2, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x54, 0x00, 0x80, 0xff}},
	9:  {face: color.RGBA{0xff, 0xb5, 0x00, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0xbf, 0x88, 0x00, 0xff}},
	10: {face: color.RGBA{0xc0, 0xc0, 0xc0, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x9c, 0x9c, 0x9c, 0xff}},
	11: {face: color.RGBA{0xce, 0xfa, 0x00, 0xff}, text: color.RGBA{0x68, 0x7f, 0x00, 0xff}, footer: color.RGBA{0x99, 0xba, 0x00, 0xff}},
	12: {face: color.RGBA{0xff, 0xff, 0x00, 0xff}, text: color.RGBA{0x78, 0x78, 0x00, 0xff}, footer: color.RGBA{0xd4, 0xd4, 0x00, 0xff}},
	13: {face: color.RGBA{0xff, 0x1b, 0x7c, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0xc7, 0x00, 0x55, 0xff}},
	14: {face: color.RGBA{0x00, 0xd6, 0xef, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x00, 0xab, 0xbf, 0xff}},
	15: {face: color.RGBA{0x80, 0x80, 0x80, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x5b, 0x5b, 0x5b, 0xff}},
	16: {face: color.RGBA{0x24, 0x24, 0xff, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x00, 0x00, 0x96, 0xff}},
	17: {face: color.RGBA{0xf3, 0x40, 0xff, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0xb6, 0x00, 0xc2, 0xff}},
	18: {face: color.RGBA{0xff, 0xb2, 0xb2, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0xff, 0x75, 0x75, 0xff}},
	19: {face: color.RGBA{0xff, 0xe5, 0xa5, 0xff}, text: color.RGBA{0xd0, 0x94, 0x00, 0xff}, footer: color.RGBA{0xf2, 0xad, 0x00, 0xff}},
	20: {face: color.RGBA{0xff, 0x83, 0x43, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0xd4, 0x48, 0x00, 0xff}},
}

func NewTile(grid *Grid, pos image.Point, value int) *Tile {
	t := &Tile{grid: grid, pos: pos, value: value, particleFrame: -1}
	t.calcColumnAndRow()
	return t
}

func (t *Tile) makeTileImg() *ebiten.Image {
	isz := t.grid.tileSize
	if isz == 0 {
		return nil
	}
	fsz := float64(isz)
	fsz10 := fsz / 10.0
	hgap := fsz / 20.0
	vgap := fsz / 40.0
	dc := gg.NewContext(isz, isz)

	var cols TileColors
	var ok bool
	if cols, ok = tileColorMap[t.value]; !ok {
		cols = TileColors{face: color.RGBA{0x80, 0x80, 0x80, 0xff}, text: color.RGBA{0xff, 0xff, 0xff, 0xff}, footer: color.RGBA{0x50, 0x50, 0x50, 0xff}}
	}

	dc.SetColor(cols.footer)
	dc.DrawRoundedRectangle(hgap, vgap+fsz10, fsz-(hgap*2), fsz-fsz10-(vgap*2), fsz10)
	dc.Fill()

	dc.SetColor(cols.face)
	dc.DrawRoundedRectangle(hgap, vgap, fsz-(hgap*2), fsz-fsz10-(vgap*2), fsz10)
	dc.Fill()
	dc.Stroke()

	dc.SetColor(cols.text)
	dc.SetFontFace(theTileFontFace)
	dc.DrawStringAnchored(fmt.Sprint(t.value), fsz/2, fsz/2, 0.5, 0.3)
	dc.Stroke()
	return ebiten.NewImageFromImage(dc.Image())
}

func (t *Tile) calcColumnAndRow() {
	x := float64(t.pos.X - t.grid.gridRectangle.Min.X)
	t.column = int(math.Round(x / float64(t.grid.tileSize)))
	y := float64(t.pos.Y - t.grid.gridRectangle.Min.Y)
	t.row = int(math.Round(y / float64(t.grid.tileSize)))
}

func (t *Tile) findNearestTileBelow() *Tile {
	var smallestGap int = math.MaxInt
	var nearestTile *Tile
	for _, t0 := range t.grid.tiles {
		if t0.column != t.column {
			continue
		}
		var diff int = t0.pos.Y - t.pos.Y
		if diff > 0 {
			if diff < smallestGap {
				smallestGap = diff
				nearestTile = t0
			}
		}
	}
	return nearestTile
}

func (t *Tile) setPos(pos image.Point) {
	t.pos = pos
	t.calcColumnAndRow()
}

func (t *Tile) lerpTo(dst image.Point) {
	if dst.Eq(t.pos) {
		t.isLerping = false
		// fmt.Println("tile pos already at dst", t.value, t.pos)
		return
	}
	if t.isLerping && dst.Eq(t.dst) {
		fmt.Println("lerp repeat request", t.value)
		return // repeat request to lerp to dst
	}
	if t.isLerping {
		// fmt.Println("extended lerp", t.value)
		// leave src
		t.dst = dst
		// leave lerpStartTime
	} else {
		t.isLerping = true
		t.src = t.pos
		t.dst = dst
		t.lerpStartTime = time.Now()
		t.velocity = 0
	}
}

func (t *Tile) startDrag() {
	if t.isLerping {
		t.dragStart = t.dst
	} else {
		t.dragStart = t.pos
	}
	t.beingDragged = true
	t.velocity = 0
}

func (t *Tile) dragBy(dx, dy int) {
	t.pos = t.dragStart.Add(image.Point{dx, dy})
	t.calcColumnAndRow()
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

// rectangle - more of a hitbox than a rectangle
func (t *Tile) rectangle() image.Rectangle {
	sz := t.grid.tileSize
	hgap := sz / 10
	vgap := sz / 10
	return image.Rectangle{
		Min: image.Point{t.pos.X + hgap, t.pos.Y + vgap},
		Max: image.Point{t.pos.X + sz - hgap*2, t.pos.Y + sz - vgap*2}}
	// return image.Rectangle{
	// 	Min: t.pos,
	// 	Max: image.Point{t.pos.X + t.grid.tileSize, t.pos.Y + t.grid.tileSize},
	// }
}

func (t *Tile) startParticles() {
	t.particleFrame = 0
}

func (t *Tile) snapToColumn() {
	t.pos.X = t.grid.gridRectangle.Min.X + (t.column * t.grid.tileSize)
}

func (t *Tile) update() error {
	if t.isLerping {
		if t.pos.Eq(t.dst) {
			t.isLerping = false
			// t.grid.tileArrived(t)
			// fmt.Println("tile arrived", t.value)
		} else {
			// time will start at nearly zero, and rise to about the value of AniSpeed,
			// because aniSpeed is the number of seconds the tile will take to transition.
			// with aniSpeed at 0.75, this happens (for example) 45 times (we are at @ 60Hz)
			var tm float64 = time.Since(t.lerpStartTime).Seconds() / aniSpeed
			t.setPos(image.Point{
				X: int(util.Lerp(float64(t.src.X), float64(t.dst.X), tm)),
				Y: int(util.Lerp(float64(t.src.Y), float64(t.dst.Y), tm)),
			})
		}
	}
	if !(t.isLerping || t.beingDragged) {
		tb := t.findNearestTileBelow()
		t.velocity = util.Min(t.velocity+1, t.grid.tileSize)
		t.pos.Y += t.velocity
		if t.pos.Y > t.grid.theBottomLine {
			t.pos.Y = t.grid.theBottomLine
			t.velocity = 0
		} else {
			if tb != nil && (t.pos.Y+t.grid.tileSize) > tb.pos.Y {
				if tb.value != t.value {
					t.pos.Y = tb.pos.Y - t.grid.tileSize
					t.velocity = 0
				} else {
					t.velocity = 0
				}
			}
		}
		t.calcColumnAndRow()
	}
	return nil
}

func (t *Tile) draw(screen *ebiten.Image) {

	t.drawLinks(screen)

	img, ok := theTileImgLib[t.value]
	if !ok {
		img = t.makeTileImg()
		if img == nil {
			fmt.Println("Cannot make image for tile", t.value)
			return
		}
		theTileImgLib[t.value] = img
	}

	op := &ebiten.DrawImageOptions{}
	op.GeoM.Translate(float64(t.pos.X), float64(t.pos.Y))
	screen.DrawImage(img, op)

	i := t.particleFrame
	if i >= 0 && i <= 17 {
		op = &ebiten.DrawImageOptions{}
		sz := float64(t.grid.tileSize * 2)
		op.GeoM.Scale(sz/particleTileSize, sz/particleTileSize)
		op.GeoM.Translate(float64(t.pos.X-t.grid.tileSize/2), float64(t.pos.Y))
		screen.DrawImage(particleSubImages[i], op)
		t.particleFrame += 1
		if t.particleFrame > 17 {
			t.particleFrame = -1
		}
	}

	if DebugMode {
		str := fmt.Sprintf("%d,%d := %d,%d %d", t.pos.X, t.pos.Y, t.column, t.row, t.velocity)
		ebitenutil.DebugPrintAt(screen, str, t.pos.X, t.pos.Y)
	}
}
