package main

import (
	"fmt"
	"image"
	"image/color"
	"log"
	"math/rand"
	"sort"

	"github.com/fogleman/gg"
	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
	"golang.org/x/exp/slices"
	"oddstream.games/grot/sound"
	"oddstream.games/grot/stroke"
)

// Grid is a container object, for a 2-dimensional array of Cells
// and a slice of Tiles
type Grid struct {
	oldWindowWidth, oldWindowHeight int
	tilesAcross, tilesDown          int
	tileSize                        int // tiles are always square
	leftMargin, topMargin           int
	headerRectangle                 image.Rectangle
	gridRectangle                   image.Rectangle
	footerRectangle                 image.Rectangle
	theBottomLine                   int
	tiles                           []*Tile
	tilebag                         []TileValue
	stroke                          *stroke.Stroke
	moves, combo                    int
	gameOver                        bool
	imgHeaderFooter, imgGrid        *ebiten.Image // debug
}

func NewGrid(across, down int) *Grid {
	g := &Grid{tilesAcross: across, tilesDown: down}

	for i := 0; i < g.tilesAcross*g.tilesDown; i++ {
		g.tilebag = append(g.tilebag, TileValue(rand.Intn(3)+1))
	}

	return g
}

func (g *Grid) highestValue() TileValue {
	var highest TileValue
	for _, t := range g.tiles {
		if t.value > highest {
			highest = t.value
		}
	}
	return highest
}

func (g *Grid) addTile(pos image.Point, v TileValue) {
	t := NewTile(g, pos, v)
	g.tiles = append(g.tiles, t)
}

func (g *Grid) addFooterRow() {
	if len(g.tilebag) < 7 {
		fmt.Printf("Not enough tiles in tilebag")
		return
	}
	rand.Shuffle(len(g.tilebag), func(i, j int) {
		g.tilebag[i], g.tilebag[j] = g.tilebag[j], g.tilebag[i]
	})
	for x := 0; x < g.tilesAcross; x++ {
		v := g.tilebag[len(g.tilebag)-1]
		g.tilebag = g.tilebag[:len(g.tilebag)-1]
		g.addTile(image.Point{
			X: g.footerRectangle.Min.X + (x * g.tileSize),
			Y: g.footerRectangle.Min.Y},
			v)
	}
}

func (g *Grid) lerpUp() {
	for _, t := range g.tiles {
		pos := t.pos
		pos.Y -= g.tileSize
		t.lerpTo(pos)
	}
}

func (g *Grid) findTile(row, column int) *Tile {
	for _, t := range g.tiles {
		if t.row == row && t.column == column {
			return t
		}
	}
	return nil
}

func (g *Grid) findTileAt(x, y int) *Tile {
	for _, t := range g.tiles {
		x0 := t.pos.X
		y0 := t.pos.Y
		x1 := x0 + g.tileSize
		y1 := y0 + g.tileSize
		if x > x0 && y > y0 && x < x1 && y < y1 {
			return t
		}
	}
	return nil
}

func (g *Grid) incMoves() {
	g.moves++
	if g.moves%(g.tilesAcross-1) == 0 {
		g.addFooterRow()
		g.lerpUp()
	}
}

// boxInGrid returns true if r is entirely within the grid rectangle
func (g *Grid) tileCompletelyInGrid(t *Tile) bool {
	if t.pos.X < g.gridRectangle.Min.X {
		return false
	}
	if t.pos.Y < g.gridRectangle.Min.Y {
		return false
	}
	if t.pos.X+g.tileSize > g.gridRectangle.Max.X {
		return false
	}
	if t.pos.Y+g.tileSize > g.gridRectangle.Max.Y {
		return false
	}
	return true
}

func (g *Grid) largestTileIntersection(t1 *Tile) *Tile {
	var largestArea int
	var largestTile *Tile
	t1rect := t1.rectangle()
	for _, t2 := range g.tiles {
		if t1 == t2 {
			continue
		}
		t2rect := t2.rectangle()
		inter := t2rect.Intersect(t1rect)
		if !inter.Empty() {
			area := inter.Dx() * inter.Dy()
			if area > largestArea {
				largestArea = area
				largestTile = t2
			}
		}
	}
	return largestTile
}

func (g *Grid) strokeStart(v stroke.StrokeEvent) {
	g.stroke = v.Stroke
	if t := g.findTileAt(v.X, v.Y); t != nil {
		g.stroke.SetDraggedObject(t)
		t.startDrag()
		t.velocity = 0
		// fmt.Println("drag start", t.value)
	} else {
		g.stroke.Cancel()
	}
	g.combo = 0
}

