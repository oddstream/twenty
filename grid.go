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
	"github.com/hajimehoshi/ebiten/v2/text"
	"golang.org/x/image/font"
	"oddstream.games/grot/sound"
	"oddstream.games/grot/stroke"
)

type GameMode int

const (
	MODE_TWENTY GameMode = iota
	MODE_BUBBLES
	MODE_FLIPFLOP
	MODE_PANIC
	MODE_DROP
	MODE_THIRTY
	MODE_ZEN
)

var modeName = map[GameMode]string{
	MODE_TWENTY:   "Twenty",
	MODE_BUBBLES:  "Bubbles",
	MODE_FLIPFLOP: "Flip Flop",
	MODE_PANIC:    "Panic",
	MODE_DROP:     "Drop",
	MODE_THIRTY:   "Thirty",
	MODE_ZEN:      "Zen",
}

var _ GameScene = (*Grid)(nil)

const refreshSeconds float64 = 12.0

// Grid is a container object, for a 2-dimensional array of Cells
// and a slice of Tiles
type Grid struct {
	mode                            GameMode
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
	ticks, zenmoves, level          int
	gameOver, gamePaused            bool
	imgHeaderFooter, imgGrid        *ebiten.Image // debug
	imgTimebarBackground            *ebiten.Image
	imgTimebarForeground            *ebiten.Image
	secondsRemaining                float64
	highestValue                    TileValue
	imgScore                        *ebiten.Image
}

func NewGrid(mode GameMode, across, down int) *Grid {
	g := &Grid{mode: mode, tilesAcross: across, tilesDown: down, level: 0}

	for i := 0; i < g.tilesAcross*g.tilesDown; i++ {
		g.tilebag = append(g.tilebag, TileValue(rand.Intn(3)+1))
	}
	g.tilebag = append(g.tilebag, 4)
	g.tilebag = append(g.tilebag, 4)
	g.tilebag = append(g.tilebag, 5)
	g.shuffleTilebag()

	// g.cq = NewCmdQueue(100)

	// can't add first two rows of tile yet, as Layout() has not been called

	return g
}

