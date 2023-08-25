package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/hajimehoshi/ebiten/v2"
	"golang.org/x/image/font"
)

var (
	DebugMode                 bool
	WindowWidth, WindowHeight int
	theTileImgLib             map[int]*ebiten.Image    = make(map[int]*ebiten.Image)
	theTileLinkImgLib         map[uint32]*ebiten.Image = make(map[uint32]*ebiten.Image)
	theTileFontFace           font.Face
	theAcmeFonts              *AcmeFonts
)

func init() {
	flag.BoolVar(&DebugMode, "debug", false, "turn debug graphics on")
	flag.IntVar(&WindowWidth, "width", 1920/2, "width of window in pixels")
	flag.IntVar(&WindowHeight, "height", 1080/2, "height of window in pixels")
}

func main() {
	flag.Parse()

	if DebugMode {
		for i, a := range os.Args {
			fmt.Println(i, a)
		}
	}

	theAcmeFonts = NewAcmeFonts()

	game, err := NewGame()
	if err != nil {
		log.Fatal(err)
	}
	ebiten.SetWindowTitle("Grot")
	ebiten.SetWindowSize(WindowWidth, WindowHeight)
	ebiten.SetWindowResizingMode(ebiten.WindowResizingModeEnabled)
	if err := ebiten.RunGame(game); err != nil {
		log.Fatal(err)
	}

}
