package main

import (
	"image/color"
	"math"

	"github.com/hajimehoshi/ebiten/v2"
)

// Menu represents a game state.
type Menu struct {
	widgets []Widget
	input   *Input
}

var MenuBackground = color.RGBA{R: 0x40, G: 0x40, B: 0x40, A: 0xff}

// NewMenu creates and initializes a Menu/GameState object
func NewMenu() *Menu {
	i := NewInput()
	s := &Menu{input: i}

	s.widgets = []Widget{
		NewLabel("Twenty", theAcmeFonts.large),
		NewTextButton("Twenty", 200, 50, theAcmeFonts.normal, func() {
			theSM.Switch(NewGrid(MODE_TWENTY, 7, 8, 12.0))
		}, i),
		NewTextButton("Big Twenty", 200, 50, theAcmeFonts.normal, func() {
			theSM.Switch(NewGrid(MODE_TWENTY, 9, 10, 12.0))
		}, i),
		NewTextButton("Little Twenty", 200, 50, theAcmeFonts.normal, func() {
			theSM.Switch(NewGrid(MODE_TWENTY, 5, 6, 10.0))
		}, i),
		// NewTextButton("Bubbles", 200, 50, TheAcmeFonts.normal, func() {
		// 	theSM.Switch(NewGrid(MODE_BUBBLES, 7, 8))
		// }, i),
		// NewTextButton("Flip Flop", 200, 50, TheAcmeFonts.normal, func() {
		// 	theSM.Switch(NewGrid(MODE_PANIC, 7, 8))
		// }, i),
		// NewTextButton("Panic", 200, 50, TheAcmeFonts.normal, func() {
		// 	theSM.Switch(NewGrid(MODE_PANIC, 7, 8))
		// }, i),
		NewTextButton("Drop", 200, 50, theAcmeFonts.normal, func() {
			theSM.Switch(NewGrid(MODE_DROP, 7, 8, 12.0))
		}, i),
		NewTextButton("Thirty", 200, 50, theAcmeFonts.normal, func() {
			theSM.Switch(NewGrid(MODE_THIRTY, 7, 8, 12.0))
		}, i),
		NewTextButton("Zen", 200, 50, theAcmeFonts.normal, func() {
			theSM.Switch(NewGrid(MODE_ZEN, 7, 8, math.MaxFloat64))
		}, i),
	}

	return s
}

// Layout implements ebiten.Game's Layout
func (s *Menu) Layout(outsideWidth, outsideHeight int) (int, int) {

	xCenter := outsideWidth / 2
	yPlaces := []int{} // golang gotcha: can't use len(s.widgets) to make an array
	slots := len(s.widgets) + 1
	for i := 0; i < slots; i++ {
		yPlaces = append(yPlaces, (outsideHeight/slots)*i)
	}

	for i, w := range s.widgets {
		w.SetPosition(xCenter, yPlaces[i+1])
	}

	return outsideWidth, outsideHeight
}

// Update updates the current game state.
func (s *Menu) Update() error {

	s.input.Update()

	return nil
}

// Draw draws the current GameState to the given screen
func (s *Menu) Draw(screen *ebiten.Image) {
	screen.Fill(MenuBackground)

	for _, d := range s.widgets {
		d.Draw(screen)
	}
}
