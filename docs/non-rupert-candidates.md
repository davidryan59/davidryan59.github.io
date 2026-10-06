# Non-Rupert candidates

## Summary

The page compares two rotationally symmetric polyhedra. The 90-vertex C15 solid is the Noperthedron of Steininger and Yurkevich. The 88-vertex C11 solid comes from a numerical search for smaller relatives of it. The page renders both models without external libraries.

## Implementation Checklist

- [x] Generate the 90-vertex C15 Noperthedron from its three published generators and their antipodes.
- [x] Generate the 88-vertex C11 model from four rotational orbits and their antipodes.
- [x] Recover each polygonal convex hull in the browser.
- [x] Draw lit faces with the Noble explorer's canvas approach.
- [x] Support automatic rotation, pointer drag, keyboard rotation, zoom and reset.
- [x] Fit both models on the six standard screen sizes.

## Geometry

[`models.js`](../app/non-rupert/models.js) contains the generators, colour and starting turn of each model. It applies the cyclic rotation and central inversion to build every vertex. The Noperthedron's generators are the ones published in [arXiv:2508.18475](https://arxiv.org/abs/2508.18475).

Each model has a regular polygon as its top and bottom face. Every other face is a triangle.

| Model | Generators | Vertices | Faces | Hull triangles |
| --- | ---: | ---: | ---: | ---: |
| C15 Noperthedron | 3 | 90 | 152 | 176 |
| C11 | 4 | 88 | 156 | 172 |

The page finds each supporting plane directly. Its test checks these counts, which SciPy's `ConvexHull` also gives, and confirms every face points outwards.

## Controls

Drag a model to turn it. Use a wheel or trackpad to zoom. On a touch screen, drag to turn the model.

The arrow keys turn a focused model. The plus and minus keys zoom it. Each model has pause and reset buttons.

Run the geometry checks with:

```sh
node tools/non-rupert/test.js
```

Run the screen check from a local server with:

```sh
node tools/screen-fit/check.js http://127.0.0.1:8765/app/non-rupert/ .comparison
```
