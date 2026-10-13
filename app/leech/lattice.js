/* Pure Leech lattice data, shared by the browser viewer and Node checks. */
(function (global) {
  'use strict';

  var COUNT = 196560;
  var FIXED = 98279;
  var FIXED_NEG = 165167;
  var TRIO = [
    [0, 2, 4, 5, 6, 10, 11, 23],
    [1, 3, 7, 8, 12, 13, 15, 18],
    [9, 14, 16, 17, 19, 20, 21, 22]
  ];
  var POW9_8 = 43046721;
  var caches = null;

  function popcount(value) {
    value >>>= 0;
    value -= (value >>> 1) & 0x55555555;
    value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
    return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }

  function golay() {
    var code = new Uint32Array(4096);
    for (var message = 0; message < 4096; message++) {
      var word = 0;
      for (var bit = 0; bit < 12; bit++) {
        if (message & (1 << bit)) word ^= 0xC75 << bit;
      }
      word >>>= 0;
      if (popcount(word & 0x7fffff) & 1) word |= 0x800000;
      code[message] = word >>> 0;
    }
    return code;
  }

  function octads(code) {
    var result = new Uint32Array(759), at = 0;
    for (var message = 0; message < code.length; message++) {
      if (popcount(code[message]) === 8) result[at++] = code[message];
    }
    if (at !== 759) throw new Error('Expected 759 octads');
    return result;
  }

  function positionsOf(mask) {
    var positions = [];
    for (var i = 0; i < 24; i++) if (mask & (1 << i)) positions.push(i);
    return positions;
  }

  function build() {
    var code = golay(), octadMasks = octads(code);
    var coords = new Int8Array(COUNT * 24);
    var shape = new Uint8Array(COUNT);
    var index = 0;

    for (var i = 0; i < 24; i++) {
      for (var j = i + 1; j < 24; j++) {
        for (var si = 4; si >= -4; si -= 8) {
          for (var sj = 4; sj >= -4; sj -= 8) {
            var offsetA = index * 24;
            coords[offsetA + i] = si;
            coords[offsetA + j] = sj;
            shape[index++] = 0;
          }
        }
      }
    }

    for (var octad = 0; octad < octadMasks.length; octad++) {
      var positions = positionsOf(octadMasks[octad]);
      for (var signs = 0; signs < 256; signs++) {
        if (popcount(signs) & 1) continue;
        var offsetB = index * 24;
        for (var k = 0; k < 8; k++) coords[offsetB + positions[k]] = signs & (1 << k) ? -2 : 2;
        shape[index++] = 1;
      }
    }

    for (var message = 0; message < code.length; message++) {
      var word = code[message];
      for (var special = 0; special < 24; special++) {
        var offsetC = index * 24;
        for (var p = 0; p < 24; p++) {
          var value = p === special ? -3 : 1;
          coords[offsetC + p] = word & (1 << p) ? -value : value;
        }
        shape[index++] = 2;
      }
    }
    if (index !== COUNT) throw new Error('Expected 196,560 vectors');
    return { code: code, octads: octadMasks, coords: coords, shape: shape };
  }

  function dot(coords, i, j) {
    var total = 0, a = i * 24, b = j * 24;
    for (var k = 0; k < 24; k++) total += coords[a + k] * coords[b + k];
    return total;
  }

  function layer(product) {
    if (product === 32) return 0;
    if (product === 16) return 1;
    if (product === 8) return 2;
    if (product === 0) return 3;
    if (product === -8) return 4;
    if (product === -16) return 5;
    if (product === -32) return 6;
    return -1;
  }

  function layers(coords, selected) {
    var result = new Uint8Array(COUNT), selectedOffset = selected * 24;
    for (var i = 0; i < COUNT; i++) {
      var total = 0, offset = i * 24;
      for (var k = 0; k < 24; k++) total += coords[selectedOffset + k] * coords[offset + k];
      var value = layer(total);
      if (value < 0) throw new Error('Unexpected Leech inner product: ' + total);
      result[i] = value;
    }
    return result;
  }

  function neighbours(coords, selected) {
    var found = new Int32Array(4600), at = 0, selectedOffset = selected * 24;
    for (var i = 0; i < COUNT; i++) {
      var total = 0, offset = i * 24;
      for (var k = 0; k < 24; k++) total += coords[selectedOffset + k] * coords[offset + k];
      if (total === 16) found[at++] = i;
    }
    if (at !== 4600) throw new Error('Expected 4,600 neighbours, found ' + at);
    return found;
  }

  function makeCaches() {
    if (caches) return caches;
    var code = golay(), octadMasks = octads(code);
    var octadRank = new Map(), messageForWord = new Map();
    for (var i = 0; i < octadMasks.length; i++) octadRank.set(octadMasks[i], i);
    for (var m = 0; m < code.length; m++) messageForWord.set(code[m], m);
    var evenRank = new Int16Array(256), rank = 0;
    evenRank.fill(-1);
    for (var s = 0; s < 256; s++) if (!(popcount(s) & 1)) evenRank[s] = rank++;
    caches = { code: code, octads: octadMasks, octadRank: octadRank,
      messageForWord: messageForWord, evenRank: evenRank };
    return caches;
  }

  function indexOf(vector) {
    if (!vector || vector.length !== 24) return -1;
    var nonzero = [], allOdd = true, allEven = true;
    for (var i = 0; i < 24; i++) {
      var value = vector[i];
      if (!Number.isInteger(value)) return -1;
      if (value) nonzero.push(i);
      if (Math.abs(value % 2) === 1) allEven = false;
      else allOdd = false;
    }
    var found = -1;
    if (nonzero.length === 2 && Math.abs(vector[nonzero[0]]) === 4 && Math.abs(vector[nonzero[1]]) === 4) {
      var a = nonzero[0], b = nonzero[1];
      var pairRank = a * (47 - a) / 2 + (b - a - 1);
      found = 4 * pairRank + 2 * (vector[a] < 0 ? 1 : 0) + (vector[b] < 0 ? 1 : 0);
    } else if (allEven && nonzero.length === 8) {
      var mask = 0, signs = 0, position = 0, validB = true;
      for (var p = 0; p < 24; p++) {
        if (!vector[p]) continue;
        if (Math.abs(vector[p]) !== 2) { validB = false; break; }
        mask |= 1 << p;
        if (vector[p] < 0) signs |= 1 << position;
        position++;
      }
      var cacheB = makeCaches(), octadRank = cacheB.octadRank.get(mask >>> 0);
      var signRank = cacheB.evenRank[signs];
      if (validB && octadRank !== undefined && signRank >= 0) found = 1104 + 128 * octadRank + signRank;
    } else if (allOdd) {
      var special = -1, signWord = 0, validC = true;
      for (var q = 0; q < 24; q++) {
        if (Math.abs(vector[q]) === 3) {
          if (special >= 0) { validC = false; break; }
          special = q;
          if (vector[q] > 0) signWord |= 1 << q;
        } else if (Math.abs(vector[q]) === 1) {
          if (vector[q] < 0) signWord |= 1 << q;
        } else { validC = false; break; }
      }
      var message = makeCaches().messageForWord.get(signWord >>> 0);
      if (validC && special >= 0 && message !== undefined) found = 98256 + 24 * message + special;
    }
    if (found < 0 || found >= COUNT) return -1;
    return vectorAt(found).every(function (value, k) { return value === vector[k]; }) ? found : -1;
  }

  function vectorAt(index) {
    var vector = new Int8Array(24);
    if (index < 1104) {
      var rank = Math.floor(index / 4), signs = index & 3, a = 0;
      while (rank >= 23 - a) rank -= 23 - a++;
      var b = a + 1 + rank;
      vector[a] = signs & 2 ? -4 : 4;
      vector[b] = signs & 1 ? -4 : 4;
      return vector;
    }
    var cache = makeCaches();
    if (index < 98256) {
      var relative = index - 1104, octadRank = Math.floor(relative / 128), wantedRank = relative % 128;
      var byte = 0;
      while (cache.evenRank[byte] !== wantedRank) byte++;
      var positions = positionsOf(cache.octads[octadRank]);
      for (var k = 0; k < 8; k++) vector[positions[k]] = byte & (1 << k) ? -2 : 2;
      return vector;
    }
    var cRelative = index - 98256, message = Math.floor(cRelative / 24), special = cRelative % 24;
    var word = cache.code[message];
    for (var p = 0; p < 24; p++) {
      var value = p === special ? -3 : 1;
      vector[p] = word & (1 << p) ? -value : value;
    }
    return vector;
  }

  function mod(value, divisor) { return ((value % divisor) + divisor) % divisor; }

  function inLattice(vector) {
    if (!vector || vector.length !== 24) return false;
    var parity = mod(vector[0], 2), mask = 0, sum = 0;
    for (var i = 0; i < 24; i++) {
      if (!Number.isInteger(vector[i]) || mod(vector[i], 2) !== parity) return false;
      sum += vector[i];
      if (mod(vector[i], 4) === (parity ? 3 : 2)) mask |= 1 << i;
    }
    if (!makeCaches().messageForWord.has(mask >>> 0)) return false;
    return mod(sum, 8) === (parity ? 4 : 0);
  }

  function shells(coords, positions) {
    var result = new Uint8Array(COUNT);
    for (var i = 0; i < COUNT; i++) {
      var norm = 0, offset = i * 24;
      for (var k = 0; k < 8; k++) {
        var value = coords[offset + positions[k]];
        norm += value * value;
      }
      result[i] = norm === 0 ? 0 : norm === 8 ? 1 : norm === 16 ? 2 : norm === 32 ? 3 : 255;
      if (result[i] === 255) throw new Error('Unexpected octad restriction norm: ' + norm);
    }
    return result;
  }

  function octadSpots(coords, shape, positions) {
    var keys = new Int32Array(COUNT);
    var groups = new Map();
    for (var i = 0; i < COUNT; i++) {
      var offset = i * 24, key = 0, norm = 0;
      for (var k = 0; k < 8; k++) {
        var value = coords[offset + positions[k]];
        key = key * 9 + value + 4;
        norm += value * value;
      }
      var shell = norm === 0 ? 0 : norm === 8 ? 1 : norm === 16 ? 2 : 3;
      var combined = shell * POW9_8 + key;
      keys[i] = combined;
      var group = groups.get(combined);
      if (group) {
        group.pile++;
        if (group.shape !== shape[i]) group.shape = 255;
      } else {
        var restriction = new Int8Array(8);
        for (var q = 0; q < 8; q++) restriction[q] = coords[offset + positions[q]];
        groups.set(combined, { coords: restriction, shell: shell, pile: 1, shape: shape[i] });
      }
    }
    var sortedKeys = Array.from(groups.keys()).sort(function (a, b) { return a - b; });
    var spotForKey = new Map(), spots = new Array(sortedKeys.length), cursor = 0;
    for (var id = 0; id < sortedKeys.length; id++) {
      var item = groups.get(sortedKeys[id]);
      spotForKey.set(sortedKeys[id], id);
      spots[id] = { id: id, coords: item.coords, shell: item.shell, pile: item.pile,
        shape: item.shape, start: cursor, end: cursor + item.pile };
      cursor += item.pile;
    }
    var spot = new Int32Array(COUNT), order = new Int32Array(COUNT), write = new Int32Array(spots.length);
    for (var s = 0; s < spots.length; s++) write[s] = spots[s].start;
    for (var ball = 0; ball < COUNT; ball++) {
      var spotId = spotForKey.get(keys[ball]);
      spot[ball] = spotId;
      order[write[spotId]++] = ball;
    }
    return { positions: positions.slice(), count: spots.length, spot: spot, order: order, spots: spots };
  }

  function checksum(bytes) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) {
      hash ^= bytes[i] & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  var Leech = {
    COUNT: COUNT, FIXED: FIXED, FIXED_NEG: FIXED_NEG, TRIO: TRIO,
    golay: golay, octads: octads, build: build, dot: dot, layer: layer,
    layers: layers, neighbours: neighbours, indexOf: indexOf,
    inLattice: inLattice, shells: shells, octadSpots: octadSpots,
    checksum: checksum
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Leech;
  global.Leech = Leech;
})(typeof window === 'undefined' ? globalThis : window);
