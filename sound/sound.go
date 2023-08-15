package sound

import (
	"bytes"
	_ "embed" // go:embed only allowed in Go files that import "embed"
	"log"

	"github.com/hajimehoshi/ebiten/v2/audio"
	"github.com/hajimehoshi/ebiten/v2/audio/wav"
)

//go:embed assets/combo_20_1.wav
var combo1bytes []byte

//go:embed assets/combo_20_2.wav
var combo2bytes []byte

//go:embed assets/combo_20_3.wav
var combo3bytes []byte

//go:embed assets/combo_20_4.wav
var combo4bytes []byte

//go:embed assets/drop2.wav
var dropbytes []byte

//go:embed assets/gameover.wav
var gameoverbytes []byte

//go:embed assets/levelup_20_1.wav
var levelup1bytes []byte

//go:embed assets/levelup_20_2.wav
var levelup2bytes []byte

//go:embed assets/levelup_20_3.wav
var levelup3bytes []byte

var audioContext *audio.Context

var soundMap map[string]*audio.Player

var Volume float64 = 1.0

func decode(name string, wavBytes []byte) {
	if len(wavBytes) == 0 {
		log.Panic("empty wav file ", name)
	}
	d, err := wav.DecodeWithSampleRate(44100, bytes.NewReader(wavBytes))
	if err != nil {
		log.Panic(err)
	}
	audioPlayer, err := audioContext.NewPlayer(d)
	if err != nil {
		log.Panic(err)
	}
	soundMap[name] = audioPlayer
}

func init() {
	// defer util.Duration(time.Now(), "sound.init")

	audioContext = audio.NewContext(44100)
	soundMap = make(map[string]*audio.Player)

	decode("Combo1", combo1bytes)
	decode("Combo2", combo2bytes)
	decode("Combo3", combo3bytes)
	decode("Combo4", combo4bytes)
	decode("Drop", dropbytes)
	decode("GameOver", gameoverbytes)
	decode("LevelUp1", levelup1bytes)
	decode("LevelUp2", levelup2bytes)
	decode("LevelUp3", levelup3bytes)
}

func SetVolume(vol float64) {
	Volume = vol
}

func Play(name string) {
	if Volume == 0.0 || name == "" {
		return
	}
	audioPlayer, ok := soundMap[name]
	if !ok {
		log.Panic(name, " not found in sound map")
	}
	if !audioPlayer.IsPlaying() {
		audioPlayer.Rewind()
		audioPlayer.SetVolume(Volume)
		audioPlayer.Play()
	}
}
