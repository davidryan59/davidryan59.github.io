(function exposeModels(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NonRupertModels = api;
}(typeof self !== "undefined" ? self : this, function makeModels() {
  "use strict";

  const DEFINITIONS = {
    // The Noperthedron of Steininger and Yurkevich, arXiv:2508.18475.
    c15: {
      name: "90-vertex C15 solid",
      order: 15,
      hue: 174,
      turn: 0.62,
      generators: [
        [152024884 / 259375205, 0, 210152163 / 259375205],
        [0.6632738028, 0.6106948881, 0.3980949609],
        [0.8193990033, 0.5298215096, 0.1230614493]
      ]
    },
    c11: {
      name: "88-vertex C11 solid",
      order: 11,
      hue: 38,
      turn: 0.77,
      generators: [
        [0.46216927401999314, 0, 0.8867917242238069],
        [0.8073903514907679, 0.26028340170707587, 0.4895982440781035],
        [0.8349899144334889, 0.3966546584642011, 0.22932860156832968],
        [0.9677138509699689, 0.07927551684849105, 0.09931730273340919]
      ]
    }
  };

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function verticesFromOrbit(definition) {
    const vertices = [];
    for (const generator of definition.generators) {
      for (let k = 0; k < definition.order; k += 1) {
        const angle = 2 * Math.PI * k / definition.order;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const point = [
          cos * generator[0] - sin * generator[1],
          sin * generator[0] + cos * generator[1],
          generator[2]
        ];
        vertices.push(point, point.map(value => -value));
      }
    }
    return vertices;
  }

  function orderFacet(vertices, indices, normal) {
    const centre = [0, 0, 0];
    for (const index of indices) {
      for (let axis = 0; axis < 3; axis += 1) centre[axis] += vertices[index][axis];
    }
    for (let axis = 0; axis < 3; axis += 1) centre[axis] /= indices.length;

    let basisU = subtract(vertices[indices[0]], centre);
    const basisLength = Math.sqrt(dot(basisU, basisU));
    basisU = basisU.map(value => value / basisLength);
    const basisV = cross(normal, basisU);
    return [...indices].sort((a, b) => {
      const pointA = subtract(vertices[a], centre);
      const pointB = subtract(vertices[b], centre);
      const angleA = Math.atan2(dot(pointA, basisV), dot(pointA, basisU));
      const angleB = Math.atan2(dot(pointB, basisV), dot(pointB, basisU));
      return angleA - angleB;
    });
  }

  function convexHullFacets(vertices, epsilon = 1e-10) {
    const facets = new Map();
    const count = vertices.length;

    for (let i = 0; i < count - 2; i += 1) {
      for (let j = i + 1; j < count - 1; j += 1) {
        for (let k = j + 1; k < count; k += 1) {
          let normal = cross(
            subtract(vertices[j], vertices[i]),
            subtract(vertices[k], vertices[i])
          );
          const normalLength = Math.sqrt(dot(normal, normal));
          if (normalLength < epsilon) continue;
          normal = normal.map(value => value / normalLength);

          let side = 0;
          let supporting = true;
          for (let m = 0; m < count; m += 1) {
            if (m === i || m === j || m === k) continue;
            const distance = dot(normal, subtract(vertices[m], vertices[i]));
            if (Math.abs(distance) <= epsilon) continue;
            const nextSide = Math.sign(distance);
            if (side && nextSide !== side) {
              supporting = false;
              break;
            }
            side = nextSide;
          }

          if (!supporting || !side) continue;
          if (side > 0) normal = normal.map(value => -value);

          const coplanar = [];
          for (let m = 0; m < count; m += 1) {
            if (Math.abs(dot(normal, subtract(vertices[m], vertices[i]))) <= epsilon) {
              coplanar.push(m);
            }
          }
          const key = coplanar.join(",");
          if (!facets.has(key)) facets.set(key, orderFacet(vertices, coplanar, normal));
        }
      }
    }
    return [...facets.values()];
  }

  function triangulateFacets(facets) {
    const triangles = [];
    for (const facet of facets) {
      for (let i = 1; i < facet.length - 1; i += 1) {
        triangles.push([facet[0], facet[i], facet[i + 1]]);
      }
    }
    return triangles;
  }

  function buildModel(key) {
    const definition = DEFINITIONS[key];
    if (!definition) throw new Error(`Unknown model: ${key}`);
    const vertices = verticesFromOrbit(definition);
    const facets = convexHullFacets(vertices);
    return {
      key,
      name: definition.name,
      hue: definition.hue,
      turn: definition.turn,
      order: definition.order,
      vertices,
      facets,
      triangles: triangulateFacets(facets)
    };
  }

  return {
    DEFINITIONS,
    buildModel,
    convexHullFacets,
    cross,
    dot,
    subtract,
    triangulateFacets,
    verticesFromOrbit
  };
}));
