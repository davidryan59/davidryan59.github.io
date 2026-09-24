# Tiling loop: music notes

A new 45-second just-intonation loop for the tiling explorer video. It runs at
80 BPM for 60 beats and loops seamlessly. The piece stands on one
fundamental, C2 = 64 Hz, and every otonal pitch is one of its harmonics. The
monotile idea carries over: one tile makes the whole plane, and one tone makes
every chord.

- **Track:** `tiling-loop.wav`. 48 kHz, stereo, 16-bit PCM, 2,160,000 frames, 45.000 s.
- **Script:** `compose.py`. It renders the track from nothing, masters it, then checks it and draws `spectrogram.png`.
- **Run:** `../../../../daily-python-music/.venv/bin/python compose.py` from this folder, with daily-python-music beside this repo. It takes about 18 s.
- **Timeline:** the accents follow `../storyboard.md`: Pastel b 21, Greyscale b 22.5, dice b 24 to 27, and Mirrored hats from b 28 through the zoom. `ZOOM_FAR` is 0.22.

## David's published style (SoundCloud)

Source: the titles, descriptions and tags of David's 19 tracks from 2015 to 2020 at [soundcloud.com/davidryan59](https://soundcloud.com/davidryan59/tracks), and `sequencer12.m` in [music-sequencer-matlab-excel-audacity](https://github.com/davidryan59/music-sequencer-matlab-excel-audacity). No audio was downloaded or played.

- **Sound.** He synthesises chip-synth tones from scratch: band-limited sawtooths mostly, with sine, square, "modified sin/saw" and a little band-limited noise. His own sequencer turns an Excel sequence into Octave WAVs. Notes decay exponentially, by default 20 dB/s at 256 Hz and faster for higher frequencies (index 0.5). He renders each part as sawtooths at three decay rates. The tags say it: microtonal, chiptune, electronica, xenharmonic.
- **Reverb.** The 2015 and 2016 tracks are dry. From 2017 he uses a lot of Audacity reverb ("Reverb reverb reverb!"). In his words, it "turns a band-limited sawtooth wave into something like a stringed instrument".
- **Repertoire.** Most tracks retune classical and pop pieces into JI: Bach BWV 846, 848, 772, 784 and 998, Mozart K545, Chopin Op. 10 No. 1, and Stevie Wonder's "You Are the Sunshine of My Life". There is also his own Sonata 1 "Cheery", the most-liked track at 169 likes, and a set of short "Example" studies. Most tracks run 1 to 2.5 minutes.
- **Harmony.** The base is the 7-limit lattice: 4:5:6 triads and 4:5:6:7 harmonic sevenths. He smuggles in the 11th and 13th harmonics on principle ("I refuse to write any new music which does not contain both 11th and 13th harmonics"). He uses 17 in diminished chords (10:12:14:17). Later tracks add high prime commas as spice, with prime limits of 2029, 2579, 5623 and once 2,499,949.
- **Devices.** He pairs otonal and utonal chords and melodies, and alternates harmonics with undertones. He uses the harmonic series directly as a scale (6, 7, 8, 9, 10 × 30 Hz). Chords move by linear steps or continuous linear slides in frequency, so every rational point on the way is a JI chord. Other devices: L-system fractal melodies, pitch bends, and comma travel with commas normalised out over 2 to 4 s.
- **Texture.** Two or three synthesised lines (bass, harmony, melody) at the source piece's tempo, often arpeggiated. His sequencer's default tremolo is 1.5 dB over 3 beats.

## How the piece uses that style

- The pad is a band-limited sawtooth-like tone with partials at 1/k^p. The value of p follows the picture: 1.75 at rest, down to 1.3 at the zoom peak.
- Every struck note decays by his sequencer's law: rate = R × (f / 256 Hz)^0.5 dB/s, per partial.
- The pad carries his default tremolo of 1.5 dB over 3 beats. It is smoothed to a cosine so the amplitude has no steps.
- The slider voice and the edge voices move by his linear slides in frequency.
- Hat pages are otonal and the mirrored hats are utonal.
- The zoom uses the undertone series as a scale.
- The piece includes the 7th, 11th, 13th and 17th harmonics.
- The piece has plenty of reverb, but sustained tones get little, so held JI notes stay balanced.

## Tuning

- **Tonic:** C4 = 256 Hz, which justsynth's own config calls "better" than 261.63 Hz.
- **Fundamental:** C2 = 64 Hz. It is never sounded, and the master high-passes at 85 Hz.
- **Notation:** every pitch is written in David's rational comma notation and parsed by `split_ji_rcn`. `compose.py` prints the whole score. Each token must survive a round trip through `parse_rcn` and `value_to_rcn`.

