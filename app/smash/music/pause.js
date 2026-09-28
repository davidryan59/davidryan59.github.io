/* The pause screen: drums only, quiet. */
Smash.Music.add('pause', {
  bpm: 88, bars: 2, swing: 0.22, gain: 2.6,
  tracks: {
    drums: {}
  }
}, `
bar,beat,track,note,length,vel
1,1,drums,shaker,0.25,0.8
1,1,drums,kick,0.25,0.9
1,1.25,drums,shaker,0.25,0.3
1,1.5,drums,shaker,0.25,0.5
1,1.75,drums,shaker,0.25,0.3
1,2,drums,shaker,0.25,0.8
1,2,drums,rim,0.25,0.7
1,2.25,drums,shaker,0.25,0.3
1,2.5,drums,shaker,0.25,0.5
1,2.75,drums,shaker,0.25,0.3
1,2.75,drums,kick,0.25,0.45
1,3,drums,shaker,0.25,0.8
1,3.25,drums,shaker,0.25,0.3
1,3.5,drums,shaker,0.25,0.5
1,3.75,drums,shaker,0.25,0.3
1,4,drums,shaker,0.25,0.8
1,4,drums,rim,0.25,0.7
1,4.25,drums,shaker,0.25,0.3
1,4.5,drums,shaker,0.25,0.5
1,4.75,drums,shaker,0.25,0.3
2,1,drums,shaker,0.25,0.8
2,1,drums,kick,0.25,0.9
2,1.25,drums,shaker,0.25,0.3
2,1.5,drums,shaker,0.25,0.5
2,1.75,drums,shaker,0.25,0.3
2,2,drums,shaker,0.25,0.8
2,2,drums,rim,0.25,0.7
2,2.25,drums,shaker,0.25,0.3
2,2.5,drums,shaker,0.25,0.5
2,2.75,drums,shaker,0.25,0.3
2,3,drums,shaker,0.25,0.8
2,3.25,drums,shaker,0.25,0.3
2,3.5,drums,shaker,0.25,0.5
2,3.5,drums,kick,0.25,0.55
2,3.75,drums,shaker,0.25,0.3
2,4,drums,shaker,0.25,0.8
2,4,drums,rim,0.25,0.7
2,4.25,drums,shaker,0.25,0.3
2,4.5,drums,shaker,0.25,0.5
2,4.75,drums,shaker,0.25,0.3
2,4.75,drums,rim,0.25,0.3
`);
