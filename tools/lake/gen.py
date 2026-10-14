"""Build the lakeside (the drawing the page ends on) and put it in the pages.

    python3 tools/lake/gen.py              # rebuild, check, update index.html and ko/index.html
    python3 tools/lake/gen.py --dry-run    # build and check only
    python3 tools/lake/gen.py --out DIR    # also write wide.svg, narrow.svg and art.html (the art
                                           # alone at its sizes, for looking at) into DIR

A path of stepping stones goes out over a long, still lake from the near
shore to a flat rock out on the water, where the mouse sits: the last step,
the endpoint. It looks out over open water to the far shore: soft
mountains, a low meadow and a small evening sun. Two inline <svg>s in one
aria-hidden block between </main> and the colophon: the panorama (wide.py,
shown from 40rem) and a closer phone crop (narrow.py). The drawing data is
in those two modules; mtn.py draws the mountain lines. This file turns them
into svg:
  - closed Catmull-Rom splines through hand-placed points, with a seeded hand
    wobble; the far shore's shapes stand side by side as separate islands,
    a bare-canvas channel between neighbours, and the lake's far edge is
    computed from them, widened until the narrowest channel below the far
    shore, after smoothing and wobble, is the one asked for
  - flat pastel paint under the site's canvas weave (/assets/weave.png at
    about 110 CSS px, the same cloth as the page ground; the panorama also
    carries a 180-unit copy that site.css uses on tablets, where it is shown
    at 2/3): "/" twill on the land and the stones, mirrored "\\" on the water
  - charcoal outlines (an SVG filter calibrated on the reference's crayon
    lines); below 2dppx site.css turns the filters off, so the outlines are
    plain round-capped charcoal like the page's own marks, in the same --pen
    (INK; the filters flood INK themselves, so at 2x the stroke colour is unused)
  - the mouse: the exact one-stroke path of assets/mark.svg (the logo), its
    body filled with the canvas so it reads solid against the water, a denser
    charcoal on its line and its eye a solid dot outside any filter
  - soft reflections clipped to the water: the mountains and meadows
    themselves, flipped and squashed onto the water's edge, and blurred dabs
    under the stones, the rock, the mouse and the sun
It is CSP-clean: presentation attributes only, no style=, no <style>, no
<script>, no data:, ids prefixed per variant, aria-hidden and not focusable.
Nothing in it moves.
"""
import argparse
import gzip
import importlib
import math
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
TILE_HREF = "/assets/weave.png"
LIMIT = 25000                          # bytes, raw, per variant
VARIANTS = (("narrow", "ln-", "lakeside-narrow"), ("wide", "lw-", "lakeside-wide"))
INK = "#171b22"


# ---------- numbers and curves ----------

def f(v, d=1):
    s = f"{v:.{d}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    if s.startswith("0."):
        s = s[1:]
    elif s.startswith("-0."):
        s = "-" + s[2:]
    return s if s not in ("", "-") else "0"


def fi(v):
    s = str(int(round(v)))
    return "0" if s == "-0" else s


def beziers(pts, closed=True, t=1.0):
    """Catmull-Rom through pts as cubic Bezier segments (p1, c1, c2, p2)."""
    n = len(pts)
    Q = (lambda i: pts[i % n]) if closed else (lambda i: pts[max(0, min(n - 1, i))])
    out = []
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = Q(i - 1), Q(i), Q(i + 1), Q(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) * t / 6, p1[1] + (p2[1] - p0[1]) * t / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) * t / 6, p2[1] - (p3[1] - p1[1]) * t / 6)
        out.append((p1, c1, c2, p2))
    return out


