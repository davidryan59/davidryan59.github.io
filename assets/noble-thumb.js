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
    return rgb.map(function (channel) {
      return Math.round(Math.min(255, channel * amount));
    });
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
    var lightDirection = [-0.38, 0.62, 0.69];
    var dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var faceColours = [];
    var depths = new Float32Array(width * height);
    var owners = new Int16Array(width * height);
    depths.fill(-Infinity);
    owners.fill(-1);

    context.clearRect(0, 0, width, height);
    faces.forEach(function (face, faceIndex) {
      var normal = cross(points[face[0]], points[face[1]], points[face[2]]);
      var length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
      var lit = Math.abs((normal[0] * lightDirection[0] + normal[1] * lightDirection[1] + normal[2] * lightDirection[2]) / length);
      var intensity = 0.47 + Math.pow(lit, 0.8) * 0.68;
      faceColours[faceIndex] = colour(aurora[faceIndex % aurora.length], intensity);

      var polygon = face.map(function (vertex) { return projected[vertex]; });
      var planePoint = points[face[0]];
      var planeConstant = normal[0] * planePoint[0] + normal[1] * planePoint[1] + normal[2] * planePoint[2];
      var minY = Math.max(0, Math.ceil(Math.min.apply(null, polygon.map(function (point) { return point[1]; })) - 0.5));
      var maxY = Math.min(height - 1, Math.floor(Math.max.apply(null, polygon.map(function (point) { return point[1]; })) - 0.5));

      for (var y = minY; y <= maxY; y++) {
        var scanY = y + 0.5;
        var crossings = [];
        for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          var a = polygon[i];
          var b = polygon[j];
          if ((a[1] > scanY) !== (b[1] > scanY)) {
            crossings.push(a[0] + (scanY - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
        }
        crossings.sort(function (a, b) { return a - b; });
        for (var pair = 0; pair + 1 < crossings.length; pair += 2) {
          var minX = Math.max(0, Math.ceil(crossings[pair] - 0.5));
          var maxX = Math.min(width - 1, Math.floor(crossings[pair + 1] - 0.5));
          for (var x = minX; x <= maxX; x++) {
            var px = (x + 0.5 - width / 2) / scale;
            var py = -(y + 0.5 - height / 2) / scale;
            var screenDot = normal[0] * px + normal[1] * py;
            var denominator = normal[2] - screenDot / distance;
            if (Math.abs(denominator) < 1e-10) continue;
            var z = (planeConstant - screenDot) / denominator;
            var pixel = y * width + x;
            if (z > depths[pixel] + 1e-5 ||
                (Math.abs(z - depths[pixel]) <= 1e-5 && faceIndex < owners[pixel])) {
              depths[pixel] = z;
              owners[pixel] = faceIndex;
            }
          }
        }
      }
    });

    var image = context.createImageData(width, height);
    var data = image.data;
    var edgeColour = dark ? [215, 226, 236] : [34, 38, 44];
    for (var pixel = 0; pixel < owners.length; pixel++) {
      var owner = owners[pixel];
      if (owner < 0) continue;
      var x = pixel % width;
      var y = Math.floor(pixel / width);
      var edge = x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        owners[pixel - 1] !== owner || owners[pixel + 1] !== owner ||
        owners[pixel - width] !== owner || owners[pixel + width] !== owner;
      var rgb = faceColours[owner];
      var blend = edge ? 0.34 : 0;
      var output = pixel * 4;
      data[output] = rgb[0] * (1 - blend) + edgeColour[0] * blend;
      data[output + 1] = rgb[1] * (1 - blend) + edgeColour[1] * blend;
      data[output + 2] = rgb[2] * (1 - blend) + edgeColour[2] * blend;
      data[output + 3] = 255;
    }
    context.putImageData(image, 0, 0);
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
