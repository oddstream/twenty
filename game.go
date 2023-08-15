package main

import "github.com/hajimehoshi/ebiten/v2"

type GrotGame struct {
}

var theSM *SceneManager = &SceneManager{}

// NewGame generates a new Game object.
func NewGame() (*GrotGame, error) {
	g := &GrotGame{}
	// theSM.Switch(NewSplash())
	theSM.Switch(NewGrid(7, 8))
	return g, nil
}

// Layout implements ebiten.Game's Layout.
func (g *GrotGame) Layout(outsideWidth, outsideHeight int) (screenWidth, screenHeight int) {
	WindowWidth = outsideWidth
	WindowHeight = outsideHeight
	scene := theSM.Get()
	return scene.Layout(outsideWidth, outsideHeight)
}

// Update updates the current game scene.
func (g *GrotGame) Update() error {
	scene := theSM.Get()
	if err := scene.Update(); err != nil {
		return err
	}
	return nil
}

// Draw draws the current game to the given screen.
func (g *GrotGame) Draw(screen *ebiten.Image) {
	scene := theSM.Get()
	scene.Draw(screen)
}
