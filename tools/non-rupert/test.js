"use strict";

const assert = require("node:assert/strict");
const {
  DEFINITIONS,
  buildModel,
  dot,
  subtract
} = require("../../app/non-rupert/models.js");

// SciPy's ConvexHull gives the same counts for both models.
const expectations = {
  c15: { vertices: 90, facets: 152, triangles: 176, cap: 15 },
  c11: { vertices: 88, facets: 156, triangles: 172, cap: 11 }
};

for (const [key, expected] of Object.entries(expectations)) {
  const model = buildModel(key);
  assert.equal(model.vertices.length, expected.vertices, `${key} vertex count`);
  assert.equal(model.facets.length, expected.facets, `${key} facet count`);
  assert.equal(model.triangles.length, expected.triangles, `${key} triangle count`);
  assert.equal(Math.max(...model.facets.map(face => face.length)), expected.cap, `${key} cap size`);

  for (let i = 0; i < model.vertices.length; i += 2) {
    const vertex = model.vertices[i];
    const antipode = model.vertices[i + 1];
    assert.ok(dot(vertex, vertex) > 0.9, `${key} vertices stay near the unit sphere`);
    assert.deepEqual(antipode, vertex.map(value => -value), `${key} antipodal pairs`);
  }

  for (const face of model.facets) {
    const [i, j, k] = face;
    const a = model.vertices[i];
    const b = model.vertices[j];
    const c = model.vertices[k];
    const normal = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    ];
    for (const vertex of model.vertices) {
      assert.ok(dot(normal, subtract(vertex, a)) <= 1e-8, `${key} face points outwards`);
    }
  }

  assert.equal(DEFINITIONS[key].order, Number(key.slice(1)), `${key} rotational order`);
  console.log(`${key}: ${model.vertices.length} vertices, ${model.facets.length} outward faces`);
}

const Shadow = require("../../app/non-rupert/shadow.js");
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

for (const key of Object.keys(DEFINITIONS)) {
  const model = buildModel(key);
  assert.equal(model.central, key !== "tetrahedron", `${key} central symmetry`);
  // A copy in the same view as the hole fills it exactly.
  const same = Shadow.fitPoses(model, IDENTITY, IDENTITY);
  assert.ok(Math.abs(same.scale - 1) < 1e-9, `${key} copy in the same view has pass ratio 1`);
  assert.equal(Shadow.classify(same.scale), "touches", `${key} copy in the same view touches`);
}

for (const key of Object.keys(DEFINITIONS).filter(key => DEFINITIONS[key].passage)) {
  const model = buildModel(key);
  const { passage } = DEFINITIONS[key];
  const hole = Shadow.quaternionRotation(passage.hole);
  const copy = Shadow.quaternionRotation(passage.copy);
  const fit = Shadow.fitPoses(model, hole, copy);
  assert.equal(Shadow.classify(fit.scale), "passes", `${key} passage passes`);

  // Check the fit independently: the turned, shifted shadow lies strictly inside the hole.
  const placed = Shadow.multiply(Shadow.twist(fit.angle), copy);
  const shadow = Shadow.shadow(model.vertices, placed, fit.shift);
  assert.ok(Shadow.protrusion(shadow, fit.planes) < 0, `${key} passage shadow lies inside the hole`);

  // Every slice of the copy on its way through then clears the rim.
  for (let depth = 1; depth >= -1; depth -= 0.01) {
    const slice = Shadow.slice(model, placed, fit.shift, depth);
    assert.ok(Shadow.protrusion(slice, fit.planes) < 0, `${key} slice at ${depth.toFixed(2)} clears the rim`);
  }
  console.log(`${key}: passage with pass ratio ${fit.scale.toFixed(6)}`);
}

// The cube's best passage has pass ratio 3√2/4.
{
  const cube = buildModel("cube");
  const fit = Shadow.fitPoses(cube, Shadow.quaternionRotation(DEFINITIONS.cube.passage.hole), Shadow.quaternionRotation(DEFINITIONS.cube.passage.copy), 360);
  assert.ok(Math.abs(fit.scale - 3 * Math.SQRT2 / 4) < 1e-5, "cube passage matches 3√2/4");
}

// A copy that sticks out jams at a depth where its slice reaches the rim.
{
  const model = buildModel("c15");
  const hole = Shadow.axisRotation([1, 0, 0], 0.3);
  const fit = Shadow.fitPoses(model, hole, Shadow.axisRotation([0, 1, 1], 0.8));
  assert.equal(Shadow.classify(fit.scale), "sticks", "c15 sample pose sticks out");
  const copy = Shadow.multiply(Shadow.twist(fit.angle), Shadow.axisRotation([0, 1, 1], 0.8));
  const contact = Shadow.contact(model, copy, fit.shift, fit.planes);
  assert.ok(Math.abs(Shadow.protrusion(contact.slice, fit.planes)) < 1e-6, "c15 jam slice touches the rim");
  console.log(`c15: sample pose has pass ratio ${fit.scale.toFixed(4)} and jams at depth ${contact.depth.toFixed(3)}`);
}

// A copy dragged in small steps moves in small steps: the twist the app adds
// stays near its last value, where the best twist overall can jump.
for (const key of ["cube", "octahedron", "c15"]) {
  const model = buildModel(key);
  const hole = Shadow.axisRotation([1, 2, 0], 0.7);
  let copy = Shadow.axisRotation([0, 1, 1], 0.8);
  let largest = 0;
  for (let step = 0; step < 200; step += 1) {
    const dragged = Shadow.multiply(Shadow.axisRotation([0, 1, 0], 0.009), copy);
    const fit = Shadow.fitNear(model, hole, dragged);
    const placed = Shadow.multiply(Shadow.twist(fit.angle), dragged);
    largest = Math.max(largest, Math.max(...placed.map((value, i) => Math.abs(value - copy[i]))));
    copy = placed;
  }
  assert.ok(largest < 0.06, `${key} drag moves smoothly (largest step ${largest.toFixed(3)})`);
  console.log(`${key}: largest change in one drag step ${largest.toFixed(3)}`);
}
