package main

import (
	"fmt"
	"image/color"

	"github.com/fogleman/gg"
	"github.com/hajimehoshi/ebiten/v2"
	"oddstream.games/grot/util"
)

const (
	LINK_NORTH = 1
	LINK_EAST  = 2
	LINK_SOUTH = 4
	LINK_WEST  = 8
)

var tileLinkage = []struct {
	x int
	y int
}{
	{0, 0},  // dummy at 0th position
	{0, -1}, // N
	{1, 0},  // E
	{0, 0},  // dummy 3
	{1, 1},  // S
	{0, 0},  // dummy 5
	{0, 0},  // dummy 6
	{0, 0},  // dummy 7
	{-1, 0}, // W
}

var tileLinkReciprocal = []uint32{
	0,          // dummy at 0th position
	LINK_SOUTH, // N := S
	LINK_WEST,  // E := W
	0,          // dummy 3
	LINK_NORTH, // S := N
	0,          // dummy 5
	0,          // dummy 6
	0,          // dummy 7
	LINK_EAST,  // W := E
}

var toutesDirections = []uint32{LINK_NORTH, LINK_EAST, LINK_SOUTH, LINK_WEST}

var linkColor = color.RGBA{R: 0x40, G: 0x40, B: 0x40, A: 0xff}

func (t *Tile) makeTileLinkImg(dir uint32) *ebiten.Image {
	isz := t.grid.tileSize
	if isz == 0 {
		return nil
	}
	fsz := float64(isz)
	dc := gg.NewContext(isz, isz)
	dc.SetColor(linkColor)
	switch dir {
	case LINK_NORTH:
		dc.DrawRectangle(fsz*0.333, 0, fsz*0.333, fsz*0.5)
	case LINK_EAST:
		dc.DrawRectangle(fsz*0.5, fsz*0.333, fsz*0.5, fsz*0.333)
	case LINK_SOUTH:
		dc.DrawRectangle(fsz*0.333, fsz*0.5, fsz*0.333, fsz*0.5)
	case LINK_WEST:
		dc.DrawRectangle(0, fsz*0.333, fsz*0.5, fsz*0.333)
	}
	dc.Fill()
	dc.Stroke()
	return ebiten.NewImageFromImage(dc.Image())
}

func (t *Tile) drawLinks(screen *ebiten.Image) {
	if t.links == 0 {
		return
	}
	for _, dir := range toutesDirections {
		if t.links&dir == dir {
			img, ok := theTileLinkImgLib[dir]
			if !ok {
				img = t.makeTileLinkImg(dir)
				if img == nil {
					fmt.Println("Cannot make image for link dir", dir)
					return
				}
				theTileLinkImgLib[dir] = img
			}
			op := &ebiten.DrawImageOptions{}
			op.GeoM.Translate(float64(t.pos.X), float64(t.pos.Y))
			screen.DrawImage(img, op)
		}
	}
}

func (g *Grid) linkTwoTiles(t1, t2 *Tile) {
	for _, dir := range toutesDirections {
		if t2 == g.findTile(t1.column+tileLinkage[dir].x, t1.row+tileLinkage[dir].y) {
			t1.links |= dir
			t2.links |= tileLinkReciprocal[dir]
		}
	}
}

func (g *Grid) breakLinks(t *Tile) {
	if t.links == 0 {
		return
	}
	for _, dir := range toutesDirections {
		if t.links&dir == dir {
			// fmt.Println("a) removing", dir)
			t.links = t.links &^ dir
			if t2 := g.findTile(t.column+tileLinkage[dir].x, t.row+tileLinkage[dir].y); t2 != nil {
				if t2.links&tileLinkReciprocal[dir] != tileLinkReciprocal[dir] {
					fmt.Println("link error", t.links, t2.links)
				}
				// fmt.Println("b) removing", tileLinkReciprocal[dir])
				t2.links = t2.links &^ tileLinkReciprocal[dir]
			}
		}
	}
}

func (g *Grid) appendLinkedTiles(tiles []*Tile, t *Tile) []*Tile {
	tiles = append(tiles, t)
	for _, dir := range toutesDirections {
		if t.links&dir == dir {
			tnext := g.findTile(t.column+tileLinkage[dir].x, t.row+tileLinkage[dir].y)
			if tnext != nil && !util.Contains(tiles, tnext) {
				tiles = g.appendLinkedTiles(tiles, tnext)
			}
		}
	}
	return tiles
}
