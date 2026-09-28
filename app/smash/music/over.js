/* The end of a run: death, time up and the game-over screen. Am9 Dm9 Fmaj7 E7.
   The drums loop every 2 bars. */
Smash.Music.add('over', {
  bpm: 76, bars: 4, swing: 0.15, gain: 1.21,
  tracks: {
    lead: { voice: 'pulse25', gain: 0.055, pan: 0.15, reverb: 0.5 },
    pad: { voice: 'triangle', gain: 0.018, pan: -0.25, reverb: 0.5, attack: 0.12, decay: 0.8 },
    bass: { voice: 'triangle', gain: 0.15 },
    drums: { loop: 2 }
  }
}, `
bar,beat,track,note,length,vel
1,1,lead,E5,1.5,1
1,1,pad,C.4,4,1
1,1,pad,E4,4,1
1,1,pad,G.4,4,1
1,1,pad,B4,4,1
1,1,bass,A2,1.5,1
1,1,drums,hat,0.25,0.5
1,1,drums,kick,0.25,0.8
1,1.5,drums,hat,0.25,0.3
1,2,drums,hat,0.25,0.5
1,2,drums,rim,0.25,0.6
1,2.5,lead,D5,0.5,0.8
1,2.5,drums,hat,0.25,0.3
1,2.75,bass,A2,0.25,0.5
1,3,lead,C.5,1,0.9
1,3,bass,E3,1,0.85
1,3,drums,hat,0.25,0.5
1,3.5,drums,hat,0.25,0.3
1,3.5,drums,kick,0.25,0.5
1,4,lead,B4,1,0.8
1,4,drums,hat,0.25,0.5
1,4,drums,rim,0.25,0.6
1,4.5,bass,G.3,0.5,0.6
1,4.5,drums,hat,0.25,0.3
2,1,lead,A4,3,1
2,1,pad,F.3,4,1
2,1,pad,A3,4,1
2,1,pad,C.4,4,1
2,1,pad,E4,4,1
2,1,bass,D2,1.5,1
2,1,drums,hat,0.25,0.5
2,1,drums,kick,0.25,0.8
2,1.5,drums,hat,0.25,0.3
2,2,drums,hat,0.25,0.5
2,2,drums,rim,0.25,0.6
2,2.5,drums,hat,0.25,0.3
2,2.75,bass,D2,0.25,0.5
2,2.75,drums,kick,0.25,0.4
2,3,bass,A2,1,0.85
2,3,drums,hat,0.25,0.5
2,3.5,drums,hat,0.25,0.3
2,4,drums,hat,0.25,0.5
2,4,drums,rim,0.25,0.6
2,4.5,bass,C.3,0.5,0.6
2,4.5,drums,hat,0.25,0.3
3,1,lead,C.5,1,0.9
3,1,pad,A3,4,1
3,1,pad,C.4,4,1
3,1,pad,E4,4,1
3,1,bass,F.2,1.5,1
3,2,lead,A4,1,0.8
3,2.75,bass,F.2,0.25,0.5
3,3,lead,E5,2,1
3,3,bass,C.3,1,0.85
3,4.5,bass,E3,0.5,0.6
4,1,lead,G#'4,3,1
4,1,pad,G#'3,4,1
4,1,pad,B3,4,1
4,1,pad,D[7]4,4,1
4,1,bass,E2,1.5,1
4,2.75,bass,E2,0.25,0.5
4,3,bass,B2,1,0.85
4,4.5,bass,D[7]3,0.5,0.6
`);
