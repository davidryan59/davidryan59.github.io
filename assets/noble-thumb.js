(function () {
  'use strict';

  var canvas = document.getElementById('noble-thumb');
  if (!canvas || !canvas.getContext) return;

  var context = canvas.getContext('2d');
  var phi = (1 + Math.sqrt(5)) / 2;
  var vertices = [
    [0, 1, phi], [0, -1, phi], [phi, 0, 1], [-phi, 0, 1],
    [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
    [phi, 0, -1], [-phi, 0, -1], [0, 1, -phi], [0, -1, -phi]
  ];
  var faces = [
    [9, 6, 3, 11, 1], [2, 5, 8, 0, 10], [8, 9, 4, 11, 5],
    [11, 4, 6, 10, 2], [11, 5, 7, 10, 3], [2, 7, 8, 1, 11],
    [9, 0, 7, 5, 1], [4, 3, 10, 0, 9], [6, 4, 1, 8, 0],
    [7, 10, 6, 9, 8], [2, 3, 4, 1, 5], [7, 2, 3, 6, 0]
  ];
  var aurora = [
    [30, 203, 181], [54, 117, 224], [169, 78, 205],
    [54, 181, 231], [136, 207, 105], [104, 89, 212]
  ];
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var visible = true;
  var running = false;
  var needsDraw = true;
  var start = performance.now();

  function rotate(vertex, yaw) {
    var cy = Math.cos(yaw);
    var sy = Math.sin(yaw);
    var x = vertex[0] * cy + vertex[2] * sy;
    var z = -vertex[0] * sy + vertex[2] * cy;
    var tilt = -0.38;
    var ct = Math.cos(tilt);
    var st = Math.sin(tilt);
    return [x, vertex[1] * ct - z * st, vertex[1] * st + z * ct];
  }

  function cross(a, b, c) {
    var ax = b[0] - a[0];
    var ay = b[1] - a[1];
    var az = b[2] - a[2];
    var bx = c[0] - a[0];
    var by = c[1] - a[1];
    var bz = c[2] - a[2];
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  }

  function colour(rgb, light) {
    var amount = Math.max(0.4, Math.min(1.18, light));
    return 'rgb(' + rgb.map(function (channel) {
      return Math.round(Math.min(255, channel * amount));
    }).join(',') + ')';
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
    var yaw = reducedMotion.matches ? 0.66 : 0.66 + (time - start) * 0.00018;
    var points = vertices.map(function (vertex) { return rotate(vertex, yaw); });
    var scale = Math.min(width, height) * 0.245;
    var distance = 5.4;
    var projected = points.map(function (point) {
      var perspective = distance / (distance - point[2]);
      return [width / 2 + point[0] * scale * perspective,
        height / 2 - point[1] * scale * perspective];
    });
    var ordered = faces.map(function (face, index) {
      var depth = face.reduce(function (sum, vertex) { return sum + points[vertex][2]; }, 0) / face.length;
      return { face: face, index: index, depth: depth };
    }).sort(function (a, b) { return a.depth - b.depth; });
    var lightDirection = [-0.38, 0.62, 0.69];
    var dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);

    context.clearRect(0, 0, width, height);
    context.lineJoin = 'round';
    ordered.forEach(function (entry) {
      var face = entry.face;
      var normal = cross(points[face[0]], points[face[1]], points[face[2]]);
      var length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
      var lit = Math.abs((normal[0] * lightDirection[0] + normal[1] * lightDirection[1] + normal[2] * lightDirection[2]) / length);
      var intensity = 0.47 + Math.pow(lit, 0.8) * 0.68;
      context.beginPath();
      face.forEach(function (vertex, index) {
        var point = projected[vertex];
        if (index) context.lineTo(point[0], point[1]);
        else context.moveTo(point[0], point[1]);
      });
      context.closePath();
      context.fillStyle = colour(aurora[entry.index % aurora.length], intensity);
      context.fill('evenodd');
      context.strokeStyle = dark ? 'rgba(224, 236, 244, .42)' : 'rgba(25, 31, 40, .42)';
      context.lineWidth = Math.max(0.8, width / 170);
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
