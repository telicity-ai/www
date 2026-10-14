"""Procedural canvas weave (SVG data-URI tile) + crayon/charcoal filter emitter.

Usage: python3 tools/canvas/gen.py site    # prints the shipped --weave-ground and the crayon defs
       (also: tile [+1|-1], uri [+1|-1], crayon ID W)

The weave tile is WHITE whose alpha carries the texture. Laid over a flat
paint colour it gives L = Lp + a*(255-Lp): the grain strengthens as the
pigment deepens and vanishes on white, as in the reference fills. The page's
ground tile (ground_tile) carries its paint inside, as an opaque first layer.

Structure (all user units = CSS px, tile T x T, T = 120):
  warp  vertical thread stripes, period SX (repeating linearGradient),
        alpha multiplied by anisotropic feTurbulence (streaks along y)
        -> each warp thread gets its own tone + slubs
  weft  horizontal thread stripes, period SY, x anisotropic turbulence
  diag  one diagonal family at the 2-cell checker frequency
        k = (1/2SX, +-1/2SY): the twill-like lines of the reference
  grain fine isotropic turbulence -> per-pixel speckle
Periods divide T, turbulence uses stitchTiles over exactly the tile, so the
tile is seamless at any device pixel ratio where T*dpr is an integer.
"""
import json
import math
import os
import sys
import urllib.parse

T = 120


def P(name, default):
    return float(os.environ.get(name, default))


def weave_svg(diag_sign=+1, T=T, sx=None, sy=None, seed=3, dark="#272b33", paint=None, **kw):
    """Layers, each a rect whose alpha comes from a tiny stitched filter:
      f  weft  : horizontal thread stripes (period sy) broken into cell-length
                 dashes by noise at the cell frequency            (white)
      w  warp  : vertical thread stripes (period sx), same idea   (white)
      d  twill : one diagonal family at the checker frequency, patchy (white)
      s  slubs : long horizontal streaks along the weft           (white)
      g  grain : short horizontal flecks                          (white)
      k  specks: sparse dark flecks (neutral, low mean)           (dark)
      m  mottle: pigment density, very low frequency              (white)
    paint, if given, is laid as an opaque first layer, so the tile carries its
    own ground colour (the page ground) instead of showing what is under it."""
    sx = sx or T / 36          # 3.333 px warp spacing
    sy = sy or T / 48          # 2.5 px weft spacing
    g = lambda k, d: kw.get(k, P(k.upper(), d))
    kx, ky = 1 / (2 * sx), diag_sign / (2 * sy)
    k2 = kx * kx + ky * ky
    px_, py_ = kx / k2, ky / k2
    f = lambda v: ("%.4f" % v).rstrip("0").rstrip(".") or "0"
    head = f"x='0' y='0' width='{T}' height='{T}' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'"

    def grad(gid, x2, y2, a):
        return (f"<linearGradient id='{gid}' gradientUnits='userSpaceOnUse' x2='{f(x2)}' y2='{f(y2)}' spreadMethod='repeat'>"
                f"<stop stop-color='#fff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='{f(a)}'/>"
                f"<stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>")

    def tone(fid, bfx, bfy, contrast, s, octv=1):
        # out = SG * (k2 + k1*n): breaks a stripe family into irregular dashes
        return (f"<filter id='{fid}' {head}>"
                f"<feTurbulence type='fractalNoise' baseFrequency='{f(bfx)} {f(bfy)}' numOctaves='{octv}' seed='{s}' stitchTiles='stitch'/>"
                f"<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0'/>"
                f"<feComposite in='SourceGraphic' operator='arithmetic' k1='{f(contrast)}' k2='{f(1 - contrast / 2)}'/></filter>")

    def noise_alpha(fid, bfx, bfy, gain, thr, s, octv=1):
        # alpha = gain * (n - thr) / (1 - thr), clamped; fractal noise n ~ .5 +- .12
        a = gain / (1 - thr) * 4
        return (f"<filter id='{fid}' {head}>"
                f"<feTurbulence type='fractalNoise' baseFrequency='{f(bfx)} {f(bfy)}' numOctaves='{octv}' seed='{s}' stitchTiles='stitch'/>"
                f"<feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 {f(a)} 0 0 0 {f(-a * thr)}' result='a'/>"
                f"<feComposite in='SourceGraphic' in2='a' operator='in'/></filter>")

    defs = (grad("f", 0, sy, g("A_f", 0.24)) + grad("w", sx, 0, g("A_w", 0.22)) + grad("d", px_, py_, g("A_d", 0.30))
            + tone("tf", g("tf_x", 0.28), g("tf_y", 0.40), g("c_f", 1.4), seed)
            + tone("tw", g("tw_x", 0.30), g("tw_y", 0.25), g("c_w", 1.4), seed + 1)
            + tone("td", g("td_x", 0.15), g("td_y", 0.15), g("c_d", 1.3), seed + 2)
            + noise_alpha("ts", g("ts_x", 0.05), g("ts_y", 0.45), g("G_s", 0.08), g("t_s", 0.40), seed + 3, 2)
            + noise_alpha("tg", g("tg_x", 0.40), g("tg_y", 0.90), g("G_g", 0.13), g("t_g", 0.38), seed + 4)
            + (noise_alpha("tk", g("tk_x", 0.45), g("tk_y", 0.95), g("G_k", 0.05), g("t_k", 0.5), seed + 5) if g("G_k", 0.05) > 0 else "")
            + noise_alpha("tm", g("tm_x", 0.04), g("tm_y", 0.05), g("G_m", 0.06), g("t_m", 0.35), seed + 6, 2))
    R = lambda fill, flt: f"<rect width='{T}' height='{T}' fill='{fill}' filter='url(#{flt})'/>"
    body = ((f"<rect width='{T}' height='{T}' fill='{paint}'/>" if paint else "") + R("url(#f)", "tf") + R("url(#w)", "tw") + R("url(#d)", "td") + R("#fff", "ts") + R("#fff", "tm")
            + R("#fff", "tg") + (R(dark, "tk") if g("G_k", 0.05) > 0 else ""))
    return f"<svg xmlns='http://www.w3.org/2000/svg' width='{T}' height='{T}'><defs>{defs}</defs>{body}</svg>"


