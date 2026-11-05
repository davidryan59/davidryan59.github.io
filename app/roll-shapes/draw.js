/* Drawing onto a 2D context: the curves, the shapes and the pens. World y points
   up. A view maps world units to pixels. */

export const toPx = (view, x, y) => [view.cx + view.k * x, view.cy - view.k * y];

/* A pen's curve as a flat list of world points. */
export function penCurve(poses, count, px, py) {
  const out = new Float32Array(count * 2);
  for (let k = 0; k < count; k++) {
    const i = k * 4, c = poses[i], s = poses[i + 1];
    out[2 * k] = c * px - s * py + poses[i + 2];
    out[2 * k + 1] = s * px + c * py + poses[i + 3];
  }
  return out;
}

const SEGMENT = 900;
const hue = (share, dark) => 'hsl(' + (share * 360).toFixed(1) + ' 88% ' + (dark ? 63 : 44) + '%)';

/* Draws points from index a to index b. Long strokes go in short pieces, which a
   canvas draws far faster, and points under a third of a pixel apart are skipped. */
export function strokeCurve(ctx, view, pts, a, b, style) {
  const { k, cx, cy } = view, last = Math.min(b, pts.length / 2 - 1);
  if (last <= a) return;
  const rainbowStep = style.rainbow ? Math.max(1, Math.floor(pts.length / 2 / 256)) : Infinity;
  const pieceSize = Math.min(SEGMENT, rainbowStep);
  ctx.lineWidth = style.width * style.scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!style.rainbow) ctx.strokeStyle = style.colour;
  let i = a;
  while (i < last) {
    const end = Math.min(last, i + pieceSize);
    if (style.rainbow) ctx.strokeStyle = hue(i / (pts.length / 2), style.dark);
    ctx.beginPath();
    let lx = cx + k * pts[2 * i], ly = cy - k * pts[2 * i + 1];
    ctx.moveTo(lx, ly);
    for (let j = i + 1; j <= end; j++) {
      const x = cx + k * pts[2 * j], y = cy - k * pts[2 * j + 1], dx = x - lx, dy = y - ly;
      if (j < end && dx * dx + dy * dy < 0.11) continue;
      ctx.lineTo(x, y);
      lx = x; ly = y;
    }
    ctx.stroke();
    i = end;
  }
}

export function tracePolygon(ctx, view, shape, pose) {
  const { k, cx, cy } = view, [c, s, tx, ty] = pose || [1, 0, 0, 0];
  ctx.beginPath();
  for (let i = 0; i < shape.n; i++) {
    const wx = c * shape.x[i] - s * shape.y[i] + tx, wy = s * shape.x[i] + c * shape.y[i] + ty;
    const x = cx + k * wx, y = cy - k * wy;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/* The two shapes, with any overlap in red. */
export function drawShapes(ctx, view, outer, inner, pose, look, side, showOverlap, width, height) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = look.scale * 1.4;
  tracePolygon(ctx, view, outer);
  ctx.strokeStyle = look.outer;
  ctx.stroke();

  tracePolygon(ctx, view, inner, pose);
  ctx.fillStyle = look.fill;
  ctx.fill();

  if (showOverlap) {
    /* Inside, the overlap is the part of the inner shape beyond the outer shape.
       Outside, it is the part within. */
    ctx.save();
    const clip = new Path2D();
    const { k, cx, cy } = view;
    for (let i = 0; i < outer.n; i++) {
      const x = cx + k * outer.x[i], y = cy - k * outer.y[i];
      if (i) clip.lineTo(x, y); else clip.moveTo(x, y);
    }
    clip.closePath();
    if (side > 0) {
      clip.moveTo(0, 0); clip.lineTo(width, 0); clip.lineTo(width, height); clip.lineTo(0, height); clip.closePath();
      ctx.clip(clip, 'evenodd');
    } else ctx.clip(clip);
    tracePolygon(ctx, view, inner, pose);
    ctx.fillStyle = look.overlap;
    ctx.fill();
    ctx.restore();
  }

  tracePolygon(ctx, view, inner, pose);
  ctx.strokeStyle = look.inner;
  ctx.lineWidth = look.scale * 1.4;
  ctx.stroke();
}

export function drawPen(ctx, view, wx, wy, colour, look) {
  const [x, y] = toPx(view, wx, wy), r = 5.5 * look.scale;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.6 * look.scale, 0, Math.PI * 2);
  ctx.fillStyle = look.penRing;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

/* A curve as an SVG path, in a 1000-unit frame. */
export function svgPath(pts, view, a = 0, b = pts.length / 2 - 1) {
  const parts = [];
  let lx = Infinity, ly = Infinity;
  for (let i = a; i <= b; i++) {
    const x = view.cx + view.k * pts[2 * i], y = view.cy - view.k * pts[2 * i + 1];
    if (i !== b && Math.abs(x - lx) + Math.abs(y - ly) < 0.08) continue;
    parts.push((parts.length ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2));
    lx = x; ly = y;
  }
  return parts.join('');
}

export function svgOutline(shape, view, pose) {
  const [c, s, tx, ty] = pose || [1, 0, 0, 0], parts = [];
  for (let i = 0; i < shape.n; i++) {
    const wx = c * shape.x[i] - s * shape.y[i] + tx, wy = s * shape.x[i] + c * shape.y[i] + ty;
    parts.push((i ? 'L' : 'M') + (view.cx + view.k * wx).toFixed(2) + ' ' + (view.cy - view.k * wy).toFixed(2));
  }
  return parts.join('') + 'Z';
}

export { hue };