def spline(pts, closed=True, prec=1):
    """The path data. prec 0 writes whole units: on the panorama 1 unit is
    1 CSS px, so rounding moves a point by half a pixel at most, well under
    the hand wobble, and saves about a quarter of the bytes."""
    g = f if prec else fi
    segs = beziers(pts, closed)
    d = [f"M{g(pts[0][0])} {g(pts[0][1])}"]
    d += [f"C{g(c1[0])} {g(c1[1])} {g(c2[0])} {g(c2[1])} {g(p2[0])} {g(p2[1])}" for _, c1, c2, p2 in segs]
    return re.sub(r" -", "-", "".join(d) + ("Z" if closed else ""))


def sample(pts, closed=True, k=16):
    """The spline as a polyline (for channels, gaps and filter regions)."""
    out = []
    for p1, c1, c2, p2 in beziers(pts, closed):
        for j in range(k):
            t = j / k
            a, b, c, d = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
            out.append((a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]))
    return out


def wobble(pts, amp, seed):
    """A hand's unevenness: a displaced midpoint on every segment (seeded, repeatable)."""
    if not amp:
        return pts
    rnd = random.Random(seed)
    out = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        out.append(a)
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        if L < 4:
            continue
        r = rnd.uniform(-amp, amp)
        out.append(((a[0] + b[0]) / 2 - dy / L * r, (a[1] + b[1]) / 2 + dx / L * r))
    return out


def dist(a, b):
    return min(math.hypot(p[0] - q[0], p[1] - q[1]) for p in a for q in b)


def crosses(pts):
    """Whether a closed outline crosses itself (a loop or zig-zag a hand would not draw)."""
    def ccw(a, b, c):
        return (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0])
    segs = list(zip(pts, pts[1:] + pts[:1]))
    n = len(segs)
    for i in range(n):
        a, b = segs[i]
        for j in range(i + 2, n - (i == 0)):
            c, d = segs[j]
            if ccw(a, c, d) * ccw(b, c, d) < 0 and ccw(a, b, c) * ccw(a, b, d) < 0:
                return True
    return False


def bbox(polys, m=0):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    return (min(xs) - m, min(ys) - m, max(xs) - min(xs) + 2 * m, max(ys) - min(ys) + 2 * m)


