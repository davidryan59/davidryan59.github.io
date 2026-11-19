/* The builder page's live thumbnail for the Hyperbolic Models Explorer: the
   {7,3} heptagon tiling in the Poincaré disk, drifting round a small circle
   and back on a 10 s loop. It draws with a cut-down copy of the explorer's
   shader in app/hyperbolic/hyperbolic.js, with the explorer's eight-colour
   colouring of {7,3} baked in. The background is transparent, so the disk
   suits both themes. Without WebGL 2, a still picture takes its place. */
(function () {
  'use strict';

  var canvas = document.getElementById('hyperbolic-thumb');
  if (!canvas) return;
  var gl = canvas.getContext && canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
  if (!gl) {
    var img = document.createElement('img');
    img.className = canvas.className; img.src = canvas.dataset.still; img.alt = '';
    img.width = 120; img.height = 120;
    canvas.replaceWith(img);
    return;
  }

  // Mirrors of the (7, 3, 2) triangle, and the permutation action of its
  // three reflections on eight colours, from the explorer's search.
  var P = Math.PI / 7, Q = Math.PI / 3;
  var b = Math.cos(Q), a = Math.cos(Q) * Math.cos(P) / Math.sin(P), c = Math.sqrt(a * a + b * b - 1);
  var N = [[0, -1, 0], [-Math.sin(P), Math.cos(P), 0], [a, b, c]];
  var TABLE = [0, 0, 1, 2, 1, 0, 1, 3, 2, 4, 2, 3, 3, 5, 6, 7, 4, 7, 6, 7, 4, 5, 6, 5];
  var PAL = ['#ff5d73', '#3fa7ff', '#ffd93d', '#4cd07d', '#8a6cff', '#ffa33f', '#ff7ad1', '#36c9c6'];
  // Distance from a heptagon's centre to its corner, for the shading.
  var R = Math.acosh(1 / (Math.tan(P) * Math.tan(Q)));

  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'out vec4 o;',
    'uniform vec2 uRes;',
    'uniform mat3 uTinv;',
    'uniform vec3 uN[3];',
    'uniform int uS[24];',
    'uniform vec3 uPal[8];',
    'uniform float uR;',
    'float md(vec3 a, vec3 b) { return a.x*b.x + a.y*b.y - a.z*b.z; }',
    'void main() {',
    '  vec2 d = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y)) / 0.96;',
    '  float r2 = dot(d, d);',
    '  vec3 v = r2 < 0.9999 ? vec3(2.0 * d, 1.0 + r2) / (1.0 - r2) : vec3(0.0, 0.0, 1.0);',
    '  vec3 dx = dFdx(v), dy = dFdy(v);',
    '  float pix = sqrt(max(max(md(dx, dx), md(dy, dy)), 0.0));',
    '  if (r2 >= 0.9999) { o = vec4(0.0); return; }',
    '  vec3 p = uTinv * v; int g[64]; int k = 0;',
    '  for (int i = 0; i < 60; i++) { bool m = false;',
    '    for (int j = 0; j < 3; j++) { float t = md(p, uN[j]); if (t > 0.0) { p -= 2.0 * t * uN[j]; if (k < 64) g[k] = j; k++; m = true; } }',
    '    if (!m) break; }',
    '  int x = 0; for (int j = 63; j >= 0; j--) { if (j < min(k, 64)) x = uS[x * 3 + g[j]]; }',
    '  vec3 col = uPal[x];',
    '  float rel = clamp(acosh(max(p.z, 1.0)) / uR, 0.0, 1.0);',
    '  col *= 1.0 + 0.35 * (0.12 - 0.42 * rel * rel);',
    '  float e3 = asinh(abs(md(p, uN[2]))), w = 0.03 * uR, aa = fwidth(e3) + 1e-6;',
    '  col = mix(col, vec3(0.11, 0.1, 0.09), 1.0 - smoothstep(w - aa, w + aa, e3));',
    '  float fade = k > 63 ? 1.0 : smoothstep(0.04, 0.2, pix / uR);',
    '  o = vec4(col, 1.0 - fade);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  function u(n) { return gl.getUniformLocation(prog, n); }
  gl.uniform3fv(u('uN'), new Float32Array([].concat(N[0], N[1], N[2])));
  gl.uniform1iv(u('uS'), new Int32Array(TABLE));
  gl.uniform3fv(u('uPal'), new Float32Array([].concat.apply([], PAL.map(function (h) {
    return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
  }))));
  gl.uniform1f(u('uR'), R);
  var uTinv = u('uTinv'), uRes = u('uRes');

  // The view centre moves to (x, y) on a small circle; uTinv is the inverse
  // of that translation, written out column by column.
  function draw(time) {
    var ang = 2 * Math.PI * (time / 10000 % 1), t = 0.42;
    var ux = Math.cos(ang), uy = Math.sin(ang), sh = Math.sinh(t), ch = Math.cosh(t);
    var x = -sh * ux, y = -sh * uy, z = ch, k = 1 / (1 + z);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniformMatrix3fv(uTinv, false, new Float32Array([
      1 + x * x * k, x * y * k, x,
      x * y * k, 1 + y * y * k, y,
      x, y, z]));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var visible = true, running = false;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), size = Math.round((canvas.clientWidth || 120) * dpr);
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    draw(reducedMotion.matches ? 0 : performance.now());
  }
  function frame(time) {
    if (!visible || document.hidden || reducedMotion.matches) { running = false; return; }
    draw(time);
    requestAnimationFrame(frame);
  }
  function wake() {
    if (running || !visible || document.hidden || reducedMotion.matches) return;
    running = true;
    requestAnimationFrame(frame);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) wake();
    }).observe(canvas);
  }
  reducedMotion.addEventListener('change', function () { resize(); wake(); });
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', resize);
  resize();
  wake();
}());
