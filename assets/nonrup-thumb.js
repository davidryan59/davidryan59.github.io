/* Stellated tetrahedron, turning, for the builder page's thumbnail.
   Written by tools/thumbnails/nonrup.js from app/nonrup/models.js. */
(function () {
  'use strict';

  var canvas = document.getElementById('nonrup-thumb');
  if (!canvas || !canvas.getContext) return;

  var context = canvas.getContext('2d');
  var vertices = [[0.57735,0.57735,0.57735],[0.57735,-0.57735,-0.57735],[-0.57735,0.57735,-0.57735],[-0.57735,-0.57735,0.57735],[-0.31754,0.31754,0.31754],[0.31754,-0.31754,0.31754],[0.31754,0.31754,-0.31754],[-0.31754,-0.31754,-0.31754]];
  var faces = [[1,0,5],[6,0,1],[4,0,2],[2,0,6],[3,0,4],[5,0,3],[6,1,2],[2,1,7],[3,1,5],[7,1,3],[4,2,3],[3,2,7]];
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var visible = true;
  var running = false;
  var needsDraw = true;
  var start = performance.now();

  // Spin about the solid's own eleven-fold axis, tilted towards the viewer,
  // while the whole solid turns slowly about the vertical.
  function place(vertex, spin, turn) {
    var cs = Math.cos(spin), ss = Math.sin(spin);
    var x = vertex[0] * cs - vertex[1] * ss;
    var y = vertex[0] * ss + vertex[1] * cs;
    var z = vertex[2];
    var tilt = -1.02, ct = Math.cos(tilt), st = Math.sin(tilt);
    var y1 = y * ct - z * st;
    var z1 = y * st + z * ct;
    var ct2 = Math.cos(turn), st2 = Math.sin(turn);
    return [x * ct2 + z1 * st2, y1, -x * st2 + z1 * ct2];
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width * ratio));
    var height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    needsDraw = true;
    wake();
  }

  function draw(time) {
    var width = canvas.width;
    var height = canvas.height;
    var elapsed = reducedMotion.matches ? 0 : time - start;
    var spin = 0.3 + elapsed * 0.00028;
    var turn = 0.35 * Math.sin(elapsed * 0.00011);
    var points = vertices.map(function (vertex) { return place(vertex, spin, turn); });
    var scale = Math.min(width, height) * 0.4;
    var distance = 5;
    var projected = points.map(function (point) {
      var perspective = distance / (distance - point[2]);
      return [width / 2 + point[0] * scale * perspective, height / 2 - point[1] * scale * perspective];
    });
    var dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var light = [-0.42, 0.66, 0.62];
    var ratio = Math.min(window.devicePixelRatio || 1, 2);

    context.clearRect(0, 0, width, height);
    context.lineJoin = 'round';
    context.lineWidth = 0.7 * ratio;
    context.strokeStyle = dark ? 'rgba(255, 240, 210, .32)' : 'rgba(70, 45, 10, .28)';
    // A convex solid shows only the faces that point at the viewer, and they never overlap.
    faces.forEach(function (face) {
      var a = points[face[0]], b = points[face[1]], c = points[face[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * -a[0] + ny * -a[1] + nz * (distance - a[2]) <= 0) return;
      var size = Math.hypot(nx, ny, nz) || 1;
      var lit = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / size);
      var lightness = 27 + lit * 36 + (nx / size + 1) * 2.5;
      context.beginPath();
      face.forEach(function (index, i) {
        var p = projected[index];
        if (i) context.lineTo(p[0], p[1]); else context.moveTo(p[0], p[1]);
      });
      context.closePath();
      context.fillStyle = 'hsl(' + (96 + ny / size * 12) + ' 58% ' + lightness + '%)';
      context.fill();
      context.stroke();
    });
    needsDraw = false;
  }

  function frame(time) {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    if (!reducedMotion.matches || needsDraw) draw(time);
    if (reducedMotion.matches) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (running || !visible || document.hidden) return;
    running = true;
    requestAnimationFrame(frame);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) wake();
    }).observe(canvas);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  reducedMotion.addEventListener('change', function () { needsDraw = true; wake(); });
  document.addEventListener('visibilitychange', wake);
  new MutationObserver(function () { needsDraw = true; wake(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize();
}());