func (g *Grid) strokeMove(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		tdragged := obj // to make this more readable
		oldPos := tdragged.pos

		tdragged.dragBy(v.Stroke.PositionDiff())

		// disallow move if tile goes off grid canvas
		if !g.tileCompletelyInGrid(tdragged) {
			tdragged.setPos(oldPos)
			fmt.Println("dragged tile going off grid")
			break
		}

		// disallow move if tile moves over another tile with different value
		tdst := g.largestTileIntersection(tdragged)
		if tdst == nil {
			// move to an empty cell
		} else if tdst.value == tdragged.value {
			// move to another tile with same value
			g.mergeTiles(tdst, tdragged)
			g.incMoves()
		} else {
			tdragged.setPos(oldPos)
			fmt.Println("dragged tile overlap with", tdst.value)
		}
	}
}

func (g *Grid) strokeStop(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		if !obj.wasDragged() {
			break
		}
		// TODO sounds merging lerping and all sorts
		sound.Play("Drop")
		obj.stopDrag()
		obj.snapToPile()
		g.incMoves()
	}
}

func (g *Grid) strokeCancel(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		obj.cancelDrag()
	}
}

func (g *Grid) strokeTap(v stroke.StrokeEvent) {
	// stroke sends a tap event, and later sends a cancel event
}

func (g *Grid) NotifyCallback(v stroke.StrokeEvent) {
	if g.gameOver {
		return
	}
	switch v.Event {
	case stroke.Start:
		g.strokeStart(v)
	case stroke.Move:
		g.strokeMove(v)
	case stroke.Stop:
		g.strokeStop(v)
	case stroke.Cancel:
		g.strokeCancel(v)
	case stroke.Tap:
		g.strokeTap(v)
	default:
		log.Panic("*** unknown stroke event ***", v.Event)
	}
}

func (g *Grid) deleteTile(t *Tile) {
	if t.beingDragged {
		log.Println("deleteTile: beingDragged")
		return
	}
	g.tiles = slices.DeleteFunc(g.tiles, func(t0 *Tile) bool {
		return t == t0
	})
}

func (g *Grid) mergeTiles(fixed, floater *Tile) {
	if fixed.beingDragged {
		log.Println("mergeTiles: fixed is being dragged")
		return
	}
	g.tilebag = append(g.tilebag, floater.value)

	floater.lerpTo(fixed.pos)
	g.deleteTile(fixed)

	floater.value += 1
	floater.startParticles()

	g.combo += 1
	switch g.combo {
	case 1:
		sound.Play("Combo1")
	case 2:
		sound.Play("Combo2")
	case 3:
		sound.Play("Combo3")
	case 4:
		sound.Play("Combo4")
	}
}

func (g *Grid) findTileAtY(column int, y int) *Tile {
	for _, t := range g.tiles {
		if t.column == column && t.pos.Y == y {
			return t
		}
	}
	return nil
}

func (g *Grid) gravity() {
	for column := 0; column < g.tilesAcross; column++ {
		tiles := g.getSortedColumnTiles(column)
		y := g.theBottomLine
		for _, t := range tiles {
			if t.beingDragged || t.isLerping {
				continue
			}
			t.lerpTo(image.Point{X: g.leftMargin + (column * g.tileSize), Y: y})
			y -= g.tileSize
		}
	}
}

func (g *Grid) postGravityMerging() {
	for column := 0; column < g.tilesAcross; column++ {
		tiles := g.getSortedColumnTiles(column)
		for i := 1; i < len(tiles); i++ {
			ts := tiles[i-1]
			tn := tiles[i]
			if tn.beingDragged || tn.isLerping {
				continue
			}
			if ts.beingDragged || ts.isLerping {
				continue
			}
			if tn.value == ts.value {
				g.mergeTiles(ts, tn)
				break
			}
		}
	}
}

func (g *Grid) getSortedColumnTiles(column int) []*Tile {
	var tiles []*Tile
	for _, t := range g.tiles {
		if t.column == column {
			tiles = append(tiles, t)
		}
	}
	sort.Slice(tiles, func(a, b int) bool {
		return tiles[a].pos.Y > tiles[b].pos.Y // descending order
	})
	// slices.SortFunc[*Tile](tiles, func(a, b int) bool {
	// 	return tiles[a].pos.Y > tiles[b].pos.Y
	// })
	return tiles
}

func (g *Grid) rectangleContainsTiles(rect image.Rectangle) bool {
	for _, t := range g.tiles {
		if rect.Overlaps(t.rectangle()) {
			return true
		}
	}
	return false
}

