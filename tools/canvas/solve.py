"""Solve paint colours so that paint under the canvas weave lands on target colours.

Usage: python3 tools/canvas/solve.py [--tile weave|water|ground] '#cfe0f9' '#deecb9' ...

Compositing is linear in the paint, so it is enough to render the tile over black
and over white at 2x (headless WebKit, snap2) and solve, per channel,
paint = (target - B) / ((W - B) / 255). `weave` is assets/weave.png (the lakeside
drawing's fills; `water` is the same tile mirrored, as on the lake), `ground` the
page's ground weave without its paint (gen.py ground_tile(paint=None)).

The model is linear and approximate, within about 1-3 per channel: use it as a
starting point, then check the result in the page. The drawing's paints in
tools/lake/wide.py and narrow.py started from this solver and are within about
3 per channel of what it gives today. For the ground it gives #dcdcd1 for #f6f6f3;
the shipped GROUND_PAINT #dfdfd8 (tools/canvas/gen.py) was chosen by measuring
in the page instead: it reads #f6f6f4 at 2x and 3x, #f7f7f5 at 1x.
"""
import argparse
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from bake import read_png, snap2
from gen import data_uri, ground_tile


def measure(tile):
    """Mean RGB of the tile over black and over white, rendered at 2x."""
    if tile == "ground":
        img, size = data_uri(ground_tile(paint=None)), 120     # the bare white-alpha weave
    else:
        img, size = "file://" + os.path.join(ROOT, "assets", "weave.png"), 120
    flip = "transform:scaleX(-1);" if tile == "water" else ""
    tmp = tempfile.mkdtemp()
    page = os.path.join(tmp, "solve.html")
    open(page, "w").write(f"<!doctype html><style>body{{margin:0}}div{{width:240px;height:240px;{flip}background-size:{size}px {size}px;"
                          f"background-image:url(\"{img}\")}}.b{{background-color:#000}}.w{{background-color:#fff}}</style>"
                          "<div class=b></div><div class=w></div>")
    shot = os.path.join(tmp, "solve-2x.png")
    subprocess.run([snap2(), page, shot, "240", "480", "1", "0", "2"], check=True, capture_output=True)
    w, h, ch, px = read_png(shot)
    def mean(y0):
        acc = [0, 0, 0]
        for y in range(y0, y0 + 480):
            for x in range(480):
                o = (y * w + x) * ch
                for c in range(3):
                    acc[c] += px[o + c]
        return [v / (480 * 480) for v in acc]
    return mean(0), mean(480)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tile", default="weave", choices=("weave", "water", "ground"))
    ap.add_argument("targets", nargs="+")
    a = ap.parse_args()
    b, wt = measure(a.tile)
    k = [(wt[c] - b[c]) / 255 for c in range(3)]
    print(f"tile {a.tile}: over black {[round(v, 1) for v in b]}, over white {[round(v, 1) for v in wt]}")
    for t in a.targets:
        tv = [int(t.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
        p = [max(0, min(255, round((tv[c] - b[c]) / k[c]))) for c in range(3)]
        print(f"{t} <- paint #{p[0]:02x}{p[1]:02x}{p[2]:02x}")


if __name__ == "__main__":
    main()
