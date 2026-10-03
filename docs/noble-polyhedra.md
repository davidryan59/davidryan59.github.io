# Noble polyhedra explorer

## Summary

The explorer shows the two infinite families and all 146 exceptional noble
polyhedra from Connor Hill's 2026 classification. It uses Hill's OFF models
for the exceptional forms. The page generates disphenoids and stephanoids in
the browser.

## Implementation Checklist

- [x] Load all 146 exceptional models from the published model library.
- [x] Generate adjustable disphenoids and exact PC and AC stephanoids.
- [x] Rotate, zoom and select models with a mouse, keyboard or touch screen.
- [x] Search by symbol and filter by symmetry family.
- [x] Show every official paper symbol with its exact symmetry and dual.
- [x] Show solid, glass, X-ray and wire views.
- [x] Offer five colour schemes, with a stable gold selected face.
- [x] Select any face by clicking it or moving the face control.
- [x] Isolate one face or show it with its edge-neighbours.
- [x] Overlay one face or every face at one vertex on the complete wireframe.
- [x] Turn the selected face towards the viewer.
- [x] Adjust opacity, face explosion and cutaway depth.
- [x] Resolve intersecting faces per pixel, including translucent layers.
- [x] Switch between perspective and orthographic projection.
- [ ] Try the explorer on a real phone, an iPad and Safari.

## Model data

The 146 OFF files come from Connor Hill's
[`noble-tools-revised`](https://github.com/Plasmath/noble-tools-revised)
repository. The repository supplies 148 files. Two files, `tI-F` and `rD-F`,
are alternate orbit representations of duals listed among the 146 forms.
The explorer excludes those two alternates.

The source repository uses the GNU General Public License version 3. A copy
of that licence sits at `app/noble/LICENSE-data.txt`. The explorer is also
distributed under GPLv3. Its visible credits page names the author, source,
licence, modifications and complete corresponding source. The rest of the
site remains under its existing terms.

Hill's paper uses CC BY-SA 4.0. The explorer credits and links the paper. It
uses the mathematical results with new text and a new implementation. It
only links the Numberphile video and Wikipedia; it copies no media or text
from either source.

The paper does not assign a descriptive proper name to every exceptional
form. Appendix A assigns a catalogue symbol, exact symmetry and dual to each
one. `tools/noble/paper-catalogue.json` records those 146 entries. The import
script can rebuild it from the paper's `main.tex` source.

`tools/noble/build-models.js` reads every bundled OFF file. It derives each
form's vertex, edge and face counts, then writes the browser catalogue. The
catalogue embeds the geometry so the explorer also works when opened directly
from disk or when a host does not serve `.off` files.

## Views

The whole-form views are Solid, Glass, X-ray and Wire. Solid shows only the
nearest opaque face surface, without hidden edges. The Face view keeps one
face strong and ghosts the others. Face + neighbours also shows every face
that shares an edge with the chosen face.

Palette choices are Prism, Mineral, Aurora, Orbit and Mono. Prism is the
original cool scheme. Mineral uses warm earth tones. Aurora is brighter.
Orbit gives adjacent faces stronger categorical contrast. Mono gives a quieter
blue-grey reading. A graph-colouring pass gives edge-neighbours different
colours. Non-touching faces can reuse a colour. The selected face stays gold
in every palette and the bottom-left On button can turn that selection off.

The view modes form a button strip across the top of the stage. Spin and
Static form a separate motion control. The strip scrolls horizontally when
the screen is too narrow for every button.

Wire + face draws the complete edge structure behind one selected face. Wire
+ vertex draws the complete edge structure behind every face incident to one
selected vertex. Its slider and step buttons select the vertex. A vertex can
also be selected directly on the model.

Click a visible face to select it. The face control also steps through the
complete face orbit. Face-on stops the spin and points that face towards the
viewer. Opacity, explosion and cutaway controls can be combined with every
view.

The fill renderer calculates depth for each pixel rather than assigning one
depth to a complete face. When two faces intersect, each visible portion is
therefore composited in its true front-to-back order. The vector edge pass
remains separate so that wireframes stay crisp.

## Sources

- [The complete set of noble polyhedra](https://arxiv.org/pdf/2607.28711),
  Connor Hill, 2026.
- [Noble polyhedron](https://en.wikipedia.org/wiki/Noble_polyhedron),
  Wikipedia.
- [Stella visual controls](https://www.software3d.com/Manual/Visuals.php?prod=Stella4DPro),
  reviewed when choosing the view controls.
- [Stella views and layouts](https://software3d.com/Manual/Views.php),
  reviewed when choosing the face tools.