// Layout implements ebiten.Game's Layout
func (g *Grid) Layout(outsideWidth, outsideHeight int) (int, int) {
	if outsideWidth == g.oldWindowWidth && outsideHeight == g.oldWindowHeight {
		return outsideWidth, outsideHeight
	}

	szw := outsideWidth / g.tilesAcross
	szh := outsideHeight / (g.tilesDown + 2) // add header and footer rows
	var newTileSize int
	if szw < szh {
		newTileSize = szw
	} else {
		newTileSize = szh
	}
	g.tileSize = newTileSize

	g.leftMargin = (outsideWidth - (g.tilesAcross * g.tileSize)) / 2
	g.topMargin = (outsideHeight - ((g.tilesDown + 2) * g.tileSize)) / 2

	g.headerRectangle = image.Rectangle{
		Min: image.Point{X: g.leftMargin, Y: g.topMargin},
		Max: image.Point{X: g.leftMargin + (g.tilesAcross * g.tileSize), Y: g.topMargin + g.tileSize},
	}
	g.gridRectangle = image.Rectangle{
		Min: image.Point{X: g.leftMargin, Y: g.headerRectangle.Max.Y},
		Max: image.Point{X: g.leftMargin + (g.tilesAcross * g.tileSize), Y: g.topMargin + g.tileSize + (g.tilesDown * g.tileSize)},
	}
	g.footerRectangle = image.Rectangle{
		Min: image.Point{X: g.leftMargin, Y: g.gridRectangle.Max.Y},
		Max: image.Point{X: g.leftMargin + (g.tilesAcross * g.tileSize), Y: g.topMargin + g.tileSize + g.tileSize + (g.tilesDown * g.tileSize)},
	}
	g.theBottomLine = g.gridRectangle.Max.Y - g.tileSize

	clear(TileImgLib)
	// for tv := range TileImgLib {
	// 	delete(TileImgLib, tv)
	// }
	TileFontFace = tileFontFace(g.tileSize / 2)

	// reposition the tiles
	for column := 0; column < g.tilesAcross; column++ {
		tiles := g.getSortedColumnTiles(column)
		y := g.gridRectangle.Max.Y - g.tileSize
		for _, t := range tiles {
			t.setPos(image.Point{X: g.leftMargin + (column * g.tileSize), Y: y})
			y -= g.tileSize
		}
	}

	if DebugMode {
		dc := gg.NewContext(g.tilesAcross*g.tileSize, g.tileSize)
		dc.SetColor(color.RGBA{0xf0, 0x80, 0x80, 0xff})
		dc.DrawRectangle(0, 0, float64(g.tilesAcross*g.tileSize), float64(g.tileSize))
		dc.Fill()
		dc.Stroke()
		g.imgHeaderFooter = ebiten.NewImageFromImage(dc.Image())

		dc = gg.NewContext(g.tilesAcross*g.tileSize, g.tilesDown*g.tileSize)
		dc.SetColor(color.RGBA{0x80, 0xf0, 0x80, 0xff})
		dc.DrawRectangle(0, 0, float64(g.tilesAcross*g.tileSize), float64(g.tilesDown*g.tileSize))
		dc.Fill()
		dc.Stroke()
		g.imgGrid = ebiten.NewImageFromImage(dc.Image())
	}

	g.oldWindowWidth = outsideWidth
	g.oldWindowHeight = outsideHeight

	return outsideWidth, outsideHeight
}

// Update updates the current game scene.
func (g *Grid) Update() error {

	if g.stroke == nil {
		stroke.StartStroke(g) // this will set g.stroke when "Start" is received by NotifyCallback
	} else {
		g.stroke.Update()
		if g.stroke.IsReleased() || g.stroke.IsCancelled() {
			g.stroke = nil
		}
	}

	if inpututil.IsKeyJustPressed(ebiten.KeyN) {
		g.addFooterRow()
		g.lerpUp()
	}

	for _, t := range g.tiles {
		t.update()
	}

	if !g.rectangleContainsTiles(g.footerRectangle) {
		g.gravity()
		g.postGravityMerging()
	}

	return nil
}

// Draw draws the current GameScene to the given screen
func (g *Grid) Draw(screen *ebiten.Image) {

	screen.Fill(ColorBackground)
	if g.imgHeaderFooter != nil {
		if g.rectangleContainsTiles(g.headerRectangle) {
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Translate(float64(g.headerRectangle.Min.X), float64(g.headerRectangle.Min.Y))
			screen.DrawImage(g.imgHeaderFooter, op)
		}
		if g.rectangleContainsTiles(g.footerRectangle) {
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Translate(float64(g.footerRectangle.Min.X), float64(g.footerRectangle.Min.Y))
			screen.DrawImage(g.imgHeaderFooter, op)
		}
	}
	if g.imgGrid != nil {
		op := &ebiten.DrawImageOptions{}
		op.GeoM.Translate(float64(g.gridRectangle.Min.X), float64(g.gridRectangle.Min.Y))
		screen.DrawImage(g.imgGrid, op)
	}
	for _, t := range g.tiles {
		if !t.beingDragged {
			t.draw(screen)
		}
	}
	for _, t := range g.tiles {
		if t.beingDragged {
			t.draw(screen)
		}
	}
}
