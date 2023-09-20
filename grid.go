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
	"oddstream.games/twenty/sound"
	"oddstream.games/twenty/stroke"
	"oddstream.games/twenty/util"
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

// var modeName = map[GameMode]string{
// 	MODE_TWENTY:   "Twenty",
// 	MODE_BUBBLES:  "Bubbles",
// 	MODE_FLIPFLOP: "Flip Flop",
// 	MODE_PANIC:    "Panic",
// 	MODE_DROP:     "Drop",
// 	MODE_THIRTY:   "Thirty",
// 	MODE_ZEN:      "Zen",
// }

var _ GameScene = (*Grid)(nil)

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
	tilebag                         []int
	stroke                          *stroke.Stroke
	ticks, zenmoves, level          int
	gameOver, gamePaused            bool
	newRowPending                   bool
	imgGrid                         *ebiten.Image
	imgTimebarBackground            *ebiten.Image
	imgTimebarForeground            *ebiten.Image
	secondsRemaining                float64
	highestValue                    int
	imgScore                        *ebiten.Image
	undoStack                       []undoState
	refreshSeconds                  float64
}

func NewGrid(mode GameMode, across, down int, refreshSeconds float64) *Grid {
	g := &Grid{mode: mode, tilesAcross: across, tilesDown: down, refreshSeconds: refreshSeconds, level: 0}

	for i := 0; i < g.tilesAcross*g.tilesDown; i++ {
		g.tilebag = append(g.tilebag, rand.Intn(3)+1)
	}
	for i := 0; i < g.tilesAcross; i++ {
		g.tilebag = append(g.tilebag, rand.Intn(5)+1)
	}
	g.shuffleTilebag()

	// can't add first two rows of tile yet, as Layout() has not been called

	return g
}

func (g *Grid) findHighestValue() int {
	var highest int
	for _, t := range g.tiles {
		if t.value > highest {
			highest = t.value
		}
	}
	return highest
}

func (g *Grid) duplicateTiles() bool {
	for i := range g.tiles {
		v := g.tiles[i].value
		for j := i + 1; j < len(g.tiles); j++ {
			if g.tiles[j].value == v {
				return true
			}
		}
	}
	sound.Play("Tick")
	// fmt.Println("No duplicates")
	return false
}

func (g *Grid) addTile(pos image.Point, v int) {
	t := NewTile(g, pos, v)
	g.tiles = append(g.tiles, t)
}

func (g *Grid) shuffleTilebag() {
	rand.Shuffle(len(g.tilebag), func(i, j int) {
		g.tilebag[i], g.tilebag[j] = g.tilebag[j], g.tilebag[i]
	})
}

func (g *Grid) peekTilebag() int {
	v := g.tilebag[len(g.tilebag)-1]
	return v
}

func (g *Grid) popTilebag() int {
	v := g.tilebag[len(g.tilebag)-1]
	g.tilebag = g.tilebag[:len(g.tilebag)-1]
	return v
}

