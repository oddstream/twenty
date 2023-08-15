package main

import (
	"fmt"
	"log"
	"math/rand"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
	"golang.org/x/exp/slices"
	"oddstream.games/grot/bimap"
	"oddstream.games/grot/sound"
	"oddstream.games/grot/stroke"
	"oddstream.games/grot/util"
)

// Grid is a container object, for a 2-dimensional array of Cells
// and a slice of Tiles
type Grid struct {
	oldWindowWidth, oldWindowHeight int
	cellsAcross, cellsDown          int
	cellSize                        int // cells are always square
	leftMargin, topMargin           int
	cells                           []*Cell
	tiles                           []*Tile
	stroke                          *stroke.Stroke
	moves, combo                    int
	tilebag                         []TileValue
	gameOver                        bool
	ctmap                           *bimap.BiMap[*Cell, *Tile]
}

func NewGrid(across, down int) *Grid {
	g := &Grid{cellsAcross: across, cellsDown: down}
	g.cells = make([]*Cell, across*down)
	for i := range g.cells {
		g.cells[i] = NewCell(g, i%across, i/across)
	}
	// fmt.Println(len(g.cells), "cells made")
	// link the cells together to avoid all that tedious 2d array stuff
	for _, c := range g.cells {
		x := c.x
		y := c.y
		c.N = g.findCell(x, y-1) // North
		c.S = g.findCell(x, y+1) // South
	}

	for i := 0; i < g.cellsAcross*g.cellsDown; i++ {
		g.tilebag = append(g.tilebag, TileValue(rand.Intn(3)+1))
	}

	g.ctmap = bimap.NewBiMap[*Cell, *Tile]()
	g.addRow()
	g.shuffleUp()
	g.addRow()

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

func (g *Grid) addRow() {
	if len(g.tilebag) < 7 {
		fmt.Printf("Not enough tiles in tilebag")
		return
	}
	rand.Shuffle(len(g.tilebag), func(i, j int) {
		g.tilebag[i], g.tilebag[j] = g.tilebag[j], g.tilebag[i]
	})
	y := g.cellsDown - 1
	for x := 0; x < g.cellsAcross; x++ {
		v := g.tilebag[len(g.tilebag)-1]
		g.tilebag = g.tilebag[:len(g.tilebag)-1]
		g.addTile(g.findCell(x, y), v)
	}
}

func (g *Grid) shuffleUp() bool {
	for _, t := range g.tiles {
		if c, ok := g.ctmap.GetInverse(t); ok {
			if c.N == nil {
				// this tile is on a cell, and that cell is at the top of the grid,
				// so we can't move the tile up, so the game is lost
				return false
			}
		}
	}
	for y := 0; y < g.cellsDown; y++ {
		for x := 0; x < g.cellsAcross; x++ {
			c := g.findCell(x, y)
			if g.ctmap.Exists(c) {
				// this cell has a tile, so move it up
				g.moveTile(c, c.N)
			}
		}
	}
	return true
}

func (g *Grid) addTile(c *Cell, v TileValue) {
	if DebugMode && g.ctmap.Exists(c) {
		log.Panic("addTile: cell is not empty")
	}
	t := NewTile(g, c.pos, v)
	g.ctmap.Insert(c, t)
	g.tiles = append(g.tiles, t)
}

func (g *Grid) findCell(x, y int) *Cell {
	// // cells do not move in the grid, so we can do this...
	// i := x + (y * g.cellsAcross)
	// if i < 0 || i >= len(g.cells) {
	// 	return nil
	// }
	// return g.cells[i]
	// ...but that didn't work, and we're prototyping, so brute-force it
	for _, c := range g.cells {
		if c.x == x && c.y == y {
			return c
		}
	}
	return nil
}

func (g *Grid) findCellAt(x, y int) *Cell {
	for _, c := range g.cells {
		if x > c.hitbox.Min.X && y > c.hitbox.Min.Y && x < c.hitbox.Max.X && y < c.hitbox.Max.Y {
			return c
		}
	}
	return nil
}

func (g *Grid) findTileAt(x, y int) *Tile {
	for _, t := range g.tiles {
		x0 := t.pos.X
		y0 := t.pos.Y
		x1 := x0 + g.cellSize
		y1 := y0 + g.cellSize
		if x > x0 && y > y0 && x < x1 && y < y1 {
			return t
		}
	}
	return nil
}

func (g *Grid) incMoves() {
	g.moves++
	if g.moves%(g.cellsAcross-1) == 0 {
		if g.shuffleUp() {
			g.addRow()
		} else {
			g.gameOver = true
			fmt.Println("GAME OVER", g.highestValue())
			sound.Play("GameOver")
		}
	}
}

func (g *Grid) largestIntersection(t *Tile) *Cell {
	var largestArea int = 0
	var largestCell *Cell = nil
	var thitbox = util.MakeHitbox(t.pos, g.cellSize)
	for _, c := range g.cells {
		// if t2, ok := g.ctmap.Get(c); ok {
		// 	if t2 == t {
		// 		continue
		// 	}
		// }
		inter := c.hitbox.Intersect(thitbox)
		if !inter.Empty() {
			area := inter.Dx() * inter.Dy()
			if area > largestArea {
				largestArea = area
				largestCell = c
			}
		}
	}
	return largestCell
}

func (g *Grid) strokeStart(v stroke.StrokeEvent) {
	g.stroke = v.Stroke
	if t := g.findTileAt(v.X, v.Y); t != nil {
		g.stroke.SetDraggedObject(t)
		t.startDrag()
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
		dx, dy := v.Stroke.PositionDiff()
		tdragged.dragBy(dx, dy)
		cdst := g.largestIntersection(tdragged)
		if cdst == nil {
			fmt.Println("no home for dragged tile!?")
			break
		}
		cdragged, ok := g.ctmap.GetInverse(tdragged)
		if !ok {
			log.Panic("strokeMove: homeless dragged tile")
		}
		if cdst == cdragged {
			break
		}
		if tdst, ok := g.ctmap.Get(cdst); !ok {
			// target cell is empty
			g.ctmap.Delete(cdragged)       // old cell no longer holds a tile
			g.ctmap.Insert(cdst, tdragged) // new cell holds the tile
		} else if tdragged.value == tdst.value {
			g.mergeTiles(tdst, tdragged)
			g.incMoves()
		} else {
			tdragged.pos = oldPos
		}
	}
}

func (g *Grid) strokeStop(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		if obj.wasDragged() {
			sound.Play("Drop")
			obj.stopDrag()
			if c, ok := g.ctmap.GetInverse(obj); ok {
				obj.lerpTo(c.pos)
			}
			g.incMoves()
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

func (g *Grid) moveTile(src, dst *Cell) {
	// get the tile linked to the src cell
	t, ok := g.ctmap.Get(src)
	if !ok {
		log.Panic("moveTile: src cell has no tile")
	}

	g.ctmap.DeleteInverse(t) // make the tile t homeless
	g.ctmap.Insert(dst, t)   // link the tile t to the dst cell

	t.lerpTo(dst.pos)
	// t.pos = dst.pos
	// fmt.Println("moving", src.x, src.y, "to", dst.x, dst.y)
}

// func (g *Grid) deleteTile0(t *Tile) {
// 	i := util.IndexOf(g.tiles, t)
// 	if i == -1 {
// 		log.Panic("deleteTile: tile is not in tiles")
// 	}
// 	// make t homeless
// 	t.cell.tile = nil
// 	t.cell = nil
// 	// delete t with GC
// 	if i < len(g.tiles)-1 {
// 		copy(g.tiles[i:], g.tiles[i+1:])
// 	}
// 	g.tiles[len(g.tiles)-1] = nil // or the zero value of T
// 	g.tiles = g.tiles[:len(g.tiles)-1]
// }

func (g *Grid) deleteTile(t *Tile) {
	if t.beingDragged {
		log.Println("deleteTile: beingDragged")
		return
	}
	g.ctmap.DeleteInverse(t) // make the tile t homeless
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

	dst, ok := g.ctmap.GetInverse(fixed)
	if !ok {
		log.Panic("mergeTiles: dst/fixed cell has no tile")
	}
	g.deleteTile(fixed)

	g.ctmap.DeleteInverse(floater) // make the floater tile homeless
	g.ctmap.Insert(dst, floater)   // link the floater to where fixed was
	floater.lerpTo(dst.pos)        // lerp floater to it's new cell position

	floater.value += 1
	dst.startParticles()
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

func (g *Grid) gravity1() {
	// move tile down if cell below is empty
	for _, tn := range g.tiles {
		if tn.beingDragged || tn.isLerping {
			continue
		}
		cn, ok := g.ctmap.GetInverse(tn)
		if !ok {
			log.Panic("gravity1: (1) tile has no cell")
		}
		if cs := cn.S; cs != nil {
			if !g.ctmap.Exists(cs) {
				// there is no tile in this cell
				g.moveTile(cn, cs)
				return
			}
		}
	}
	// merge any stacked tiles of same value
	for _, tn := range g.tiles {
		if tn.beingDragged || tn.isLerping {
			continue
		}
		cn, ok := g.ctmap.GetInverse(tn)
		if !ok {
			log.Panic("gravity1: (2) tile has no cell")
		}
		if cs := cn.S; cs != nil {
			if ts, ok := g.ctmap.Get(cs); ok {
				if !(ts.beingDragged || ts.isLerping) {
					if ts.value == tn.value {
						g.mergeTiles(ts, tn)
						return
					}
				}
			}
		}
	}
}

// Layout implements ebiten.Game's Layout
func (g *Grid) Layout(outsideWidth, outsideHeight int) (int, int) {
	if outsideWidth == g.oldWindowWidth && outsideHeight == g.oldWindowHeight {
		return outsideWidth, outsideHeight
	}

	szw := outsideWidth / g.cellsAcross
	szh := outsideHeight / g.cellsDown
	var newCellSize int
	if szw < szh {
		newCellSize = szw
	} else {
		newCellSize = szh
	}

	g.cellSize = newCellSize
	g.leftMargin = (outsideWidth - (g.cellsAcross * g.cellSize)) / 2
	g.topMargin = (outsideHeight - (g.cellsDown * g.cellSize)) / 2
	// fmt.Println("Cell size", g.cellSize, "Left margin", g.leftMargin, "Top margin", g.topMargin)

	for _, c := range g.cells {
		c.setPos(g.leftMargin+(c.x*g.cellSize), g.topMargin+(c.y*g.cellSize))
	}
	clear(TileImgLib)
	// for tv := range TileImgLib {
	// 	delete(TileImgLib, tv)
	// }
	TileFontFace = tileFontFace(g.cellSize / 2)

	for _, t := range g.tiles {
		if c, ok := g.ctmap.GetInverse(t); ok {
			t.pos = c.pos
			// t.lerpTo(c.pos)
			// fmt.Println(c.pos, t.value, t.pos)
		}
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

	if inpututil.IsKeyJustReleased(ebiten.KeyC) {
		for _, c := range g.cells {
			if t, ok := g.ctmap.Get(c); ok {
				if c2, ok := g.ctmap.GetInverse(t); ok {
					if c != c2 {
						fmt.Println("fail at cell", c.x, c.y)
					}
				}
			}
		}
		for _, t := range g.tiles {
			if c, ok := g.ctmap.GetInverse(t); !ok {
				fmt.Println("homeless tile", t.value)
			} else {
				if t.pos != c.pos {
					fmt.Println("tile/cell pos fail at tile", t.value)
				}
			}
		}
	}

	for _, c := range g.cells {
		c.update()
	}
	for _, t := range g.tiles {
		t.update()
	}

	g.gravity1()

	return nil
}

// Draw draws the current GameScene to the given screen
func (g *Grid) Draw(screen *ebiten.Image) {
	screen.Fill(ColorBackground)
	for _, c := range g.cells {
		c.draw(screen)
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
