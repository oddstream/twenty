package main

import (
	"flag"
	"fmt"
	"image/color"
	"log"
	"os"

	"github.com/hajimehoshi/ebiten/v2"
	"golang.org/x/image/font"
)

var (
	DebugMode                 bool
	WindowWidth, WindowHeight int
	ColorBackground                                       = color.RGBA{R: 0x80, G: 0x80, B: 0x80, A: 0xff}
	TileImgLib                map[TileValue]*ebiten.Image = make(map[TileValue]*ebiten.Image)
	TileFontFace              font.Face
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