| Material | RCN | Ratio to C4 | Hz |
|---|---|---|---|
| Shape stops: Chevron, Hat, Spectre, Turtle, Comet | C5, E'5, F5~11, G5, Bb5~7 | 2, 5/2, 11/4, 3, 7/2 | 512, 640, 704, 768, 896 |
| Pedal | C3 | 1/2 | 128 |
| Home chord (harmonics 3 to 7 of 64 Hz) | G3 C4 E'4 G4 Bb4~7 | 3/4, 1, 5/4, 3/2, 7/4 | 192 to 448 |
| Spectre chord | G3 C4 F4~11 G4 Bb4~7 D5 | 3/4, 1, 11/8, 3/2, 7/4, 9/4 | 192 to 576 |
| Mirror chord (home reflected about C4) | Ab.3 C4 D4_7 F4 Ab.4 | 4/5, 1, 8/7, 4/3, 8/5 | 204.8 to 409.6 |
| Pastel, Greyscale | G5, C5 | 3, 2 | 768, 512 |
| Dice (faces 5, 2, 6, 3 give harmonic 6 + face) | F5~11 C5 G5 D5 | 11/4, 2, 3, 9/4 | 704, 512, 768, 576 |
| Mirrored hats strum (mirror of 4:5:6) | C5 Ab.4 F4 | 2, 8/5, 4/3 | 512, 409.6, 341.3 |
| Zoom ladder (undertones 16 to 8 of 8192 Hz) | C5 Db.5 D5_7 Eb5_13 F5 G5_11 Ab.5 Bb5 C6 | 2 up to 4 | 512 to 1024 |
| Edge, curve: base, up, down | C5 D5 Bb4~7 | 2, 9/4, 7/4 | 512, 576, 448 |
| Edge, triangle: base, up, down | G5 A5~13 F5~11 | 3, 13/4, 11/4 | 768, 832, 704 |
| Edge, jigsaw: base, up, down | C6 C#6~17 B'5 | 4, 17/4, 15/4 | 1024, 1088, 960 |

- **Primes used:** 2, 3, 5, 7, 11, 13 and 17.
- **Continuous pitches:** only the linear slides between listed pitches are not fixed ratios.

## Section by section

| Beats | Picture | Music |
|---|---|---|
| 58 → 2 (across the seam) | Slider 30° → 0° | The slider voice glides 640 → 512 Hz. At the seam (15°) it passes exactly 576 Hz, harmonic 9. The home chord sits over the C3 pedal. |
| 0 → 20 | Shape morph | The slider voice follows the angle: f = 64 × (8 + angle / 15) Hz. This is linear in the angle and lands on harmonics 8, 10, 11, 12 and 14 at the five stops. It pans with the angle, left for Chevron and right for Comet, and it swells while the slider moves. A bell rings the stop's pitch on each arrival. The Comet → Hat move slides down through harmonics 13, 12 and 11. |
| 20 → 28 | Pastel, Greyscale, dice | The slider voice fades with the slider graphic. Colour is heard as timbre. The home palette, Rainbow, is the full pad. Pastel is a soft triangle-like pluck and Greyscale a plain sine. Each dice roll is a short wooden note that bounces three times. |
| 28 → 38 | Mirrored hats, then zoom | At b 28 a downward strum of the minor triad 1/4 : 1/5 : 1/6 turns the pad into its mirror image. That is the home chord reflected about C4 and panned to the other side. For the zoom, the undertone series of 8192 Hz climbs from C5 to C6, a note every half beat, and reaches the top at the far zoom (b 34). The mirror-chord notes of the ladder sustain, and the pad swells by about 3 dB and brightens. The ladder thins out as the zoom returns. |
| 37.5 → 41 | Slider returns, Hat → Spectre | The home chord returns with the slider graphic. The slider voice glides 640 → 704 Hz, and the Spectre bell (11/4) rings at b 40. In the crossfade (b 40 → 41) the pad's 5th harmonic slides to 11/2 (320 → 352 Hz) and 9/4 joins. That is the move from 7-limit to 11-limit harmony. |
| 41 → 53 | Six edge sweeps | The edge height drives one voice. It swells in with the height, slides up one harmonic ("single") or splits into one voice up and one down ("double"), then fades at height 0. Its wave morphs from a sine towards the edge's shape, using justsynth's `combined_wave`: a skewed curve, a triangle, then a jigsaw-like rounded pulse. The register rises from harmonic 8 to 12 to 16. The shape and arrangement switch at silence, as in the picture. |
| 53 → 60 | Spectre → Hat, home | The pad slides 352 → 320 Hz back to the home chord. The slider voice returns at 704 Hz and glides to 640 Hz, and the Hat bell rings at b 57. The glide down towards the seam begins at b 58. |

## Accents

- **Placement:** every accent is a musical note placed at its exact sample (beat × 36,000). It has a 3 ms raised-cosine attack.
- **Check method:** `compose.py` checks each onset twice. First on the accent voices rendered alone. Second on the finished mix, high-passed at 0.8 × the accent's pitch.

