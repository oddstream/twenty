package main

import "github.com/hajimehoshi/ebiten/v2"

// GameScene interface defines the API for each game scene
// each separate game scene (eg Splash, Menu, Grid, GameOver &c) must implement these
type GameScene interface {
	Layout(int, int) (int, int)
	Update() error
	Draw(*ebiten.Image)
}

// SceneManager does what it says on the tin
type SceneManager struct {
	// TODO implement a stack with Push(), Pop() methods
	currentScene GameScene
}

// Switch changes to a different GameScene
func (sm *SceneManager) Switch(scene GameScene) {
	sm.currentScene = scene
}

// Get returns the current GameScene
func (sm *SceneManager) Get() GameScene {
	return sm.currentScene
}
