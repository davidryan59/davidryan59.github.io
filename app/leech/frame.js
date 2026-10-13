/* Orthonormal frame helpers for the 24-dimensional Leech explorer. */
(function (global) {
  'use strict';

  var N = 24;
  var EPSILON = 1e-9;

  function dot(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i++) total += a[i] * b[i];
    return total;
  }

  function cloneRow(row) { return new Float64Array(row); }

  function orthonormalise(rows) {
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var vector = cloneRow(rows[i]);
      if (vector.length !== N) throw new Error('A frame row must have 24 values');
      for (var pass = 0; pass < 2; pass++) {
        for (var j = 0; j < result.length; j++) {
          var amount = dot(vector, result[j]);
          for (var k = 0; k < N; k++) vector[k] -= amount * result[j][k];
        }
      }
      var length = Math.sqrt(dot(vector, vector));
      if (length > EPSILON) {
        for (var q = 0; q < N; q++) vector[q] /= length;
        result.push(vector);
      }
    }
    return result;
  }

  function complete(firstRows, candidates) {
    var rows = [], i;
    (firstRows || []).forEach(function (row) { rows.push(cloneRow(row)); });
    (candidates || []).forEach(function (row) { rows.push(cloneRow(row)); });
    for (i = 0; i < N; i++) {
      var basis = new Float64Array(N);
      basis[i] = 1;
      rows.push(basis);
    }
    var frame = orthonormalise(rows);
    if (frame.length < N) throw new Error('Could not complete the 24D frame');
    return frame.slice(0, N);
  }

  function copy(frame) { return frame.map(cloneRow); }

  function rotateRows(frame, a, b, angle) {
    var cosine = Math.cos(angle), sine = Math.sin(angle);
    var rowA = cloneRow(frame[a]), rowB = cloneRow(frame[b]);
    for (var i = 0; i < N; i++) {
      frame[a][i] = cosine * rowA[i] + sine * rowB[i];
      frame[b][i] = -sine * rowA[i] + cosine * rowB[i];
    }
    return frame;
  }

  function place(rows8, positions) {
    return rows8.slice(0, 2).map(function (row) {
      var placed = new Float64Array(N);
      for (var k = 0; k < 8; k++) placed[positions[k]] = row[k];
      return placed;
    });
  }

  function octadFrame(row0, row1, positions) {
    var candidates = [], used = new Set(positions);
    positions.forEach(function (position) {
      var basis = new Float64Array(N);
      basis[position] = 1;
      candidates.push(basis);
    });
    for (var i = 0; i < N; i++) {
      if (used.has(i)) continue;
      var basis = new Float64Array(N);
      basis[i] = 1;
      candidates.push(basis);
    }
    return complete([row0, row1], candidates);
  }

  function tiltTarget(row0, row1, from, to) {
    return [row0, row1].map(function (row) {
      var target = new Float64Array(N);
      for (var k = 0; k < 8; k++) target[to[k]] = row[from[k]];
      return target;
    });
  }

  function tilted(frame, amount, from, to) {
    var target = tiltTarget(frame[0], frame[1], from, to);
    var cosine = Math.cos(amount), sine = Math.sin(amount), rows = [];
    for (var r = 0; r < 2; r++) {
      var row = new Float64Array(N);
      for (var i = 0; i < N; i++) row[i] = cosine * frame[r][i] + sine * target[r][i];
      rows.push(row);
    }
    return rows;
  }

  function alignPlane(fromRows, toRows) {
    var a00 = dot(fromRows[0], toRows[0]), a01 = dot(fromRows[0], toRows[1]);
    var a10 = dot(fromRows[1], toRows[0]), a11 = dot(fromRows[1], toRows[1]);
    var rotationScore = Math.hypot(a00 + a11, a01 - a10);
    var reflectionScore = Math.hypot(a00 - a11, a01 + a10);
    var theta, cosine, sine, first = new Float64Array(N), second = new Float64Array(N);
    if (rotationScore >= reflectionScore) {
      theta = Math.atan2(a01 - a10, a00 + a11);
      cosine = Math.cos(theta); sine = Math.sin(theta);
      for (var i = 0; i < N; i++) {
        first[i] = cosine * toRows[0][i] + sine * toRows[1][i];
        second[i] = -sine * toRows[0][i] + cosine * toRows[1][i];
      }
    } else {
      theta = Math.atan2(a01 + a10, a00 - a11);
      cosine = Math.cos(theta); sine = Math.sin(theta);
      for (var j = 0; j < N; j++) {
        first[j] = cosine * toRows[0][j] + sine * toRows[1][j];
        second[j] = sine * toRows[0][j] - cosine * toRows[1][j];
      }
    }
    return [first, second];
  }

  function interpolate(from, to, amount) {
    if (amount <= 0) return copy(from);
    if (amount >= 1) return copy(to);
    var rows = [];
    for (var i = 0; i < N; i++) {
      var row = new Float64Array(N);
      for (var j = 0; j < N; j++) row[j] = from[i][j] * (1 - amount) + to[i][j] * amount;
      rows.push(row);
    }
    return complete(rows);
  }

  function planeAngle(rowsA, rowsB) {
    var m00 = dot(rowsA[0], rowsB[0]), m01 = dot(rowsA[0], rowsB[1]);
    var m10 = dot(rowsA[1], rowsB[0]), m11 = dot(rowsA[1], rowsB[1]);
    var trace = m00 * m00 + m01 * m01 + m10 * m10 + m11 * m11;
    var determinant = (m00 * m11 - m01 * m10) ** 2;
    var smaller = Math.max(0, (trace - Math.sqrt(Math.max(0, trace * trace - 4 * determinant))) / 2);
    var singular = Math.min(1, Math.max(0, Math.sqrt(smaller)));
    return Math.acos(singular);
  }

  function orbit(frame, depth, dx, dy) {
    rotateRows(frame, 0, depth, dx * 0.006);
    rotateRows(frame, 1, depth, -dy * 0.006);
    return frame;
  }

  function roll(frame, dx) {
    rotateRows(frame, 0, 1, dx * 0.007);
    return frame;
  }

  function pull(frame, vector, dx, dy, scale, last) {
    var coordinates = new Float64Array(last + 1), vectorLength = Math.sqrt(dot(vector, vector));
    if (vectorLength < 1e-9) return frame;
    for (var row = 0; row <= last; row++) coordinates[row] = dot(frame[row], vector);
    var targetX = dx / Math.max(1, scale), targetY = -dy / Math.max(1, scale);
    var variables = [], m00 = 0, m01 = 0, m11 = 0;
    for (var b = 1; b <= last; b++) {
      var bx = coordinates[b], by = b === 1 ? -coordinates[0] : 0;
      variables.push({ a: 0, b: b, x: bx, y: by, angle: 0 });
      m00 += bx * bx; m01 += bx * by; m11 += by * by;
    }
    for (var c = 2; c <= last; c++) {
      var x = 0, y = coordinates[c];
      variables.push({ a: 1, b: c, x: x, y: y, angle: 0 });
      m00 += x * x; m01 += x * y; m11 += y * y;
    }
    m00 += 0.0005; m11 += 0.0005;
    var determinant = m00 * m11 - m01 * m01;
    if (Math.abs(determinant) < 1e-10) return frame;
    var c0 = (m11 * targetX - m01 * targetY) / determinant;
    var c1 = (-m01 * targetX + m00 * targetY) / determinant;
    var norm = 0;
    variables.forEach(function (variable) {
      variable.angle = variable.x * c0 + variable.y * c1;
      norm += variable.angle * variable.angle;
    });
    norm = Math.sqrt(norm);
    var cap = norm > 0.16 ? 0.16 / norm : 1;
    variables.forEach(function (variable) {
      if (Math.abs(variable.angle) > 1e-12) rotateRows(frame, variable.a, variable.b, variable.angle * cap);
    });
    return frame;
  }

  function drift(frame, dt, speed, last) {
    var pairs = [[0, 2, 0.19], [1, 3, 0.153], [2, 4, 0.083], [3, 5, 0.067],
      [4, 6, 0.047], [5, 7, 0.037]];
    if (last > 7) {
      for (var k = 6; k <= 21 && k + 2 <= last; k++) pairs.push([k, k + 2, 0.037 * Math.pow(0.93, k - 5)]);
    }
    pairs.forEach(function (pair) {
      if (pair[1] <= last) rotateRows(frame, pair[0], pair[1], pair[2] * dt * speed);
    });
    return frame;
  }

  function bytesToBase64(bytes) {
    if (typeof btoa === 'function') {
      var binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    return Buffer.from(bytes).toString('base64');
  }

  function base64ToBytes(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
    var standard = text.replace(/-/g, '+').replace(/_/g, '/');
    while (standard.length % 4) standard += '=';
    try {
      if (typeof atob === 'function') {
        var binary = atob(standard), bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
      return new Uint8Array(Buffer.from(standard, 'base64'));
    } catch (error) { return null; }
  }

  function encode(rows, positions) {
    var bytes = new Uint8Array(positions.length * 4), view = new DataView(bytes.buffer);
    for (var row = 0; row < 2; row++) {
      for (var k = 0; k < positions.length; k++) {
        var value = Math.max(-1, Math.min(1, rows[row][positions[k]]));
        view.setInt16((row * positions.length + k) * 2, Math.round(value * 32767));
      }
    }
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(text, positions) {
    var bytes = base64ToBytes(text);
    if (!bytes || bytes.length !== positions.length * 4) return null;
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), rows = [];
    for (var row = 0; row < 2; row++) {
      var values = new Float64Array(N);
      for (var k = 0; k < positions.length; k++) values[positions[k]] = view.getInt16((row * positions.length + k) * 2) / 32767;
      rows.push(values);
    }
    var result;
    try { result = orthonormalise(rows); } catch (error) { return null; }
    return result.length === 2 ? result : null;
  }

  var Frame = {
    N: N, dot: dot, orthonormalise: orthonormalise, complete: complete,
    copy: copy, rotateRows: rotateRows, place: place, octadFrame: octadFrame,
    tiltTarget: tiltTarget, tilted: tilted, alignPlane: alignPlane,
    interpolate: interpolate, planeAngle: planeAngle, orbit: orbit, roll: roll,
    pull: pull, drift: drift, encode: encode, decode: decode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Frame;
  global.Frame = Frame;
})(typeof window === 'undefined' ? globalThis : window);
