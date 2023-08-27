package main

import "github.com/hajimehoshi/ebiten/v2"

type TwentyGame struct {
}

var theSM *SceneManager = &SceneManager{}

// NewGame generates a new Game object.
func NewGame() (*TwentyGame, error) {
	g := &TwentyGame{}
	// theSM.Switch(NewSplash())
	theSM.Switch(NewSplash())
	return g, nil
}

// Layout implements ebiten.Game's Layout.
func (g *TwentyGame) Layout(outsideWidth, outsideHeight int) (screenWidth, screenHeight int) {
	WindowWidth = outsideWidth
	WindowHeight = outsideHeight
	scene := theSM.Get()
	return scene.Layout(outsideWidth, outsideHeight)
}

// Update updates the current game scene.
func (g *TwentyGame) Update() error {
	scene := theSM.Get()
	if err := scene.Update(); err != nil {
		return err
	}
	return nil
}

// Draw draws the current game to the given screen.
func (g *TwentyGame) Draw(screen *ebiten.Image) {
	scene := theSM.Get()
	scene.Draw(screen)
}