def data_uri(svg):
    # minimal escaping for a CSS url("...") value
    s = svg.replace("%", "%25").replace("#", "%23").replace("<", "%3C").replace(">", "%3E").replace('"', "'")
    return "data:image/svg+xml," + s


def crayon(fid, W, region=None, seed=5, ink="#171b22", disp=0.0, wob=None, slope=2.6, gate_k=0.55,
           bfk=2.34, aa=0.18, am=0.34, thr=0.38, sigk=0.36, octv=2):
    """Crayon / charcoal line filter for a stroke of stroke-width W (user units).
    profile: blur the stroke (sigma = sigk*W) -> soft cross-section p(d)
    grain:   fractal noise n (sd ~.116 in WebKit/Blink), grain size ~ 1/bf, bf = bfk/W
    mask:    a = slope * (p + (aa + am*p)*(n-.5)/.116 - thr) + .5   -> porous core,
             broken speckled edges, grey partial specks when slope is low
    gate:    a wide blur of the stroke keeps stray specks within ~1 W of the line
    disp:    optional low-frequency displacement (pressure wobble) before all that."""
    sig = sigk * W
    bf = bfk / W
    k1 = am / 0.116
    k2 = 1 - 0.5 * am / 0.116
    k3 = aa / 0.116
    k4 = -0.5 * aa / 0.116 - thr + 0.5
    wob = (0.3 / W) if wob is None else wob
    if region == "vp":       # whole SVG viewport + margins, works for any path in that svg
        reg = " x='-10%' y='-60%' width='120%' height='220%' filterUnits='userSpaceOnUse'"
    elif region == "bb":     # HTML element bounding box + margins
        reg = " x='-0.1' y='-0.35' width='1.2' height='1.7'"
    elif isinstance(region, tuple) and region[0] == "bb":   # bounding-box relative, custom margins
        reg = " x='%g' y='%g' width='%g' height='%g'" % region[1:]
    elif region:
        reg = " x='%g' y='%g' width='%g' height='%g' filterUnits='userSpaceOnUse'" % region
    else:
        reg = ""
    d = ""
    src = "SourceAlpha"
    if disp > 0:
        d = (f"<feTurbulence type='fractalNoise' baseFrequency='{wob:.3f}' numOctaves='1' seed='{seed + 11}' result='wn'/>"
             f"<feDisplacementMap in='SourceAlpha' in2='wn' scale='{disp * W:.2f}' xChannelSelector='R' yChannelSelector='G' result='dsp'/>")
        src = "dsp"
    return (f"<filter id='{fid}'{reg} color-interpolation-filters='sRGB'>{d}"
            f"<feTurbulence type='fractalNoise' baseFrequency='{bf:.3f}' numOctaves='{octv}' seed='{seed}'/>"
            f"<feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0' result='gr'/>"
            f"<feGaussianBlur in='{src}' stdDeviation='{sig:.2f}' result='s'/>"
            f"<feComposite in='s' in2='gr' operator='arithmetic' k1='{k1:.3f}' k2='{k2:.3f}' k3='{k3:.3f}' k4='{k4:.3f}'/>"
            f"<feComponentTransfer result='m'><feFuncA type='linear' slope='{slope}' intercept='{0.5 - 0.5 * slope:.2f}'/></feComponentTransfer>"
            f"<feGaussianBlur in='{src}' stdDeviation='{gate_k * W:.2f}'/>"
            f"<feComponentTransfer result='gt'><feFuncA type='linear' slope='8' intercept='-0.4'/></feComponentTransfer>"
            f"<feComposite in='m' in2='gt' operator='in' result='m2'/>"
            f"<feFlood flood-color='{ink}'/><feComposite in2='m2' operator='in'/></filter>")