func (g *Grid) findHighestValue() TileValue {
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

func (g *Grid) shuffleTilebag() {
	rand.Shuffle(len(g.tilebag), func(i, j int) {
		g.tilebag[i], g.tilebag[j] = g.tilebag[j], g.tilebag[i]
	})
}

func (g *Grid) peekTilebag() TileValue {
	v := g.tilebag[len(g.tilebag)-1]
	return v
}

func (g *Grid) popTilebag() TileValue {
	v := g.tilebag[len(g.tilebag)-1]
	g.tilebag = g.tilebag[:len(g.tilebag)-1]
	return v
}

func (g *Grid) getNextValue(x int) TileValue {
	// original game does not add tiles with same value as tile above
	// not sure if this is by design, or to avoid moving-tile weirdness
	if g.mode != MODE_DROP {
		tabove := g.findTile(x, g.tilesDown-1)
		if tabove != nil {
			tries := 0
			for g.peekTilebag() == tabove.value {
				tries += 1
				if tries > 7 {
					break
				}
				// fmt.Println("shuffle", tabove.value)
				g.shuffleTilebag()
			}
		}
	}
	return g.popTilebag()
}

func (g *Grid) addNewRow() bool {
	if len(g.tilebag) < 7 {
		fmt.Println("Not enough tiles in tilebag")
		return false
	}
	g.shuffleTilebag()
	var targetRect image.Rectangle
	if g.mode == MODE_DROP {
		// In drop mode, we would start the new tiles off in the header,
		// but then this would register as game over,
		// so we put them at the top of the grid rectangle.
		// If there are aleady tiles there, then it's game over.
		for x := 0; x < g.tilesAcross; x++ {
			if t := g.findTile(x, 0); t != nil {
				fmt.Println("tile", t.value, "found in top row")
				return false
			}
		}
		targetRect = g.gridRectangle
	} else {
		targetRect = g.footerRectangle
	}
	for x := 0; x < g.tilesAcross; x++ {
		v := g.getNextValue(x)
		g.addTile(image.Point{
			X: targetRect.Min.X + (x * g.tileSize),
			Y: targetRect.Min.Y},
			v)
	}
	// TODO if level > 0 (ie imgScore is 10 or greater)
	// then link two tiles
	// randomly picked, horz and/or vert
	/*
		n := rand.Intn(g.tilesAcross - 1)
		t1 := g.findTile(n, g.tilesDown)   // tile is in the footer
		t2 := g.findTile(n+1, g.tilesDown) // tile is in the footer
		if t1 != nil && t2 != nil {
			fmt.Println("rand", n, "link tiles", t1.column, t1.row, "and", t2.column, t2.row)
			g.linkTwoTiles(t1, t2)
		}

		n = rand.Intn(g.tilesAcross - 1)
		t1 = g.findTile(n, g.tilesDown)   // tile is in the footer
		t2 = g.findTile(n, g.tilesDown-1) // tile is in the footer
		if t1 != nil && t2 != nil {
			fmt.Println("rand", n, "link tiles", t1.column, t1.row, "and", t2.column, t2.row)
			g.linkTwoTiles(t1, t2)
		}
	*/
	return true
}

func (g *Grid) lerpUp() {
	if g.mode != MODE_DROP {
		for _, t := range g.tiles {
			pos := t.pos
			pos.Y -= g.tileSize
			t.lerpTo(pos)
		}
	}
}

func (g *Grid) findTile(column, row int) *Tile {
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

// boxInGrid returns true if r is entirely within the grid rectangle
func (g *Grid) tileCompletelyInGrid(t *Tile) bool {
	r := t.rectangle()
	if r.Min.X < g.gridRectangle.Min.X {
		return false
	}
	if r.Min.Y < g.gridRectangle.Min.Y {
		return false
	}
	if r.Max.X > g.gridRectangle.Max.X {
		return false
	}
	if r.Max.Y > g.gridRectangle.Max.Y {
		return false
	}
	return true
}

func (g *Grid) largestTileIntersection(t1 *Tile) (*Tile, int) {
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
	return largestTile, largestArea
}

func (g *Grid) strokeStart(v stroke.StrokeEvent) {
	// g.stroke = v.Stroke
	if t := g.findTileAt(v.X, v.Y); t != nil {
		if t.links != 0 || t.isLerping {
			v.Stroke.Cancel()
		} else {
			g.stroke = v.Stroke
			g.stroke.SetDraggedObject(t)
			t.startDrag()
		}
		// fmt.Println("drag start", t.value)
	} else {
		v.Stroke.Cancel()
	}
}

func (g *Grid) strokeMove(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		tdragged := obj // to make this more readable
		oldPos := tdragged.pos

		// dx, dy := v.Stroke.PositionDiff()
		// var tdraggers []*Tile
		// tdraggers = g.appendLinkedTiles(tdraggers, tdragged)
		// for _, t := range tdraggers {
		// 	t.dragBy(dx, dy)
		// }

		tdragged.dragBy(v.Stroke.PositionDiff())

		// disallow move if tile goes off grid canvas
		if !g.tileCompletelyInGrid(tdragged) {
			tdragged.setPos(oldPos)
			// for _, t := range tdraggers {
			// 	t.dragBy(-dx, -dy)
			// }
			// fmt.Println("dragged tile going off grid")
			break
		}

		// disallow move if tile moves over another tile with different value
		tdst, _ := g.largestTileIntersection(tdragged)
		if tdst == nil {
			// move to an empty area
		} else if tdst.value == tdragged.value {
			// move to another tile with same value, that's fine
		} else {
			// overlapping with a tile with a different value, verboten!
			tdragged.setPos(oldPos)
			// for _, t := range tdraggers {
			// 	t.dragBy(-dx, -dy)
			// }
			// fmt.Println("dragged tile overlap with", tdst.value)
		}
	}
}

func (g *Grid) strokeStop(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		if !obj.wasDragged() {
			break
		}
		sound.Play("Drop")
		obj.stopDrag()
		obj.snapToColumn()
		// in twenty zen, just dropping/moving a tile
		// does not count toward creating a new row
		// but that doesn't reward combos
		// so we don't do that here
		if g.mode == MODE_ZEN {
			g.zenmoves++
			if g.zenmoves%(g.tilesAcross-1) == 0 {
				if g.addNewRow() {
					g.lerpUp()
				} else {
					g.gameOver = true
				}
			}
		}
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
	if g.gamePaused || g.gameOver {
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

func (g *Grid) gravityColumn(column int) {
	coltiles := g.getSortedColumnTiles(column) // eg y are {500 400 300 200 100}
	// fmt.Println("gravityColumn", column, len(coltiles), "tiles")
	// for _, t := range tiles {
	// 	fmt.Println(t.column, t.value, t.pos)
	// }

	for _, t := range coltiles {
		if t.beingDragged || t.isLerping {
			return
		}
	}

	x := g.gridRectangle.Min.X + (column * g.tileSize)
	y := g.theBottomLine

	// the 0th tile will always be on the bottom line
	if len(coltiles) > 0 {
		pos := image.Point{X: x, Y: y}
		coltiles[0].lerpTo(pos)
	}

	// if the values are the same, tile 1 will be over tile 0 (same y),
	// otherwise tile 1 will be above (-y) tile 0
	for i := 1; i < len(coltiles); i++ {
		t0 := coltiles[i-1]
		t1 := coltiles[i]

		if t0.value == t1.value {
			// don't move y up
			pos := image.Point{X: x, Y: y}
			t1.lerpTo(pos)
		} else {
			y -= g.tileSize
			pos := image.Point{X: x, Y: y}
			t1.lerpTo(pos)
		}
	}
}

func (g *Grid) gravityAllColumns() {
	for column := 0; column < g.tilesAcross; column++ {
		g.gravityColumn(column)
	}
}

func (g *Grid) mergeAllColumns() {
	seen := make(map[int]*Tile)
	var merges int
	for _, t := range g.tiles {
		key := t.row<<8 | t.column
		if seen[key] != nil {
			if seen[key].value != t.value {
				fmt.Println("merge logic problem - is game over?", g.gameOver)
			}
			g.tilebag = append(g.tilebag, t.value)
			seen[key].value++
			if seen[key].value > g.highestValue {
				g.highestValue = seen[key].value
				var valueTotal TileValue
				for _, t2 := range g.tiles {
					valueTotal += t2.value
				}
				fmt.Println("SCORE: ", g.highestValue, "VALUE TOTAL:", valueTotal)
				if g.highestValue == 10 || g.highestValue == 15 || g.highestValue == 20 {
					g.level += 1
					sound.Play(fmt.Sprintf("LevelUp%d", g.level)) // 1, 2 or 3
				}
				g.imgScore = nil // this will regenerate pseudo tile image
			}
			seen[key].startParticles()
			// TODO think about why we need two calls to breakLinks
			g.breakLinks(seen[key])
			g.breakLinks(t)
			sound.Play(fmt.Sprintf("Combo%d", g.level+1)) // 1, 2, 3 or 4
			merges += 1
		} else {
			seen[key] = t
		}
	}
	if merges > 0 {
		g.tiles = nil
		for _, t := range seen {
			g.tiles = append(g.tiles, t)
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

func (g *Grid) rectangleContainsStaticTiles(rect image.Rectangle) bool {
	for _, t := range g.tiles {
		if t.isLerping || t.beingDragged {
			continue
		}
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

	clear(theTileImgLib)
	clear(theTileLinkImgLib)
	// for tv := range TileImgLib {
	// 	delete(TileImgLib, tv)
	// }
	theTileFontFace = tileFontFace(g.tileSize / 2)

	// reposition the tiles
	for column := 0; column < g.tilesAcross; column++ {
		tiles := g.getSortedColumnTiles(column)
		x := g.leftMargin + (column * g.tileSize)
		y := g.theBottomLine
		for _, t := range tiles {
			t.setPos(image.Point{X: x, Y: y})
			y -= g.tileSize
		}
	}

	if DebugMode {
		dc := gg.NewContext(g.tilesAcross*g.tileSize, g.tileSize)
		dc.SetColor(color.RGBA{0xe0, 0x80, 0x80, 0xff})
		dc.DrawRoundedRectangle(0, 0, float64(g.tilesAcross*g.tileSize), float64(g.tileSize), float64(g.tileSize)/10)
		dc.Fill()
		dc.Stroke()
		g.imgHeaderFooter = ebiten.NewImageFromImage(dc.Image())
	}
	{
		dc := gg.NewContext(g.tilesAcross*g.tileSize, g.tilesDown*g.tileSize)
		dc.SetColor(color.RGBA{0xe0, 0xe0, 0xe0, 0xff})
		dc.DrawRoundedRectangle(0, 0, float64(g.tilesAcross*g.tileSize), float64(g.tilesDown*g.tileSize), float64(g.tileSize)/10)
		dc.Fill()
		dc.Stroke()
		g.imgGrid = ebiten.NewImageFromImage(dc.Image())
	}
	{
		dc := gg.NewContext(g.tilesAcross*g.tileSize, g.tileSize/4)
		dc.SetColor(color.RGBA{R: 0xe0, G: 0xe0, B: 0xe0, A: 0xff})
		dc.DrawRoundedRectangle(0, 0, float64(g.tilesAcross*g.tileSize), float64(g.tileSize/4), float64(g.tileSize)/10)
		dc.Fill()
		dc.Stroke()
		g.imgTimebarBackground = ebiten.NewImageFromImage(dc.Image())
		dc.Clear()
		dc.SetColor(color.RGBA{R: 0x80, G: 0x80, B: 0x80, A: 0xff})
		dc.DrawRoundedRectangle(0, 0, float64(g.tilesAcross*g.tileSize), float64(g.tileSize/4), float64(g.tileSize)/10)
		dc.Fill()
		dc.Stroke()
		g.imgTimebarForeground = ebiten.NewImageFromImage(dc.Image())
	}

	if g.oldWindowHeight == 0 && g.oldWindowWidth == 0 {
		fmt.Println("init")
		for x := 0; x < g.tilesAcross; x++ {
			v := g.getNextValue(x)
			g.addTile(image.Point{
				X: g.gridRectangle.Min.X + (x * g.tileSize),
				Y: g.theBottomLine},
				v)
			v = g.getNextValue(x)
			g.addTile(image.Point{
				X: g.gridRectangle.Min.X + (x * g.tileSize),
				Y: g.theBottomLine - g.tileSize},
				v)
		}
		// g.linkTwoTiles(g.findTile(1, 6), g.findTile(2, 6))
		// g.linkTwoTiles(g.findTile(3, 7), g.findTile(3, 6))
		g.highestValue = g.findHighestValue()
		g.secondsRemaining = refreshSeconds
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
	// if inpututil.IsKeyJustPressed(ebiten.KeyG) {
	// 	g.gravityAllColumns()
	// }
	// if inpututil.IsKeyJustPressed(ebiten.KeyM) {
	// 	g.mergeAllColumns()
	// }
	if inpututil.IsKeyJustPressed(ebiten.KeyN) {
		if g.addNewRow() {
			g.lerpUp()
		} else {
			g.gameOver = true
		}
	}
	if inpututil.IsKeyJustPressed(ebiten.KeyBackspace) {
		theSM.Switch(NewMenu())
	}
	if inpututil.IsKeyJustPressed(ebiten.KeySpace) {
		g.gamePaused = !g.gamePaused
	}

	for _, t := range g.tiles {
		t.update()
	}

	if !(g.gameOver || g.gamePaused) {
		g.ticks = g.ticks + 1
		if !g.rectangleContainsStaticTiles(g.footerRectangle) {
			if g.ticks%10 == 0 {
				g.gravityAllColumns()
				g.mergeAllColumns()
			}
		}
	}

	if !g.gameOver && g.rectangleContainsStaticTiles(g.headerRectangle) {
		g.gameOver = true
		sound.Play("GameOver")
	}

	if !(g.gameOver || g.gamePaused || g.mode == MODE_ZEN) {
		g.secondsRemaining -= ebiten.ActualTPS() / 60.0 / 60.0
		if g.secondsRemaining <= 0.0 {
			if g.addNewRow() {
				g.lerpUp()
				g.secondsRemaining = refreshSeconds
			} else {
				g.gameOver = true
			}
		}
	}

	return nil
}

// Draw draws the current GameScene to the given screen
func (g *Grid) Draw(screen *ebiten.Image) {

	screen.Fill(color.RGBA{0xff, 0xff, 0xff, 0xff})

	if g.imgHeaderFooter != nil {
		if g.rectangleContainsStaticTiles(g.headerRectangle) {
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Translate(float64(g.headerRectangle.Min.X), float64(g.headerRectangle.Min.Y))
			screen.DrawImage(g.imgHeaderFooter, op)
		}
		if g.rectangleContainsStaticTiles(g.footerRectangle) {
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Translate(float64(g.footerRectangle.Min.X), float64(g.footerRectangle.Min.Y))
			screen.DrawImage(g.imgHeaderFooter, op)
		}
	}

	if g.gamePaused {
		str := "PAUSED"
		bound, _ := font.BoundString(theTileFontFace, str)
		text.Draw(screen, str, theTileFontFace,
			g.headerRectangle.Min.X,
			g.headerRectangle.Min.Y+int(bound.Max.Y),
			color.Black)
	}

	if !g.gamePaused && g.mode != MODE_ZEN {
		if !g.gameOver && g.imgTimebarBackground != nil {
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Translate(float64(g.headerRectangle.Min.X), float64(g.headerRectangle.Max.Y-g.tileSize/4))
			screen.DrawImage(g.imgTimebarBackground, op)
		}
		if !g.gameOver && g.imgTimebarForeground != nil {
			w := float64(g.headerRectangle.Dx()) * (g.secondsRemaining / refreshSeconds)
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Scale(w/float64(g.headerRectangle.Dx()), 1.0)
			op.GeoM.Translate(float64(g.headerRectangle.Min.X), float64(g.headerRectangle.Max.Y-g.tileSize/4))
			screen.DrawImage(g.imgTimebarForeground, op)
		}
	}

	if g.imgScore == nil {
		t := &Tile{grid: g, value: g.highestValue}
		g.imgScore = t.makeTileImg()
	}
	if g.imgScore != nil {
		op := &ebiten.DrawImageOptions{}
		op.GeoM.Scale(0.5, 0.5)
		op.GeoM.Translate(float64(g.headerRectangle.Max.X-g.tileSize), float64(g.headerRectangle.Min.Y))
		screen.DrawImage(g.imgScore, op)
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
	// ebitenutil.DrawLine(screen, float64(g.gridRectangle.Min.X), float64(g.theBottomLine), float64(g.gridRectangle.Max.X), float64(g.theBottomLine), color.RGBA{0xff, 0, 0, 0xff})
}
