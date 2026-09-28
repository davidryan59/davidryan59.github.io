/* K.O. and its bonuses, and Fun Mode's SCREEN DESTROYED. Cmaj7 Fmaj7 Dm7 E7.
   The drums loop every bar. */
Smash.Music.add('ko', {
  bpm: 112, bars: 4, swing: 0.15, gain: 1.5,
  tracks: {
    lead: { voice: 'pulse25', gain: 0.065, pan: 0.1, reverb: 0.4 },
    keys: { voice: 'pulse12', gain: 0.028, pan: -0.35, reverb: 0.4, decay: 0.3 },
    bass: { voice: 'triangle', gain: 0.16 },
    drums: { loop: 1 }
  }
}, `
bar,beat,track,note,length,vel
1,1,lead,C.5,0.5,1
1,1,bass,C.3,0.5,1
1,1,drums,hat,0.25,0.7
1,1,drums,kick,0.25,1
1,1.5,lead,E5,0.5,1
1,1.5,drums,hat,0.25,0.4
1,1.75,bass,C.3,0.25,0.5
1,2,lead,G.5,0.5,1
1,2,drums,hat,0.25,0.7
1,2,drums,clap,0.25,0.9
1,2.5,lead,B5,1.5,1
1,2.5,keys,E4,0.25,1
1,2.5,keys,G.4,0.25,1
1,2.5,keys,B4,0.25,1
1,2.5,bass,C.4,0.25,0.8
1,2.5,drums,hat,0.25,0.4
1,3,bass,G.3,0.5,0.9
1,3,drums,hat,0.25,0.7
1,3,drums,kick,0.25,0.8
1,3.5,drums,hat,0.25,0.4
1,3.75,bass,B3,0.25,0.6
1,3.75,drums,kick,0.25,0.5
1,4,keys,E4,0.25,0.8
1,4,keys,G.4,0.25,0.8
1,4,keys,B4,0.25,0.8
1,4,bass,C.4,0.25,0.8
1,4,drums,hat,0.25,0.7
1,4,drums,clap,0.25,0.9
1,4.5,bass,C.3,0.5,0.7
1,4.5,drums,open,0.25,0.7
2,1,lead,A5,0.5,1
2,1,bass,F.2,0.5,1
2,1.5,lead,G.5,0.5,1
2,1.75,bass,F.2,0.25,0.5
2,2,lead,E5,0.5,1
2,2.5,lead,C.5,1.5,1
2,2.5,keys,A3,0.25,1
2,2.5,keys,C.4,0.25,1
2,2.5,keys,E4,0.25,1
2,2.5,bass,F.3,0.25,0.8
2,3,bass,C.3,0.5,0.9
2,3.75,bass,E3,0.25,0.6
2,4,keys,A3,0.25,0.8
2,4,keys,C.4,0.25,0.8
2,4,keys,E4,0.25,0.8
2,4,bass,F.3,0.25,0.8
2,4.5,bass,F.2,0.5,0.7
3,1,lead,D5,0.5,1
3,1,bass,D2,0.5,1
3,1.5,lead,F.5,0.5,1
3,1.75,bass,D2,0.25,0.5
3,2,lead,A5,0.5,1
3,2.5,lead,C.6,1.5,1
3,2.5,keys,F.3,0.25,1
3,2.5,keys,A3,0.25,1
3,2.5,keys,C.4,0.25,1
3,2.5,bass,D3,0.25,0.8
3,3,bass,A2,0.5,0.9
3,3.75,bass,C.3,0.25,0.6
3,4,keys,F.3,0.25,0.8
3,4,keys,A3,0.25,0.8
3,4,keys,C.4,0.25,0.8
3,4,bass,D3,0.25,0.8
3,4.5,bass,D2,0.5,0.7
4,1,lead,B5,1,1
4,1,bass,E2,0.5,1
4,1.75,bass,E2,0.25,0.5
4,2,lead,G#'5,1,1
4,2.5,keys,G#'3,0.25,1
4,2.5,keys,B3,0.25,1
4,2.5,keys,D[7]4,0.25,1
4,2.5,bass,E3,0.25,0.8
4,3,lead,E5,2,1
4,3,bass,B2,0.5,0.9
4,3.75,bass,D[7]3,0.25,0.6
4,4,keys,G#'3,0.25,0.8
4,4,keys,B3,0.25,0.8
4,4,keys,D[7]4,0.25,0.8
4,4,bass,E3,0.25,0.8
4,4.5,bass,E2,0.5,0.7
`);
