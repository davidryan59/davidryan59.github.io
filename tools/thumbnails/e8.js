/* Draw the animated E8 explorer thumbnail from the explorer's own model. */
'use strict';

const fs = require('fs'), path = require('path');
const E8 = require('../../app/e8/model.js');
const roots = E8.buildRoots(), coxeter = E8.buildCoxeterData(roots);

function animatedFrames() {
  const presets = E8.makePresets();
  const frames = [], times = [];
  function add(time, frame) { times.push(time); frames.push(frame); }
  function change(start, end, from, to) {
    for (let step = 1; step <= 5; step++) {
      const amount = step / 5;
      add(start + (end - start) * amount, E8.interpolateFrames(from, to, amount));
    }
  }
  add(0, presets.coxeter);
  add(0.10, presets.coxeter);
  change(0.10, 0.30, presets.coxeter, presets.octagonal);
  add(0.38, presets.octagonal);
  change(0.38, 0.58, presets.octagonal, presets.squares);
  add(0.66, presets.squares);
  change(0.66, 0.92, presets.squares, presets.coxeter);
  add(1, presets.coxeter);
  return { frames: frames, times: times };
}

const animation = animatedFrames(), frames = animation.frames;
const times = animation.times.map(time => time.toFixed(3)).join(';');
const lineOpacity = animation.times.map(time => {
  if (time <= 0.10) return 0.48;
  if (time <= 0.30) return 0.48 * (0.30 - time) / 0.20;
  if (time < 0.66) return 0;
  if (time <= 0.92) return 0.48 * (time - 0.66) / 0.26;
  return 0.48;
}).map(value => value.toFixed(3)).join(';');

function n(value) { return value.toFixed(2); }

function draw(theme) {
  const points = frames.map(frame => {
    const raw = roots.map(root => [E8.dot(frame[0], root), -E8.dot(frame[1], root)]);
    const scale = theme.radius ? theme.radius / Math.max(...raw.map(point => Math.hypot(point[0], point[1]))) : theme.scale;
    return raw.map(point => [60 + point[0] * scale, 60 + point[1] * scale]);
  });
  function values(makeValue) { return points.map(makeValue).join(';'); }
  const cyclePaths = coxeter.cycles.map((cycle, orbit) => {
    const paths = values(frame => cycle.map((index, i) =>
      (i ? 'L' : 'M') + n(frame[index][0]) + ' ' + n(frame[index][1])).join(' ') + ' Z');
    return `<path d="${paths.split(';')[0]}" fill="none" stroke="${theme.palette[orbit]}" stroke-width=".55" opacity=".48"><animate attributeName="d" dur="${theme.duration}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times}" values="${paths}"/><animate attributeName="opacity" dur="${theme.duration}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times}" values="${lineOpacity}"/></path>`;
  }).join('');
  const dots = roots.map((root, i) => {
    const radius = E8.rootKind(root) === 'd8' ? theme.largeRadius : theme.smallRadius;
    const xs = values(frame => n(frame[i][0]));
    const ys = values(frame => n(frame[i][1]));
    return `<circle cx="${n(points[0][i][0])}" cy="${n(points[0][i][1])}" r="${radius}" fill="${theme.palette[coxeter.orbit[i]]}"><animate attributeName="cx" dur="${theme.duration}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times}" values="${xs}"/><animate attributeName="cy" dur="${theme.duration}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times}" values="${ys}"/></circle>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
<defs><radialGradient id="b">${theme.gradient}</radialGradient><clipPath id="c"><circle cx="60" cy="60" r="59"/></clipPath></defs>
<g clip-path="url(#c)"><rect width="120" height="120" fill="url(#b)"/>${theme.guide}${cyclePaths}${dots}</g>
<circle cx="60" cy="60" r="59" fill="none" stroke="${theme.border}"/>
</svg>`;
  const output = path.join(__dirname, '../../assets/thumbs/' + theme.file);
  fs.writeFileSync(output, svg);
  console.log(output + ' ' + Buffer.byteLength(svg) + ' bytes');
}

draw({
  file: 'e8-light.svg', radius: 55.5, duration: 12, largeRadius: 1.35, smallRadius: 1.02,
  palette: ['#087f72', '#2563b8', '#7447b8', '#b52b75', '#c63d55', '#bf5a24', '#947000', '#387b42'],
  gradient: '<stop stop-color="#fffdf8"/><stop offset="1" stop-color="#e8e2d7"/>',
  guide: '<circle cx="60" cy="60" r="43.8" fill="none" stroke="#8b8578" stroke-width=".5" stroke-dasharray="1.5 3" opacity=".45"/>',
  border: '#d3cdc1'
});
draw({
  file: 'e8.svg', radius: 55.5, duration: 6, largeRadius: 1.48, smallRadius: 1.13,
  palette: ['#59e3cf', '#70b7ff', '#b095ff', '#ff79c3', '#ff8191', '#ff9f68', '#e8cb58', '#83d48d'],
  gradient: '<stop stop-color="#181b23"/><stop offset=".68" stop-color="#0e1016"/><stop offset="1" stop-color="#050609"/>',
  guide: '', border: '#343945'
});
