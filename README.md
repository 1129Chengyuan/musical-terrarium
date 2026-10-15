# Musical Terrarium

A glass jar garden that grows from math and plays music as it grows.

**Live:** https://1129chengyuan.github.io/musical-terrarium/

Click inside the jar to plant a seed. Every new leaf plays a note, every bloom rings a chord, and the garden slowly composes its own ambient music. Water it, watch day turn to night, and leave it running.

## How to play

- **Seed**: pick Fern, Tree, Flower, or Vine, then click inside the jar to plant it
- **Water**: the soil dries out over time. Thirsty plants droop and turn brown, and water brings them back
- **Speed**: 1×, 5×, or 20× time
- **Start sound**: browsers need one click before a page can play audio
- Your garden is saved in your browser, so it's still there when you come back

## The math

| What you see | The math behind it |
| --- | --- |
| Branching plants | **L-systems**: a string like `X` is rewritten with rules like `X → F[+X][-X]FX` a few times, then a "turtle" walks the result to draw it. Random rule choices from a seeded random number generator make every plant unique |
| Flower centers | **Phyllotaxis**: seed *n* sits at angle *n* × 137.5° (the golden angle) and radius *c*·√*n*, the same spiral as a sunflower |
| Swaying | Sine waves, with sway growing with height² so tips move and roots don't |
| Music | Notes come from the **pentatonic scale** (C D E G A), so any combination sounds good. Height in the jar sets pitch, and each species has its own synth voice built from sine/triangle waves |
| Reverb | A convolution reverb using generated, exponentially decaying noise |
| Day and night | The sky blends between color keyframes, and daylight = a clipped sine of the time of day |

## Run locally

It's plain HTML/CSS/JS with no build step. ES modules need a server:

```sh
python3 -m http.server
# open http://localhost:8000
```
