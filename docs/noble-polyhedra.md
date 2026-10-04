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
- [x] Offer flat, point, diffuse and camera-depth lighting.
- [x] Offer clean, grain, paper and contour face textures.
- [x] Disable face-dependent controls when face selection is off.
- [x] Adapt rendering resolution and translucent layers to frame rate.
- [x] Stop drawing while Static is idle or the page is hidden.
- [x] Select any face by clicking it or moving the face control.
- [x] Isolate one face or show it with its edge-neighbours.
- [x] Overlay one face or every face at one vertex on the complete wireframe.
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
in every palette and the bottom-left Face control can turn selection off.

Lighting and texture are independent. Flat preserves the original unlit
appearance. Point gives a strong local light, Diffuse gives broad soft light,
and Depth brightens surfaces near the camera. Grain, Paper and Contours add
procedural detail that stays attached to the rotating form. Clean keeps plain
colour. No texture image files or network requests are required.

The defaults are Aurora colour, Point lighting, Grain texture and Auto render
quality. Auto measures frame time while the form spins. It reduces the raster
resolution and translucent layer count when the rate falls below 30 frames per
second, then restores detail when there is spare capacity. Performance keeps a
lower resolution and two fewer translucent layers. Quality keeps full detail.
Static renders after a change and then becomes idle. A hidden page also stops
drawing until it becomes visible again.

The depth renderer resolves coplanar faces with a stable face-index tie break.
This prevents temporal shimmer on forms such as D-5, whose triangles occur in
coplanar groups.

The eight view modes form one button strip across the top of the stage. The
bottom-right stack contains Motion, Render, Lighting, Texture and Colour, in
that order. The strips scroll horizontally when a screen is too narrow.

Wire + face draws the complete edge structure behind one selected face. Wire
+ vertex draws the complete edge structure behind every face incident to one
selected vertex. Its slider and step buttons select the vertex. A vertex can
also be selected directly on the model.

Click a visible face to select it. The face control also steps through the
complete face orbit. The viewer keeps the current motion setting when the
selection changes. Opacity, explosion and cutaway controls can be combined
with every view.

The explorer uses the builder page's warm light theme and charcoal dark
theme. Its header includes the standard builder-page link and the shared
theme switch. The builder page shows a lightweight animated I-2 thumbnail
with Aurora colour, point lighting and clean solid faces. That animation
uses per-pixel depth testing so intersecting faces remain stable. It pauses
off-screen and becomes still when the user requests reduced motion.

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
