"""The phone crop (viewBox 360 wide: about 1 unit to the CSS px at 390).

The same scene drawn closer: three stepping stones from the near shore out
to the mouse's rock, a little left of centre. The mouse looks over open
water to the far shore: a low green hill, the deeper blue mountain, and a
small meadow with the evening sun low over it, each standing on its own. The
mouse is drawn a little smaller than on the panorama (1.5): about 48px at
390 and 38px at 320. See wide.py for what each setting means.
"""
from mtn import mountain

VIEWBOX = (0, 25, 360, 186)
TILE = 112
W = 2.1
WR = 2.0
PREC = 1

SHORE = 96

MS, MX = 1.5, 142
MSEAT = .4
MSTROKE = 1.9
MOUSE_INK = dict(aa=.07, am=.2, T=.36, gate=.7)
MOUSE_FILL = "canvas"

FRONT_PEAKS = [(204, 66, 34, 32, 2.0), (256, 34, 26, 30, 2.2)]
HILL_PEAKS = [(62, 34, 36, 26, 2.2)]

S, SEED = {}, {}
S["hill"] = mountain(12, 120, 6, HILL_PEAKS, SHORE)
SEED["hill"] = 3
S["front"] = mountain(110, 294, 8, FRONT_PEAKS, SHORE)
SEED["front"] = 4
S["meadow"] = [(318, 97), (321, 92), (327, 88.4), (336, 86.6), (345, 87.2), (351, 90.6), (354, 95.4), (354.4, 99.8),
               (344, 101.6), (328, 101.6)]
SEED["meadow"] = 6

LAKE = dict(
    x0=8, x1=352, step=16, bstep=8, channel=8, ceiling=104,
    far=["hill", "front", "meadow"],
    bottom=[(8, 156), (16, 169), (28, 180), (46, 190), (72, 198), (120, 204), (180, 206), (240, 204), (290, 199),
            (318, 192), (336, 182), (346, 170), (352, 157)],
    right=[(356, 118), (357, 132), (355, 145)],
    left=[(5, 144), (4, 130), (6, 116)],
)
SEED["lake"] = 8

STONES = [(62, 178, 28, 13, .05), (96, 175, 22, 10.5, -.08), (122, 172, 17, 8, .05)]
ROCK = (166, 170, 56, 20)
STONE_REFL = (.86, .2, .9)
WET_GAP = 6

PAINT = {
    "water": "#adcdf9",
    "front": "#87a5cc",
    "hill": "#c9e383",
    "stone": "#a0a8b5",
    "step": "#7d8799",
    "sage": "#9cbeaa",
    "mist": "#d9dcbb",
    "butter": "#f6e143",
    "canvas": "#f4f4ee",
}
STONE_PAINT, ROCK_PAINT = "step", "stone"
FILL = [("hill", "hill", "plain"), ("front", "front", "plain"), ("meadow", "hill", "plain"),
        ("lake", "water", "water")]

MIRROR = [("hill", "sage", SHORE, 105, .6, 0), ("front", "front", SHORE + 2, 105, .62, 0),
          ("meadow", "sage", 101, 108, .8, 0)]
REFL = [
    ("stone", [(139, 170, 54, 7)]),
    ("mist", [(146, 175, 38, 7)]),
    ("butter", [(326, 118, 18, 4.4), (330, 126, 10, 3.4)]),
]
REFL_OPACITY = .62
REFL_BLUR = (2.4, 1.2)
FRAG = [[(153, 185.2), (161, 186.9), (171, 186.6)]]

WOBBLE = {"front": 1.2, "hill": 1.1, "meadow": .9, "lake": 1.2, "stone": .5, "rock": .6}
SUN = (335, 64, 9, 1.2, -1, 8.7)
