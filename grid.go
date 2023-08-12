package main

import (
	"image"
	"log"

	"github.com/hajimehoshi/ebiten/v2"
	"oddstream.games/grot/stroke"
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
		c.edges[0] = g.findCell(x, y-1) // North
		c.edges[1] = g.findCell(x+1, y) // East
		c.edges[2] = g.findCell(x, y+1) // South
		c.edges[3] = g.findCell(x-1, y) // West
	}

	{
		g.addTile(0, 0, 1)
		g.addTile(1, 1, 2)
		g.addTile(2, 2, 3)
		g.addTile(3, 3, 4)
		g.addTile(4, 4, 5)
		g.addTile(5, 5, 6)
		g.addTile(6, 6, 7)
	}

	return g
}

func (g *Grid) addTile(x, y int, v TileValue) {
	c := g.findCell(x, y)
	t := NewTile(c, v)
	c.tile = t
	g.tiles = append(g.tiles, t)
}

func (g *Grid) findCell(x, y int) *Cell {
	// cells do not move in the grid, so we can do this...
	i := x + (y * g.cellsAcross)
	if i < 0 || i >= len(g.cells) {
		return nil
	}
	return g.cells[i]
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

func (g *Grid) largestIntersection(t *Tile) *Cell {
	var largestArea int = 0
	var largestCell *Cell = nil
	var tr image.Rectangle = image.Rectangle{Min: t.pos, Max: image.Point{X: t.pos.X + g.cellSize, Y: t.pos.Y + g.cellSize}}
	for _, c := range g.cells {
		cr := image.Rectangle{Min: c.pos, Max: image.Point{X: c.pos.X + g.cellSize, Y: c.pos.Y + g.cellSize}}
		inter := cr.Intersect(tr)
		area := inter.Dx() * inter.Dy()
		if area > largestArea {
			largestArea = area
			largestCell = c
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
}

func (g *Grid) strokeMove(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		dx, dy := v.Stroke.PositionDiff()
		obj.dragBy(dx, dy)
	}
}

func (g *Grid) strokeStop(v stroke.StrokeEvent) {
	switch obj := g.stroke.DraggedObject().(type) {
	case *Tile:
		if obj.wasDragged() {
			if cdst := g.largestIntersection(obj); cdst == nil {
				obj.cancelDrag()
			} else {
				if cdst.tile != nil {
					obj.cancelDrag()
				} else {
					obj.stopDrag()
					g.moveTile(obj.cell, cdst)
					g.gravity()
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
	t := src.tile

	src.tile = nil

	dst.tile = t
	t.cell = dst

	t.lerpTo(dst.pos)
}

func (g *Grid) gravity() {
	for {
		tilesMoved := false

		for row := g.cellsDown - 1; row >= 0; row-- {
			for col := 0; col < g.cellsAcross; col++ {
				cs := g.findCell(col, row)
				if cs.tile == nil { // this cell is empty
					if cn := cs.edges[0]; cn != nil { // this cell has a cell above it
						if cn.tile != nil { // this cell has a tile in it
							g.moveTile(cn, cs)
							tilesMoved = true
						}
					}
				}
			}
		}

		if !tilesMoved {
			break
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
		c.pos = image.Point{
			g.leftMargin + (c.x * g.cellSize),
			g.topMargin + (c.y * g.cellSize),
		}
	}
	clear(TileImgLib)
	// for tv := range TileImgLib {
	// 	delete(TileImgLib, tv)
	// }
	TileFontFace = tileFontFace(g.cellSize / 2)

	for _, t := range g.tiles {
		t.pos = t.cell.pos
		// t.lerpTo(t.cell.pos)
		// fmt.Println(t.cell.pos, t.value, t.pos)
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

	// individual cells are not updated
	for _, t := range g.tiles {
		t.update()
	}
	return nil
}

// Draw draws the current GameScene to the given screen
func (g *Grid) Draw(screen *ebiten.Image) {
	screen.Fill(ColorBackground)
	// individual cells are not drawn
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
