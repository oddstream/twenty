# Twenty

A playground for experimenting with falling tile games, based on reimplementing Twenty by Stephen French in Go+Ebiten.

### It currently doesn't

- Register, record or acknowledge a 'won' game (a game is 'won' when you get a 20 tile);
- Do the tile-linking that happens after you get a 10 tile. The code for creating and drawing the links is there, but nothing regarding moving groups of linked tiles. I'm either thinking of an elegant way of doing this, or deciding that linking tiles doesn't add to the gameplay. I think the original game used a physics engine, which makes this kind of thing easy;
- Implement the Bubbles, Flip Flop or Panic modes of the orginal.

### It currently does

- Allow experimentation with larger or smaller grid of tiles.

### Problems

- No tile linking, although to be fair, this isn't needed to get good gameplay, a game gets progessively hard the longer it lasts without tile linking
- You can cheat by moving the mouse quickly and passing a tile through and between other tiles. This makes games too easy. No obvious solution
- It doesn't play as well with a mouse
- There is a weird bug in the tile merging function

Probably ought to try redoing it in Lua+LÖVE+Box2D.