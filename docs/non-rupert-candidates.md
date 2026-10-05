# Non-Rupert candidates

## Summary

The page compares two rotationally symmetric polyhedra from a numerical search for non-Rupert polyhedra. It renders both models without external libraries.

## Implementation Checklist

- [x] Generate the 78-vertex C13 model from three rotational orbits and their antipodes.
- [x] Generate the 66-vertex C11 model from three rotational orbits and their antipodes.
- [x] Recover each polygonal convex hull in the browser.
- [x] Draw lit faces with the Noble explorer's canvas approach.
- [x] Support automatic rotation, pointer drag, keyboard rotation, zoom and reset.
- [x] Fit both models on the six standard screen sizes.

## Geometry

[`models.js`](../app/non-rupert/models.js) contains the three generators for each model. It applies the cyclic rotation and central inversion to build every vertex.

The search program reported 152 hull triangles for C13 and 128 for C11. Each model has a regular polygon as its top and bottom face. The viewer combines their triangles and displays the true 132-face and 112-face hulls.

The page finds each supporting plane directly. Its test checks both sets of counts and confirms every face points outwards.

The C13 model is the stronger candidate. It has passed a broad numerical audit. The C11 model remains a weaker lead. Neither result is a proof.

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
