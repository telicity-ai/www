"""The panorama (viewBox units = CSS px at the 864px content width).

A long, still lake across the whole width. From the near shore a path of
four stepping stones goes out over the water, smaller and closer together
as it goes, to a flat rock a little left of centre, where the mouse sits:
the last step. It looks out over open water to the far shore: a pale range
and a green hill side by side on the left, each standing on its own, open
sky over the mouse, a deeper blue massif with two summits, and on the right
a low meadow under the small evening sun. The far shore, the rock and the
stones mirror softly in the water.

Edit here, then run `python3 tools/lake/gen.py`.
"""
from mtn import mountain

VIEWBOX = (0, 26, 864, 236)
TILE = 110          # the weave tile in viewBox units (about 110 CSS px from 60rem, where 1 unit = 1 CSS px)
TILE_TABLET = 180   # the tile site.css switches to at 40-60rem, where the svg is shown at 2/3:
                    # 120 CSS px, the ground's own tile (the 240px PNG lands 1:1 at 2x)
W = 2.1             # outlines (about 2.1 CSS px)
WR = 2.0            # reflection fragments
PREC = 0            # whole-unit coordinates on the big shapes (1 unit = 1 CSS px here)

SHORE = 112         # the foot of the far shore

# The mouse: assets/mark.svg (32.7 x 21.7) at 1.65, about 54px wide; gen.py
# seats it on its rock (MSEAT: how far its bottom line sinks onto the rock's).
MS, MX = 1.65, 352
MSEAT = .4
MSTROKE = 1.9       # its line, in the logo's units
MOUSE_INK = dict(aa=.07, am=.2, T=.36, gate=.7)    # a denser, cleaner charcoal so it reads
MOUSE_FILL = "canvas"

# Mountain lines (mtn.py): (centre x, height, spread left, spread right, exponent)
FRONT_PEAKS = [(596, 80, 50, 62, 2.0), (520, 60, 40, 34, 2.1)]
HILL_PEAKS = [(260, 36, 38, 62, 2.2)]
BACKL_PEAKS = [(110, 56, 44, 30, 1.9)]

S, SEED = {}, {}
# a pale range at the far left, standing on its own
S["backl"] = mountain(14, 200, 10, BACKL_PEAKS, SHORE)
SEED["backl"] = 3
# the green hill beside it; it stands a little nearer than the mountains
S["hill"] = mountain(166, 400, 12, HILL_PEAKS, SHORE + 7)
SEED["hill"] = 5
# the deeper cloud-blue massif: two summits and broad flanks
S["front"] = mountain(426, 750, 12, FRONT_PEAKS, SHORE)
SEED["front"] = 4
# a low meadow on the right, under the sun
S["meadow"] = [(792, 113), (798, 107.5), (808, 102.6), (822, 99.6), (836, 99.2), (847, 101.5), (853, 107), (855, 113),
               (842, 116.4), (816, 116.8)]
SEED["meadow"] = 6

# The lake: its far edge a constant channel below the far shore (never above
# `ceiling`); its ends and its near edge drawn by hand, a long shallow curve.
LAKE = dict(
    x0=14, x1=856, step=24, channel=8, ceiling=121,
    far=["backl", "hill", "front", "meadow"],
    bottom=[(20, 178), (44, 202), (90, 223), (150, 238), (210, 248), (300, 255), (400, 257), (500, 255.5),
            (600, 251), (700, 242), (780, 228), (830, 210), (854, 188)],
    right=[(860, 136), (861, 152), (859, 168)],
    left=[(9, 160), (7, 146), (9, 133)],
)
SEED["lake"] = 8

# Stepping stones (cx, waterline y, w, h, lean): near ones bigger, lower and
# farther apart, on a gentle curve; then the mouse's rock (cx, waterline y, w, h).
STONES = [(160, 224, 46, 19, .05), (222, 217, 36, 15, -.08), (272, 211, 30, 12.5, .06), (313, 204.5, 24, 10.5, -.03)]
ROCK = (378, 198, 78, 25)
STONE_REFL = (.86, .2, .9)     # each stone's soft dab: width, offset below the waterline and height, as fractions of the stone
WET_GAP = 6                    # the stones and the rock stay at least this far inside the water

# Paint under the canvas weave, solved with tools/canvas/solve.py so paint +
# weave lands on the colour after the arrow.
PAINT = {
    "water": "#adcdf9",    # -> #cfe0f9
    "back": "#b2c3d9",     # -> #d3dce8, the pale range
    "front": "#87a5cc",    # -> #bccce1, cloud-blue
    "hill": "#c9e383",     # -> #deecb9
    "stone": "#a0a8b5",    # -> #c8ccd4, the mouse's rock
    "step": "#7d8799",     # -> about #b6bbc5, the stepping stones: a shade deeper than the rock
    "sage": "#9cbeaa",     # -> #c6d8ce (reflections)
    "mist": "#d9dcbb",     # the mouse's reflection
    "butter": "#f6e143",   # -> #f7ec98, the sun
    "canvas": "#f4f4ee",   # -> #f6f6f3, the page ground: the mouse's body
}
STONE_PAINT, ROCK_PAINT = "step", "stone"
# fills and which weave each takes: plain "/" twill, the water's mirrored "\"
FILL = [("backl", "back", "plain"), ("hill", "hill", "plain"), ("front", "front", "plain"),
        ("meadow", "hill", "plain"), ("lake", "water", "water")]

# Reflections: (shape, paint, its foot y, the water's edge y, squash, dx),
# then soft dabs (x, y, w, h); all blurred and clipped to the water. One
# short broken line under the rock; the open water stays clean.
MIRROR = [("backl", "back", SHORE, 123, .6, 0), ("hill", "sage", SHORE + 7, 130, .62, 0),
          ("front", "front", SHORE + 2, 123, .62, 0), ("meadow", "sage", 116, 123, .8, 0)]
REFL = [
    ("stone", [(340, 197, 76, 8)]),
    ("mist", [(352, 203, 46, 8)]),
    ("butter", [(807, 136, 22, 5), (812, 146, 12, 4)]),
]
REFL_OPACITY = .62
REFL_BLUR = (2.6, 1.3)
FRAG = [[(359, 213.5), (368, 215.4), (380, 215)]]

WOBBLE = {"hill": 1.2, "front": 1.3, "backl": 1.3, "meadow": 1.0, "lake": 1.4, "stone": .6, "rock": .7}
SUN = (818, 74, 10.5, 1.4, -1.1, 10.6)     # cx, cy, r; the charcoal ring off-register by (dx, dy), its r
