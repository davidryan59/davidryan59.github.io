/* Hyperbolic Models Explorer: the pictures that can sit on each tile.
   Each draws on a clear 128-pixel square, with up at the top. Black draws
   in the tiling's edge colour, white draws white and alpha sets opacity, so
   the shader can lay any of them over any colouring. */
(function () {
  var PI = Math.PI;
  function K(x, a) { x.fillStyle = x.strokeStyle = 'rgba(0,0,0,' + a + ')'; }
  function Wh(x, a) { x.fillStyle = x.strokeStyle = 'rgba(255,255,255,' + a + ')'; }
  function G(x, v, a) { x.fillStyle = x.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')'; }
  function circle(x, cx, cy, r) { x.beginPath(); x.arc(cx, cy, r, 0, 2 * PI); }
  function sector(x, cx, cy, r, a0, a1) { x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, a0, a1); x.closePath(); }
  // Angles in degrees, clockwise from 12 o'clock.
  function deg(d) { return (d - 90) * PI / 180; }

  function drop(x, s, ox, oy) {
    s = s || 1; ox = ox || 0; oy = oy || 0;
    function P(a, b) { return [ox + 64 + (a - 64) * s, oy + 70 + (b - 70) * s]; }
    var p = P(64, 8), q;
    x.beginPath(); x.moveTo(p[0], p[1]);
    q = [P(90, 50), P(112, 70), P(104, 92)]; x.bezierCurveTo(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1]);
    var c = P(64, 84); x.arc(c[0], c[1], 40 * s, 0.2, PI - 0.2);
    q = [P(16, 70), P(38, 50), P(64, 8)]; x.bezierCurveTo(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1]);
    x.closePath();
  }
  function spiralPts(t0, t1, a, b, cx, cy) {
    var pts = [];
    for (var t = t0; t <= t1; t += 0.04) { var r = a + b * t; pts.push([cx + r * Math.cos(-t), cy + r * Math.sin(-t), t]); }
    return pts;
  }
  function leafPath(x) { x.beginPath(); x.moveTo(40, 112); x.bezierCurveTo(4, 60, 50, 14, 108, 10); x.bezierCurveTo(112, 70, 76, 112, 40, 112); x.closePath(); }
  function leafVeins(x, w) {
    x.lineCap = 'round';
    x.lineWidth = w; x.beginPath(); x.moveTo(30, 122); x.lineTo(40, 112); x.quadraticCurveTo(66, 60, 104, 14); x.stroke();
    x.lineWidth = w * 0.55;
    [[0.22, 1, 1], [0.38, -1, 1], [0.52, 1, 0.9], [0.66, -1, 0.75], [0.8, 1, 0.5]].forEach(function (v) {
      var t = v[0], u = 1 - t;
      var px = u * u * 40 + 2 * u * t * 66 + t * t * 104, py = u * u * 112 + 2 * u * t * 60 + t * t * 14;
      x.beginPath(); x.moveTo(px, py);
      var s = v[2];
      if (v[1] > 0) x.quadraticCurveTo(px - 4 * s, py - 16 * s, px - 22 * s, py - 24 * s); else x.quadraticCurveTo(px + 14 * s, py + 2 * s, px + 24 * s, py - 6 * s);
      x.stroke();
    });
  }
  function planeL(x) { x.beginPath(); x.moveTo(102, 28); x.lineTo(12, 64); x.lineTo(54, 76); x.closePath(); }
  function planeR(x) { x.beginPath(); x.moveTo(102, 28); x.lineTo(54, 76); x.lineTo(66, 116); x.closePath(); }
  function pent(x, fn) { [[1, 0], [0, 1], [1, 1], [2, 1], [2, 2]].forEach(function (c, i) { fn(16 + c[0] * 33, 16 + c[1] * 33, i); }); }
  function paisleyPath(x, s, ox, oy) {
    s = s || 1; ox = ox || 0; oy = oy || 0;
    function P(a, b) { return [ox + 64 + (a - 64) * s, oy + 72 + (b - 72) * s]; }
    var a = P(98, 8), b1 = P(70, 30), b2 = P(20, 50), b3 = P(30, 90), c1 = P(40, 124), c2 = P(104, 122), c3 = P(104, 82), d1 = P(104, 56), d2 = P(82, 40);
    x.beginPath(); x.moveTo(a[0], a[1]);
    x.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], b3[0], b3[1]);
    x.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], c3[0], c3[1]);
    x.bezierCurveTo(d1[0], d1[1], d2[0], d2[1], a[0], a[1]); x.closePath();
  }
  function snailBody(x) { x.beginPath(); x.moveTo(8, 114); x.lineTo(116, 114); x.quadraticCurveTo(118, 100, 104, 100); x.lineTo(30, 100); x.quadraticCurveTo(22, 80, 20, 70); x.lineTo(16, 70); x.quadraticCurveTo(14, 96, 8, 114); x.closePath(); }
  function stalks(x) {
    x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(20, 74); x.lineTo(10, 50); x.moveTo(20, 74); x.lineTo(26, 48); x.stroke();
    circle(x, 10, 48, 5); x.fill(); circle(x, 26, 46, 5); x.fill();
  }

  window.HYPER_DESIGNS = [
    { id: 'teardrop', name: 'Teardrop', draw: function (x) {
        K(x, 0.5); drop(x); x.fill(); K(x, 1); x.lineWidth = 5; drop(x); x.stroke(); Wh(x, 1); circle(x, 78, 90, 12); x.fill();
      } },
    { id: 'fading-drop', name: 'Fading drop', draw: function (x) {
        var g = x.createLinearGradient(64, 8, 64, 124); g.addColorStop(0, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(0,0,0,1)');
        x.fillStyle = g; drop(x); x.fill(); Wh(x, 1); circle(x, 78, 92, 12); x.fill(); K(x, 0.6); circle(x, 46, 100, 6); x.fill();
      } },
    { id: 'spiral', name: 'Spiral', draw: function (x) {
        K(x, 1); x.lineCap = 'round'; var p = spiralPts(0.3, 4.2 * PI, 3, 4.2, 64, 64);
        for (var i = 1; i < p.length; i++) { x.lineWidth = 2 + 11 * i / p.length; x.beginPath(); x.moveTo(p[i - 1][0], p[i - 1][1]); x.lineTo(p[i][0], p[i][1]); x.stroke(); }
      } },
    { id: 'dot-spiral', name: 'Dot spiral', draw: function (x) {
        for (var t = 1; t < 4.4 * PI; t += 0.55) { var r = 3 + 4.0 * t, k = t / (4.4 * PI); K(x, 0.2 + 0.8 * k); circle(x, 64 + r * Math.cos(-t), 64 + r * Math.sin(-t), 2 + 7 * k); x.fill(); }
      } },
    { id: 'clock', name: 'Clock', draw: function (x) {
        K(x, 0.2); circle(x, 64, 64, 56); x.fill();
        K(x, 0.5); x.lineWidth = 6; circle(x, 64, 64, 54); x.stroke();
        K(x, 0.7); [0, 90, 180, 270].forEach(function (d) { var a = deg(d), c = Math.cos(a), sn = Math.sin(a);
          x.beginPath(); x.moveTo(64 + 46 * c - 3 * sn, 64 + 46 * sn + 3 * c); x.lineTo(64 + 46 * c + 3 * sn, 64 + 46 * sn - 3 * c); x.lineTo(64 + 38 * c, 64 + 38 * sn); x.closePath(); x.fill(); });
        K(x, 1);
        x.beginPath(); x.moveTo(64, 11); x.lineTo(70, 34); x.lineTo(64, 66); x.lineTo(58, 34); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(94, 64); x.lineTo(76, 74); x.lineTo(62, 64); x.lineTo(76, 54); x.closePath(); x.fill();
        circle(x, 64, 64, 6); x.fill();
      } },
    { id: 'compass', name: 'Compass', draw: function (x) {
        K(x, 1); x.beginPath(); x.moveTo(64, 6); x.lineTo(88, 64); x.lineTo(40, 64); x.closePath(); x.fill();
        Wh(x, 1); x.beginPath(); x.moveTo(64, 122); x.lineTo(40, 64); x.lineTo(64, 64); x.closePath(); x.fill();
        G(x, 140, 1); x.beginPath(); x.moveTo(64, 122); x.lineTo(88, 64); x.lineTo(64, 64); x.closePath(); x.fill();
        K(x, 1); x.lineWidth = 3; x.lineJoin = 'round'; x.beginPath(); x.moveTo(64, 122); x.lineTo(88, 64); x.lineTo(40, 64); x.closePath(); x.stroke();
      } },
    { id: 'notched-disc', name: 'Notched disc', draw: function (x) {
        K(x, 1); sector(x, 64, 64, 54, deg(120), deg(360)); x.fill();
        K(x, 0.5); sector(x, 64, 64, 54, deg(60), deg(120)); x.fill();
      } },
    { id: 'notched-ring', name: 'Notched ring', draw: function (x) {
        x.lineWidth = 26;
        K(x, 1); x.beginPath(); x.arc(64, 64, 42, deg(120), deg(360)); x.stroke();
        K(x, 0.5); x.beginPath(); x.arc(64, 64, 42, deg(60), deg(120)); x.stroke();
        K(x, 0.8); circle(x, 64, 64, 14); x.fill(); Wh(x, 1); circle(x, 64, 64, 7); x.fill();
      } },
    { id: 'leaf', name: 'Leaf', draw: function (x) {
        K(x, 0.45); leafPath(x); x.fill();
        K(x, 1); x.save(); leafPath(x); x.clip(); leafVeins(x, 6); x.restore();
        x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(30, 122); x.lineTo(40, 112); x.stroke();
      } },
    { id: 'paper-plane', name: 'Paper plane', draw: function (x) {
        K(x, 0.55); planeL(x); x.fill(); Wh(x, 0.9); planeR(x); x.fill();
        K(x, 1); x.lineWidth = 4; x.lineJoin = 'round'; planeL(x); x.stroke(); planeR(x); x.stroke();
      } },
    { id: 'pennant', name: 'Pennant', draw: function (x) {
        K(x, 1); x.fillRect(30, 18, 9, 102); circle(x, 34.5, 14, 8); x.fill();
        K(x, 0.55); x.beginPath(); x.moveTo(39, 22); x.lineTo(112, 42); x.lineTo(39, 66); x.closePath(); x.fill();
      } },
    { id: 'boat', name: 'Sailing boat', draw: function (x) {
        K(x, 1); x.fillRect(58, 6, 4, 88);
        x.beginPath(); x.moveTo(64, 8); x.quadraticCurveTo(108, 50, 106, 88); x.lineTo(64, 88); x.closePath(); x.fill();
        K(x, 0.45); x.beginPath(); x.moveTo(56, 14); x.lineTo(56, 88); x.lineTo(22, 88); x.closePath(); x.fill();
        K(x, 1); x.beginPath(); x.moveTo(12, 96); x.lineTo(116, 96); x.lineTo(98, 114); x.lineTo(28, 114); x.closePath(); x.fill();
        K(x, 0.3); x.fillRect(4, 118, 120, 6);
      } },
    { id: 'pentomino', name: 'Pentomino', draw: function (x) {
        K(x, 1); pent(x, function (a, b) { x.fillRect(a + 2, b + 2, 29, 29); });
      } },
    { id: 'paisley', name: 'Paisley', draw: function (x) {
        K(x, 0.5); paisleyPath(x); x.fill();
        K(x, 0.5); paisleyPath(x, 0.62, -2, 10); x.fill(); K(x, 1); circle(x, 62, 94, 7); x.fill();
      } },
    { id: 'snail', name: 'Snail', draw: function (x) {
        K(x, 0.5); circle(x, 72, 58, 40); x.fill();
        K(x, 1); x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); spiralPts(0, 3.4 * PI, 2, 3.4, 72, 58).forEach(function (q) { x.lineTo(q[0], q[1]); }); x.stroke();
        K(x, 1); snailBody(x); x.fill(); stalks(x);
      } }
  ];
  window.HYPER_DESIGNS.paint = function (d) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'); K(x, 1); d.draw(x);
    return c;
  };
})();
