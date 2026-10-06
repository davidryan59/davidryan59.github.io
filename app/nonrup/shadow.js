(function exposeShadow(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NonRupertShadow = api;
}(typeof self !== "undefined" ? self : this, function makeShadow() {
  "use strict";

  // A pass ratio within this margin of 1 counts as a touch. It sits far above
  // rounding error, about 1e-15, and far below the narrowest real passages,
  // which clear 1 by about 5e-5.
  const MARGIN = 1e-8;
  const clock = typeof performance !== "undefined" ? performance : Date;

  // A 3x3 matrix is a flat array of nine numbers in row order.
  function multiply(a, b) {
    const out = new Array(9);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        out[row * 3 + column] =
          a[row * 3] * b[column] +
          a[row * 3 + 1] * b[3 + column] +
          a[row * 3 + 2] * b[6 + column];
      }
    }
    return out;
  }

  function apply(m, p) {
    return [
      m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
      m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
      m[6] * p[0] + m[7] * p[1] + m[8] * p[2]
    ];
  }

  function transpose(m) {
    return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  }

  function axisRotation(axis, angle) {
    const size = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const x = axis[0] / size;
    const y = axis[1] / size;
    const z = axis[2] / size;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    return [
      t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c
    ];
  }

  function twist(angle) {
    return axisRotation([0, 0, 1], angle);
  }

  function quaternionRotation(q) {
    const size = Math.hypot(q[0], q[1], q[2], q[3]);
    const [w, x, y, z] = q.map(value => value / size);
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)
    ];
  }

  // Shoemake's method gives a rotation chosen evenly from all rotations.
  function randomRotation(random = Math.random) {
    const u1 = random();
    const u2 = random() * 2 * Math.PI;
    const u3 = random() * 2 * Math.PI;
    const a = Math.sqrt(1 - u1);
    const b = Math.sqrt(u1);
    return quaternionRotation([b * Math.cos(u3), a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3)]);
  }

  // Drag turns build up rounding error, so they are squared up again.
  function orthonormalise(m) {
    const x = [m[0], m[1], m[2]];
    let size = Math.hypot(...x);
    const r0 = x.map(value => value / size);
    const y = [m[3], m[4], m[5]];
    const along = r0[0] * y[0] + r0[1] * y[1] + r0[2] * y[2];
    const y1 = y.map((value, i) => value - along * r0[i]);
    size = Math.hypot(...y1);
    const r1 = y1.map(value => value / size);
    const r2 = [
      r0[1] * r1[2] - r0[2] * r1[1],
      r0[2] * r1[0] - r0[0] * r1[2],
      r0[0] * r1[1] - r0[1] * r1[0]
    ];
    return [...r0, ...r1, ...r2];
  }

  // Andrew's monotone chain. The hull runs anticlockwise.
  function hull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3) return sorted;
    const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-12) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const point = sorted[i];
      while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-12) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  // The shadow falls along the z axis, so it is the hull of each vertex's x and y.
  function shadow(vertices, rotation, shift = [0, 0]) {
    return hull(vertices.map(point => {
      const turned = apply(rotation, point);
      return [turned[0] + shift[0], turned[1] + shift[1]];
    }));
  }

  // Each edge of an anticlockwise polygon gives a half-plane nx x + ny y <= b.
  function halfPlanes(polygon) {
    return polygon.map((point, i) => {
      const next = polygon[(i + 1) % polygon.length];
      const dx = next[0] - point[0];
      const dy = next[1] - point[1];
      const size = Math.hypot(dx, dy);
      const nx = dy / size;
      const ny = -dx / size;
      return { nx, ny, b: nx * point[0] + ny * point[1] };
    });
  }

  // How far the copy reaches along each hole edge's normal, once it is turned by angle.
  function supports(planes, copy, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const out = new Array(planes.length);
    for (let i = 0; i < planes.length; i += 1) {
      const ux = c * planes[i].nx + s * planes[i].ny;
      const uy = -s * planes[i].nx + c * planes[i].ny;
      let reach = -Infinity;
      for (const point of copy) {
        const value = point[0] * ux + point[1] * uy;
        if (value > reach) reach = value;
      }
      out[i] = reach;
    }
    return out;
  }

  // The largest scale s, and the shift v, with s * copy + v inside the hole:
  // maximise s subject to s * reach_i + n_i . v <= b_i for every hole edge.
  // A centrally symmetric pair of shadows never gains from a shift.
  function fitAtTwist(planes, copy, angle, central) {
    const reach = supports(planes, copy, angle);
    if (central) {
      let scale = Infinity;
      for (let i = 0; i < planes.length; i += 1) scale = Math.min(scale, planes[i].b / reach[i]);
      return { scale, shift: [0, 0] };
    }
    // The optimum of this three-variable programme sits where three constraints meet.
    let best = { scale: -Infinity, shift: [0, 0] };
    const m = planes.length;
    for (let i = 0; i < m - 2; i += 1) {
      for (let j = i + 1; j < m - 1; j += 1) {
        for (let k = j + 1; k < m; k += 1) {
          const rows = [i, j, k].map(index => [reach[index], planes[index].nx, planes[index].ny, planes[index].b]);
          const det = (a, b, c) =>
            a[0] * (b[1] * c[2] - b[2] * c[1]) -
            a[1] * (b[0] * c[2] - b[2] * c[0]) +
            a[2] * (b[0] * c[1] - b[1] * c[0]);
          const columns = rows.map(row => row.slice(0, 3));
          const d = det(...columns);
          if (Math.abs(d) < 1e-14) continue;
          const replace = column => rows.map(row => row.map((value, index) => index === column ? row[3] : value).slice(0, 3));
          const scale = det(...replace(0)) / d;
          const x = det(...replace(1)) / d;
          const y = det(...replace(2)) / d;
          if (scale <= best.scale) continue;
          let feasible = true;
          for (let l = 0; l < m && feasible; l += 1) {
            feasible = reach[l] * scale + planes[l].nx * x + planes[l].ny * y <= planes[l].b + 1e-12;
          }
          if (feasible) best = { scale, shift: [x, y] };
        }
      }
    }
    return best;
  }

  // Golden-section search for the best twist between lo and hi.
  function refine(planes, copy, central, lo, hi) {
    const ratio = (Math.sqrt(5) - 1) / 2;
    let a = hi - ratio * (hi - lo);
    let b = lo + ratio * (hi - lo);
    let fa = fitAtTwist(planes, copy, a, central).scale;
    let fb = fitAtTwist(planes, copy, b, central).scale;
    for (let i = 0; i < 24; i += 1) {
      if (fa < fb) {
        lo = a; a = b; fa = fb;
        b = lo + ratio * (hi - lo);
        fb = fitAtTwist(planes, copy, b, central).scale;
      } else {
        hi = b; b = a; fb = fa;
        a = hi - ratio * (hi - lo);
        fa = fitAtTwist(planes, copy, a, central).scale;
      }
    }
    return (lo + hi) / 2;
  }

  function better(best, planes, copy, central, angle) {
    const fit = fitAtTwist(planes, copy, angle, central);
    return fit.scale > best.scale ? { scale: fit.scale, angle, shift: fit.shift } : best;
  }

  // Sample the twist of the copy, then refine the three best peaks by golden section.
  function bestTwist(planes, copy, central, samples = 120) {
    const period = central ? Math.PI : 2 * Math.PI;
    const step = period / samples;
    const values = [];
    for (let k = 0; k < samples; k += 1) values.push(fitAtTwist(planes, copy, k * step, central).scale);
    const peaks = [];
    for (let k = 0; k < samples; k += 1) {
      const before = values[(k + samples - 1) % samples];
      const after = values[(k + 1) % samples];
      if (values[k] >= before && values[k] >= after) peaks.push(k);
    }
    peaks.sort((a, b) => values[b] - values[a]);
    let best = { scale: -Infinity, angle: 0, shift: [0, 0] };
    for (const peak of peaks.slice(0, 3)) {
      best = better(best, planes, copy, central, peak * step);
      best = better(best, planes, copy, central, refine(planes, copy, central, (peak - 1) * step, (peak + 1) * step));
    }
    return best;
  }

  // The best twist within reach of the copy's current one. A dragged copy then
  // turns smoothly, where the best twist overall can jump between equal peaks.
  function nearTwist(planes, copy, central, reach = 0.04, samples = 9) {
    const step = 2 * reach / (samples - 1);
    let best = { scale: -Infinity, angle: 0, shift: [0, 0] };
    for (let k = 0; k < samples; k += 1) best = better(best, planes, copy, central, -reach + k * step);
    const lo = Math.max(-reach, best.angle - step);
    const hi = Math.min(reach, best.angle + step);
    return better(best, planes, copy, central, refine(planes, copy, central, lo, hi));
  }

  // The best fit of the copy through the hole. The app chooses the twist and shift.
  function fitPoses(model, holeRotation, copyRotation, samples = 120) {
    const hole = shadow(model.vertices, holeRotation);
    const planes = halfPlanes(hole);
    const copy = shadow(model.vertices, copyRotation);
    return { hole, planes, ...bestTwist(planes, copy, model.central, samples) };
  }

  // The same fit, with the twist kept near the copy's current one.
  function fitNear(model, holeRotation, copyRotation) {
    const hole = shadow(model.vertices, holeRotation);
    const planes = halfPlanes(hole);
    const copy = shadow(model.vertices, copyRotation);
    return { hole, planes, ...nearTwist(planes, copy, model.central) };
  }

  function classify(scale) {
    if (scale > 1 + MARGIN) return "passes";
    if (scale < 1 - MARGIN) return "sticks";
    return "touches";
  }

  // The cross-section of the copy where it meets the plate, at z = 0.
  function slice(model, rotation, shift, depth) {
    const turned = model.vertices.map(point => {
      const p = apply(rotation, point);
      return [p[0] + shift[0], p[1] + shift[1], p[2] + depth];
    });
    const points = [];
    for (const [i, j] of model.edges) {
      const a = turned[i];
      const b = turned[j];
      if ((a[2] > 0 && b[2] > 0) || (a[2] < 0 && b[2] < 0) || a[2] === b[2]) continue;
      const t = a[2] / (a[2] - b[2]);
      points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
    return points;
  }

  function protrusion(points, planes) {
    let most = -Infinity;
    for (const point of points) {
      for (const plane of planes) {
        const value = plane.nx * point[0] + plane.ny * point[1] - plane.b;
        if (value > most) most = value;
      }
    }
    return most;
  }

  // Push the copy towards the plate and find the depth of its first contact
  // with the rim of the hole. Use this only for a copy that does not pass.
  function contact(model, rotation, shift, planes, steps = 400) {
    const heights = model.vertices.map(point => apply(rotation, point)[2]);
    const top = -Math.min(...heights);
    const bottom = -Math.max(...heights);
    const at = depth => protrusion(slice(model, rotation, shift, depth), planes);
    let previous = top;
    let deepest = { depth: top, value: -Infinity };
    for (let k = 1; k <= steps; k += 1) {
      const depth = top + (bottom - top) * k / steps;
      const value = at(depth);
      if (value > deepest.value) deepest = { depth, value };
      if (value >= -1e-9) {
        let lo = previous;
        let hi = depth;
        for (let i = 0; i < 40; i += 1) {
          const mid = (lo + hi) / 2;
          if (at(mid) >= -1e-9) hi = mid;
          else lo = mid;
        }
        return { depth: hi, slice: hull(slice(model, rotation, shift, hi)) };
      }
      previous = depth;
    }
    return { depth: deepest.depth, slice: hull(slice(model, rotation, shift, deepest.depth)) };
  }

  // A hill-climb over pairs of views, restarted from random views when it stalls.
  function createSearch(model, random = Math.random, samples = 48) {
    const best = { scale: -Infinity, hole: null, copy: null, shift: [0, 0], tried: 0 };
    let hole = null;
    let copy = null;
    let value = -Infinity;
    let step = 0;

    function evaluate(h, c) {
      const fit = fitPoses(model, h, c, samples);
      best.tried += 1;
      if (fit.scale > best.scale) {
        best.scale = fit.scale;
        best.hole = h;
        best.copy = multiply(twist(fit.angle), c);
        best.shift = fit.shift;
      }
      return fit.scale;
    }

    function nudge(rotation) {
      const axis = [random() - 0.5, random() - 0.5, random() - 0.5];
      return orthonormalise(multiply(axisRotation(axis, (random() * 2 - 1) * step), rotation));
    }

    function iterate() {
      if (!hole || step < 2e-4) {
        hole = randomRotation(random);
        copy = randomRotation(random);
        value = evaluate(hole, copy);
        step = 0.35;
        return;
      }
      const choice = random();
      const nextHole = choice < 0.65 ? nudge(hole) : hole;
      const nextCopy = choice > 0.35 ? nudge(copy) : copy;
      const next = evaluate(nextHole, nextCopy);
      if (next > value) {
        hole = nextHole;
        copy = nextCopy;
        value = next;
        step = Math.min(0.6, step * 1.4);
      } else {
        step *= 0.9;
      }
    }

    return {
      best,
      run(milliseconds) {
        const end = clock.now() + milliseconds;
        do iterate(); while (clock.now() < end);
        return best;
      }
    };
  }

  return {
    MARGIN,
    apply,
    axisRotation,
    bestTwist,
    classify,
    contact,
    createSearch,
    fitAtTwist,
    fitNear,
    fitPoses,
    halfPlanes,
    hull,
    nearTwist,
    multiply,
    orthonormalise,
    protrusion,
    quaternionRotation,
    randomRotation,
    shadow,
    slice,
    transpose,
    twist
  };
}));
