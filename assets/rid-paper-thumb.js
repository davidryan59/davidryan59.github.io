/* Rhombicosidodecahedron, turning, for the builder page's thumbnail.
   Written by tools/thumbnails/nonrup.js from app/nonrup/models.js. */
(function () {
  'use strict';

  var canvas = document.getElementById('rid-paper-thumb');
  if (!canvas || !canvas.getContext) return;

  var context = canvas.getContext('2d');
  var vertices = [[0.22392,0.22392,0.94854],[0.22392,0.22392,-0.94854],[0.22392,-0.22392,0.94854],[0.22392,-0.22392,-0.94854],[-0.22392,0.22392,0.94854],[-0.22392,0.22392,-0.94854],[-0.22392,-0.22392,0.94854],[-0.22392,-0.22392,-0.94854],[0.22392,0.94854,0.22392],[0.22392,0.94854,-0.22392],[0.22392,-0.94854,0.22392],[0.22392,-0.94854,-0.22392],[-0.22392,0.94854,0.22392],[-0.22392,0.94854,-0.22392],[-0.22392,-0.94854,0.22392],[-0.22392,-0.94854,-0.22392],[0.94854,0.22392,0.22392],[0.94854,0.22392,-0.22392],[0.94854,-0.22392,0.22392],[0.94854,-0.22392,-0.22392],[-0.94854,0.22392,0.22392],[-0.94854,0.22392,-0.22392],[-0.94854,-0.22392,0.22392],[-0.94854,-0.22392,-0.22392],[0.58623,0.36231,0.72462],[0.58623,0.36231,-0.72462],[0.58623,-0.36231,0.72462],[0.58623,-0.36231,-0.72462],[-0.58623,0.36231,0.72462],[-0.58623,0.36231,-0.72462],[-0.58623,-0.36231,0.72462],[-0.58623,-0.36231,-0.72462],[0.36231,0.72462,0.58623],[0.36231,0.72462,-0.58623],[0.36231,-0.72462,0.58623],[0.36231,-0.72462,-0.58623],[-0.36231,0.72462,0.58623],[-0.36231,0.72462,-0.58623],[-0.36231,-0.72462,0.58623],[-0.36231,-0.72462,-0.58623],[0.72462,0.58623,0.36231],[0.72462,0.58623,-0.36231],[0.72462,-0.58623,0.36231],[0.72462,-0.58623,-0.36231],[-0.72462,0.58623,0.36231],[-0.72462,0.58623,-0.36231],[-0.72462,-0.58623,0.36231],[-0.72462,-0.58623,-0.36231],[0.81015,0,0.58623],[0.81015,0,-0.58623],[-0.81015,0,0.58623],[-0.81015,0,-0.58623],[0,0.58623,0.81015],[0,0.58623,-0.81015],[0,-0.58623,0.81015],[0,-0.58623,-0.81015],[0.58623,0.81015,0],[0.58623,-0.81015,0],[-0.58623,0.81015,0],[-0.58623,-0.81015,0]];
  var faces = [[2,0,4,6],[48,24,0,2,26],[4,0,52],[32,52,0,24],[5,1,3,7],[27,3,1,25,49],[53,1,5],[25,1,53,33],[54,2,6],[26,2,54,34],[7,3,55],[35,55,3,27],[30,6,4,28,50],[28,4,52,36],[51,29,5,7,31],[37,53,5,29],[38,54,6,30],[31,7,55,39],[12,8,9,13],[9,8,56],[52,32,8,12,36],[56,8,32,40],[37,13,9,33,53],[41,33,9,56],[11,10,14,15],[57,10,11],[38,14,10,34,54],[42,34,10,57],[55,35,11,15,39],[57,11,35,43],[58,12,13],[44,36,12,58],[58,13,37,45],[15,14,59],[59,14,38,46],[47,39,15,59],[17,16,18,19],[56,40,16,17,41],[18,16,48],[24,48,16,40],[49,17,19],[41,17,49,25],[43,19,18,42,57],[42,18,48,26],[27,49,19,43],[22,20,21,23],[45,21,20,44,58],[50,20,22],[44,20,50,28],[23,21,51],[29,51,21,45],[59,46,22,23,47],[30,50,22,46],[47,23,51,31],[32,24,40],[41,25,33],[42,26,34],[35,27,43],[44,28,36],[37,29,45],[38,30,46],[47,31,39]];
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
      context.fillStyle = 'hsl(' + (304 + ny / size * 12) + ' 58% ' + lightness + '%)';
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
