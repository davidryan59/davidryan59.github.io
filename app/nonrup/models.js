(function exposeModels(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NonRupertModels = api;
}(typeof self !== "undefined" ? self : this, function makeModels() {
  "use strict";

  const PHI = (1 + Math.sqrt(5)) / 2;

  // Every choice of sign for the nonzero coordinates of each point.
  function allSigns(points) {
    const out = [];
    for (const point of points) {
      let signed = [[]];
      for (const value of point) {
        signed = signed.flatMap(prefix => value === 0
          ? [[...prefix, 0]]
          : [[...prefix, value], [...prefix, -value]]);
      }
      out.push(...signed);
    }
    return out;
  }

  // The three cyclic shifts (x, y, z), (y, z, x) and (z, x, y): the even permutations.
  function cyclic(points) {
    return points.flatMap(([x, y, z]) => [[x, y, z], [y, z, x], [z, x, y]]);
  }

  function unitRadius(points) {
    const radius = Math.max(...points.map(point => Math.hypot(...point)));
    return points.map(point => point.map(value => value / radius));
  }

  function cuboid(a, b, c) {
    return unitRadius(allSigns([[a, b, c]]));
  }

  const DEFINITIONS = {
    tetrahedron: {
      label: "Tetrahedron",
      short: "Tetra",
      kind: "Platonic solid",
      group: "Platonic solids",
      hue: 286,
      turn: 0.4,
      // Views found by tools/non-rupert/find-passages.js, as quaternions.
      passage: {
        hole: [0.262992, -0.156833, 0.873619, 0.378191],
        copy: [-0.098108, 0.867625, -0.189499, -0.449102]
      },
      vertices: unitRadius([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]])
    },
    cube: {
      label: "Cube",
      short: "Cube",
      kind: "Platonic solid",
      group: "Platonic solids",
      hue: 212,
      turn: 0.48,
      passage: {
        hole: [0.387227, -0.128398, 0.903803, -0.129262],
        copy: [0, 0.754982, -0.655745, 0]
      },
      vertices: cuboid(1, 1, 1)
    },
    octahedron: {
      label: "Octahedron",
      short: "Octa",
      kind: "Platonic solid",
      group: "Platonic solids",
      hue: 340,
      turn: 0.3,
      passage: {
        hole: [-0.380951, 0.000805, 0.000337, 0.924595],
        copy: [0.290298, 0.289215, 0.288134, 0.865483]
      },
      vertices: allSigns(cyclic([[1, 0, 0]]))
    },
    dodecahedron: {
      label: "Dodecahedron",
      short: "Dodeca",
      kind: "Platonic solid",
      group: "Platonic solids",
      hue: 24,
      turn: 0.5,
      passage: {
        hole: [0.384158, 0.743061, 0.069871, 0.543508],
        copy: [0.179965, 0.71792, 0.663772, 0.107756]
      },
      vertices: unitRadius(allSigns([[1, 1, 1], ...cyclic([[0, 1 / PHI, PHI]])]))
    },
    icosahedron: {
      label: "Icosahedron",
      short: "Icosa",
      kind: "Platonic solid",
      group: "Platonic solids",
      hue: 196,
      turn: 0.35,
      passage: {
        hole: [0.575266, 0.108548, 0.077084, -0.807059],
        copy: [0.550433, -0.398948, -0.65767, 0.324551]
      },
      vertices: unitRadius(allSigns(cyclic([[0, 1, PHI]])))
    },
    buckyball: {
      label: "Buckyball",
      short: "Buckyball",
      kind: "Truncated icosahedron",
      group: "Archimedean solid",
      hue: 132,
      turn: 0.45,
      passage: {
        hole: [0.093997, 0.957057, 0.192274, -0.195542],
        copy: [0.924637, -0.193002, 0.274854, 0.179586]
      },
      vertices: unitRadius(allSigns(cyclic([
        [0, 1, 3 * PHI],
        [1, 2 + PHI, 2 * PHI],
        [PHI, 2, 2 * PHI + 1]
      ])))
    },
    "box-112": {
      label: "1 × 1 × 2",
      short: "1×1×2",
      kind: "Cuboid",
      group: "Cuboids",
      hue: 48,
      turn: 0.5,
      passage: {
        hole: [0.797177, 0.184091, -0.461636, -0.3428],
        copy: [0.998724, -0.000649, -0.048713, -0.013313]
      },
      vertices: cuboid(1, 1, 2)
    },
    "box-123": {
      label: "1 × 2 × 3",
      short: "1×2×3",
      kind: "Cuboid",
      group: "Cuboids",
      hue: 8,
      turn: 0.5,
      passage: {
        hole: [0.789254, -0.343567, 0.486659, 0.149007],
        copy: [-0.005274, 0.435483, 0.900178, 0.002552]
      },
      vertices: cuboid(1, 2, 3)
    },
    "box-133": {
      label: "1 × 3 × 3",
      short: "1×3×3",
      kind: "Cuboid",
      group: "Cuboids",
      hue: 258,
      turn: 0.5,
      passage: {
        hole: [-0.288233, 0.884284, -0.117435, 0.348098],
        copy: [0, 0.967666, -0.252234, 0]
      },
      vertices: cuboid(1, 3, 3)
    },
    // The Noperthedron of Steininger and Yurkevich, arXiv:2508.18475.
    c15: {
      name: "90-vertex C15 solid",
      label: "C<sub>15</sub>",
      short: "C<sub>15</sub>",
      featured: 4,
      kind: "Noperthedron",
      group: "Odd-cyclic solids",
      order: 15,
      hue: 174,
      turn: 0.62,
      generators: [
        [152024884 / 259375205, 0, 210152163 / 259375205],
        [0.6632738028, 0.6106948881, 0.3980949609],
        [0.8193990033, 0.5298215096, 0.1230614493]
      ]
    },
    rid: {
      // The rhombicosidodecahedron. Hervay's 2026 public certificate says
      // that it is non-Rupert; David Ryan audited it subject to stated assumptions.
      name: "Rhombicosidodecahedron, the 60-vertex solid",
      label: "RID",
      short: "RID",
      featured: 2,
      kind: "Rhombicosidodecahedron",
      group: "Non-Rupert solids",
      hue: 304,
      turn: 0.58,
      vertices: unitRadius(allSigns(cyclic([
        [1, 1, PHI ** 3],
        [PHI ** 2, PHI, 2 * PHI],
        [2 + PHI, 0, PHI ** 2]
      ])))
    },
    stellated: {
      // Zeng's 11/20 stellated tetrahedron, arXiv:2604.26531: a regular
      // tetrahedron with a low pyramid on each face. Renshaw proved it
      // non-Rupert in Lean in 2026, github.com/dwrensha/StellatedTetrahedron.
      name: "Stellated tetrahedron, the 8-vertex solid",
      label: "P<sub>11/20</sub>",
      short: "P<sub>11/20</sub>",
      featured: 1,
      kind: "Stellated tetrahedron",
      group: "Non-Rupert solids",
      hue: 96,
      turn: 0.4,
      vertices: unitRadius([
        [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
        [-11 / 20, 11 / 20, 11 / 20], [11 / 20, -11 / 20, 11 / 20],
        [11 / 20, 11 / 20, -11 / 20], [-11 / 20, -11 / 20, -11 / 20]
      ])
    },
    c11: {
      // The Undecanope: undecim, Latin for eleven, with the Noperthedron's "nope".
      name: "Undecanope, the 88-vertex C11 solid",
      label: "C<sub>11</sub>",
      short: "C<sub>11</sub>",
      featured: 3,
      kind: "Undecanope",
      group: "Odd-cyclic solids",
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

  function edgesOf(facets) {
    const edges = new Map();
    for (const facet of facets) {
      for (let i = 0; i < facet.length; i += 1) {
        const a = facet[i];
        const b = facet[(i + 1) % facet.length];
        edges.set(a < b ? `${a},${b}` : `${b},${a}`, [Math.min(a, b), Math.max(a, b)]);
      }
    }
    return [...edges.values()];
  }

  // A solid is centrally symmetric when every vertex's antipode is a vertex.
  function isCentral(vertices, epsilon = 1e-9) {
    return vertices.every(point => vertices.some(other =>
      Math.abs(point[0] + other[0]) < epsilon &&
      Math.abs(point[1] + other[1]) < epsilon &&
      Math.abs(point[2] + other[2]) < epsilon
    ));
  }

  function buildModel(key) {
    const definition = DEFINITIONS[key];
    if (!definition) throw new Error(`Unknown model: ${key}`);
    const vertices = definition.vertices
      ? definition.vertices.map(point => [...point])
      : verticesFromOrbit(definition);
    const facets = convexHullFacets(vertices);
    return {
      key,
      name: definition.name || definition.label.toLowerCase(),
      label: definition.label,
      short: definition.short || definition.label,
      featured: definition.featured || 0,
      kind: definition.kind,
      hue: definition.hue,
      turn: definition.turn,
      order: definition.order,
      passage: definition.passage || null,
      vertices,
      facets,
      edges: edgesOf(facets),
      central: isCentral(vertices),
      triangles: triangulateFacets(facets)
    };
  }

  return {
    DEFINITIONS,
    buildModel,
    convexHullFacets,
    cross,
    edgesOf,
    dot,
    subtract,
    triangulateFacets,
    verticesFromOrbit
  };
}));
