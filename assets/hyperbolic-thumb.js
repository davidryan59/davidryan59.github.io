/* The builder page's live thumbnail for the Hyperbolic Models Explorer: the
   {7,3} heptagon tiling in the Poincaré disk, drifting round a small circle
   and back on a 10 s loop. It draws with a cut-down copy of the explorer's
   shader in app/hyperbolic/hyperbolic.js, at the explorer's defaults: its
   eight-colour colouring of {7,3}, shading 70%, edge width 2, and the Compass
   design, Upright, at 60% opacity. The background is transparent, so the
   disk suits both themes. Without WebGL 2, a still picture takes its place. */
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
    'uniform mat3 uT;',
    'uniform vec2 uZ0;',
    'uniform sampler2D uGlyph;',
    'float md(vec3 a, vec3 b) { return a.x*b.x + a.y*b.y - a.z*b.z; }',
    'mat3 reflM(mat3 M, vec3 N) { vec3 n = vec3(N.xy, -N.z); vec3 r = vec3(dot(n, M[0]), dot(n, M[1]), dot(n, M[2]));',
    '  M[0] -= 2.0 * r.x * N; M[1] -= 2.0 * r.y * N; M[2] -= 2.0 * r.z * N; return M; }',
    'vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }',
    'void main() {',
    '  vec2 d = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y)) / 0.96;',
    '  float r2 = dot(d, d);',
    '  vec3 v = r2 < 0.9999 ? vec3(2.0 * d, 1.0 + r2) / (1.0 - r2) : vec3(0.0, 0.0, 1.0);',
    '  vec3 dx = dFdx(v), dy = dFdy(v);',
    '  float pix = sqrt(max(max(md(dx, dx), md(dy, dy)), 0.0));',
    '  if (r2 >= 0.9999) { o = vec4(0.0); return; }',
    '  vec3 p = uTinv * v; int g[64]; int k = 0; mat3 M = mat3(1.0);',
    '  for (int i = 0; i < 60; i++) { bool m = false;',
    '    for (int j = 0; j < 3; j++) { float t = md(p, uN[j]); if (t > 0.0) { p -= 2.0 * t * uN[j]; M = reflM(M, uN[j]); if (k < 64) g[k] = j; k++; m = true; } }',
    '    if (!m) break; }',
    '  int x = 0; for (int j = 63; j >= 0; j--) { if (j < min(k, 64)) x = uS[x * 3 + g[j]]; }',
    '  vec3 col = uPal[x];',
    '  float rel = clamp(acosh(max(p.z, 1.0)) / uR, 0.0, 1.0);',
    '  float sg = pow(0.7, 1.6), t2 = rel * rel; col *= 1.0 - 0.7 * sg * t2; col = mix(col, vec3(1.0), 0.2 * sg * (1.0 - t2));',
    // The Compass, upright in the home view and carried with the plane: the
    // explorer's Upright frame with phi = 0, since every view is a pure shift.
    '  if (k < 64) {',
    '    vec3 cs = uT * vec3(-M[0].z, -M[1].z, M[2].z); vec2 z = cs.xy / (1.0 + cs.z);',
    '    vec2 q = vec2(1.0, 0.0) - cmul(vec2(uZ0.x, -uZ0.y), z);',
    '    float th = 1.5707963 + 2.0 * atan(q.y, q.x);',
    '    vec2 dv = vec2(cos(th), sin(th)); float D = 1.0 - dot(z, z), ud = dot(z, dv);',
    '    vec3 ef = M * (uTinv * vec3(2.0 * D * dv + 4.0 * ud * z, 4.0 * ud));',
    '    float al = atan(ef.y, ef.x), ca = cos(al), sa = sin(al);',
    '    vec2 L = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y); if ((k & 1) == 1) L.y = -L.y;',
    '    vec2 f = L / (1.0 + p.z) / (0.62 * tanh(0.5 * asinh(uN[2].z)));',
    '    vec2 tc = vec2(-f.y, f.x) * 0.5 + 0.5;',
    '    vec4 gt = all(greaterThan(tc, vec2(0.0))) && all(lessThan(tc, vec2(1.0))) ? texture(uGlyph, tc) : vec4(0.0);',
    '    col = mix(col, mix(vec3(0.11, 0.1, 0.09), vec3(1.0), gt.r), 0.6 * gt.a);',
    '  }',
    '  float e3 = asinh(abs(md(p, uN[2]))), w = 0.02 * uR, aa = fwidth(e3) + 1e-6;',
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
  var uTinv = u('uTinv'), uRes = u('uRes'), uT = u('uT'), uZ0 = u('uZ0');

  // The Compass from app/hyperbolic/designs.js: black draws in the edge
  // colour, white draws white, grey between.
  var pic = document.createElement('canvas'); pic.width = pic.height = 128;
  var x2 = pic.getContext('2d');
  x2.fillStyle = '#000'; x2.beginPath(); x2.moveTo(64, 6); x2.lineTo(88, 64); x2.lineTo(40, 64); x2.closePath(); x2.fill();
  x2.fillStyle = '#fff'; x2.beginPath(); x2.moveTo(64, 122); x2.lineTo(40, 64); x2.lineTo(64, 64); x2.closePath(); x2.fill();
  x2.fillStyle = 'rgb(140,140,140)'; x2.beginPath(); x2.moveTo(64, 122); x2.lineTo(88, 64); x2.lineTo(64, 64); x2.closePath(); x2.fill();
  x2.strokeStyle = '#000'; x2.lineWidth = 3; x2.lineJoin = 'round';
  x2.beginPath(); x2.moveTo(64, 122); x2.lineTo(88, 64); x2.lineTo(40, 64); x2.closePath(); x2.stroke();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pic);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(u('uGlyph'), 0);

  // The view centre moves to (x, y) on a small circle; uTinv is the inverse
  // of that translation, written out column by column. Both are symmetric,
  // so rows and columns agree. The designs were aimed in the home view, so
  // uZ0 is the current centre's point in the Poincaré disk.
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
    gl.uniformMatrix3fv(uT, false, new Float32Array([
      1 + x * x * k, x * y * k, -x,
      x * y * k, 1 + y * y * k, -y,
      -x, -y, z]));
    gl.uniform2f(uZ0, -x * k, -y * k);
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
