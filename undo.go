package main

import (
	"errors"
	"image"
)

type undoTile struct {
	x, y, v int
}

type undoState []undoTile

func (g *Grid) undoPush() {
	g.undoStack = append(g.undoStack, g.undoPack())
}

func (g *Grid) undoPop() (undoState, error) {
	if len(g.undoStack) == 0 {
		return nil, errors.New("undo stack is empty")
	}
	state := g.undoStack[len(g.undoStack)-1]
	g.undoStack = g.undoStack[:len(g.undoStack)-1]
	return state, nil
}

func (g *Grid) undoPack() undoState {
	var state undoState = make([]undoTile, 0, len(g.tiles))
	for _, t := range g.tiles {
		state = append(state, undoTile{x: t.column(), y: t.row(), v: t.value})
	}
	return state
}

func (g *Grid) undoDeploy(state undoState) {
	g.tiles = make([]*Tile, 0, len(state))
	for _, ut := range state {
		pos := image.Point{
			X: g.gridRectangle.Min.X + (ut.x * g.tileSize),
			Y: g.gridRectangle.Min.Y + (ut.y * g.tileSize),
		}
		g.addTile(pos, ut.v)
	}
}
