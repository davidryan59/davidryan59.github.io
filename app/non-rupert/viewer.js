(function start() {
  "use strict";

  const { buildModel, cross, dot, subtract } = window.NonRupertModels;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewers = [];

  function length(vector) {
    return Math.hypot(vector[0], vector[1], vector[2]);
  }

  function normalise(vector) {
    const size = length(vector) || 1;
    return vector.map(value => value / size);
  }

  function rotate(point, rx, ry) {
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    const x = point[0] * cy + point[2] * sy;
    const z1 = -point[0] * sy + point[2] * cy;
    return [x, point[1] * cx - z1 * sx, point[1] * sx + z1 * cx];
  }

  function createViewer(canvas) {
    const card = canvas.closest(".model-card");
    const model = buildModel(canvas.dataset.model);
    const context = canvas.getContext("2d");
    const spinButton = card.querySelector(".spin-button");
    const resetButton = card.querySelector(".reset-button");
    const edgeColour = `hsl(${model.hue} 90% 87% / .27)`;
    const glowColour = `hsl(${model.hue} 68% 62% / .15)`;
    card.style.setProperty("--hue", model.hue);
    const state = {
      rx: -0.35,
      ry: model.turn,
      zoom: 1,
      spinning: !reducedMotion,
      dragging: false,
      pointer: null,
      pointers: new Map(),
      pinchDistance: 0,
      lastTime: performance.now()
    };

    function setSpin(spinning) {
      state.spinning = spinning;
      spinButton.setAttribute("aria-pressed", String(spinning));
      spinButton.setAttribute("aria-label", `${spinning ? "Pause" : "Resume"} rotation of the ${model.name}`);
      spinButton.querySelector(".control-label").textContent = spinning ? "Pause" : "Spin";
    }

    function reset() {
      state.rx = -0.35;
      state.ry = model.turn;
      state.zoom = 1;
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    function draw(time) {
      resize();
      const elapsed = Math.min(40, time - state.lastTime);
      state.lastTime = time;
      if (state.spinning && !state.dragging) state.ry += elapsed * 0.00016;

      const width = canvas.width;
      const height = canvas.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const shortest = Math.min(width, height);
      const scale = shortest * 0.34 * state.zoom;
      const centreX = width / 2;
      const centreY = height / 2 + Math.min(22 * ratio, height * 0.04);
      const camera = [0, 0, 4.4];
      const light = normalise([-0.45, -0.7, 1]);
      const rotated = model.vertices.map(point => rotate(point, state.rx, state.ry));
      const projected = rotated.map(point => {
        const perspective = 3.8 / (4.4 - point[2]);
        return [
          centreX + point[0] * scale * perspective,
          centreY - point[1] * scale * perspective
        ];
      });

      context.clearRect(0, 0, width, height);
      const visibleFaces = [];
      for (const face of model.facets) {
        const a = rotated[face[0]];
        const b = rotated[face[1]];
        const c = rotated[face[2]];
        const normal = normalise(cross(subtract(b, a), subtract(c, a)));
        const centre = [0, 0, 0];
        for (const index of face) {
          for (let axis = 0; axis < 3; axis += 1) centre[axis] += rotated[index][axis];
        }
        for (let axis = 0; axis < 3; axis += 1) centre[axis] /= face.length;
        if (dot(normal, subtract(camera, centre)) <= 0) continue;
        visibleFaces.push({ face, normal, centre });
      }
      visibleFaces.sort((a, b) => a.centre[2] - b.centre[2]);

      context.lineJoin = "round";
      for (const item of visibleFaces) {
        const points = item.face.map(index => projected[index]);
        const brightness = Math.max(0, dot(item.normal, light));
        const sideLight = (item.normal[0] + 1) * 3;
        const lightness = 25 + brightness * 31 + sideLight;
        const hue = model.hue + item.normal[1] * 12;
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i += 1) context.lineTo(points[i][0], points[i][1]);
        context.closePath();
        context.fillStyle = `hsl(${hue} 55% ${lightness}%)`;
        context.fill();
        context.strokeStyle = edgeColour;
        context.lineWidth = Math.max(0.65 * ratio, 1);
        context.stroke();
      }

      const glow = context.createRadialGradient(
        centreX, centreY + scale * 1.02, 0,
        centreX, centreY + scale * 1.02, scale * .72
      );
      glow.addColorStop(0, glowColour);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      context.save();
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = glow;
      context.fillRect(centreX - scale, centreY, scale * 2, scale * .8);
      context.restore();
    }

    function pointerDown(event) {
      canvas.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      state.dragging = true;
      state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      if (state.pointers.size === 2) {
        const [a, b] = [...state.pointers.values()];
        state.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }

    function pointerMove(event) {
      if (!state.pointers.has(event.pointerId)) return;
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (state.pointers.size === 2) {
        const [a, b] = [...state.pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (state.pinchDistance) {
          state.zoom = Math.max(0.62, Math.min(1.55, state.zoom * distance / state.pinchDistance));
        }
        state.pinchDistance = distance;
        return;
      }
      if (!state.dragging || !state.pointer || event.pointerId !== state.pointer.id) return;
      state.ry += (event.clientX - state.pointer.x) * 0.009;
      state.rx += (event.clientY - state.pointer.y) * 0.009;
      state.rx = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.rx));
      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
    }

    function pointerUp(event) {
      state.pointers.delete(event.pointerId);
      state.pinchDistance = 0;
      if (!state.pointers.size) {
        state.dragging = false;
        state.pointer = null;
        return;
      }
      const [id, point] = state.pointers.entries().next().value;
      state.pointer = { id, x: point.x, y: point.y };
    }

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      state.zoom = Math.max(0.62, Math.min(1.55, state.zoom * Math.exp(-event.deltaY * 0.001)));
    }, { passive: false });
    canvas.addEventListener("keydown", event => {
      const change = 0.09;
      if (event.key === "ArrowLeft") state.ry -= change;
      else if (event.key === "ArrowRight") state.ry += change;
      else if (event.key === "ArrowUp") state.rx -= change;
      else if (event.key === "ArrowDown") state.rx += change;
      else if (event.key === "+" || event.key === "=") state.zoom = Math.min(1.55, state.zoom * 1.08);
      else if (event.key === "-" || event.key === "_") state.zoom = Math.max(0.62, state.zoom / 1.08);
      else return;
      event.preventDefault();
    });
    spinButton.addEventListener("click", () => setSpin(!state.spinning));
    resetButton.addEventListener("click", reset);
    setSpin(state.spinning);

    return { draw, model };
  }

  for (const canvas of document.querySelectorAll("canvas[data-model]")) {
    viewers.push(createViewer(canvas));
  }

  function frame(time) {
    for (const viewer of viewers) viewer.draw(time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const fullscreenButton = document.querySelector("#fullscreen");
  if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
  fullscreenButton.addEventListener("click", async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  });
  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute("aria-label", `${active ? "Exit" : "Enter"} full screen`);
    fullscreenButton.title = `${active ? "Exit" : "Enter"} full screen`;
  });
}());
