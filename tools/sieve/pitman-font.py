"""Builds app/sieve/pitman.woff: a font with two glyphs, Pitman's dozenal
digits for ten and eleven, U+218A and U+218B. Few fonts carry them, and none
that ships with macOS, so a text box on the sieve page would show an empty
box. Each glyph here is DejaVu Sans Mono's 2 or 3 turned upside down about
its own centre, which is how Unicode draws the pair.

Run from anywhere: python3 tools/sieve/pitman-font.py [DejaVuSansMono.ttf]

It needs fontTools. Without an argument it takes DejaVu Sans Mono from
matplotlib, which ships it. The page asks for the font only for these two
characters, through unicode-range. The grid, the status line and the prime
buttons draw the turned digits themselves, in their own fonts; the font is
for the text boxes, where the page cannot do that.

DejaVu's changes to Bitstream Vera are in the public domain. The Vera licence
allows a changed font under a new name that contains neither "Bitstream" nor
"Vera". The font keeps both notices in its name table.
"""
import os
import sys

from fontTools import subset
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'app', 'sieve', 'pitman.woff')
FAMILY = 'Sieve Pitman Digits'
TURNED = ((0x218A, '2'), (0x218B, '3'))


def source():
    if len(sys.argv) > 1:
        return sys.argv[1]
    import matplotlib
    return os.path.join(os.path.dirname(matplotlib.__file__), 'mpl-data', 'fonts', 'ttf', 'DejaVuSansMono.ttf')


font = TTFont(source())
glyf, hmtx, cmap = font['glyf'], font['hmtx'], font.getBestCmap()
glyphs = font.getGlyphSet()

# Each new glyph is its digit turned half a turn about the centre of the
# digit's box, so it keeps the digit's place and advance. Adding a glyph to
# glyf also adds its name to the font's glyph order.
for code, digit in TURNED:
    src = cmap[ord(digit)]
    box = glyf[src]
    cx, cy = (box.xMin + box.xMax) / 2, (box.yMin + box.yMax) / 2
    pen = TTGlyphPen(glyphs)
    glyphs[src].draw(TransformPen(pen, (-1, 0, 0, -1, 2 * cx, 2 * cy)))
    name = 'uni%04X' % code
    glyf[name] = pen.glyph()
    hmtx[name] = hmtx[src]
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap[code] = name

options = subset.Options()
options.name_IDs = ['*']
options.name_languages = ['*']
options.name_legacy = True
options.hinting = False
options.layout_features = []
options.flavor = 'woff'
sub = subset.Subsetter(options)
sub.populate(unicodes=[code for code, _ in TURNED])
sub.subset(font)

# A new name, as the Vera licence asks. The copyright and licence records,
# IDs 0, 13 and 14, stay as they are.
for rec in font['name'].names:
    if rec.nameID in (1, 3, 4, 16, 21):
        rec.string = FAMILY
    elif rec.nameID == 6:
        rec.string = FAMILY.replace(' ', '')
    elif rec.nameID in (2, 17, 22):
        rec.string = 'Book'

font.flavor = 'woff'
font.save(OUT)
print(os.path.relpath(OUT, ROOT), os.path.getsize(OUT), 'bytes,', len(font.getGlyphOrder()), 'glyphs')
