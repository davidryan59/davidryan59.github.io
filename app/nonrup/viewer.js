(function start() {
  "use strict";

  const { DEFINITIONS, buildModel, cross, dot, subtract } = window.NonRupertModels;
  const Shadow = window.NonRupertShadow;
  const { apply, axisRotation, multiply, orthonormalise, quaternionRotation, transpose, twist } = Shadow;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The plate lies in the plane z = 0, and the ghost of the fixed solid sits on it.
  // The copy starts clear of the ghost and is pushed along -z.
  const START = 2.15;
  const END = -2.15;
  const PLATE = 1.6;
  const CAMERA = 9;
  const HOME = { yaw: -0.62, pitch: 0.42 };
  // How far the scene reaches from the screen's centre in the starting view: the
  // plate's corners and the unit-radius copy at both ends of its push.
  const HOME_REACH = (() => {
    const view = viewFrom(HOME.yaw, HOME.pitch);
    let x = 0;
    let y = 0;
    const add = (point, radius) => {
      const v = apply(view, point);
      const f = CAMERA / (CAMERA - v[2]);
      x = Math.max(x, (Math.abs(v[0]) + radius) * f);
      y = Math.max(y, (Math.abs(v[1]) + radius) * f);
    };
    for (const corner of [[-PLATE, -PLATE, 0], [PLATE, -PLATE, 0], [PLATE, PLATE, 0], [-PLATE, PLATE, 0]]) add(corner, 0);
    add([0, 0, START], 1);
    add([0, 0, END], 1);
    return { x, y };
  })();
  // The light turns with the camera, so the solid looks the same from every side.
  const LIGHT = apply(viewFrom(HOME.yaw, HOME.pitch), normalise([-0.5, 0.8, 0.65]));
  const GHOST_FADE = 450;
  const PUSH_SPEED = 0.0019;
  const SETTLE_TIME = 320;
  const SETTLE_DELAY = 180;
  const SEARCH_TIME = 10000;
  const RED = "255, 100, 116";

  const sceneCanvas = document.querySelector("#scene");
  const fitCanvas = document.querySelector("#fit");
  const kindText = document.querySelector("#kind");
  const titleText = document.querySelector("#shape-title");
  const metaText = document.querySelector("#shape-meta");
  const hintText = document.querySelector("#hint");
  const stepText = document.querySelector("#step");
  const resetViewButton = document.querySelector("#reset-view");
  const ratioText = document.querySelector("#ratio");
  const verdictText = document.querySelector("#verdict");
  const shapeBar = document.querySelector("#shapes");
  const cutButton = document.querySelector("#cut");
  const pushButton = document.querySelector("#push");
  const searchButton = document.querySelector("#search");
  const passageButton = document.querySelector("#passage");

  const VERDICTS = { passes: "Passes", touches: "Touches", sticks: "Sticks out" };
  const models = new Map();
  const state = {
    model: null,
    phase: "hole",
    hole: null,
    copy: null,
    shift: [0, 0],
    fit: null,
    verdict: null,
    holeShadow: [],
    copyShadow: [],
    depth: START,
    motion: null,
    jam: null,
    shake: 0,
    spinning: !reducedMotion,
    search: null,
    note: "",
    dirty: true,
    precise: true,
    settle: null,
    settleDue: false,
    lastTurn: 0,
    yaw: HOME.yaw,
    pitch: HOME.pitch,
    zoom: 1,
    ghostStart: -Infinity,
    grab: [],
    lastTime: performance.now()
  };

  function viewFrom(yaw, pitch) {
    return multiply(axisRotation([1, 0, 0], pitch), axisRotation([0, 1, 0], yaw));
  }

  // The camera orbits the plate. Its view matrix maps world to view coordinates.
  function camera() {
    const view = viewFrom(state.yaw, state.pitch);
    const back = transpose(view);
    return {
      view,
      position: apply(back, [0, 0, CAMERA]),
      right: [view[0], view[1], view[2]],
      up: [view[3], view[4], view[5]],
      light: apply(back, LIGHT)
    };
  }

  function normalise(vector) {
    const size = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return vector.map(value => value / size);
  }

  function model(key) {
    if (!models.has(key)) models.set(key, buildModel(key));
    return models.get(key);
  }

  function restingPose(solid) {
    return multiply(axisRotation([1, 0, 0], -0.35), axisRotation([0, 1, 0], solid.turn));
  }

  // Setting up and changing the poses

  function chooseShape(key) {
    if (!DEFINITIONS[key]) key = "stellated";
    stopSearch();
    state.model = model(key);
    state.phase = "hole";
    state.hole = restingPose(state.model);
    state.copy = null;
    state.note = "";
    state.spinning = !reducedMotion;
    resetPush();
    for (const button of shapeBar.querySelectorAll(".shape")) {
      const chosen = button.dataset.shape === key;
      button.setAttribute("aria-pressed", String(chosen));
      if (chosen) button.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    document.documentElement.style.setProperty("--hue", state.model.hue);
    kindText.textContent = state.model.kind;
    titleText.innerHTML = state.model.label;
    metaText.textContent = `${state.model.vertices.length} vertices · ${state.model.edges.length} edges · ${state.model.facets.length} faces`;
    passageButton.hidden = !state.model.passage;
    history.replaceState(null, "", `#${key}`);
    markChanged();
  }

  function cutHole() {
    stopSearch();
    state.spinning = false;
    state.note = "";
    resetPush();
    if (state.phase === "hole") {
      state.phase = "copy";
      state.ghostStart = performance.now();
      state.copy = multiply(axisRotation([1, 1, 0], 0.9), state.hole);
    } else {
      state.phase = "hole";
    }
    markChanged();
  }

  function showPassage() {
    const passage = state.model.passage;
    if (!passage) return;
    stopSearch();
    resetPush();
    state.spinning = false;
    state.phase = "copy";
    state.hole = quaternionRotation(passage.hole);
    state.copy = quaternionRotation(passage.copy);
    state.note = "passage";
    markChanged();
  }

  function turn(axis, angle) {
    stopSearch();
    resetPush();
    state.spinning = false;
    state.note = "";
    state.settle = null;
    const rotation = axisRotation(axis, angle);
    if (state.phase === "hole") state.hole = orthonormalise(multiply(rotation, state.hole));
    else state.copy = orthonormalise(multiply(rotation, state.copy));
    state.dirty = true;
    state.precise = false;
    state.settleDue = state.phase === "copy";
    state.lastTurn = performance.now();
  }

  // A new hole, a new solid or a pass found: fit the copy with the best twist overall.
  function markChanged() {
    state.settle = null;
    state.dirty = true;
    state.precise = true;
    state.settleDue = false;
  }

  // The app turns the copy about the push axis and slides it to its best fit.
  // While the visitor turns the copy, the twist stays near its last value, so the
  // copy follows the pointer. Once they stop, the copy eases to the best twist overall.
  function refit(time) {
    const solid = state.model;
    state.dirty = false;
    if (state.phase === "hole") {
      state.holeShadow = Shadow.shadow(solid.vertices, state.hole);
      state.fit = null;
      state.verdict = null;
      updateText();
      return;
    }
    const fit = state.precise
      ? Shadow.fitPoses(solid, state.hole, state.copy, 120)
      : Shadow.fitNear(solid, state.hole, state.copy);
    const period = solid.central ? Math.PI : 2 * Math.PI;
    let angle = fit.angle % period;
    if (angle > period / 2) angle -= period;
    state.fit = fit;
    state.verdict = Shadow.classify(fit.scale);
    state.holeShadow = fit.hole;
    if (state.precise && !reducedMotion && Math.abs(angle) > 0.002) {
      placeCopy(state.copy, state.shift);
      state.settle = { base: state.copy, angle, from: state.shift, to: fit.shift, start: time };
    } else {
      placeCopy(multiply(twist(angle), state.copy), fit.shift);
    }
    updateText();
  }

  function placeCopy(rotation, shift) {
    state.copy = orthonormalise(rotation);
    state.shift = shift;
    state.copyShadow = Shadow.shadow(state.model.vertices, state.copy, state.shift);
  }

  function stepSettle(time) {
    if (state.settleDue && !dragging && time - state.lastTurn > SETTLE_DELAY) {
      state.settleDue = false;
      state.dirty = true;
      state.precise = true;
    }
    const settle = state.settle;
    if (!settle) return;
    const t = Math.min(1, (time - settle.start) / SETTLE_TIME);
    const eased = t * t * (3 - 2 * t);
    const shift = [0, 1].map(i => settle.from[i] + (settle.to[i] - settle.from[i]) * eased);
    placeCopy(multiply(twist(settle.angle * eased), settle.base), shift);
    if (t >= 1) state.settle = null;
  }

  function finishSettle() {
    const settle = state.settle;
    if (!settle) return;
    placeCopy(multiply(twist(settle.angle), settle.base), settle.to);
    state.settle = null;
  }

  // Pushing the copy through the plate

  function resetPush() {
    state.motion = null;
    state.jam = null;
    state.depth = START;
  }

  function push() {
    if (state.phase !== "copy" || state.motion) return;
    stopSearch();
    if (state.dirty) refit(performance.now());
    finishSettle();
    if (state.depth !== START) {
      moveTo(START, null);
      state.jam = null;
      return;
    }
    if (state.verdict === "passes") {
      moveTo(END, null);
    } else {
      const contact = Shadow.contact(state.model, state.copy, state.shift, state.fit.planes);
      moveTo(contact.depth, contact);
    }
  }

  function moveTo(target, contact) {
    const from = state.depth;
    if (reducedMotion) {
      finishMove(target, contact);
      return;
    }
    state.motion = {
      from,
      target,
      contact,
      start: performance.now(),
      duration: Math.max(260, Math.abs(target - from) / PUSH_SPEED)
    };
    updateText();
  }

  function finishMove(target, contact) {
    state.depth = target;
    state.motion = null;
    if (contact) {
      state.jam = contact;
      state.shake = performance.now();
    }
    updateText();
  }

  function stepMotion(time) {
    const motion = state.motion;
    if (!motion) return;
    const t = Math.min(1, (time - motion.start) / motion.duration);
    // A jam stops dead, so it moves at a steady speed. A pass eases in and out.
    const eased = motion.contact ? t : t * t * (3 - 2 * t);
    state.depth = motion.from + (motion.target - motion.from) * eased;
    if (t >= 1) finishMove(motion.target, motion.contact);
  }

  // Searching over pairs of views

  function toggleSearch() {
    if (state.search) {
      stopSearch();
      return;
    }
    resetPush();
    state.spinning = false;
    state.search = {
      runner: Shadow.createSearch(state.model),
      start: performance.now(),
      shown: -Infinity
    };
    state.note = "search";
    updateText();
  }

  function stepSearch(time) {
    const search = state.search;
    if (!search) return;
    const best = search.runner.run(10);
    if (best.scale > search.shown) {
      search.shown = best.scale;
      state.phase = "copy";
      state.hole = best.hole;
      state.copy = best.copy;
      markChanged();
    }
    if (time - search.start > SEARCH_TIME) stopSearch();
    else updateText();
  }

  function stopSearch() {
    if (!state.search) return;
    state.searched = state.search.runner.best.tried;
    state.search = null;
    state.note = "searched";
    updateText();
  }

  // Words beside the pictures

  function count(value) {
    return value.toLocaleString("en-GB");
  }

  // Each hint carries its step: 1 cut a hole, 2 fit the copy, 3 push it.
  function hint() {
    if (state.search) return ["", `Searching. ${count(state.search.runner.best.tried)} pairs of views tried so far.`];
    if (state.phase === "hole") return ["1", "Drag to turn the solid. Its shadow on the plate becomes the hole. Then cut the hole."];
    if (state.motion) return ["3", state.motion.target === START ? "Pulling the copy back." : "Pushing the copy into the hole."];
    if (state.jam) return ["3", "It jams where the red slice meets the rim of the hole."];
    if (state.depth !== START) return ["3", "It passes through the hole."];
    if (state.note === "searched") {
      const tried = `The best of ${count(state.searched)} pairs of views`;
      if (state.verdict === "passes") return ["2", `${tried} has room to spare. Push it through.`];
      if (state.verdict === "touches") return ["2", `${tried} lines the copy up with the hole, so it only touches the rim.`];
      if (state.fit.scale > 1 - 1e-3) return ["2", `${tried} lines the copy up with the hole, and it still sticks out.`];
      return ["2", `${tried} still sticks out.`];
    }
    if (state.note === "passage") return ["2", "These views leave room to spare. Push the copy through."];
    if (state.verdict === "passes") return ["2", "The copy's shadow fits inside the hole. Push it through."];
    if (state.verdict === "touches") return ["2", "The copy touches the rim. Drag to turn it and look for room."];
    return ["2", "The red part sticks out. Drag to turn the copy and find a way through."];
  }

  function updateText() {
    const [step, text] = hint();
    stepText.textContent = step;
    hintText.textContent = text;
    if (state.phase === "copy" && state.fit) {
      // Near 1, four decimals would hide the difference between a touch and a narrow pass.
      ratioText.textContent = state.fit.scale.toFixed(Math.abs(state.fit.scale - 1) < 1e-3 ? 7 : 4);
      verdictText.hidden = false;
      verdictText.dataset.verdict = state.verdict;
      verdictText.textContent = VERDICTS[state.verdict];
    } else {
      ratioText.textContent = "–";
      verdictText.hidden = true;
    }
    const resting = state.depth === START && !state.motion;
    cutButton.textContent = state.phase === "hole" ? "Cut hole" : "New hole";
    cutButton.classList.toggle("primary", state.phase === "hole");
    pushButton.disabled = state.phase !== "copy";
    pushButton.textContent = resting ? "Push" : "Pull back";
    pushButton.classList.toggle("primary", state.phase === "copy" && resting && !state.search);
    searchButton.textContent = state.search ? "Stop" : "Search";
  }

  // Drawing

  function resize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return ratio;
  }

  function trace(context, points) {
    if (points.length < 3) return;
    context.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i][0], points[i][1]);
    context.closePath();
  }

  // Keep the part of a face on one side of the plate: side 1 in front, -1 behind.
  function clipAtPlate(points, side) {
    const out = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const inA = side * a[2] >= 0;
      const inB = side * b[2] >= 0;
      if (inA) out.push(a);
      if (inA !== inB) {
        const t = a[2] / (a[2] - b[2]);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 0]);
      }
    }
    return out;
  }

  function worldPoints(solid, rotation, offset) {
    return solid.vertices.map(point => {
      const p = apply(rotation, point);
      return [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
    });
  }

  // Each face with its outward normal, and whether it faces the camera.
  function facesOf(solid, world, cam) {
    return solid.facets.map(facet => {
      const points = facet.map(index => world[index]);
      const normal = normalise(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
      return { points, normal, front: dot(normal, subtract(cam.position, points[0])) > 0 };
    });
  }

  function zRange(points) {
    let low = Infinity;
    let high = -Infinity;
    for (const point of points) {
      low = Math.min(low, point[2]);
      high = Math.max(high, point[2]);
    }
    return [low, high];
  }

  function drawScene(time) {
    const ratio = resize(sceneCanvas);
    const context = sceneCanvas.getContext("2d");
    const width = sceneCanvas.width;
    const height = sceneCanvas.height;
    const cam = camera();
    const top = height * 0.08;
    // The scale fits the starting view and stays fixed while the camera orbits.
    const scale = state.zoom * Math.min(width * 0.47 / HOME_REACH.x, (height - top) * 0.45 / HOME_REACH.y);
    const since = time - state.shake;
    const shake = since < 360 && !reducedMotion ? Math.sin(since / 22) * (1 - since / 360) * 5 * ratio : 0;
    const originX = width / 2 + shake;
    const originY = top + (height - top) / 2;
    const screen = point => {
      const v = apply(cam.view, point);
      const f = CAMERA / (CAMERA - v[2]);
      return [originX + v[0] * f * scale, originY - v[1] * f * scale];
    };
    const onPlate = polygon => polygon.map(([x, y]) => screen([x, y, 0]));

    const solid = state.model;
    const copyPhase = state.phase === "copy";
    const rotation = copyPhase ? state.copy : state.hole;
    const offset = copyPhase ? [state.shift[0], state.shift[1], state.depth] : [0, 0, START];
    const world = worldPoints(solid, rotation, offset);
    const solidFaces = facesOf(solid, world, cam).filter(face => face.front);
    state.grab = Shadow.hull(world.map(screen));

    const ghostWorld = copyPhase ? worldPoints(solid, state.hole, [0, 0, 0]) : null;
    const ghostFaces = ghostWorld ? facesOf(solid, ghostWorld, cam) : [];
    const fade = Math.min(1, Math.max(0, (time - state.ghostStart) / GHOST_FADE));

    context.clearRect(0, 0, width, height);
    context.lineJoin = "round";

    // A convex solid shows only its front faces, and they never overlap.
    const drawSolid = side => {
      context.lineWidth = Math.max(0.65 * ratio, 1);
      context.strokeStyle = `hsl(${solid.hue} 90% 88% / .28)`;
      for (const face of solidFaces) {
        const part = clipAtPlate(face.points, side);
        if (part.length < 3) continue;
        const brightness = Math.max(0, dot(face.normal, cam.light));
        const lightness = 26 + brightness * 34 + (dot(face.normal, cam.right) + 1) * 2.5;
        context.beginPath();
        trace(context, part.map(screen));
        context.fillStyle = `hsl(${solid.hue + dot(face.normal, cam.up) * 12} 55% ${lightness}%)`;
        context.fill();
        context.stroke();
      }
    };

    // The ghost is glass: a faint tint on its near faces and fine lines on its far ones.
    const drawGhost = (side, front) => {
      context.lineWidth = Math.max(0.8 * ratio, 1);
      context.strokeStyle = `rgba(226, 238, 252, ${(front ? 0.42 : 0.14) * fade})`;
      context.fillStyle = `rgba(214, 230, 250, ${0.07 * fade})`;
      for (const face of ghostFaces) {
        if (face.front !== front) continue;
        const part = clipAtPlate(face.points, side);
        if (part.length < 3) continue;
        context.beginPath();
        trace(context, part.map(screen));
        if (front) context.fill();
        context.stroke();
      }
    };

    // Draw the copy and the ghost in depth order. Two solids on either side of a
    // plane z = c are ordered by the camera's side of that plane. Where they
    // overlap in z, the copy goes between the ghost's far and near faces.
    const copyRange = zRange(world);
    const ghostRange = ghostWorld ? zRange(ghostWorld) : null;
    const drawHalf = side => {
      if (!ghostWorld) {
        drawSolid(side);
        return;
      }
      let copyNearer = null;
      if (copyRange[0] >= ghostRange[1]) copyNearer = cam.position[2] > (copyRange[0] + ghostRange[1]) / 2;
      else if (copyRange[1] <= ghostRange[0]) copyNearer = cam.position[2] < (copyRange[1] + ghostRange[0]) / 2;
      if (copyNearer === true) {
        drawGhost(side, false);
        drawGhost(side, true);
        drawSolid(side);
      } else if (copyNearer === false) {
        drawSolid(side);
        drawGhost(side, false);
        drawGhost(side, true);
      } else {
        drawGhost(side, false);
        drawSolid(side);
        drawGhost(side, true);
      }
    };

    // The far side of the plate, then the plate, then the near side.
    const near = cam.position[2] >= 0 ? 1 : -1;
    drawHalf(-near);

    const corners = onPlate([[-PLATE, -PLATE], [PLATE, -PLATE], [PLATE, PLATE], [-PLATE, PLATE]]);
    const hole = onPlate(state.holeShadow);
    const platePath = new Path2D();
    trace(platePath, corners);
    if (copyPhase) trace(platePath, hole);
    const shade = copyPhase ? 0.74 : 0.9;
    const gradient = context.createLinearGradient(corners[3][0], corners[3][1], corners[1][0], corners[1][1]);
    gradient.addColorStop(0, `rgba(52, 78, 108, ${shade})`);
    gradient.addColorStop(1, `rgba(24, 40, 61, ${shade})`);
    context.fillStyle = gradient;
    context.fill(platePath, "evenodd");
    context.lineWidth = 1.2 * ratio;
    context.strokeStyle = "rgba(190, 214, 242, .3)";
    context.beginPath();
    trace(context, corners);
    context.stroke();

    if (!copyPhase) {
      context.beginPath();
      trace(context, hole);
      context.fillStyle = "rgba(2, 6, 12, .62)";
      context.fill();
    } else {
      // Where the copy's shadow lands on the plate, the copy cannot get through.
      context.save();
      context.clip(platePath, "evenodd");
      context.beginPath();
      trace(context, onPlate(state.copyShadow));
      context.fillStyle = `rgba(${RED}, .55)`;
      context.fill();
      context.restore();
      context.beginPath();
      trace(context, hole);
      context.lineWidth = 1.6 * ratio;
      context.strokeStyle = "rgba(235, 245, 255, .85)";
      context.stroke();
    }

    drawHalf(near);

    if (state.jam && state.jam.slice.length > 2) {
      context.beginPath();
      trace(context, onPlate(state.jam.slice));
      context.fillStyle = `rgba(${RED}, .3)`;
      context.fill();
      context.lineWidth = 2.4 * ratio;
      context.strokeStyle = `rgb(${RED})`;
      context.stroke();
    }
  }

  function drawFit() {
    const ratio = resize(fitCanvas);
    const context = fitCanvas.getContext("2d");
    const width = fitCanvas.width;
    const height = fitCanvas.height;
    const scale = Math.min(width, height) * 0.43;
    const screen = ([x, y]) => [width / 2 + x * scale, height / 2 - y * scale];
    context.clearRect(0, 0, width, height);
    const hole = state.holeShadow.map(screen);
    if (hole.length < 3) return;

    if (state.phase === "hole") {
      context.beginPath();
      trace(context, hole);
      context.fillStyle = "rgba(2, 6, 12, .55)";
      context.fill();
      context.lineWidth = 1.4 * ratio;
      context.strokeStyle = `hsl(${state.model.hue} 70% 70% / .7)`;
      context.setLineDash([5 * ratio, 4 * ratio]);
      context.stroke();
      context.setLineDash([]);
      return;
    }

    const holePath = new Path2D();
    trace(holePath, hole);
    context.fillStyle = "#03070d";
    context.fill(holePath);

    const copyPath = new Path2D();
    trace(copyPath, state.copyShadow.map(screen));
    context.save();
    context.clip(holePath);
    context.fillStyle = `hsl(${state.model.hue} 60% 55% / .55)`;
    context.fill(copyPath);
    context.restore();

    const outside = new Path2D();
    outside.rect(0, 0, width, height);
    trace(outside, hole);
    context.save();
    context.clip(outside, "evenodd");
    context.fillStyle = `rgba(${RED}, .85)`;
    context.fill(copyPath);
    context.restore();

    context.lineJoin = "round";
    context.lineWidth = 1.4 * ratio;
    context.strokeStyle = `hsl(${state.model.hue} 80% 80% / .9)`;
    context.stroke(copyPath);
    context.lineWidth = 1.8 * ratio;
    context.strokeStyle = "rgba(235, 245, 255, .9)";
    context.stroke(holePath);

    if (state.jam && state.jam.slice.length > 2) {
      context.beginPath();
      trace(context, state.jam.slice.map(screen));
      context.lineWidth = 2.2 * ratio;
      context.strokeStyle = `rgb(${RED})`;
      context.stroke();
    }
  }

  function frame(time) {
    requestAnimationFrame(frame);
    const elapsed = Math.min(40, time - state.lastTime);
    state.lastTime = time;
    if (state.spinning && state.phase === "hole" && !dragging) {
      state.hole = orthonormalise(multiply(axisRotation([0, 1, 0], elapsed * 0.00022), state.hole));
      state.dirty = true;
    }
    stepSearch(time);
    stepMotion(time);
    stepSettle(time);
    if (state.dirty) refit(time);
    drawScene(time);
    drawFit();
  }

  // Input

  let dragging = false;

  // Is a canvas point inside the solid's outline? A small margin makes it easier to grab.
  function onSolid(x, y) {
    const outline = state.grab;
    if (outline.length < 3) return false;
    const centre = outline.reduce((sum, p) => [sum[0] + p[0] / outline.length, sum[1] + p[1] / outline.length], [0, 0]);
    let sign = 0;
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i].map((value, axis) => centre[axis] + (value - centre[axis]) * 1.08);
      const b = outline[(i + 1) % outline.length].map((value, axis) => centre[axis] + (value - centre[axis]) * 1.08);
      const turn = Math.sign((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]));
      if (turn && sign && turn !== sign) return false;
      if (turn) sign = turn;
    }
    return true;
  }

  function orbit(dx, dy) {
    state.yaw += dx;
    state.pitch = Math.max(-1.25, Math.min(1.25, state.pitch + dy));
    resetViewButton.hidden = false;
  }

  function zoomBy(factor) {
    state.zoom = Math.max(0.5, Math.min(2.2, state.zoom * factor));
    resetViewButton.hidden = false;
  }

  // On the 3D view, dragging the solid turns it, and dragging around it orbits the camera.
  // On the view through the hole, every drag turns the solid.
  function attachDrag(canvas, axes, canOrbit) {
    let last = null;
    const canvasPoint = event => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / Math.max(1, rect.width);
      return [(event.clientX - rect.left) * ratio, (event.clientY - rect.top) * ratio];
    };
    const touches = new Map();
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener("pointerdown", event => {
      canvas.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (canOrbit && touches.size === 2) {
        // A second finger turns the drag into a pinch zoom.
        pinch = spread();
        last = null;
        dragging = false;
        return;
      }
      const orbiting = canOrbit && !onSolid(...canvasPoint(event));
      last = { id: event.pointerId, x: event.clientX, y: event.clientY, orbiting };
      dragging = !orbiting;
      if (!orbiting) state.spinning = false;
      canvas.style.cursor = orbiting ? "move" : "grabbing";
    });
    canvas.addEventListener("pointermove", event => {
      if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && touches.size === 2) {
        const now = spread();
        if (now > 0) zoomBy(now / pinch);
        pinch = now;
        return;
      }
      if (!last) {
        if (canOrbit && event.pointerType === "mouse") {
          canvas.style.cursor = onSolid(...canvasPoint(event)) ? "grab" : "move";
        }
        return;
      }
      if (event.pointerId !== last.id) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      last.x = event.clientX;
      last.y = event.clientY;
      if (last.orbiting) {
        orbit(dx * 0.008, dy * 0.008);
        return;
      }
      const { up, right } = axes();
      if (dx) turn(up, dx * 0.009);
      if (dy) turn(right, dy * 0.009);
    });
    const end = event => {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = 0;
      if (!last || event.pointerId !== last.id) return;
      last = null;
      dragging = false;
      canvas.style.cursor = "";
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    if (canOrbit) {
      canvas.addEventListener("wheel", event => {
        event.preventDefault();
        zoomBy(Math.exp(-event.deltaY * 0.0015));
      }, { passive: false });
    }
    canvas.addEventListener("keydown", event => {
      const change = 0.09;
      const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (canOrbit && (event.key === "+" || event.key === "=" || event.key === "-")) {
        event.preventDefault();
        zoomBy(event.key === "-" ? 1 / 1.1 : 1.1);
        return;
      }
      const step = keys[event.key];
      if (!step) return;
      event.preventDefault();
      if (canOrbit && event.shiftKey) {
        orbit(step[0] * change, step[1] * change);
        return;
      }
      const { up, right } = axes();
      if (step[0]) turn(up, step[0] * change);
      if (step[1]) turn(right, step[1] * change);
    });
  }

  attachDrag(sceneCanvas, () => camera(), true);
  attachDrag(fitCanvas, () => ({ up: [0, 1, 0], right: [1, 0, 0] }), false);

  resetViewButton.addEventListener("click", () => {
    state.yaw = HOME.yaw;
    state.pitch = HOME.pitch;
    state.zoom = 1;
    resetViewButton.hidden = true;
  });

  // P11/20, the rhombicosidodecahedron, the Undecanope and Noperthedron lead, then the comparison solids.
  const order = Object.keys(DEFINITIONS).sort((a, b) =>
    (DEFINITIONS[a].featured || 99) - (DEFINITIONS[b].featured || 99));
  let lastGroup = null;
  for (const key of order) {
    const definition = DEFINITIONS[key];
    const group = definition.featured ? "featured" : definition.group;
    if (lastGroup && group !== lastGroup) {
      const divider = document.createElement("span");
      divider.className = "shape-divider";
      shapeBar.append(divider);
    }
    lastGroup = group;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shape";
    button.dataset.shape = key;
    button.style.setProperty("--hue", definition.hue);
    button.setAttribute("aria-pressed", "false");
    if (definition.featured) {
      button.classList.add("featured");
      if (definition.featured === 1) button.classList.add("lead");
      button.innerHTML = `<span class="shape-name">${definition.short}</span><span class="shape-note">${definition.kind}</span>`;
    } else {
      button.innerHTML = definition.short;
      button.title = definition.kind === "Cuboid" ? `${definition.label} cuboid` : definition.label;
      button.setAttribute("aria-label", button.title);
    }
    button.addEventListener("click", () => chooseShape(key));
    shapeBar.append(button);
  }
  cutButton.addEventListener("click", cutHole);
  pushButton.addEventListener("click", push);
  searchButton.addEventListener("click", toggleSearch);
  passageButton.addEventListener("click", showPassage);

  chooseShape(location.hash.slice(1));
  requestAnimationFrame(frame);

  const fullscreenButton = document.querySelector("#fullscreen");
  if (!document.fullscreenEnabled) fullscreenButton.hidden = true;
  fullscreenButton.addEventListener("click", async () => {
    fullscreenButton.blur();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      // The browser may refuse full screen.
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute("aria-label", `${active ? "Exit" : "Enter"} full screen`);
    fullscreenButton.title = `${active ? "Exit" : "Enter"} full screen`;
  });
}());
