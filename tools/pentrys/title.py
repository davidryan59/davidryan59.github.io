"""Writes app/pentrys/title.js: the outlines of the letters of "Pentrys" in
Anton, so the game draws its title without loading a font.

Run: python3 tools/pentrys/title.py Anton-Regular.ttf
Anton-Regular.ttf comes from https://github.com/google/fonts/tree/main/ofl/anton,
under the SIL Open Font License 1.1, which is copied to app/pentrys/anton-OFL.txt.
It needs fontTools (pip install fonttools). The script stops if Anton gains
kerning between these letters, since Draw.logo spaces them by advance alone.
"""
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

WORD = 'Pentrys'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'app', 'pentrys', 'title.js')


def number(v):
    return '%d' % v if v == int(v) else '%.1f' % v


def kerning(font, names):
    """The kerning between each neighbouring pair of letters, from GPOS pair lookups."""
    found = {}
    if 'GPOS' not in font:
        return found
    for lookup in font['GPOS'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, 'LookupType', lookup.LookupType) != 2:
                continue
            cover = st.Coverage.glyphs
            for a, b in zip(WORD, WORD[1:]):
                if names[a] not in cover:
                    continue
                value = None
                if st.Format == 1:
                    for rec in st.PairSet[cover.index(names[a])].PairValueRecord:
                        if rec.SecondGlyph == names[b] and rec.Value1 is not None:
                            value = getattr(rec.Value1, 'XAdvance', 0)
                else:
                    c1 = st.ClassDef1.classDefs.get(names[a], 0)
                    c2 = st.ClassDef2.classDefs.get(names[b], 0)
                    rec = st.Class1Record[c1].Class2Record[c2]
                    if rec.Value1 is not None:
                        value = getattr(rec.Value1, 'XAdvance', 0)
                if value:
                    found[a + b] = found.get(a + b, 0) + value
    return found


def main(path):
    font = TTFont(path)
    upm, cmap, glyphs, hmtx = font['head'].unitsPerEm, font.getBestCmap(), font.getGlyphSet(), font['hmtx']
    names = {ch: cmap[ord(ch)] for ch in WORD}
    kern = kerning(font, names)
    if kern:
        sys.exit('Anton now kerns %s: Draw.logo would need to space the letters by it.' % kern)
    rows = []
    for ch in WORD:
        svg = SVGPathPen(glyphs, ntos=number)
        glyphs[names[ch]].draw(TransformPen(svg, (1, 0, 0, -1, 0, 0)))   # y down, baseline at 0
        bounds = BoundsPen(glyphs)
        glyphs[names[ch]].draw(bounds)
        rows.append("      %s: { adv: %d, top: %d, bottom: %d,\n        d: '%s' }"
                    % (ch, hmtx[names[ch]][0], bounds.bounds[3], -bounds.bounds[1], svg.getCommands()))
    with open(OUT, 'w') as f:
        f.write(TEMPLATE % (upm, upm, ',\n'.join(rows)))
    print('wrote %s' % os.path.relpath(OUT))


TEMPLATE = """/* The title's letters: "Pentrys" in Anton, as outlines, so the game draws its
   title without loading a font. Draw.logo in draw.js lays them out.

   Anton is Copyright 2020 The Anton Project Authors
   (https://github.com/googlefonts/AntonFont.git). These outlines are taken
   from Anton-Regular.ttf by tools/pentrys/title.py and are licensed under the
   SIL Open Font License 1.1, in anton-OFL.txt beside this file.

   Each outline is in font units, %d to the em, y down, with its baseline at 0
   and its origin at the left of its advance. adv is the advance width, top the
   height above the baseline and bottom the depth below it. Anton has no
   kerning between these letters, so each starts where the last one's advance
   ends. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});

  Pentrys.Title = {
    UPM: %d,
    GLYPHS: {
%s
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
"""

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
