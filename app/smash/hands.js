/* The player's two cartoon hands and the seven weapons.

   The right hand holds the weapon and follows the pointer. It is SVG, one
   drawing per weapon, all in the same frame: a 130 x 150 box with the wrist
   at (110, 140), the pivot the swing turns about. The arm runs off to the
   lower right, past the edge of the box. Each weapon's face is the point
   that lands where the pointer is.

   The left hand holds the device: it grips the left edge of a phone,
   tablet or monitor, with its fingers over the front of the screen, and
   rests on the keyboard of a laptop. It is drawn on the canvas in screen
   units, so it zooms and shakes with the device.

   Generic hands: four fingers and a thumb, one skin tone. */
(function (global) {
  'use strict';

  var Smash = global.Smash;
  var SKIN = '#dea57b', SHADE = '#c1875f', LINE = '#5b3927', NAIL = '#f3d2b9';
  var SLEEVE = '#3d5e91', CUFF = '#2c4674', SLEEVE_LINE = '#22375a', HURT = '#ec7a6e';

  // lift: degrees the weapon rises; full: seconds to reach the top; selfAt:
  // held this long, it hits the player; fuse: the bomb's fuse, from the
  // press; reach: the blow's radius, as a share of the screen's short side;
  // local: the weapon's face in the drawing's own frame.
  var WEAPONS = [
    { id: 'finger', label: 'Finger', key: '1', full: 0.1, lift: 18, selfAt: 2.6, reach: 0.015, local: [-2.5, -114] },
    { id: 'fist', label: 'Fist', key: '2', full: 0.45, lift: 48, selfAt: 2.8, reach: 0.045, local: [0, -72] },
    { id: 'hammer', label: 'Hammer', key: '3', full: 0.87, lift: 70, selfAt: 3.2, reach: 0.025, local: [-41, -118] },
    { id: 'fish', label: 'Fish', key: '4', full: 0.7, lift: 74, selfAt: 3, reach: 0.06, local: [-2, -158] },
    { id: 'banana', label: 'Banana', key: '5', full: 0.6, lift: 62, selfAt: 3, reach: 0.04, local: [-38, -152] },
    { id: 'bomb', label: 'Bomb', key: '6', full: 0.55, lift: 40, fuse: 2.4, reach: 0.22, local: [0, -78], special: true },
    { id: 'lightning', label: 'Lightning', key: '7', full: 0.9, lift: 36, selfAt: 3, reach: 0.03, local: [-7, -176], special: true }
  ];
  var BY_ID = {};
  WEAPONS.forEach(function (w) {
    // The drawings sit in the box turned 30 degrees back from upright.
    w.face = [110 + 0.866 * w.local[0] + 0.5 * w.local[1], 140 - 0.5 * w.local[0] + 0.866 * w.local[1]];
    w.pivot = [110, 140];
    BY_ID[w.id] = w;
  });

  var S = 'fill="' + SKIN + '" stroke="' + LINE + '" stroke-width="2" stroke-linejoin="round"';
  var CREASE = 'stroke="' + SHADE + '" stroke-width="1.6" fill="none" stroke-linecap="round"';

  // The sleeve fades out along the arm, so it never hides much of the screen.
  var ARM = '<defs><linearGradient id="arm-fade" gradientUnits="userSpaceOnUse" x1="4" y1="40" x2="62" y2="330">' +
            '<stop offset="0" stop-color="' + SLEEVE + '"/><stop offset="0.4" stop-color="' + SLEEVE + '"/>' +
            '<stop offset="1" stop-color="' + SLEEVE + '" stop-opacity="0"/></linearGradient>' +
            '<linearGradient id="arm-line" gradientUnits="userSpaceOnUse" x1="4" y1="40" x2="62" y2="330">' +
            '<stop offset="0" stop-color="' + SLEEVE_LINE + '"/><stop offset="0.4" stop-color="' + SLEEVE_LINE + '"/>' +
            '<stop offset="1" stop-color="' + SLEEVE_LINE + '" stop-opacity="0"/></linearGradient></defs>' +
            '<path d="M-10 28 L24 19 L86 330 L36 342 Z" fill="url(#arm-fade)" stroke="url(#arm-line)" stroke-width="2"/>' +
            '<path d="M-13 24 L25 14 L30 32 L-8 42 Z" fill="' + CUFF + '" stroke="' + SLEEVE_LINE + '" stroke-width="2"/>' +
            '<path d="M-13 -6 L17 -6 L25 18 L-11 27 Z" ' + S + '/>';

  // A fist closed round a handle that runs up through it.
  var GRIP = '<g ' + S + '>' +
    '<rect x="-17" y="-46" width="35" height="52" rx="14"/>' +
    '<rect x="-25" y="-46" width="21" height="12.5" rx="6.2"/>' +
    '<rect x="-26.5" y="-34" width="22" height="12.5" rx="6.2"/>' +
    '<rect x="-25.5" y="-22" width="21" height="12.5" rx="6.2"/>' +
    '<rect x="-23" y="-10.5" width="18" height="11.5" rx="5.7"/>' +
    '<path d="M10 -40 C4 -52 -14 -53 -22 -46 C-12 -43 -2 -41 6 -34 Z"/></g>' +
    '<path d="M9 -30 Q15 -18 10 -4" ' + CREASE + '/>';

  var BONES = '<g class="bones" stroke="#f4f7ff" stroke-width="3" stroke-linecap="round" fill="none">' +
    '<path d="M-21 -40h12M-22 -28h13M-21 -16h12M-19 -5h10M-3 -40 L1 0M5 -40 L9 0M0 4 L3 24M9 4 L15 22"/></g>';
  var SWEAT = '<g class="sweat" fill="#a6dcff" stroke="#3a7cb0" stroke-width="1.2">' +
    '<path d="M26 -60 q5 8 0 11 q-5 -3 0 -11z"/><path d="M36 -42 q4 7 0 10 q-4 -3 0 -10z"/><path d="M-32 -64 q4 7 0 10 q-4 -3 0 -10z"/></g>';

  var HAMMER = '<defs>' +
    '<linearGradient id="h-wood" x1="0" x2="1"><stop offset="0" stop-color="#8d5524"/><stop offset="0.45" stop-color="#c68642"/><stop offset="1" stop-color="#7a4a1f"/></linearGradient>' +
    '<linearGradient id="h-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3f6"/><stop offset="0.45" stop-color="#aab1bb"/><stop offset="1" stop-color="#5d646e"/></linearGradient>' +
    '<linearGradient id="h-face" x1="0" x2="1"><stop offset="0" stop-color="#6b727c"/><stop offset="1" stop-color="#d9dde3"/></linearGradient></defs>' +
    '<rect x="-6" y="-112" width="12" height="112" rx="5" fill="url(#h-wood)"/>' +
    '<rect x="-7.5" y="-40" width="15" height="42" rx="6" fill="#23252b"/>' +
    '<path d="M24 -130C40 -128 50 -118 54 -100C47 -110 38 -116 28 -118Z" fill="url(#h-steel)"/>' +
    '<path d="M24 -112C36 -110 44 -104 47 -92C41 -99 34 -104 26 -106Z" fill="#8e959f"/>' +
    '<path d="M-30 -131H22Q27 -131 29 -127L31 -110Q31 -106 26 -106H-30Z" fill="url(#h-steel)"/>' +
    '<rect x="-41" y="-134" width="12" height="32" rx="3" fill="url(#h-face)"/>' +
    '<rect x="-26" y="-128" width="46" height="4" rx="2" fill="#ffffff" opacity="0.55"/>';

  var ART = {
    hammer: HAMMER + GRIP,
    fist: '<g ' + S + '>' +
      '<rect x="-24" y="-66" width="46" height="66" rx="17"/>' +
      '<circle cx="-15" cy="-62" r="8.5"/><circle cx="-4.5" cy="-64.5" r="8.5"/><circle cx="6" cy="-63.5" r="8.5"/><circle cx="15.5" cy="-60" r="8"/>' +
      '<path d="M-25 -30 C-18 -41 4 -45 15 -38 C19 -34 15 -27 8 -27 C-2 -27 -14 -23 -23 -18 Z"/></g>' +
      '<path d="M-17 -52v6M-6 -54v6M5 -54v6M15 -50v6" ' + CREASE + '/>',
    finger: '<g ' + S + '>' +
      '<rect x="-10" y="-112" width="15" height="72" rx="7.5"/>' +
      '<rect x="-18" y="-52" width="38" height="56" rx="15"/>' +
      '<rect x="-24.5" y="-44" width="20" height="11.5" rx="5.7"/>' +
      '<rect x="-25" y="-33" width="20" height="11.5" rx="5.7"/>' +
      '<rect x="-23" y="-22" width="18" height="11" rx="5.5"/>' +
      '<path d="M12 -38 C4 -49 -12 -49 -21 -42 C-12 -38 0 -36 8 -29 Z"/></g>' +
      '<rect x="-7.5" y="-110" width="10" height="11" rx="4" fill="' + NAIL + '"/>' +
      '<path d="M-9 -74h6M-9 -90h5" ' + CREASE + '/>',
    fish: '<path d="M-6 -2 L-36 16 L-31 -10 Z" fill="#5b86b3" stroke="#2c4a6b" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M0 -44 C20 -62 26 -118 8 -152 C2 -160 -6 -160 -12 -152 C-28 -118 -20 -62 0 -44 Z" fill="#6d97c4" stroke="#2c4a6b" stroke-width="2"/>' +
      '<path d="M-3 -52 C-16 -72 -20 -118 -8 -146 C-12 -118 -10 -72 -3 -52 Z" fill="#d6e6f2"/>' +
      '<path d="M14 -80 C27 -92 29 -108 18 -120 C21 -104 19 -92 14 -80 Z" fill="#4d77a3" stroke="#2c4a6b" stroke-width="1.5"/>' +
      '<path d="M-6 -100q5 4 10 0M-4 -86q5 4 10 0M-6 -114q5 4 10 0M-10 -128q8 6 16 0" stroke="#9fc0de" stroke-width="1.6" fill="none"/>' +
      '<circle cx="-1" cy="-140" r="5" fill="#fff" stroke="#2c4a6b" stroke-width="1.2"/><circle cx="-2" cy="-140" r="2.4" fill="#111"/>' +
      '<path d="M-8 -154q4 3 8 0" stroke="#2c4a6b" stroke-width="1.6" fill="none"/>' + GRIP,
    banana: '<path d="M-6 -44 C-34 -76 -50 -118 -40 -150 L-35 -152 C-30 -122 -14 -84 8 -46 Z" fill="#f2cd3c" stroke="#8c6a17" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M-8 -60 C-28 -86 -38 -116 -36 -140" stroke="#d8ab1f" stroke-width="3" fill="none"/>' +
      '<path d="M-40 -150 L-35 -152 L-36 -158 L-41 -156 Z" fill="#5b3b1a"/>' + GRIP,
    bomb: '<g ' + S + '><rect x="-18" y="-52" width="40" height="56" rx="15"/></g>' +
      '<circle cx="0" cy="-78" r="30" fill="#26272c" stroke="#0e0e10" stroke-width="2"/>' +
      '<ellipse cx="-10" cy="-90" rx="9" ry="6" fill="#fff" opacity="0.25" transform="rotate(-30 -10 -90)"/>' +
      '<rect x="-7" y="-114" width="14" height="10" rx="2" fill="#4a4c55" stroke="#0e0e10" stroke-width="2"/>' +
      '<path d="M0 -114 C2 -124 12 -126 16 -134" stroke="#b58a52" stroke-width="3" fill="none"/>' +
      '<g class="spark"><path d="M16 -134 l3 -9 l2 8 l8 -3 l-6 6 l7 5 l-9 -1 l-2 8 l-3 -8 l-8 2 l6 -6 l-6 -6 z" fill="#ffd23f" stroke="#ff7a00" stroke-width="1.2"/></g>' +
      '<g ' + S + '><rect x="-33" y="-78" width="16" height="11" rx="5.5"/><rect x="-34" y="-66" width="17" height="11" rx="5.5"/>' +
      '<rect x="-31" y="-54" width="15" height="11" rx="5.5"/><rect x="-26" y="-43" width="13" height="10" rx="5"/>' +
      '<rect x="18" y="-68" width="12" height="24" rx="6"/></g>',
    lightning: '<g class="bolt"><path d="M-4 -40 L8 -40 L3 -80 L15 -80 L-2 -128 L8 -128 L-7 -176 L-15 -124 L-5 -124 L-15 -86 L-4 -86 Z" ' +
      'fill="none" stroke="#fff3a0" stroke-opacity="0.45" stroke-width="10" stroke-linejoin="round"/>' +
      '<path d="M-4 -40 L8 -40 L3 -80 L15 -80 L-2 -128 L8 -128 L-7 -176 L-15 -124 L-5 -124 L-15 -86 L-4 -86 Z" ' +
      'fill="#ffe14d" stroke="#e08a00" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M1 -48 L-2 -84 L8 -84 L-4 -122" stroke="#fff8c4" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>' + GRIP
  };

  // The right hand's drawing for one weapon, as the inside of an <svg>.
  function svg(id) {
    return '<g transform="translate(110 140) rotate(-30)">' + ARM + ART[id] + BONES + SWEAT + '</g>';
  }

  // Small pictures for the weapon buttons, 32 units square.
  var ICONS = {
    finger: '<path d="M13 29v-9l-3-3a2.3 2.3 0 0 1 3.3-3.3L13 14V5.5a2.5 2.5 0 0 1 5 0V14h4.5a4 4 0 0 1 4 4v6a5 5 0 0 1-5 5z" fill="' + SKIN + '" stroke="' + LINE + '" stroke-width="1.6" stroke-linejoin="round"/>',
    fist: '<rect x="6" y="9" width="20" height="18" rx="6" fill="' + SKIN + '" stroke="' + LINE + '" stroke-width="1.6"/>' +
      '<path d="M8 12a3 3 0 0 1 5-2a3 3 0 0 1 5 0a3 3 0 0 1 5 0a3 3 0 0 1 3 3M7 19c4-3 9-3 13-1" stroke="' + LINE + '" stroke-width="1.5" fill="none"/>',
    hammer: '<rect x="14" y="10" width="4.5" height="20" rx="2" fill="#b0763a" stroke="#5a3a18" stroke-width="1.2"/>' +
      '<path d="M5 5h20q3 0 3 3v4q0 3-3 3H5z" fill="#b8bec7" stroke="#4d535b" stroke-width="1.4"/>',
    fish: '<path d="M4 16c5-7 14-8 20-3l4-4v14l-4-4c-6 5-15 4-20-3z" fill="#6d97c4" stroke="#2c4a6b" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<circle cx="9.5" cy="14.5" r="1.6" fill="#111"/>',
    banana: '<path d="M6 8c-2 10 5 19 17 19l3-2c-11-1-16-8-15-17z" fill="#f2cd3c" stroke="#8c6a17" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M6 8l4-1" stroke="#5b3b1a" stroke-width="2.4"/>',
    bomb: '<circle cx="14" cy="19" r="10" fill="#26272c"/><path d="M19 10c2-4 6-4 8-6" stroke="#b58a52" stroke-width="2" fill="none"/>' +
      '<circle cx="27.5" cy="4.5" r="2.8" fill="#ffd23f"/><circle cx="10.5" cy="15.5" r="2.4" fill="#fff" opacity="0.3"/>',
    lightning: '<path d="M18 2L6 18h8l-4 12 14-17h-8l4-11z" fill="#ffe14d" stroke="#e08a00" stroke-width="1.5" stroke-linejoin="round"/>'
  };
  function icon(id) { return '<svg viewBox="0 0 32 32" aria-hidden="true">' + ICONS[id] + '</svg>'; }

  /* ------------------------------------------------------- left hand */

  // Finger width and the width of the bezel the fingers reach over, in
  // screen units, for each device.
  var GRIP_SIZE = { phone: [64, 58], tablet: [56, 70], monitor: [40, 26] };

  // The parts of the left hand that a blow can land on: one capsule per
  // finger, from knuckle to tip, and the palm. st: { y, x, reach }.
  function parts(dev, st) {
    var out = [], i;
    if (dev.type === 'laptop') {
      // Lying on the keyboard, fingers towards the screen, seen at a slant.
      var fw = 36, k = 0.42, by = 1172, x0 = st.x;
      for (i = 0; i < 4; i++) {
        var fx = x0 - 54 + i * fw, L = [118, 150, 142, 108][i];
        out.push({ a: [fx, by - 24 * k], b: [fx + 4, by - (24 + L) * k], r: fw * 0.46, i: i });
      }
      out.push({ a: [x0 + 50, by + 5 * k], b: [x0 + 92, by - 46 * k], r: fw * 0.5, i: 4 });
      out.push({ a: [x0 - 20, by - 20 * k], b: [x0 + 30, by - 20 * k], r: 60 * k, i: 5, palm: true });
      return out;
    }
    var g = GRIP_SIZE[dev.type] || GRIP_SIZE.monitor, w = g[0], b = g[1], base = -b - w * 0.9;
    for (i = 0; i < 4; i++) {
      var y = st.y + (i - 1.5) * w * 1.05;
      out.push({ a: [base, y], b: [Math.max(base + w * 0.5, st.reach * [0.9, 1, 0.95, 0.75][i]), y], r: w * 0.46, i: i });
    }
    return out;
  }

  // Whether any fingertip is on the glass.
  function onGlass(dev, st) {
    if (dev.type === 'laptop') return false;
    return parts(dev, st).some(function (p) { return p.b[0] > 2; });
  }

  function capsule(c, a, b, r) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    c.save();
    c.translate(a[0], a[1]);
    c.rotate(Math.atan2(dy, dx));
    c.beginPath();
    Smash.draw.roundRect(c, -r, -r, L + 2 * r, 2 * r, r);
    c.restore();
  }

  // st: { y, x, reach, hurt: finger index or -1, hurtAt, t }.
  function drawLeft(c, dev, st) {
    var ps = parts(dev, st), t = st.t || 0, i;
    var sore = st.hurt >= 0 && t - st.hurtAt < 1.6 ? 1 - (t - st.hurtAt) / 1.6 : 0;
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (dev.type === 'laptop') {
      var k = 0.42, by = 1172, x0 = st.x;
      c.save();
      c.translate(x0, by);
      c.scale(1, k);
      // Sleeve and wrist run off the front of the laptop.
      c.beginPath();
      Smash.draw.roundRect(c, -64, 40, 128, 3000, 10);
      c.fillStyle = SLEEVE;
      c.fill();
      c.strokeStyle = SLEEVE_LINE;
      c.lineWidth = 3;
      c.stroke();
      c.beginPath();
      Smash.draw.roundRect(c, -66, 40, 132, 30, 8);
      c.fillStyle = CUFF;
      c.fill();
      c.stroke();
      c.beginPath();
      Smash.draw.roundRect(c, -56, -30, 112, 76, 30);
      c.fillStyle = SKIN;
      c.fill();
      c.strokeStyle = LINE;
      c.lineWidth = 4;
      c.stroke();
      c.restore();
    } else {
      var g = GRIP_SIZE[dev.type] || GRIP_SIZE.monitor, w = g[0], b = g[1], base = -b - w * 0.9;
      var top = st.y - 1.5 * w * 1.05 - w * 0.62, bot = st.y + 1.5 * w * 1.05 + w * 0.62;
      // Sleeve, cuff and wrist come in from the left.
      c.beginPath();
      Smash.draw.roundRect(c, base - w * 3.3 - 3000, st.y - w * 1.55, 3000 + w * 0.2, w * 3.1, 8);
      c.fillStyle = SLEEVE;
      c.fill();
      c.strokeStyle = SLEEVE_LINE;
      c.lineWidth = w * 0.05;
      c.stroke();
      c.beginPath();
      Smash.draw.roundRect(c, base - w * 3.35, st.y - w * 1.62, w * 0.5, w * 3.24, 6);
      c.fillStyle = CUFF;
      c.fill();
      c.stroke();
      // The thumb wraps round behind the device, above the fingers.
      capsule(c, [base - w * 1.4, top + w * 0.4], [base - w * 0.2, top - w * 0.55], w * 0.44);
      c.fillStyle = SKIN;
      c.fill();
      c.strokeStyle = LINE;
      c.lineWidth = w * 0.06;
      c.stroke();
      c.beginPath();
      Smash.draw.roundRect(c, base - w * 2.9, top, w * 3.2, bot - top, w * 0.8);
      c.fillStyle = SKIN;
      c.fill();
      c.stroke();
    }
    ps.forEach(function (p) {
      if (p.palm) return;
      var hurt = sore && p.i === st.hurt, r = p.r * (hurt ? 1 + 0.25 * sore : 1);
      capsule(c, p.a, p.b, r);
      c.fillStyle = hurt ? HURT : SKIN;
      c.fill();
      c.strokeStyle = LINE;
      c.lineWidth = p.r * 0.13;
      c.stroke();
      if (p.i < 4) {
        // A nail at the tip and a crease at each knuckle.
        var dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        capsule(c, [p.b[0] - ux * r * 0.55, p.b[1] - uy * r * 0.55], [p.b[0] - ux * r * 0.15, p.b[1] - uy * r * 0.15], r * 0.42);
        c.fillStyle = NAIL;
        c.fill();
        c.strokeStyle = SHADE;
        c.lineWidth = p.r * 0.1;
        [0.45, 0.72].forEach(function (f) {
          var x = p.a[0] + dx * f, y = p.a[1] + dy * f;
          c.beginPath();
          c.moveTo(x - uy * r * 0.5, y + ux * r * 0.5);
          c.lineTo(x - uy * r * 0.1, y + ux * r * 0.1);
          c.stroke();
        });
      }
      if (hurt) {
        // Cartoon throb lines round a sore fingertip.
        c.strokeStyle = 'rgba(210,40,30,' + sore.toFixed(2) + ')';
        c.lineWidth = p.r * 0.14;
        for (i = 0; i < 3; i++) {
          var a = -1 + i, px = p.b[0] + Math.cos(a) * r * 1.6, py = p.b[1] + Math.sin(a) * r * 1.6;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px + Math.cos(a) * r * 0.8, py + Math.sin(a) * r * 0.8);
          c.stroke();
        }
      }
    });
    c.restore();
  }

  // The hammer on its own, as the page drew it before it had a hand. The
  // builder page's picture uses it.
  var BARE_HAMMER = '<g transform="translate(110 140) rotate(-30)">' + HAMMER + '</g>';

  Smash.Hands = { WEAPONS: WEAPONS, weapon: function (id) { return BY_ID[id]; }, svg: svg, icon: icon,
                  parts: parts, onGlass: onGlass, drawLeft: drawLeft, BARE_HAMMER: BARE_HAMMER };
})(this);