| Beat | Event | Pitch (Hz) | Onset alone | Onset in mix | Level rise above 300 Hz |
|---|---|---|---|---|---|
| 2 | Chevron | 512 | +0.7 ms | +2.5 ms | +7.0 dB |
| 6 | Hat | 640 | +1.2 ms | +2.0 ms | +5.9 dB |
| 10 | Spectre | 704 | +1.6 ms | +1.9 ms | +8.5 dB |
| 13 | Turtle | 768 | +1.4 ms | +1.9 ms | +7.0 dB |
| 16 | Comet | 896 | +1.1 ms | +1.6 ms | +9.3 dB |
| 20 | Hat | 640 | +1.2 ms | +2.1 ms | +6.1 dB |
| 21 | Pastel | 768 | +2.8 ms | +2.4 ms | +6.4 dB |
| 22.5 | Greyscale | 512 | +1.2 ms | +3.2 ms | +7.0 dB |
| 24 | Dice: any colour | 704 | +1.5 ms | +2.0 ms | +5.2 dB |
| 25 | Dice: RGB corners | 512 | +0.9 ms | +1.0 ms | +6.3 dB |
| 26 | Dice: black and white | 768 | +1.1 ms | +1.7 ms | +5.5 dB |
| 27 | Dice: greys | 576 | +1.1 ms | +2.5 ms | +6.0 dB |
| 28 | Mirrored hats | 512 | +1.3 ms | +2.5 ms | +9.1 dB |
| 40 | Spectre | 704 | +1.1 ms | +2.1 ms | +8.3 dB |
| 57 | Hat | 640 | +1.1 ms | +2.1 ms | +6.3 dB |

- **Worst offset:** 3.2 ms, against a limit of 10 ms.
- **Near the seam:** no accent falls at beat 0 or 60. The nearest are b 57 and b 2.

## How the loop works

- **Circular render.** `compose.py` renders onto a buffer of exactly one loop (2,160,000 samples). An event that runs past beat 60 wraps to beat 0 with its phase intact. For example, the slider voice runs from b 53 to b 81.
- **Reverb and EQ.** The reverb is a circular convolution and the master EQ is a zero-phase filter in the frequency domain, so both wrap around too. The result is the steady state of the loop playing forever. That equals rendering three cycles and keeping the middle one.
- **Whole cycles.** Every oscillator that sounds across the seam makes a whole number of cycles per loop, and the script asserts it. Harmonics of 64 Hz make 2,880 × h cycles in 45 s. The pad's 320 → 352 Hz slide adds exactly 312 cycles. Voices that cannot meet this, such as 8/7, are silent at the seam, and the script asserts that too.
- **Timeline port.** The script ports `timeline.js` to numpy: `deg`, `edgeAt`, `hatMix`, `zoomAt` and `sliderOpacity`. It checks the port against Node on 241 beats. The largest difference is 2.3e-13.
- **Seam check.** The file was tiled twice, and the join compared with the rest of the file.
  - Sample-to-sample jump at the join: 148 LSB left and 186 LSB right.
  - Elsewhere in the file: median 174 and 171, 99th percentile 979 and 992, maximum 2373 and 2943.
  - RMS over the 0.5 s before and after the join: left −18.83 and −18.79 dBFS, right −19.53 and −20.07 dBFS.
  - The median step between adjacent half-seconds anywhere in the file is 1.02 dB.
- **Clicks.** Energy above 9 kHz never rises above −78 dBFS, so the file has no clicks.

## Reverb

- **Why not plain noise.** A plain decaying-noise impulse gives each steady frequency a random level, with a standard deviation of about 5.7 dB. That pushed held JI notes up to 10 dB to one side.
- **Flattening.** The impulse is built band by band, alternating between a flat magnitude response and the decay envelope. Ten rounds bring the spread down to about 2 dB. RT60 is 3.0 s in the lows and 0.7 s in the highs, with a 22 ms pre-delay.
- **Drift.** The wet signal drifts between four such rooms, four times per loop.
- **Sends.** Sustained voices send little: pad 0.12, pedal 0. Struck and gliding voices send 0.4 to 0.6.
- **Balance.** The final left/right RMS is −18.34 / −18.53 dBFS overall, and every section is within 0.7 dB.

## Loudness and spectrum

Measured by `ffmpeg -af ebur128=peak=true` on the written file:

- **Integrated loudness:** −16.0 LUFS. One static gain of +4.0 dB from −20.0 LUFS pre-master. No dynamic processing.
- **True peak:** −2.4 dBTP. Sample peak −2.37 dBFS. No clipping.
- **Loudness range:** 2.4 LU.
- **Share of power:** 6 % below 150 Hz, 28 % at 150 to 300 Hz, 61 % at 300 Hz to 1 kHz, 5 % at 1 to 4 kHz, nothing above 5 kHz.
- **Headroom:** partials stop at 5 kHz, the master low-passes at 7 kHz and high-passes at 85 Hz, so there is no sub-bass.
- **Phone speakers:** with everything below 300 Hz removed, as on a phone, the accents rise 5 to 9 dB above the bed.
