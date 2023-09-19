package main

import (
	"bytes"
	_ "embed" // go:embed only allowed in Go files that import "embed"
	"image"
	"image/color"
	"log"
	"math"
	"os"
	"runtime"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"

	"github.com/fogleman/gg"
)

var SplashBackground = color.RGBA{R: 0x40, G: 0x40, B: 0x40, A: 0xff}

var _ GameScene = (*Splash)(nil)

//go:embed assets/raccoon280x180.png
var logoBytes []byte

// Splash represents a game scene.
type Splash struct {
	tileImage *ebiten.Image
	logoImage *ebiten.Image
	tilePos   image.Point
	logoPos   image.Point
	skew      float64
}

// NewSplash creates and initializes a Splash/GameScene object
func NewSplash() *Splash {
	s := &Splash{}

	dc := gg.NewContext(280, 280)

	dc.SetColor(color.RGBA{R: 0x30, G: 0x30, B: 0x30, A: 0xff})
	dc.DrawRoundedRectangle(0, 50, 280, 280-50, 50)
	dc.Fill()

	dc.SetColor(color.RGBA{R: 0x50, G: 0x50, B: 0x50, A: 0xff})
	dc.DrawRoundedRectangle(0, 0, 280, 280-50, 50)
	dc.Fill()

	dc.Stroke()
	img := dc.Image()
	s.tileImage = ebiten.NewImageFromImage(img)

	img, _, err := image.Decode(bytes.NewReader(logoBytes))
	if err != nil {
		log.Fatal(err)
	}
	s.logoImage = ebiten.NewImageFromImage(img)

	return s
}

// Layout implements ebiten.Game's Layout
func (s *Splash) Layout(outsideWidth, outsideHeight int) (int, int) {

	xCenter := outsideWidth / 2
	yCenter := outsideHeight / 2

	cx := s.tileImage.Bounds().Dx()
	cy := s.tileImage.Bounds().Dy()
	s.tilePos = image.Point{X: xCenter - (cx / 2), Y: yCenter - (cy / 2)}

	lx := s.logoImage.Bounds().Dx()
	ly := s.logoImage.Bounds().Dy()
	s.logoPos = image.Point{X: xCenter - (lx / 2), Y: yCenter - 4 - (ly / 2)}

	return outsideWidth, outsideHeight
}

// Update updates the current game scene.
func (s *Splash) Update() error {

	if inpututil.IsKeyJustReleased(ebiten.KeyBackspace) {
		if runtime.GOARCH != "wasm" {
			os.Exit(0)
		}
	}

	if s.skew < 90.0 {
		s.skew += 1.5
	} else {
		theSM.Switch(NewMenu())
	}

	return nil
}

// Draw draws the current GameScene to the given screen
func (s *Splash) Draw(screen *ebiten.Image) {
	screen.Fill(SplashBackground)

	skewRadians := s.skew * math.Pi / 180

	{
		op := &ebiten.DrawImageOptions{}
		sx := s.tileImage.Bounds().Dx() / 2
		sy := s.tileImage.Bounds().Dy() / 2
		op.GeoM.Translate(float64(-sx), float64(-sy))
		op.GeoM.Scale(0.5, 0.5)
		op.GeoM.Skew(skewRadians, skewRadians)
		op.GeoM.Translate(float64(sx), float64(sy))
		op.GeoM.Translate(float64(s.tilePos.X), float64(s.tilePos.Y))
		screen.DrawImage(s.tileImage, op)
	}
	{
		op := &ebiten.DrawImageOptions{}
		sx := s.logoImage.Bounds().Dx() / 2
		sy := s.logoImage.Bounds().Dy() / 2
		op.GeoM.Translate(float64(-sx), float64(-sy))
		op.GeoM.Scale(0.5, 0.5)
		op.GeoM.Skew(skewRadians, skewRadians)
		op.GeoM.Translate(float64(sx), float64(sy))
		op.GeoM.Translate(float64(s.logoPos.X), float64(s.logoPos.Y))
		screen.DrawImage(s.logoImage, op)
	}
}
