/* Undecanope, turning, for the builder page's thumbnail.
   Written by tools/thumbnails/nonrup.js from app/nonrup/models.js. */
(function () {
  'use strict';

  var canvas = document.getElementById('undecanope-paper-thumb');
  if (!canvas || !canvas.getContext) return;

  var context = canvas.getContext('2d');
  var vertices = [[0.46217,0,0.88679],[-0.46217,0,-0.88679],[0.3888,0.24987,0.88679],[-0.3888,-0.24987,-0.88679],[0.19199,0.4204,0.88679],[-0.19199,-0.4204,-0.88679],[-0.06577,0.45747,0.88679],[0.06577,-0.45747,-0.88679],[-0.30266,0.34928,0.88679],[0.30266,-0.34928,-0.88679],[-0.44345,0.13021,0.88679],[0.44345,-0.13021,-0.88679],[-0.44345,-0.13021,0.88679],[0.44345,0.13021,-0.88679],[-0.30266,-0.34928,0.88679],[0.30266,0.34928,-0.88679],[-0.06577,-0.45747,0.88679],[0.06577,0.45747,-0.88679],[0.19199,-0.4204,0.88679],[-0.19199,0.4204,-0.88679],[0.3888,-0.24987,0.88679],[-0.3888,0.24987,-0.88679],[0.80739,0.26028,0.4896],[-0.80739,-0.26028,-0.4896],[0.5385,0.65547,0.4896],[-0.5385,-0.65547,-0.4896],[0.09864,0.84255,0.4896],[-0.09864,-0.84255,-0.4896],[-0.37254,0.76213,0.4896],[0.37254,-0.76213,-0.4896],[-0.72544,0.43974,0.4896],[0.72544,-0.43974,-0.4896],[-0.84802,-0.02227,0.4896],[0.84802,0.02227,-0.4896],[-0.70136,-0.47721,0.4896],[0.70136,0.47721,-0.4896],[-0.33202,-0.78063,0.4896],[0.33202,0.78063,-0.4896],[0.14273,-0.83621,0.4896],[-0.14273,0.83621,-0.4896],[0.57216,-0.6263,0.4896],[-0.57216,0.6263,-0.4896],[0.81994,-0.21754,0.4896],[-0.81994,0.21754,-0.4896],[0.83499,0.39665,0.22933],[-0.83499,-0.39665,-0.22933],[0.48799,0.78512,0.22933],[-0.48799,-0.78512,-0.22933],[-0.01394,0.92431,0.22933],[0.01394,-0.92431,-0.22933],[-0.51145,0.77004,0.22933],[0.51145,-0.77004,-0.22933],[-0.84657,0.37129,0.22933],[0.84657,-0.37129,-0.22933],[-0.91292,-0.14534,0.22933],[0.91292,0.14534,-0.22933],[-0.68942,-0.61583,0.22933],[0.68942,0.61583,-0.22933],[-0.24703,-0.8908,0.22933],[0.24703,0.8908,-0.22933],[0.27379,-0.88294,0.22933],[-0.27379,0.88294,-0.22933],[0.70768,-0.59476,0.22933],[-0.70768,0.59476,-0.22933],[0.91689,-0.11774,0.22933],[-0.91689,0.11774,-0.22933],[0.96771,0.07928,0.09932],[-0.96771,-0.07928,-0.09932],[0.77123,0.58988,0.09932],[-0.77123,-0.58988,-0.09932],[0.32989,0.9132,0.09932],[-0.32989,-0.9132,-0.09932],[-0.21619,0.94658,0.09932],[0.21619,-0.94658,-0.09932],[-0.69363,0.67943,0.09932],[0.69363,-0.67943,-0.09932],[-0.95085,0.19657,0.09932],[0.95085,-0.19657,-0.09932],[-0.90618,-0.3487,0.09932],[0.90618,0.3487,-0.09932],[-0.57381,-0.78326,0.09932],[0.57381,0.78326,-0.09932],[-0.05925,-0.96915,0.09932],[0.05925,0.96915,-0.09932],[0.47411,-0.84733,0.09932],[-0.47411,0.84733,-0.09932],[0.85695,-0.45649,0.09932],[-0.85695,0.45649,-0.09932]];
  var faces = [[12,14,16,18,20,0,2,4,6,8,10],[2,0,22],[42,0,20],[22,0,42],[11,9,7,5,3,1,21,19,17,15,13],[23,1,3],[21,1,43],[43,1,23],[4,2,24],[24,2,22],[25,3,5],[23,3,25],[6,4,26],[26,4,24],[27,5,7],[25,5,27],[8,6,28],[28,6,26],[29,7,9],[27,7,29],[10,8,30],[30,8,28],[31,9,11],[29,9,31],[12,10,32],[32,10,30],[33,11,13],[31,11,33],[14,12,34],[34,12,32],[35,13,15],[33,13,35],[16,14,36],[36,14,34],[37,15,17],[35,15,37],[18,16,38],[38,16,36],[39,17,19],[37,17,39],[20,18,40],[40,18,38],[41,19,21],[39,19,41],[42,20,40],[41,21,43],[24,22,68],[66,22,42],[44,22,66],[68,22,44],[69,23,25],[43,23,67],[67,23,45],[45,23,69],[26,24,70],[46,24,68],[70,24,46],[71,25,27],[69,25,47],[47,25,71],[28,26,72],[48,26,70],[72,26,48],[73,27,29],[71,27,49],[49,27,73],[30,28,74],[50,28,72],[74,28,50],[75,29,31],[73,29,51],[51,29,75],[32,30,76],[52,30,74],[76,30,52],[77,31,33],[75,31,53],[53,31,77],[34,32,78],[54,32,76],[78,32,54],[79,33,35],[77,33,55],[55,33,79],[36,34,80],[56,34,78],[80,34,56],[81,35,37],[79,35,57],[57,35,81],[38,36,82],[58,36,80],[82,36,58],[83,37,39],[81,37,59],[59,37,83],[40,38,84],[60,38,82],[84,38,60],[85,39,41],[83,39,61],[61,39,85],[42,40,86],[62,40,84],[86,40,62],[87,41,43],[85,41,63],[63,41,87],[66,42,64],[64,42,86],[65,43,67],[87,43,65],[79,44,66],[68,44,79],[67,45,78],[78,45,69],[81,46,68],[70,46,81],[69,47,80],[80,47,71],[83,48,70],[72,48,83],[71,49,82],[82,49,73],[85,50,72],[74,50,85],[73,51,84],[84,51,75],[87,52,74],[76,52,87],[75,53,86],[86,53,77],[67,54,76],[78,54,67],[77,55,66],[66,55,79],[69,56,78],[80,56,69],[79,57,68],[68,57,81],[71,58,80],[82,58,71],[81,59,70],[70,59,83],[73,60,82],[84,60,73],[83,61,72],[72,61,85],[75,62,84],[86,62,75],[85,63,74],[74,63,87],[66,64,77],[77,64,86],[76,65,67],[87,65,76]];
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
      context.fillStyle = 'hsl(' + (38 + ny / size * 12) + ' 58% ' + lightness + '%)';
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
