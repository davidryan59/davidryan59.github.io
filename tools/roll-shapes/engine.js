/* Rolling maths for the Rolling Shapes examples page. A shape is a closed curve,
   resampled at equal arc length and scaled to a given perimeter. The placing
   rule: the contact points meet, the tangents line up, and rolling moves both
   contact points by equal arc length. */
(function (root) {
  const TAU = Math.PI * 2, N = 8192;

  function polar(r) { return t => { const v = r(t); return [v * Math.cos(t), v * Math.sin(t)]; }; }
  const SHAPES = {
    circle: () => polar(() => 1),
    ellipse: (a, b) => t => [a * Math.cos(t), b * Math.sin(t)],
    flower: (k, d) => polar(t => 1 + d * Math.cos(k * t)),
    peanut: d => polar(t => 1 + d * Math.cos(2 * t)),
    egg: e => t => { const x = Math.cos(t), y = Math.sin(t); return [x * (1 + e * y), y * 1.25]; },
    squircle: p => t => { const c = Math.cos(t), s = Math.sin(t);
      return [Math.sign(c) * Math.abs(c) ** (2 / p), Math.sign(s) * Math.abs(s) ** (2 / p)]; },
  };

  function makeShape(f, perimeter) {
    const M = 40000, xs = new Float64Array(M + 1), ys = new Float64Array(M + 1), len = new Float64Array(M + 1);
    for (let i = 0; i <= M; i++) { const [x, y] = f(i / M * TAU); xs[i] = x; ys[i] = y; if (i) len[i] = len[i - 1] + Math.hypot(x - xs[i - 1], y - ys[i - 1]); }
    const k = perimeter / len[M], X = new Float64Array(N), Y = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const target = i / N * len[M];
      while (len[j + 1] < target) j++;
      const u = (target - len[j]) / ((len[j + 1] - len[j]) || 1);
      X[i] = (xs[j] + u * (xs[j + 1] - xs[j])) * k; Y[i] = (ys[j] + u * (ys[j + 1] - ys[j])) * k;
    }
    const TX = new Float64Array(N), TY = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1;
      TX[i] = dx / l; TY[i] = dy / l;
    }
    return { X, Y, TX, TY, perimeter };
  }

  function at(shape, s) {
    let u = (s / shape.perimeter) % 1; if (u < 0) u += 1;
    const f = u * N, i = Math.floor(f) % N, j = (i + 1) % N, w = f - Math.floor(f);
    const tx = shape.TX[i] + w * (shape.TX[j] - shape.TX[i]), ty = shape.TY[i] + w * (shape.TY[j] - shape.TY[i]), l = Math.hypot(tx, ty) || 1;
    return [shape.X[i] + w * (shape.X[j] - shape.X[i]), shape.Y[i] + w * (shape.Y[j] - shape.Y[i]), tx / l, ty / l];
  }

  /* Placement of the inner shape when the contact has travelled s along both. */
  function place(outer, inner, s) {
    const [ox, oy, otx, oty] = at(outer, s), [ix, iy, itx, ity] = at(inner, s);
    const c = otx * itx + oty * ity, n = oty * itx - otx * ity;
    return { c, n, ox, oy, ix, iy };
  }
  function apply(p, x, y) {
    const dx = x - p.ix, dy = y - p.iy;
    return [p.ox + p.c * dx - p.n * dy, p.oy + p.n * dx + p.c * dy];
  }

  /* The pen's curve over a number of laps, as a flat array. */
  function trace(outer, inner, pen, laps, perUnit) {
    const total = laps * outer.perimeter;
    const ds = Math.min(outer.perimeter / 1200, inner.perimeter / 500) * (perUnit || 1);
    const n = Math.ceil(total / ds) + 1, pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const p = apply(place(outer, inner, i / (n - 1) * total), pen[0], pen[1]); pts[2 * i] = p[0]; pts[2 * i + 1] = p[1]; }
    return pts;
  }

  /* Laps until the body is back within tol of its start, up to a cap. */
  function lapsToClose(outer, inner, tol, cap) {
    const a = place(outer, inner, 0), box = inner.perimeter / 4;
    const test = [[box, 0], [-box, 0], [0, box]];
    const start = test.map(q => apply(a, q[0], q[1]));
    for (let k = 1; k <= cap; k++) {
      const p = place(outer, inner, k * outer.perimeter);
      let gap = 0;
      test.forEach((q, i) => { const w = apply(p, q[0], q[1]); gap = Math.max(gap, Math.hypot(w[0] - start[i][0], w[1] - start[i][1])); });
      if (gap < tol) return k;
    }
    return null;
  }

  function insidePoly(X, Y, n, x, y) {
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) if ((Y[i] > y) !== (Y[j] > y) && x < (X[j] - X[i]) * (y - Y[i]) / (Y[j] - Y[i]) + X[i]) inside = !inside;
    return inside;
  }
  function distPoly(X, Y, n, x, y) {
    let best = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.hypot(X[i] - x, Y[i] - y); if (d < best) best = d; }
    return best;
  }

  /* How far the inner shape crosses the outer one, over one full closing cycle.
     Returns the share of placements that cross, and the deepest crossing as a
     share of the outer shape's width. */
  function overlap(outer, inner, laps) {
    const step = 4, n = Math.floor(N / step), X = new Float64Array(n), Y = new Float64Array(n);
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < n; i++) { X[i] = outer.X[i * step]; Y[i] = outer.Y[i * step]; minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); }
    const width = maxX - minX, tol = width * 0.001;
    const placements = Math.min(800, Math.max(300, Math.round(laps * 240))), samples = 160;
    let crossing = 0, deepest = 0;
    for (let i = 0; i < placements; i++) {
      const p = place(outer, inner, i / placements * laps * outer.perimeter);
      let d = 0;
      for (let j = 0; j < samples; j++) {
        const k = Math.floor(j / samples * N), w = apply(p, inner.X[k], inner.Y[k]);
        if (!insidePoly(X, Y, n, w[0], w[1])) { const e = distPoly(X, Y, n, w[0], w[1]); if (e > d) d = e; }
      }
      if (d > tol) crossing++;
      if (d > deepest) deepest = d;
    }
    return { share: crossing / placements, depth: deepest / width };
  }

  /* A regular polygon tumbling corner to corner inside a circle: pure pivots.
     pose(h) places it after h hops, h may be fractional. */
  function tumbler(sides, innerPerimeter, outerPerimeter) {
    const R = outerPerimeter / TAU, a = innerPerimeter / sides, alpha = Math.asin(a / (2 * R));
    const rho = a / (2 * Math.sin(Math.PI / sides));
    const corner = j => { const t = j * TAU / sides; return [rho * Math.cos(t), rho * Math.sin(t)]; };
    const onCircle = k => { const t = k * 2 * alpha; return [R * Math.cos(t), R * Math.sin(t)]; };
    function stance(k) {
      const A = corner(k), B = corner(k + 1), P = onCircle(k), Q = onCircle(k + 1);
      const ang = Math.atan2(Q[1] - P[1], Q[0] - P[0]) - Math.atan2(B[1] - A[1], B[0] - A[0]);
      return { ang, c: Math.cos(ang), n: Math.sin(ang), A, P };
    }
    function pose(h) {
      const k = Math.floor(h), s0 = stance(k), s1 = stance(k + 1), V = onCircle(k + 1);
      let d = s1.ang - s0.ang; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      const u = (h - k) * d, cu = Math.cos(u), nu = Math.sin(u);
      return (x, y) => {
        const dx = x - s0.A[0], dy = y - s0.A[1];
        const wx = s0.P[0] + s0.c * dx - s0.n * dy - V[0], wy = s0.P[1] + s0.n * dx + s0.c * dy - V[1];
        return [V[0] + cu * wx - nu * wy, V[1] + nu * wx + cu * wy];
      };
    }
    function trace(pen, hops) {
      const perHop = 48, pts = new Float32Array((hops * perHop + 1) * 2);
      for (let i = 0; i <= hops * perHop; i++) { const w = pose(i / perHop)(pen[0], pen[1]); pts[2 * i] = w[0]; pts[2 * i + 1] = w[1]; }
      return pts;
    }
    /* Hops per lap, and the smallest whole number of laps that comes back within tol. */
    function lapsToClose(tol, cap) {
      const hopsPerLap = Math.PI / alpha, start = pose(0), t0 = start(rho, 0), t1 = start(0, rho);
      for (let m = sides; m < cap * hopsPerLap; m += sides) {
        const w = pose(m), a0 = w(rho, 0), a1 = w(0, rho);
        if (Math.hypot(a0[0] - t0[0], a0[1] - t0[1]) < tol && Math.hypot(a1[0] - t1[0], a1[1] - t1[1]) < tol) return { hops: m, laps: m / hopsPerLap };
      }
      return null;
    }
    return { pose, trace, lapsToClose, alpha, rho, R, hopsPerLap: Math.PI / alpha, corner };
  }

  const api = { TAU, SHAPES, makeShape, at, place, apply, trace, lapsToClose, overlap, tumbler };
  if (typeof module !== 'undefined') module.exports = api; else root.RollEngine = api;
})(this);