def interp(curve, x):
    """y on a polyline (sorted by x) at x, clamped at the ends."""
    if x <= curve[0][0]:
        return curve[0][1]
    for (x0, y0), (x1, y1) in zip(curve, curve[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / ((x1 - x0) or 1)
    return curve[-1][1]


def steps(x0, x1, step):
    xs, x = [], x0
    while x < x1 - step / 2:
        xs.append(x)
        x += step
    xs.append(x1)
    return xs


def edge(polys, xs, ch, bound, below=True):
    """An edge a constant channel `ch` off the objects' outlines: below them
    (y = max) or above them (y = min), never past `bound(x)`; lightly smoothed."""
    pts = [p for poly in polys for p in poly]
    out = []
    for x in xs:
        y = bound(x)
        for px, py in pts:
            dx = abs(px - x)
            if dx < ch:
                h = math.sqrt(ch * ch - dx * dx)
                y = max(y, py + h) if below else min(y, py - h)
        out.append([x, y])
    sm = [out[0]] + [[out[i][0], (out[i - 1][1] + 2 * out[i][1] + out[i + 1][1]) / 4] for i in range(1, len(out) - 1)] + [out[-1]]
    return [(round(x, 1), round(y, 1)) for x, y in sm]


# ---------- stones ----------

def stone(cx, cy, w, h, lean=0.0, seed=0, top=.72, n=12, rough=.07):
    """A stone standing in still water, seen from a little above: an uneven
    dome over a flatter waterline. (cx, cy) is the middle of the waterline;
    h is the whole height, `top` the share above the waterline; `lean` moves
    the crown sideways (a fraction of w)."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = 2 * math.pi * (i + .5) / n
        c, s = math.cos(a), math.sin(a)
        r = 1 + rnd.uniform(-rough, rough)
        if s < 0:                                     # the crown
            x = cx + c * w / 2 * r - s * lean * w
            y = cy + s * h * top * r ** 2
        else:                                         # the waterline, nearly flat
            x = cx + math.copysign(abs(c) ** .8, c) * w / 2 * r
            y = cy + s ** .6 * h * (1 - top) * r
        out.append((round(x, 2), round(y, 2)))
    return out


def rock(cx, cy, w, h, seed=0, n=14, rough=.04, flat=.6):
    """The mouse's rock: a broad, flat-topped boulder in the water. (cx, cy)
    the middle of its waterline; its top is flattened so the mouse can sit."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = 2 * math.pi * (i + .5) / n
        c, s = math.cos(a), math.sin(a)
        r = 1 + rnd.uniform(-rough, rough)
        if s < 0:
            x = cx + math.copysign(abs(c) ** .7, c) * w / 2 * r
            y = cy - (abs(s) ** flat) * h * .78 * r
        else:
            x = cx + math.copysign(abs(c) ** .75, c) * w / 2 * r
            y = cy + s ** .7 * h * .22 * r
        out.append((round(x, 2), round(y, 2)))
    return out


# ---------- the mouse ----------

def mark_d():
    svg = open(os.path.join(ROOT, "assets", "mark.svg")).read()
    return svg.split(' d="')[1].split('"')[0]


def mouse_d(sc, prec=1):
    """assets/mark.svg's path (absolute M and C only), placed: x' = MX + x MS."""
    nums = [float(v) for v in re.findall(r"-?\d*\.?\d+", mark_d())]
    cmds = re.findall(r"[MC]", mark_d())
    assert len(nums) == 2 + 6 * (len(cmds) - 1), "mark.svg must be one M and Cs, absolute"
    pts = [(sc.MX + x * sc.MS, sc.MY + y * sc.MS) for x, y in zip(nums[0::2], nums[1::2])]
    g = f if prec else fi
    out = f"M{g(pts[0][0])} {g(pts[0][1])}"
    for i in range(1, len(pts), 3):
        out += "C" + " ".join(f"{g(x)} {g(y)}" for x, y in pts[i:i + 3])
    return out.replace(" -", "-"), pts


# ---------- the charcoal ----------

def charcoal(fid, W, region, seed=5, ink=INK, aa=.14, am=.36, T=.42, slope=7, gate=.9, gf=2.34):
    """Charcoal line (calibrated on the reference's crayon), noise, threshold and gate exposed:
    mask = soft + (aa + am*soft)*(n - .5)/.116 - T, gated to about 1 W around the line."""
    sig, bf, g = .31 * W, gf / W, gate * W
    k1, k2, k3, k4 = am / .116, 1 - .5 * am / .116, aa / .116, -.5 * aa / .116 - T + .5
    x, y, w, h = region
    return (f'<filter id="{fid}" x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">'
            f'<feTurbulence type="fractalNoise" baseFrequency="{bf:.3f}" numOctaves="2" seed="{seed}"/>'
            f'<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0" result="n"/>'
            f'<feGaussianBlur in="SourceAlpha" stdDeviation="{sig:.2f}" result="s"/>'
            f'<feComposite in="s" in2="n" operator="arithmetic" k1="{k1:.3f}" k2="{k2:.3f}" k3="{k3:.3f}" k4="{k4:.3f}"/>'
            f'<feComponentTransfer result="m"><feFuncA type="linear" slope="{slope}" intercept="{f(.5 - .5 * slope)}"/></feComponentTransfer>'
            f'<feGaussianBlur in="SourceAlpha" stdDeviation="{g:.2f}"/>'
            f'<feComponentTransfer><feFuncA type="linear" slope="8" intercept="-.4"/></feComponentTransfer>'
            f'<feComposite in="m" operator="in" result="k"/>'
            f'<feFlood flood-color="{ink}"/><feComposite in2="k" operator="in"/></filter>')


# ---------- the scene ----------

def shapes(sc):
    """Every closed shape, wobbled, with the computed edges placed by rule."""
    S = {k: wobble(v, sc.WOBBLE.get(k, 0), sc.SEED.get(k, 1)) for k, v in sc.S.items()}
    polys = {k: sample(v) for k, v in S.items()}
    rep = {}

    # stones in the water and the mouse's rock
    for i, st in enumerate(sc.STONES):
        cx, cy, w, h = st[:4]
        lean = st[4] if len(st) > 4 else 0
        S[f"s{i + 1}"] = wobble(stone(cx, cy, w, h, lean, seed=30 + i), sc.WOBBLE.get("stone", .5), 40 + i)
    S["rock"] = wobble(rock(*sc.ROCK, seed=11), sc.WOBBLE.get("rock", .6), 12)
    for k in S:
        if k == "rock" or k[0] == "s" and k[1:].isdigit():
            polys[k] = sample(S[k])

    # the mouse sits on its rock: its bottom line (mark y 20.2 to 20.4 between x 7 and 23) on the rock's top
    rx = [p for p in polys["rock"] if sc.MX + 7 * sc.MS <= p[0] <= sc.MX + 23 * sc.MS]
    sc.MY = min(p[1] for p in rx) - 20.3 * sc.MS + sc.MSEAT
    _, mpts = mouse_d(sc)
    mouse = sample(mpts[::3], closed=False, k=4)
    polys["mouse"] = mouse

    # the lake: its far edge a constant channel below the far shore (widened
    # until the narrowest channel, after smoothing and wobble, is the one
    # asked for); its ends and its near edge by hand, the near edge sampled
    # every `bstep` (default `step`) so its hand-placed points survive
    lk = dict(sc.LAKE)
    far = [polys[k] for k in lk["far"]]
    for _ in range(8):
        xs = steps(lk["x0"], lk["x1"], lk["step"])
        top = edge(far, xs, lk["channel"], lambda x: lk["ceiling"], below=True)
        bot = edge([], steps(lk["x0"], lk["x1"], lk.get("bstep", lk["step"]))[::-1], 0, lambda x: interp(lk["bottom"], x))
        S["lake"] = wobble(top + lk["right"] + bot + lk["left"], sc.WOBBLE.get("lake", 0), sc.SEED.get("lake", 8))
        lp = sample(S["lake"])
        short = sc.LAKE["channel"] - min(dist(p, lp) for p in far)
        if short < .1:
            break
        lk["channel"] += short
    polys["lake"] = lp
    rep["far gap"] = round(min(dist(p, lp) for p in far), 2)
    # neighbours on the far shore keep a channel between them too
    side = [(a, b) for i, a in enumerate(lk["far"]) for b in lk["far"][i + 1:]]
    rep["far neighbours"] = {f"{a}/{b}": round(dist(polys[a], polys[b]), 1) for a, b in side if dist(polys[a], polys[b]) < 30}
    if any(v < sc.LAKE["channel"] - .5 for v in rep["far neighbours"].values()):
        rep["PROBLEM far"] = "far-shore neighbours closer than the channel"
    wet = [k for k in polys if k == "rock" or k[0] == "s" and k[1:].isdigit()]
    rep["stones to edge"] = {k: round(dist(polys[k], lp), 1) for k in wet}
    rep["stone gaps"] = [round(dist(polys[a], polys[b]), 1) for a, b in zip(wet, wet[1:])]
    if min(rep["stones to edge"].values()) < sc.WET_GAP:
        rep["PROBLEM"] = f"a stone is closer than {sc.WET_GAP} to the water's edge"
    rep["mouse to lake edge"] = round(dist(mouse, lp), 1)
    loops = [k for k in S if crosses(sample(S[k], k=4))]
    if loops:
        rep["PROBLEM loops"] = "outlines that cross themselves: " + ", ".join(loops)
    rep["mouse to"] = {k: round(dist(mouse, polys[k]), 1) for k in polys if k not in ("lake", "mouse", "rock")}
    return S, polys, rep


def build(sc, P):
    S, polys, rep = shapes(sc)
    u = lambda k: f'<use href="#{P}{k}"/>'
    prec = getattr(sc, "PREC", 1)
    wet = [k for k in S if k == "rock" or k[0] == "s" and k[1:].isdigit()]
    land = [k for k, _, _ in sc.FILL]
    weave = {"plain": "wv", "water": "ww"}

    WM = sc.MSTROKE * sc.MS
    md, mpts = mouse_d(sc)
    mbox = bbox([mpts])
    frags = [sample(p, closed=False) for p in sc.FRAG]
    lake_bb = bbox([polys["lake"]])
    bx, by = sc.REFL_BLUR
    r_blur = (lake_bb[0] - 3 * bx, lake_bb[1] - 3 * by, lake_bb[2] + 6 * bx, lake_bb[3] + 6 * by)
    sun = getattr(sc, "SUN", None)
    sunpoly = [(sun[0] - sun[2] - 2, sun[1] - sun[2] - 2), (sun[0] + sun[2] + 2, sun[1] + sun[2] + 2)] if sun else []
    r_main = bbox([polys[k] for k in land + wet] + ([sunpoly] if sun else []), 2.5 * sc.W)
    r_frag = bbox(frags, 2.5 * sc.WR) if frags else None
    r_mouse = bbox([[(mbox[0], mbox[1]), (mbox[0] + mbox[2], mbox[1] + mbox[3])]], 2.5 * WM)

    small = lambda k: k in wet
    defs = [f'<path id="{P}{k}" d="{spline(S[k], True, 1 if small(k) else prec)}"/>' for k in land + wet]
    defs.append(f'<path id="{P}m" d="{md}"/>')
    T = sc.TILE
    defs.append(f'<pattern id="{P}wv" patternUnits="userSpaceOnUse" width="{f(T)}" height="{f(T)}">'
                f'<image href="{TILE_HREF}" width="{f(T)}" height="{f(T)}"/></pattern>')
    defs.append(f'<pattern id="{P}ww" href="#{P}wv" patternTransform="scale(-1 1)"/>')
    # a second cloth for a scene shown smaller than 1:1 (the panorama on tablets):
    # site.css switches the weave layers (.ls-wv, .ls-ww) to it there
    TT = getattr(sc, "TILE_TABLET", None)
    if TT:
        defs.append(f'<pattern id="{P}wvt" patternUnits="userSpaceOnUse" width="{f(TT)}" height="{f(TT)}">'
                    f'<image href="{TILE_HREF}" width="{f(TT)}" height="{f(TT)}"/></pattern>')
        defs.append(f'<pattern id="{P}wwt" href="#{P}wvt" patternTransform="scale(-1 1)"/>')
    wcls = (lambda w: f' class="ls-{w}"') if TT else (lambda w: "")
    defs.append(f'<filter id="{P}bl" x="{f(r_blur[0])}" y="{f(r_blur[1])}" width="{f(r_blur[2])}" height="{f(r_blur[3])}" '
                f'filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="{bx} {by}"/></filter>')
    defs.append(f'<clipPath id="{P}cw">{u("lake")}</clipPath>')
    defs.append(charcoal(f"{P}ch", sc.W, r_main, seed=5))
    if r_frag:
        defs.append(charcoal(f"{P}cr", sc.WR, r_frag, seed=7))
    defs.append(charcoal(f"{P}cm", WM, r_mouse, seed=11, **sc.MOUSE_INK))

    # paint: the land and the water
    body = [f'<use href="#{P}{k}" fill="{sc.PAINT[p]}"/>' for k, p, _ in sc.FILL]

    # reflections, under everything that stands in the water: the shapes
    # themselves, flipped about their foot onto the water's edge and squashed,
    # and soft dabs (x, y, w, h); all blurred and clipped to the water
    refl = []
    for k, paint, y_foot, y_water, squash, dx in getattr(sc, "MIRROR", []):
        c = y_water + squash * y_foot
        refl.append(f'<use href="#{P}{k}" fill="{sc.PAINT[paint]}" transform="matrix(1 0 0 -{f(squash, 2)} {f(dx)} {f(c)})"/>')
    dabs = [(p, d) for p, ds in sc.REFL for d in ds]
    a, b, c = sc.STONE_REFL
    for st in sc.STONES:
        cx, cy, w, h = st[:4]
        dabs.append(("stone", (cx - w * a / 2, cy + h * b, w * a, h * c)))
    refl += [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(min(w, h) / 2)}" fill="{sc.PAINT[p]}"/>'
             for p, (x, y, w, h) in dabs]
    body.append(f'<g clip-path="url(#{P}cw)"><g filter="url(#{P}bl)" opacity="{f(sc.REFL_OPACITY, 2)}">{"".join(refl)}</g></g>')

    # the stones and the rock, on the water
    body += [f'<use href="#{P}{k}" fill="{sc.PAINT[sc.STONE_PAINT if k != "rock" else sc.ROCK_PAINT]}"/>' for k in wet]
    if sun:
        body.append(f'<circle cx="{f(sun[0])}" cy="{f(sun[1])}" r="{f(sun[2])}" fill="{sc.PAINT["butter"]}"/>')
    body.append(f'<use href="#{P}m" fill="{sc.PAINT[sc.MOUSE_FILL]}"/>')

    # the canvas weave over every painted shape
    body += [f'<use{wcls(weave[g])} href="#{P}{k}" fill="url(#{P}{weave[g]})"/>' for k, _, g in sc.FILL]
    body += [f'<use{wcls("wv")} href="#{P}{k}" fill="url(#{P}wv)"/>' for k in wet]
    if sun:
        body.append(f'<circle{wcls("wv")} cx="{f(sun[0])}" cy="{f(sun[1])}" r="{f(sun[2])}" fill="url(#{P}wv)"/>')
    body.append(f'<use{wcls("wv")} href="#{P}m" fill="url(#{P}wv)"/>')

    # charcoal: every outline, the sun's ring a little off-register (as the page's endpoint dot)
    lines = "".join(u(k) for k in land + wet)
    if sun:
        lines += f'<circle cx="{f(sun[0] + sun[3])}" cy="{f(sun[1] + sun[4])}" r="{f(sun[5])}"/>'
    body.append(f'<g class="ls-ch" filter="url(#{P}ch)" fill="none" stroke="{INK}" stroke-width="{sc.W}" stroke-linecap="round" stroke-linejoin="round">{lines}</g>')
    if r_frag:
        fr = "".join(f'<path d="{spline(p, closed=False)}"/>' for p in sc.FRAG)
        body.append(f'<g class="ls-cr" filter="url(#{P}cr)" fill="none" stroke="{INK}" stroke-width="{sc.WR}" stroke-linecap="round">{fr}</g>')
    body.append(f'<g class="ls-cm" filter="url(#{P}cm)" fill="none" stroke="{INK}" stroke-width="{f(WM)}" stroke-linecap="round" stroke-linejoin="round">{u("m")}</g>')
    # the eye: a solid dot outside the filter, the same r 1.4 as in assets/mark.svg
    body.append(f'<circle cx="{f(sc.MX + 27.15 * sc.MS)}" cy="{f(sc.MY + 13.88 * sc.MS)}" r="{f(1.4 * sc.MS)}" fill="{INK}"/>')

    rep["content"] = [round(v, 1) for v in bbox(list(polys.values()) + [sunpoly] if sun else list(polys.values()))]
    rep["lake"] = [round(v, 1) for v in lake_bb]
    rep["mouse"] = [round(v, 1) for v in mbox]
    rep["regions"] = {"main": [round(v) for v in r_main], "mouse": [round(v) for v in r_mouse]}
    return f'<defs>{"".join(defs)}</defs>{"".join(body)}', rep


def inline(sc, inner, cls):
    x, y, w, h = sc.VIEWBOX
    return (f'<svg class="lakeside-art {cls}" viewBox="{f(x)} {f(y)} {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}" '
            f'aria-hidden="true" focusable="false">{inner}</svg>')


def check(svg, P):
    problems = []
    if len(svg.encode()) > LIMIT:
        problems.append(f"{len(svg.encode())} bytes > {LIMIT}")
    for bad in ("style=", "<style", "<script", "<title", "data:", "http"):
        if bad in svg:
            problems.append(f"contains {bad}")
    if 'aria-hidden="true"' not in svg[:300] or 'focusable="false"' not in svg[:300]:
        problems.append("svg must be aria-hidden and focusable=false")
    ids = re.findall(r' id="([^"]+)"', svg)
    if any(not i.startswith(P) for i in ids) or len(ids) != len(set(ids)):
        problems.append("ids must be unique and start with " + P)
    return problems


BLOCK_RE = re.compile(r'\s*<div class="lakeside" aria-hidden="true">.*?</svg>\s*</div>', re.S)


def place(block):
    """Put the drawing in both pages, between </main> and the colophon.
    Both pages are built and checked first (one lakeside block, unique ids)
    and written only if both pass, so they never go out of step."""
    out = {}
    for page in ("index.html", os.path.join("ko", "index.html")):
        path = os.path.join(ROOT, page)
        h = open(path).read()
        h = BLOCK_RE.sub("", h)
        i = h.index("\n  </main>\n") + len("\n  </main>")
        h = h[:i] + "\n\n  " + block + h[i:]
        ids = re.findall(r' id="([^"]+)"', h)
        if h.count('class="lakeside"') != 1 or len(ids) != len(set(ids)):
            sys.exit(f"{page}: lakeside block not unique or duplicate ids; nothing written")
        out[path] = h
    for path, h in out.items():
        open(path, "w").write(h)


ART_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="{origin}/assets/site.css">
<style>body{{display:block;padding:24px}} .a{{margin:0 0 40px}} .a svg{{display:block !important;width:100%;height:auto;overflow:visible}}</style>
</head><body>{blocks}</body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--origin", default="http://127.0.0.1:4173", help="for --out previews: where /assets is served")
    a = ap.parse_args()
    svgs, bad = {}, False
    for name, P, cls in VARIANTS:
        sc = importlib.import_module(name)
        inner, rep = build(sc, P)
        svg = inline(sc, inner, cls)
        svgs[name] = svg
        raw, gz = len(svg.encode()), len(gzip.compress(svg.encode(), 9))
        print(f"{name}: {raw} bytes, {gz} gzip")
        for k, v in rep.items():
            print("  ", k, v)
        probs = check(svg, P) + [v for k, v in rep.items() if k.startswith("PROBLEM")]
        if probs:
            print("   problems:", "; ".join(probs))
            bad = True
    block = f'<div class="lakeside" aria-hidden="true">{svgs["narrow"]}{svgs["wide"]}</div>'
    print(f"block: {len(block.encode())} bytes, {len(gzip.compress(block.encode(), 9))} gzip")
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        for name in svgs:
            open(os.path.join(a.out, f"{name}.svg"), "w").write(svgs[name].replace(f'href="{TILE_HREF}"', f'href="{a.origin}{TILE_HREF}"'))
        sizes = [("wide", 864), ("wide", 576), ("narrow", 350), ("narrow", 280)]
        blocks = "".join(f'<div class="a" style="width:{w}px">{svgs[n].replace(chr(34) + TILE_HREF, chr(34) + a.origin + TILE_HREF)}</div>'
                         for n, w in sizes)
        open(os.path.join(a.out, "art.html"), "w").write(ART_HTML.format(origin=a.origin, blocks=blocks))
    if bad:
        sys.exit(1)
    if not a.dry_run:
        place(block)
        print("updated index.html and ko/index.html")


if __name__ == "__main__":
    main()
