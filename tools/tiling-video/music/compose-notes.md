# Tiling loop: notes on compose.py

Before David mixed his own track, `compose.py` made the soundtrack from his
music: sections A and B, 8 bars each,
written in Ableton Live in A minor in a 7-note just intonation scale,
arranged A B A and transposed up a pure fourth (4/3) into D minor. His tune, bassline and drum patterns play as he wrote them, note for
note, rhythm for rhythm and velocity for velocity, with the bass an octave
lower than written. The only addition is a quiet two-note pad.

- **Source:** `sections.json`, copied from his Ableton set by
  `read_ableton.py`. Re-run that after editing the set.
- **Track:** `tiling-loop.wav`, 48 kHz stereo, exactly 2,342,400 frames,
  48.8 s.
- **Run:** `../../../../daily-python-music/.venv/bin/python compose.py` from
  this folder, in about 4 s.

## Tuning

His scale, `JI_scale_7-note_5-limit_minor`, with C4 = 261.63 Hz:

| C | D | E | F | G | A | B |
|---|---|---|---|---|---|---|
| 1/1 | 10/9 | 5/4 | 4/3 | 3/2 | 5/3 | 15/8 |

From A it is the pure natural minor: 1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5.

- **Key mapping:** Ableton maps the set's MIDI keys with MIDI 55 as C4 and
  one scale note per key, 7 to the octave. So MIDI 60 is A4 and the bass's
  46 is A2.
- **A mistake to avoid:** mapping MIDI 60 to C4 instead shifts every note up
  two scale steps and turns his A minor into C major.

## Form and harmony

| Section | Bars | Chords |
|---|---|---|
| A | 0–7 | Am, Dm, G then Am, Am; Am, Dm, G then Am, Am with the bass walking down |
| B | 8–15 | Am, Dm9, C/G, F then G, Am7, Dm7, G, F then G |
| A | 16–23 | As bars 0–7 |

- **Tempo:** his 118 BPM, rounded to 118.03 so the loop is a whole number of
  video frames.

## Sounds and mix

- **Drums:** his 707 and 808 kits' own samples, read from Ableton's Core
  Library at render time, with his pad levels and 50% velocity response.
- **Bass:** his line an octave down, 55–145 Hz after the transposition, on an analogue-style synth,
  saw and square with a brief bright pluck, standing in for his Wavetable
  "Analog Bass".
- **Piano:** his tune on soft synth keys, pulse and triangle with a
  piano-like decay, 436–1047 Hz after the transposition.
- **Pad:** two quiet notes between the bass and the piano (174–291 Hz), each
  held for a whole bar, changing only at bar lines. `choose_pad()` picks, bar
  by bar, the pair a third, fourth, fifth or sixth apart that is most
  consonant, by Tenney height, with every piano and bass note in the bar. In A
  it mostly holds A3+D4, the fifth and root of D minor.
- **Stereo:** kick and bass in the middle; snare −0.35 and open hat +0.8 on
  opposite sides; maracas −0.85, tambourine +0.9, rim +0.6; each piano chord
  split ±0.4, lower note left; the pad pair split ±0.55.
- **Mix:** his track pans and returns carry over: the 2.5 s reverb on the
  bass, and the eighth-note delay at 35% feedback on the piano. Both returns
  play at a quarter of full level, so they stay quiet.
- **Balance, measured in the final mix:** piano −21.6 LUFS, snare −23.1,
  kick −23.5, bass −24.1, maracas −33.4, reverb −36.8, open hat −37.0, pad
  −42.2, delay −53.0. Left and right are within 0.7 dB.
- **Humanising:** velocities vary by up to 5% either way.

## Checks, as last rendered

- **Master:** −18.0 LUFS, true peak −3.1 dBTP, no clipping, no clicks.
- **MP3, two loops:** in step with the master, with the join in the middle
  clean.