func (g *Grid) getNextValue(x int) int {
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
	if len(g.tilebag) < g.tilesAcross {
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
		if t.row() == row && t.column() == column {
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
	if t := g.findTileAt(v.X, v.Y); t != nil {
		if t.isLerping {
			v.Stroke.Cancel()
		} else {
			g.stroke = v.Stroke
			g.stroke.SetDraggedObject(t)
			g.undoPush()
			t.startDrag()
		}
		// fmt.Println("drag start", t.value)
	} else {
		v.Stroke.Cancel()
	}
}

func (g *Grid) interpolatedDrag(t *Tile, oldPos, newPos image.Point) {
	// let's say tile size is 100
	// we want to test every 100/2 = 50
	// if dist is 50
	// if dist is 100
	// if dist is 200
	dist := util.Distance(oldPos, newPos)
	steps := dist / float64(g.tileSize)
	fmt.Printf("size %d, dist %f, steps %f\n", g.tileSize, dist, steps)
	for n := 0.1; n <= 1.0; n += 0.1 {
		prevPos := t.pos
		x := int(util.Lerp(float64(oldPos.X), float64(newPos.X), n))
		y := int(util.Lerp(float64(oldPos.Y), float64(newPos.Y), n))
		t.setPos(image.Point{x, y})
		t.constrainToGrid()
		if t.verbotenOverlap() {
			// fmt.Println("Verboten overlap")
			// sound.Play("Tick")
			t.setPos(prevPos)
			break
		}
	}
}

func (g *Grid) shortDrag(t *Tile, oldPos, newPos image.Point) {
	t.setPos(newPos)
	t.constrainToGrid()
	if t.verbotenOverlap() {
		t.setPos(oldPos)
	}
}

func (g *Grid) strokeMove(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		t := obj // just to make this more readable
		oldPos := t.pos
		dx, dy := v.Stroke.PositionDiff()
		newPos := t.dragStart.Add(image.Point{dx, dy})
		dist := util.DistanceInt(oldPos.X, oldPos.Y, newPos.X, newPos.Y)
		if dist > g.tileSize/2 {
			g.interpolatedDrag(t, oldPos, newPos)
		} else {
			g.shortDrag(t, oldPos, newPos)
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

func (g *Grid) mergeAllColumns() {
	seen := make(map[uint32]*Tile)
	var merges int
	for _, t := range g.tiles {
		if t.column() < 0 || t.column() > g.tilesDown {
			fmt.Println("merge problem - tile out of bounds - game over?", t.column())
			return
		}
		key := uint32(t.row())<<8 | uint32(t.column())
		if seen[key] == nil {
			seen[key] = t
		} else {
			if seen[key].value != t.value {
				fmt.Println("merge value problem")
				// we can't merge these two tiles, because their values are not the same
				sound.Play("Tick")
			}
			g.tilebag = append(g.tilebag, t.value)
			seen[key].value++
			if seen[key].value > g.highestValue {
				g.highestValue = seen[key].value
				// fmt.Println("SCORE: ", g.highestValue)
				if g.highestValue == 10 || g.highestValue == 15 || g.highestValue == 20 {
					g.level += 1
					sound.Play(fmt.Sprintf("LevelUp%d", g.level)) // 1, 2 or 3
				}
				g.imgScore = nil // this will regenerate pseudo tile image
			}
			seen[key].startParticles()
			// TODO think about why we need two calls to breakLinks
			// g.breakLinks(seen[key])
			// g.breakLinks(t)
			sound.Play(fmt.Sprintf("Combo%d", g.level+1)) // 1, 2, 3 or 4
			merges += 1
		}
	}
	if merges > 0 {
		g.tiles = nil
		for _, t := range seen {
			g.tiles = append(g.tiles, t)
		}
	}
}

// getSortedColumnTiles returns a slice of *Tile, sorted into y order,
// so that the lowest tiles come first eg y = {500 400 300 200 100}
func (g *Grid) getSortedColumnTiles(column int) []*Tile {
	var tiles []*Tile
	for _, t := range g.tiles {
		if t.column() == column {
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

func (g *Grid) staticTilesOutsideGrid() bool {
	for _, t := range g.tiles {
		if t.isLerping || t.beingDragged {
			continue
		}
		if !g.gridRectangle.Overlaps(t.rectangle()) {
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
		g.secondsRemaining = g.refreshSeconds
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
		if g.addNewRow() {
			g.lerpUp()
		} else {
			g.gameOver = true
		}
	}
	if inpututil.IsKeyJustPressed(ebiten.KeyU) {
		if state, err := g.undoPop(); err != nil {
			fmt.Println(err)
		} else {
			g.undoDeploy(state)
			g.secondsRemaining = g.refreshSeconds
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
		g.ticks += 1
		g.mergeAllColumns()
		if g.ticks%10 == 0 {
			if g.staticTilesOutsideGrid() {
				g.gameOver = true
				sound.Play("GameOver")
			}
			if !g.newRowPending && g.mode == MODE_ZEN {
				if g.zenmoves == g.tilesAcross-1 || !g.duplicateTiles() {
					g.newRowPending = true
				}
			}
		} else if !g.newRowPending {
			g.secondsRemaining -= ebiten.ActualTPS() / 60.0 / 60.0
			if g.secondsRemaining <= 0.0 || !g.duplicateTiles() {
				g.newRowPending = true
			}
		}
	}

	if g.stroke == nil && g.newRowPending {
		if g.addNewRow() {
			g.lerpUp()
			g.secondsRemaining = g.refreshSeconds
			g.zenmoves = 0
		} else {
			g.gameOver = true
			sound.Play("GameOver")
		}
		g.newRowPending = false
	}

	return nil
}

// Draw draws the current GameScene to the given screen
func (g *Grid) Draw(screen *ebiten.Image) {

	screen.Fill(color.White)

	// ebitenutil.DrawRect(screen,
	// 	float64(g.headerRectangle.Min.X),
	// 	float64(g.headerRectangle.Min.Y),
	// 	float64(g.headerRectangle.Dx()),
	// 	float64(g.headerRectangle.Dy()),
	// 	color.Black)

	if theTileFontFace != nil {
		var str string
		if g.gamePaused {
			str = "PAUSED"
		} else if g.gameOver {
			str = "GAME OVER"
			// } else {
			// 	str = fmt.Sprintf("%d%%", len(g.tiles)*100/(g.tilesAcross*g.tilesDown))
		}
		if len(str) > 0 {
			// str = fmt.Sprintf("UNDO %d", len(g.undoStack))
			// str = fmt.Sprint(len(g.undoStack))
			bound := text.BoundString(theTileFontFace, str)
			text.Draw(screen, str, theTileFontFace,
				g.headerRectangle.Min.X,
				g.headerRectangle.Min.Y+bound.Dy(),
				color.Black)
		}
	}

	if !g.gamePaused && g.mode != MODE_ZEN {
		if !g.gameOver && g.imgTimebarBackground != nil {
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Translate(float64(g.headerRectangle.Min.X), float64(g.headerRectangle.Max.Y-g.tileSize/4))
			screen.DrawImage(g.imgTimebarBackground, op)
		}
		if !g.gameOver && g.imgTimebarForeground != nil {
			w := float64(g.headerRectangle.Dx()) * (g.secondsRemaining / g.refreshSeconds)
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
