(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('viewer');
  const ctx = canvas.getContext('2d');
  const rasterCanvas = document.createElement('canvas');
  const rasterContext = rasterCanvas.getContext('2d');
  window.addEventListener('error', event => {
    $('loading').hidden = false;
    $('loading').textContent = `Viewer error: ${event.message}`;
  });
  const state = {
    geometry: null, current: null, family: null, tab: 'sporadic', filter: 'all',
    rx: -0.42, ry: 0.62, zoom: 1, dragging: false, lastX: 0, lastY: 0,
    spin: true, faces: true, edges: true, lastTime: 0, pinchDistance: 0,
    view: 'solid', palette: 'aurora', lighting: 'point', texture: 'grain', quality: 'auto', adaptiveScale: 1, frameTime: 16.7, lastQualityCheck: 0,
    faceSelected: true, selectedFace: 0, selectedVertex: 0, faceColours: [], opacity: 1, explode: 0, clip: 0, orthographic: false,
    hitFaces: [], hitVertices: [], dirty: true, frameRequested: 0
  };
  function invalidate() {
    state.dirty = true;
    if (!state.frameRequested) state.frameRequested = requestAnimationFrame(draw);
  }
  const labels = { tetrahedral: 'Tetrahedral', octahedral: 'Octahedral', icosahedral: 'Icosahedral' };
  const specialNames = { 'T-1': 'Regular tetrahedron', 'O-1': 'Regular octahedron', 'C-1': 'Cube', 'I-1': 'Regular icosahedron', 'D-1': 'Regular dodecahedron' };
  const defaultModel = () => window.NOBLE_MODELS.find(model => model.name === 'I-2') || window.NOBLE_MODELS[0];
  function paperNameExplanation(meta) {
    if (!meta.file) return '';
    const [orbit, suffix] = meta.name.split('-');
    const parts = suffix.split('.');
    return `${meta.name} is the paper’s symbol: orbit type ${orbit}, orbit ${parts[0]}${parts[1] ? `, faceting ${parts[1]}` : ''}.`;
  }

  function parseOff(text) {
    const lines = text.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
    if (lines.shift() !== 'OFF') throw new Error('This model is not an OFF file.');
    const [nv, nf] = lines.shift().split(/\s+/).map(Number);
    const vertices = lines.splice(0, nv).map(line => line.split(/\s+/).slice(0, 3).map(Number));
    const faces = lines.slice(0, nf).map(line => { const a = line.split(/\s+/).map(Number); return a.slice(1, a[0] + 1); });
    return normalise({ vertices, faces });
  }

  function normalise(geometry) {
    const centre = [0, 1, 2].map(axis => geometry.vertices.reduce((sum, v) => sum + v[axis], 0) / geometry.vertices.length);
    let radius = 0;
    for (const v of geometry.vertices) {
      v[0] -= centre[0]; v[1] -= centre[1]; v[2] -= centre[2];
      radius = Math.max(radius, Math.hypot(v[0], v[1], v[2]));
    }
    for (const v of geometry.vertices) { v[0] /= radius; v[1] /= radius; v[2] /= radius; }
    return geometry;
  }

  function disphenoid() {
    const h = +$('height').value / 100;
    const s = +$('shape').value / 100;
    const vertices = [[s,1,h],[s,-1,-h],[-s,1,-h],[-s,-1,h]];
    return normalise({ vertices, faces: [[0,1,2],[0,3,1],[0,2,3],[1,3,2]] });
  }

  function stephanoid() {
    const n = +$('sides').value;
    const h = +$('height').value / 100;
    const kind = $('stephanoid-kind').value;
    const [p,q] = $('winding').value.split(',').map(Number);
    const vertices = [];
    const faces = [];
    const seen = new Set();
    const addFace = face => {
      face = face.map(i => (i % vertices.length + vertices.length) % vertices.length);
      const key = [...face].sort((a,b) => a-b).join(',');
      if (!seen.has(key)) { seen.add(key); faces.push(face); }
    };
    if (kind === 'PC') {
      const a = i => (i%n+n)%n;
      const b = i => n+(i%n+n)%n;
      for (let i=0;i<n;i++) { const a=2*Math.PI*i/n; vertices.push([Math.cos(a),Math.sin(a),h]); }
      for (let i=0;i<n;i++) { const a=2*Math.PI*i/n; vertices.push([Math.cos(a),Math.sin(a),-h]); }
      for (let r=0;r<n;r++) {
        addFace([a(r),b(r+q),a(r+p),b(r+p-q)]);
        addFace([b(r),a(r+q),b(r+p),a(r+p-q)]);
      }
    } else {
      for (let i=0;i<2*n;i++) { const a=Math.PI*i/n; vertices.push([Math.cos(a),Math.sin(a),i%2?h:-h]); }
      for (let r=0;r<n;r++) {
        addFace([2*r,2*r+q,2*r+2*p,2*r+2*p-q]);
        addFace([2*r+1,2*r+1-q,2*r+1-2*p,2*r+1-2*p+q]);
      }
    }
    return normalise({ vertices, faces });
  }

  function validWindings() {
    const n = +$('sides').value, kind = $('stephanoid-kind').value, values = [];
    const gcd = (a,b) => b ? gcd(b,a%b) : a;
    for (let p=1;p<n;p++) for (let q=1;q<p;q++) {
      if (gcd(gcd(n,p),q) !== 1) continue;
      if (kind === 'PC' && 2*p-n < 2*q && 2*q < p) values.push([p,q]);
      if (kind === 'AC' && q%2===1 && 2*p-n < q && q < p) values.push([p,q]);
    }
    return values;
  }

  function updateWindings() {
    const select = $('winding'), previous = select.value;
    const options = validWindings();
    select.replaceChildren(...options.map(([p,q]) => {
      const option=document.createElement('option');
      option.value=`${p},${q}`; option.textContent=`p = ${p}, q = ${q}`;
      return option;
    }));
    if (options.some(pair => pair.join(',')===previous)) select.value=previous;
  }

  function familyMeta() {
    if (state.family === 'disphenoid') return { name: 'Disphenoid', symmetry: 'Dihedral', p: 3, q: 3, vertices: 4, edges: 6, faces: 4 };
    const n = +$('sides').value;
    const kind = $('stephanoid-kind').value;
    const [p,q] = $('winding').value.split(',');
    return { name: `${kind}(${n}, ${p}, ${q})`, symmetry: `${n}-fold ${kind==='PC'?'prismatic':'antiprismatic'}`, p: 4, q: 4, vertices: 2*n, edges: 4*n, faces: 2*n };
  }

  function updateFamily() {
    state.geometry = state.family === 'disphenoid' ? disphenoid() : stephanoid();
    state.faceColours = faceColouring(state.geometry);
    const meta = familyMeta();
    state.current = meta;
    $('sides-row').hidden = state.family !== 'stephanoid';
    $('stephanoid-controls').hidden = state.family !== 'stephanoid';
    $('shape-row').hidden = state.family === 'stephanoid';
    $('sides-output').value = $('sides').value;
    $('height-output').value = (+$('height').value / 100).toFixed(2);
    $('shape-output').value = (+$('shape').value / 100).toFixed(2);
    updateDetails(meta, true);
    updateFaceControls();
    $('loading').hidden = true;
    invalidate();
  }

  function updateDetails(meta, family = false) {
    $('kind').textContent = family ? 'Infinite family' : 'Exceptional form';
    $('model-name').textContent = meta.name;
    $('plain-name').textContent = family ? (state.family === 'disphenoid' ? 'A tetrahedron with congruent faces' : 'A self-intersecting crown polyhedron') : (specialNames[meta.name] || `${labels[meta.symmetry]} orbit`);
    $('paper-symbol').textContent = family ? 'Infinite family' : meta.name;
    $('schlafli').textContent = `{${meta.p}, ${Number.isInteger(meta.q) ? meta.q : meta.q.toFixed(2)}}`;
    $('vertices').textContent = meta.vertices;
    $('edges').textContent = meta.edges;
    $('faces').textContent = meta.faces;
    $('symmetry').textContent = family ? meta.symmetry : `${labels[meta.symmetry]} (${meta.paperSymmetry})`;
    $('dual-row').hidden = family;
    $('dual').textContent = family ? '' : meta.dual;
    $('paper-name').hidden = family;
    $('paper-name-explanation').textContent = family ? '' : paperNameExplanation(meta);
    $('explanation').textContent = family
      ? (state.family === 'disphenoid' ? 'Its four faces are congruent triangles. Half-turns exchange every vertex and every face.' : 'Rotations and reflections exchange every vertex and every quadrilateral face around the crown.')
      : 'Its symmetry group acts transitively on its vertices and on its faces. Some faces and edges cross in space.';
    document.title = `${meta.name} · Noble polyhedra`;
  }

  async function selectModel(meta, button, reset = false) {
    state.family = null;
    state.current = meta;
    $('loading').hidden = false;
    document.querySelectorAll('.model-button').forEach(el => el.classList.toggle('active', el === button));
    try {
      if (meta.geometry) {
        state.geometry = normalise({
          vertices: meta.geometry.vertices.map(vertex => [...vertex]),
          faces: meta.geometry.faces
        });
      } else {
        const response = await fetch(meta.file);
        if (!response.ok) throw new Error(`Model returned ${response.status}`);
        state.geometry = parseOff(await response.text());
      }
      state.faceColours = faceColouring(state.geometry);
      updateDetails(meta);
      state.selectedFace = Math.min(state.selectedFace, state.geometry.faces.length - 1);
      state.selectedVertex = Math.min(state.selectedVertex, state.geometry.vertices.length - 1);
      updateFaceControls();
      location.hash = encodeURIComponent(meta.name);
      if (reset) resetView();
      invalidate();
    } catch (error) {
      $('loading').textContent = 'The model could not be loaded.';
      console.error(error);
      return;
    }
    $('loading').hidden = true;
  }

  function modelRows() {
    const query = $('search').value.trim().toLowerCase();
    return window.NOBLE_MODELS.filter(model => (state.filter === 'all' || model.symmetry === state.filter) && model.name.toLowerCase().includes(query));
  }

  function renderList() {
    const list = $('model-list');
    const models = modelRows();
    list.replaceChildren();
    if (!models.length) {
      const empty = document.createElement('p');
      empty.className = 'empty'; empty.textContent = 'No symbols match this search.'; list.append(empty); return;
    }
    for (const meta of models) {
      const button = document.createElement('button');
      button.className = 'model-button'; button.type = 'button'; button.role = 'option';
      button.innerHTML = `<strong>${meta.name}</strong><span class="type">{${meta.p}, ${meta.q}}</span><small>${meta.vertices} vertices · ${meta.faces} faces</small>`;
      button.addEventListener('click', () => selectModel(meta, button, true));
      if (state.current && state.current.name === meta.name && !state.family) button.classList.add('active');
      list.append(button);
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(button => { const on = button.dataset.tab === tab; button.classList.toggle('active', on); button.setAttribute('aria-selected', on); });
    const families = tab === 'families';
    $('model-list').hidden = families; $('family-list').hidden = !families; $('search-wrap').hidden = families; $('filters').hidden = families;
    $('family-parameters').hidden = !families;
    if (families) {
      state.family = document.querySelector('.family-card.active').dataset.family;
      updateFamily(); location.hash = state.family;
    } else {
      const model = state.current && state.current.file ? state.current : defaultModel();
      renderList();
      const button = [...document.querySelectorAll('.model-button')].find(el => el.querySelector('strong').textContent === model.name);
      selectModel(model, button, false);
    }
  }

  function rotate(v) {
    const cy = Math.cos(state.ry), sy = Math.sin(state.ry), cx = Math.cos(state.rx), sx = Math.sin(state.rx);
    const x = v[0] * cy + v[2] * sy;
    const z1 = -v[0] * sy + v[2] * cy;
    return [x, v[1] * cx - z1 * sx, v[1] * sx + z1 * cx];
  }

  function inverseRotate(v, rotation) {
    const { cy, sy, cx, sx } = rotation;
    const y = v[1] * cx + v[2] * sx;
    const z1 = -v[1] * sx + v[2] * cx;
    return [v[0] * cy - z1 * sy, y, v[0] * sy + z1 * cy];
  }

  function faceNeighbours(index) {
    if (!state.geometry) return new Set();
    const selected = new Set(state.geometry.faces[index]);
    const found = new Set([index]);
    state.geometry.faces.forEach((face, i) => {
      let shared = 0;
      for (const vertex of face) if (selected.has(vertex)) shared++;
      if (shared >= 2) found.add(i);
    });
    return found;
  }

  function faceColouring(geometry) {
    const neighbours = geometry.faces.map(() => new Set());
    const edges = new Map();
    geometry.faces.forEach((face, faceIndex) => {
      face.forEach((vertex, index) => {
        const next = face[(index + 1) % face.length];
        const edge = vertex < next ? `${vertex}:${next}` : `${next}:${vertex}`;
        if (!edges.has(edge)) edges.set(edge, []);
        edges.get(edge).push(faceIndex);
      });
    });
    for (const faces of edges.values()) for (const face of faces) for (const other of faces) if (face !== other) neighbours[face].add(other);
    const colours = Array(geometry.faces.length).fill(-1);
    const order = [...geometry.faces.keys()].sort((a, b) => neighbours[b].size - neighbours[a].size || a - b);
    for (const face of order) {
      const unavailable = new Set([...neighbours[face]].map(other => colours[other]));
      let colour = 0; while (unavailable.has(colour)) colour++;
      colours[face] = colour;
    }
    return colours;
  }

  function vertexFaces(index) {
    const found = new Set();
    if (!state.geometry) return found;
    state.geometry.faces.forEach((face, i) => { if (face.includes(index)) found.add(i); });
    return found;
  }

  function selectingVertex() { return state.view === 'wire-vertex'; }

  function updateFaceControls() {
    if (!state.geometry) return;
    const vertexMode = selectingVertex();
    const count = vertexMode ? state.geometry.vertices.length : state.geometry.faces.length;
    const key = vertexMode ? 'selectedVertex' : 'selectedFace';
    state[key] = (state[key] % count + count) % count;
    $('face-picker').max = count;
    $('face-picker').value = state[key] + 1;
    $('face-output').value = `${state[key] + 1} / ${count}`;
    $('selection-label').textContent = vertexMode ? 'Vertex' : 'Face';
    $('previous-face').ariaLabel = `Previous ${vertexMode ? 'vertex' : 'face'}`;
    $('next-face').ariaLabel = `Next ${vertexMode ? 'vertex' : 'face'}`;
    $('selection-toggle').textContent = state.faceSelected ? 'On' : 'Off';
    $('selection-toggle').setAttribute('aria-pressed', state.faceSelected);
    const dependent = [$('previous-face'), $('face-picker'), $('next-face')];
    dependent.forEach(control => control.disabled = !state.faceSelected);
    $('face-picker').closest('label').classList.toggle('disabled', !state.faceSelected);
    document.querySelectorAll('[data-needs-selection]').forEach(button => button.disabled = !state.faceSelected);
  }

  function setSelection(active) {
    state.faceSelected = active;
    if (!active && document.querySelector(`[data-view="${state.view}"]`)?.hasAttribute('data-needs-selection')) setView('solid');
    else updateFaceControls();
    invalidate();
  }

  function selectFace(index) {
    state.selectedFace = index;
    state.faceSelected = true;
    updateFaceControls();
    invalidate();
  }

  function selectTarget(index) {
    if (selectingVertex()) state.selectedVertex = index;
    else state.selectedFace = index;
    state.faceSelected = true;
    updateFaceControls();
    invalidate();
  }

  function updateMotionControls() {
    document.querySelectorAll('[data-spin]').forEach(button => {
      const active = (button.dataset.spin === 'true') === state.spin;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
  }

  function setSpin(spin) { state.spin = spin; updateMotionControls(); invalidate(); }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
    updateFaceControls();
    invalidate();
  }

  function setPalette(palette) {
    state.palette = palette;
    document.querySelectorAll('[data-palette]').forEach(button => {
      const active = button.dataset.palette === palette;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
    invalidate();
  }

  function setLighting(lighting) {
    state.lighting = lighting;
    document.querySelectorAll('[data-lighting]').forEach(button => {
      const active = button.dataset.lighting === lighting;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
    invalidate();
  }

  function setTexture(texture) {
    state.texture = texture;
    document.querySelectorAll('[data-texture]').forEach(button => {
      const active = button.dataset.texture === texture;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
    invalidate();
  }

  function updateAutoQualityLabel() {
    const button = document.querySelector('[data-quality="auto"]');
    const percentage = Math.round(state.adaptiveScale * 100);
    button.title = `Automatically adjusted rendering resolution: ${percentage}%`;
    button.setAttribute('aria-label', `Auto rendering quality, currently ${percentage}%`);
  }

  function setQuality(quality) {
    state.quality = quality;
    if (quality === 'auto') state.adaptiveScale = 1;
    document.querySelectorAll('[data-quality]').forEach(button => {
      const active = button.dataset.quality === quality;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
    updateAutoQualityLabel();
    invalidate();
  }

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i=0, j=points.length-1; i<points.length; j=i++) {
      const a=points[i], b=points[j];
      if (((a[1]>y)!==(b[1]>y)) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const hue = (p, q, t) => { if (t<0)t++; if(t>1)t--; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
    if (!s) return [l*255,l*255,l*255];
    const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q;
    return [hue(p,q,h+1/3)*255,hue(p,q,h)*255,hue(p,q,h-1/3)*255];
  }

  function colourFor(face, highlighted, depth) {
    if (highlighted) return [243, 185, 95];
    const colour = state.faceColours[face.i] || 0;
    const hues = {
      prism: [174, 194, 218, 246, 274, 302, 154, 326],
      mineral: [8, 29, 48, 78, 142, 204, 278, 336],
      aurora: [174, 208, 246, 282, 320, 84, 132, 24],
      orbit: [350, 28, 52, 92, 150, 190, 220, 258, 292, 320]
    };
    if (state.palette === 'mono') {
      const light = 52 + (colour * 17 % 34) + depth * 22;
      return [light * .55, light * .8, light];
    }
    const hue = hues[state.palette][colour % hues[state.palette].length];
    const variation = Math.floor(colour / hues[state.palette].length) * 8;
    if (state.palette === 'prism') return hslToRgb(hue, 68 + depth * 18, 36 + depth * 23 + variation);
    if (state.palette === 'mineral') return hslToRgb(hue, 48 + colour % 3 * 10, 39 + depth * 22 + variation);
    if (state.palette === 'aurora') return hslToRgb(hue, 72 + colour % 3 * 8, 42 + depth * 22 + variation);
    return hslToRgb(hue, 74 + colour % 3 * 7, 43 + depth * 20 + variation);
  }

  function lightingFor(face, depth) {
    if (state.lighting === 'flat') return 1;
    if (state.lighting === 'depth') return .58 + depth * .55;
    const plane = facePlane(face.points3);
    if (!plane) return 1;
    const length = Math.hypot(...plane.n) || 1;
    const normal = plane.n.map(value => value / length);
    const dot = direction => Math.abs(normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2]);
    if (state.lighting === 'diffuse') {
      return .55 + .28 * dot([.16, .76, .63]) + .17 * dot([-.72, .22, .66]);
    }
    const centre = face.points3.reduce((sum, point) => [sum[0] + point[0] / face.points3.length, sum[1] + point[1] / face.points3.length, sum[2] + point[2] / face.points3.length], [0, 0, 0]);
    const direction = [-1.4 - centre[0], 1.8 - centre[1], 3.2 - centre[2]];
    const directionLength = Math.hypot(...direction) || 1;
    const incidence = dot(direction.map(value => value / directionLength));
    const distance = Math.hypot(...direction);
    return .26 + .96 * Math.pow(incidence, 1.45) * Math.min(1, 4 / distance);
  }

  function faceStyle(face, neighbours, incident) {
    const selected = state.faceSelected && face.i === state.selectedFace;
    const highlighted = state.view === 'wire-vertex' ? state.faceSelected && incident.has(face.i) : selected;
    const relevant = state.view === 'face' || state.view === 'wire-face' ? selected : state.view === 'neighbours' ? state.faceSelected && neighbours.has(face.i) : state.view === 'wire-vertex' ? highlighted : true;
    let alpha = state.opacity;
    if (state.view === 'glass') alpha *= .24;
    if (state.view === 'xray') alpha *= selected ? .72 : .07;
    if (state.view === 'face' && !relevant) alpha = 0;
    if (state.view === 'neighbours' && !relevant) alpha = .035;
    if (state.view === 'wire') alpha = 0;
    if (state.view === 'wire-face' || state.view === 'wire-vertex') alpha = relevant ? alpha * .72 : 0;
    const depth = (face.z + 1) / 2;
    const light = lightingFor(face, depth);
    const colour = colourFor(face, highlighted, depth).map(value => Math.max(0, Math.min(255, value * light)));
    return { selected, highlighted, relevant, alpha, colour };
  }

  function facePlane(points) {
    const a = points[0];
    for (let i=1;i<points.length-1;i++) {
      const b=points[i], c=points[i+1];
      const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if (Math.hypot(...n)>1e-9) return { a, n };
    }
    return null;
  }

  function textureFor(point, owner) {
    if (state.texture === 'clean') return 1;
    const hash = value => {
      const result = Math.sin(value) * 43758.5453123;
      return result - Math.floor(result);
    };
    const grain = hash(Math.floor(point[0] * 190) * 12.9898 + Math.floor(point[1] * 190) * 78.233 + Math.floor(point[2] * 190) * 37.719 + owner * 19.19);
    if (state.texture === 'grain') return .95 + grain * .1;
    if (state.texture === 'paper') {
      const fibres = Math.sin((point[0] + point[2] * .42) * 78 + owner * .7) * .018 + Math.sin((point[1] - point[2] * .28) * 23) * .014;
      return .975 + grain * .05 + fibres;
    }
    const bands = Math.sin((point[0] + point[1] * .62 + point[2] * .31) * 31 + owner * .17);
    return .98 + bands * .055 + (grain - .5) * .018;
  }

  function rasteriseFaces(faces, rect, size, centreX, centreY) {
    const visible = faces.filter(face => face.style.alpha > 0 && !(state.clip > 0 && face.z < -1 + state.clip*2));
    if (!visible.length) { state.hitRaster = null; return; }
    const translucent = visible.some(face => face.style.alpha < .995);
    const textured = state.texture !== 'clean';
    const baseMaxDimension = textured
      ? (faces.length > 90 ? 600 : faces.length > 40 ? 760 : 900)
      : translucent ? (faces.length > 90 ? 440 : faces.length > 40 ? 560 : 760) : (faces.length > 90 ? 900 : 1080);
    const qualityScale = state.quality === 'performance' ? .58 : state.quality === 'auto' ? state.adaptiveScale : 1;
    const maxDimension = Math.max(260, Math.round(baseMaxDimension * qualityScale));
    const scale = Math.min(1, maxDimension / Math.max(rect.width, rect.height));
    const width = Math.max(1,Math.round(rect.width*scale)), height = Math.max(1,Math.round(rect.height*scale));
    let layers = translucent ? (faces.length > 90 ? 4 : faces.length > 40 ? 5 : 6) : 1;
    if (translucent && state.quality === 'performance') layers = Math.max(2, layers - 2);
    if (translucent && state.quality === 'auto' && state.adaptiveScale < .9) layers = Math.max(2, layers - (state.adaptiveScale < .68 ? 2 : 1));
    const depths = new Float32Array(width*height*layers); depths.fill(-Infinity);
    const owners = new Int16Array(width*height*layers); owners.fill(-1);

    for (const face of visible) {
      const plane = facePlane(face.points3); if (!plane) continue;
      const points = face.points.map(point => [point[0]*scale,point[1]*scale]);
      const minY=Math.max(0,Math.ceil(Math.min(...points.map(p=>p[1]))-.5));
      const maxY=Math.min(height-1,Math.floor(Math.max(...points.map(p=>p[1]))-.5));
      for (let y=minY;y<=maxY;y++) {
        const scanY=y+.5, crossings=[];
        for (let i=0,j=points.length-1;i<points.length;j=i++) {
          const a=points[i],b=points[j];
          if ((a[1]>scanY)!==(b[1]>scanY)) crossings.push(a[0]+(scanY-a[1])*(b[0]-a[0])/(b[1]-a[1]));
        }
        crossings.sort((a,b)=>a-b);
        for (let pair=0;pair+1<crossings.length;pair+=2) {
          const minX=Math.max(0,Math.ceil(crossings[pair]-.5)), maxX=Math.min(width-1,Math.floor(crossings[pair+1]-.5));
          for (let x=minX;x<=maxX;x++) {
            const screenX=(x+.5)/scale, screenY=(y+.5)/scale;
            const px=(screenX-centreX)/size, py=-(screenY-centreY)/size;
            let z;
            if (state.orthographic) {
              if (Math.abs(plane.n[2])<1e-10) continue;
              z=plane.a[2]-(plane.n[0]*(px-plane.a[0])+plane.n[1]*(py-plane.a[1]))/plane.n[2];
            } else {
              const denominator=plane.n[0]*px+plane.n[1]*py-plane.n[2]*3.8;
              if (Math.abs(denominator)<1e-10) continue;
              const numerator=plane.n[0]*plane.a[0]+plane.n[1]*plane.a[1]+plane.n[2]*(plane.a[2]-4.2);
              z=4.2-3.8*numerator/denominator;
            }
            const base=(y*width+x)*layers;
            for (let layer=0;layer<layers;layer++) {
              const offset = base + layer;
              if (Math.abs(z - depths[offset]) <= 1e-5) {
                if (face.i < owners[offset]) owners[offset] = face.i;
                break;
              }
              if (z > depths[offset] + 1e-5) {
                for (let move=layers-1;move>layer;move--) { depths[base+move]=depths[base+move-1]; owners[base+move]=owners[base+move-1]; }
                depths[offset]=z; owners[offset]=face.i; break;
              }
            }
          }
        }
      }
    }

    const image=rasterContext.createImageData(width,height), data=image.data;
    const styles=new Map(faces.map(face=>[face.i,face.style]));
    const inverseRotation = { cy: Math.cos(state.ry), sy: Math.sin(state.ry), cx: Math.cos(state.rx), sx: Math.sin(state.rx) };
    for (let pixel=0;pixel<width*height;pixel++) {
      let pr=0,pg=0,pb=0,pa=0;
      let px, py;
      if (textured) {
        const rasterX = pixel % width, rasterY = Math.floor(pixel / width);
        const screenX = (rasterX + .5) / scale, screenY = (rasterY + .5) / scale;
        px = (screenX - centreX) / size; py = -(screenY - centreY) / size;
      }
      for (let layer=layers-1;layer>=0;layer--) {
        const offset = pixel * layers + layer;
        const owner=owners[offset]; if(owner<0)continue;
        const style=styles.get(owner), alpha=style.alpha, z=depths[offset];
        const perspective = state.orthographic ? 1 : 3.8 / (4.2 - z);
        const texture = textured ? textureFor(inverseRotate([px / perspective, py / perspective, z], inverseRotation), owner) : 1;
        pr=style.colour[0]*texture*alpha+pr*(1-alpha); pg=style.colour[1]*texture*alpha+pg*(1-alpha); pb=style.colour[2]*texture*alpha+pb*(1-alpha); pa=alpha+pa*(1-alpha);
      }
      const out=pixel*4;
      if(pa>0){data[out]=pr/pa;data[out+1]=pg/pa;data[out+2]=pb/pa;data[out+3]=pa*255;}
    }
    if(rasterCanvas.width!==width||rasterCanvas.height!==height){rasterCanvas.width=width;rasterCanvas.height=height;}
    rasterContext.putImageData(image,0,0);
    ctx.imageSmoothingEnabled=true; ctx.drawImage(rasterCanvas,0,0,width,height,0,0,rect.width,rect.height);
    state.hitRaster={owners,width,height,layers,scale};
  }

  function draw(time) {
    state.frameRequested = 0;
    if (!state.dirty && !state.spin) return;
    state.dirty = false;
    if (state.lastTime && state.spin) {
      const elapsed = time - state.lastTime;
      if (elapsed > 0 && elapsed < 250) state.frameTime = state.frameTime * .9 + elapsed * .1;
      if (state.quality === 'auto' && time - state.lastQualityCheck > 800) {
        const previous = state.adaptiveScale;
        if (state.frameTime > 34) state.adaptiveScale = Math.max(.48, state.adaptiveScale - .1);
        else if (state.frameTime < 20) state.adaptiveScale = Math.min(1, state.adaptiveScale + .04);
        if (state.adaptiveScale !== previous) updateAutoQualityLabel();
        state.lastQualityCheck = time;
      }
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min((devicePixelRatio || 1) * 1.5, 3);
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    if (state.spin && !state.dragging && state.geometry) state.ry += Math.min(40, time - state.lastTime) * .00016;
    state.lastTime = time;
    if (state.geometry) {
      const size = Math.min(rect.width, rect.height) * .34 * state.zoom;
      const centreX = rect.width / 2, centreY = rect.height / 2;
      const rotated = state.geometry.vertices.map(rotate);
      const neighbours = state.view === 'neighbours' ? faceNeighbours(state.selectedFace) : null;
      const incident = state.view === 'wire-vertex' ? vertexFaces(state.selectedVertex) : null;
      const wireHighlight = state.view === 'wire-face' || state.view === 'wire-vertex';
      const faces = state.geometry.faces.map((indices, i) => {
        const centroid = indices.reduce((out,n) => [out[0]+rotated[n][0]/indices.length,out[1]+rotated[n][1]/indices.length,out[2]+rotated[n][2]/indices.length],[0,0,0]);
        const amount = state.explode * .72;
        const points3 = indices.map(n => [rotated[n][0]+centroid[0]*amount,rotated[n][1]+centroid[1]*amount,rotated[n][2]+centroid[2]*amount]);
        const points = points3.map(v => { const perspective = state.orthographic ? 1 : 3.8/(4.2-v[2]); return [centreX+v[0]*size*perspective,centreY-v[1]*size*perspective,v[2]]; });
        return { indices, points, points3, i, z: centroid[2] };
      }).sort((a,b) => a.z - b.z);
      for (const face of faces) face.style=faceStyle(face,neighbours,incident);
      state.hitFaces = [];
      rasteriseFaces(faces,rect,size,centreX,centreY);
      const lightTheme = document.documentElement.dataset.theme === 'light';
      for (const face of faces) {
        if (state.clip > 0 && face.z < -1 + state.clip*2) continue;
        const points = face.points;
        ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.closePath();
        const { highlighted, relevant } = face.style;
        const showEdge = state.view !== 'solid' && (state.view === 'wire' || state.view === 'xray' || wireHighlight || relevant);
        if (showEdge) { ctx.strokeStyle = highlighted ? (lightTheme ? 'rgba(138,82,0,.95)' : 'rgba(255,211,113,.98)') : (lightTheme ? `rgba(45,48,52,${relevant?.7:.24})` : `rgba(224,249,250,${relevant?.78:.3})`); ctx.lineWidth = highlighted ? 2.2 : Math.max(.65, size / 430); ctx.stroke(); }
        state.hitFaces.push({ i: face.i, points, z: face.z });
      }
      state.hitVertices = rotated.map((vertex, i) => {
        const perspective = state.orthographic ? 1 : 3.8/(4.2-vertex[2]);
        return { i, x: centreX+vertex[0]*size*perspective, y: centreY-vertex[1]*size*perspective, z: vertex[2] };
      });
      if (state.view === 'wire-vertex') {
        for (const vertex of state.hitVertices) {
          ctx.beginPath(); ctx.arc(vertex.x, vertex.y, vertex.i === state.selectedVertex ? 5.5 : 2.2, 0, Math.PI*2);
          ctx.fillStyle = vertex.i === state.selectedVertex ? (lightTheme ? 'rgba(138,82,0,1)' : 'rgba(255,211,113,1)') : (lightTheme ? 'rgba(45,48,52,.55)' : 'rgba(224,249,250,.55)'); ctx.fill();
        }
      }
    }
    if (state.spin && !document.hidden) state.frameRequested = requestAnimationFrame(draw);
  }

  function resetView() { state.rx = -.42; state.ry = .62; state.zoom = 1; }
  function point(e) { const t = e.touches && e.touches[0]; return [t ? t.clientX : e.clientX, t ? t.clientY : e.clientY]; }
  function distance(touches) { return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY); }
  function useHint() { $('gesture-hint').classList.add('used'); }
  canvas.addEventListener('pointerdown', e => { state.dragging = true; state.moved = false; [state.lastX,state.lastY] = point(e); canvas.setPointerCapture(e.pointerId); useHint(); });
  canvas.addEventListener('pointermove', e => { if (!state.dragging) return; const [x,y] = point(e); if(Math.abs(x-state.lastX)+Math.abs(y-state.lastY)>2)state.moved=true; state.ry += (x-state.lastX)*.008; state.rx += (y-state.lastY)*.008; state.lastX=x; state.lastY=y; invalidate(); });
  canvas.addEventListener('pointerup', e => { state.dragging = false; if(!state.moved){ const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top; if(selectingVertex()){ const hit=[...state.hitVertices].sort((a,b)=>b.z-a.z).find(vertex=>Math.hypot(vertex.x-x,vertex.y-y)<14); if(hit)selectTarget(hit.i); } else { const raster=state.hitRaster; const px=raster&&Math.floor(x*raster.scale),py=raster&&Math.floor(y*raster.scale); const owner=raster&&px>=0&&py>=0&&px<raster.width&&py<raster.height?raster.owners[(py*raster.width+px)*raster.layers]:-1; if(owner>=0)selectFace(owner); else { const hit=[...state.hitFaces].sort((a,b)=>b.z-a.z).find(face=>pointInPolygon(x,y,face.points)); if(hit)selectFace(hit.i); } } } });
  canvas.addEventListener('pointercancel', () => state.dragging = false);
  canvas.addEventListener('wheel', e => { e.preventDefault(); state.zoom = Math.max(.38, Math.min(2.8, state.zoom * Math.exp(-e.deltaY*.001))); useHint(); invalidate(); }, { passive: false });
  canvas.addEventListener('touchstart', e => { if (e.touches.length === 2) state.pinchDistance = distance(e.touches); }, { passive: true });
  canvas.addEventListener('touchmove', e => { if (e.touches.length !== 2 || !state.pinchDistance) return; const d=distance(e.touches); state.zoom=Math.max(.38,Math.min(2.8,state.zoom*d/state.pinchDistance)); state.pinchDistance=d; invalidate(); }, { passive: true });
  canvas.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') state.ry-=.1; if(e.key==='ArrowRight')state.ry+=.1; if(e.key==='ArrowUp')state.rx-=.1; if(e.key==='ArrowDown')state.rx+=.1; invalidate(); });
  $('zoom-in').onclick = () => state.zoom = Math.min(2.8, state.zoom*1.16);
  $('zoom-out').onclick = () => state.zoom = Math.max(.38, state.zoom/1.16);
  $('reset-view').onclick = resetView;
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => setView(button.dataset.view));
  document.querySelectorAll('[data-spin]').forEach(button => button.onclick = () => setSpin(button.dataset.spin === 'true'));
  document.querySelectorAll('[data-palette]').forEach(button => button.onclick = () => setPalette(button.dataset.palette));
  document.querySelectorAll('[data-lighting]').forEach(button => button.onclick = () => setLighting(button.dataset.lighting));
  document.querySelectorAll('[data-texture]').forEach(button => button.onclick = () => setTexture(button.dataset.texture));
  document.querySelectorAll('[data-quality]').forEach(button => button.onclick = () => setQuality(button.dataset.quality));
  $('selection-toggle').onclick = () => setSelection(!state.faceSelected);
  $('face-picker').oninput = e => selectTarget(+e.target.value-1);
  $('previous-face').onclick = () => selectTarget((selectingVertex() ? state.selectedVertex : state.selectedFace)-1);
  $('next-face').onclick = () => selectTarget((selectingVertex() ? state.selectedVertex : state.selectedFace)+1);
  $('opacity').oninput = e => { state.opacity=+e.target.value/100; $('opacity-output').value=`${e.target.value}%`; };
  $('explode').oninput = e => { state.explode=+e.target.value/100; $('explode-output').value=`${e.target.value}%`; };
  $('clip').oninput = e => { state.clip=+e.target.value/100; $('clip-output').value=`${e.target.value}%`; };
  $('orthographic').onchange = e => state.orthographic=e.target.checked;
  $('search').addEventListener('input', renderList);
  document.querySelectorAll('.filter').forEach(button => button.onclick = () => { state.filter=button.dataset.filter; document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b===button)); renderList(); });
  document.querySelectorAll('.tab').forEach(button => button.onclick = () => switchTab(button.dataset.tab));
  document.querySelectorAll('.family-card').forEach(button => button.onclick = () => { document.querySelectorAll('.family-card').forEach(b=>b.classList.toggle('active',b===button)); state.family=button.dataset.family; updateFamily(); location.hash=state.family; });
  $('sides').addEventListener('input', () => { updateWindings(); updateFamily(); });
  $('stephanoid-kind').addEventListener('change', () => { updateWindings(); updateFamily(); });
  $('winding').addEventListener('change', updateFamily);
  ['height','shape'].forEach(id => $(id).addEventListener('input', updateFamily));
  const requestFullscreen = () => (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)?.call(document.documentElement);
  $('fullscreen').hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  $('fullscreen').onclick = () => { requestFullscreen(); $('fullscreen').blur(); };
  document.addEventListener('keydown', e => { if (e.key.toLowerCase()==='f' && e.target===document.body) requestFullscreen(); if(e.key.toLowerCase()==='r' && e.target===document.body) { resetView(); invalidate(); } });
  document.addEventListener('click', invalidate);
  document.addEventListener('input', invalidate);
  document.addEventListener('change', invalidate);
  window.addEventListener('resize', invalidate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidate(); });

  const requestedView = new URLSearchParams(location.search).get('view');
  if ([...document.querySelectorAll('[data-view]')].some(button => button.dataset.view === requestedView)) setView(requestedView);
  if (new URLSearchParams(location.search).get('selection') === 'off') setSelection(false);
  const requestedPalette = new URLSearchParams(location.search).get('palette');
  if ([...document.querySelectorAll('[data-palette]')].some(button => button.dataset.palette === requestedPalette)) setPalette(requestedPalette);
  const requestedLighting = new URLSearchParams(location.search).get('lighting');
  if ([...document.querySelectorAll('[data-lighting]')].some(button => button.dataset.lighting === requestedLighting)) setLighting(requestedLighting);
  const requestedTexture = new URLSearchParams(location.search).get('texture');
  if ([...document.querySelectorAll('[data-texture]')].some(button => button.dataset.texture === requestedTexture)) setTexture(requestedTexture);
  const requestedQuality = new URLSearchParams(location.search).get('quality');
  if ([...document.querySelectorAll('[data-quality]')].some(button => button.dataset.quality === requestedQuality)) setQuality(requestedQuality);
  const requestedOpacity = +new URLSearchParams(location.search).get('opacity');
  if (requestedOpacity >= 4 && requestedOpacity <= 100) {
    state.opacity = requestedOpacity / 100;
    $('opacity').value = requestedOpacity;
    $('opacity-output').value = `${requestedOpacity}%`;
  }
  updateWindings();
  const requested = decodeURIComponent(location.hash.slice(1));
  if (requested === 'disphenoid' || requested === 'stephanoid') {
    document.querySelectorAll('.family-card').forEach(button => button.classList.toggle('active', button.dataset.family===requested));
    switchTab('families');
  } else {
    const initial = window.NOBLE_MODELS.find(model => model.name===requested) || defaultModel();
    state.current = initial; renderList();
    const button = [...document.querySelectorAll('.model-button')].find(el=>el.querySelector('strong').textContent===initial.name);
    selectModel(initial, button, false);
  }
  updateAutoQualityLabel();
  invalidate();
})();
