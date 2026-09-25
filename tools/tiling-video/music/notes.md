# Tiling loop: music notes

The soundtrack is David's own track, written and mixed by him in Ableton Live
for this video, in his set `Aperiodic Monotile Video v2`. It plays as he
exported it. `loop_export.py` makes it a loop and sets its level, and changes
nothing else.

- **Source:** his export, 16-bit, 48 kHz stereo. It starts on bar 1 and runs
  25 bars: the 24-bar loop and a bar of reverb and delay tail.
- **Run:** `python3 music/loop_export.py EXPORT.wav` from the tool folder, in
  a few seconds.
- **Track:** `tiling-loop.wav`, 48 kHz stereo, exactly 2,342,400 frames,
  48.8 s.

## Form

Three sections of 8 bars, each built from two-bar phrases.

| Section | Bars | What plays |
|---|---|---|
| Groove | 0–7 | A 707 kit, the bassline, and a riff on piano, horns, marimba and flute. A drum fill in bar 7 |
| Busier groove | 8–15 | Cowbell on every beat, louder open hats, extra kicks, fuller piano chords and long flute notes. A fill in bar 15, then a short gap |
| Build | 16–23 | No kick. Snare and claps on every beat, in eighths from bar 20 and sixteenths from bar 22, then a roll and a tom fill in bar 23. An off-beat bassline. The piano calls on even bars, and horns, marimba and flute answer on odd bars |

The kick comes back at the loop join, so the drop falls where the video
restarts.

- **Tempo:** he wrote it at 120 BPM and exported it at 118.03 BPM, the tempo
  the picture was built on, so the picture needed no re-render. Ableton takes
  a tempo to two decimals, so the music's loop is 48.80115 s, 1.2 ms longer
  than the video's. The fold happens at 48.8 s, which keeps the join
  continuous.
- **Tuning:** his scale `JI_scale_9-note_7-limit_minor`: 1, 9/8, 5/4, 45/32,
  3/2, 5/3, 27/16, 15/8 and 63/32 from C4 = 261.63 Hz.

## Level

- His export measures −22.3 LUFS, with its sample peak at −7.2 dBFS.
  `loop_export.py` adds 4.22 dB, which brings the peak to the −3 dBFS cap.
  The loop measures −18.1 LUFS, the level of the earlier soundtracks.
- 26% of the power is below 60 Hz, where phone speakers play little. The
  check warns above 40%.

## Checks, as last delivered

- **MP4 and two-loop MP3:** pass. −18.1 LUFS, true peak −3.1 dBTP, no
  clipping, no clicks, in step with the master.
- **The WAV master** fails the click test on two marimba attacks in bar 19,
  its second and third answering chords, at about −73 dBFS above 15 kHz.
  They are part of his mix, far below the music, and no sample step there is
  out of the ordinary. The same attacks sit just under the threshold in
  bar 17, and the encoded files do not show them.