# What the site ships. The ground: the same model at 1.4x gain with no dark
# flecks, seed 11, its thread stripes 1.7x stronger again so the cloth reads
# at arm's length (L sd about 3.4 at 2x), laid over GROUND_PAINT inside the
# tile itself. Over that paint it reads #f6f6f3, the page's --paper-seen; with
# the paint inside the tile, a late or blocked tile shows that colour too,
# never a bare grey paint (assets/site.css --weave-ground).
GROUND_GAIN = 1.4
GROUND_THREADS = 1.7
GROUND_PAINT = "#dfdfd8"


def ground_tile(paint=GROUND_PAINT):
    """The page's ground tile. paint=None gives the bare white-alpha weave (for solve.py)."""
    g, t = GROUND_GAIN, GROUND_GAIN * GROUND_THREADS
    return weave_svg(+1, seed=11, G_k=0.0, paint=paint, A_d=round(0.30 * t, 3), A_w=round(0.22 * t, 3), A_f=round(0.24 * t, 3),
                     G_s=0.08 * g, G_g=0.13 * g, G_m=0.06 * g)


def site_defs():
    """The hidden crayon-defs svg pasted after <body> in index.html, ko/index.html and 404.html.
    Pen and ring run their speck noise 15% lower (aa .153) so they match the drawing's charcoal."""
    return ('<svg class="crayon-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>'
            + crayon("cr-pen", 2.2, region="vp", seed=5, aa=0.153)        # notes, run marks, arrow, CTA underline
            + crayon("cr-ring", 5.6, region="vp", seed=4, aa=0.153)       # ring: 100 units/em, stroke 5-6.8
            + crayon("cr-strike", 9.5, region="vp", seed=8)               # strike: 100 units/em, stroke 9.5
            + '</defs></svg>')


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "site":
        print('  --weave-ground: url("' + data_uri(ground_tile()) + '");')
        print(site_defs())
    elif cmd == "tile":
        sign = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        svg = weave_svg(sign)
        print(svg)
    elif cmd == "uri":
        sign = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        print(data_uri(weave_svg(sign)))
    elif cmd == "crayon":
        print(crayon(sys.argv[2], float(sys.argv[3])))
