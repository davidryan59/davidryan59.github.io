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
