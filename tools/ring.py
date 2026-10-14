"""Hand-drawn pen ring around the headline's endpoint phrase.

    python3 tools/ring.py

Prints, for each language, the viewBox and path for the h1's ring <svg> and
the `.ring > svg` offsets for assets/site.css. Not deployed (.vercelignore).

How it works: the points below are in em (y up, baseline = 0, the phrase
runs from x = 0 to W). A Catmull-Rom spline through them becomes cubic
Beziers in a viewBox of 100 units per em (y down), so the loop renders
undistorted at the phrase's design width and hugs the glyphs with the same
margin at every headline size.

When the ringed phrase or its font changes:
  1. Measure W in the browser: the `.ring` span's width / its font-size.
     Currently EN "sees it through." = 6.03em (Newsreader),
     KO "끝까지 해내 주는" = 6.694em (Gowun Batang, word-spacing -0.088em).
  2. Move the point list to the new W (shift the right-hand points; keep the
     overhangs: about 0.3em past each end, 0.15em above the tallest glyph).
  3. Paste the printed viewBox and d into the h1's <svg> (keep
     pathLength="1"), and the offsets into site.css (`.ring > svg` for EN,
     `html:lang(ko) .ring > svg` for KO).
  4. Check the loop in screenshots at 320, 360, 375, 390, 768, 1280 and
     1440px. The shipped `top` values carry a small nudge by eye.
  5. Re-render og.png / og-ko.png with the same points.

The loop closes on its own start (no tail running back along the top), so
the first and last stroke never sit side by side as a doubled line.
"""


def spline(pts, tension=1.0):
    """Open Catmull-Rom through pts -> list of (c1, c2, p)."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    segs = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * tension, p1[1] + (p2[1] - p0[1]) / 6 * tension)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * tension, p2[1] - (p3[1] - p1[1]) / 6 * tension)
        segs.append((c1, c2, p2))
    return segs


def ring(pts, W, pad=0.07):
    segs = spline(pts)
    allp = [pts[0]] + [q for s in segs for q in s]
    xs = [p[0] for p in allp]
    ys = [p[1] for p in allp]
    left, right = min(xs) - pad, max(xs) + pad
    top, bottom = max(ys) + pad, min(ys) - pad
    T = lambda p: ((p[0] - left) * 100, (top - p[1]) * 100)
    f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")
    d = "M" + " ".join(f(v) for v in T(pts[0]))
    for c1, c2, p in segs:
        d += "C" + " ".join(f(v) for q in (c1, c2, p) for v in T(q))
    vb = f"0 0 {f((right - left) * 100)} {f((top - bottom) * 100)}"
    css = dict(left=round(left, 3), extra_w=round(right - left - W, 3),
               top_above_baseline=round(top, 3), height=round(top - bottom, 3))
    return d, vb, css


# Phrase widths in em, and the font's ascent (em above the baseline at the
# top of the span's content box), which turns "top above baseline" into a
# CSS `top`.
EN_W, EN_ASCENT = 6.03, 0.735   # Newsreader
KO_W, KO_ASCENT = 6.694, 1.16   # Gowun Batang

EN = [(0.42, 0.66), (1.6, 0.74), (3.2, 0.8), (4.8, 0.85), (5.98, 0.8), (6.36, 0.25), (5.83, -0.36),
      (4.6, -0.41), (2.6, -0.34), (0.9, -0.27), (-0.08, -0.13), (-0.27, 0.25), (-0.1, 0.58),
      (0.5, 0.72)]

# Designed at 6.87em, then fitted to the phrase as tightened by word-spacing.
_KO_DESIGN_W = 6.87
KO = [(x * KO_W / _KO_DESIGN_W, y) for x, y in
      [(0.5, 0.93), (2.0, 1.0), (3.8, 1.05), (5.5, 1.06), (6.7, 1.0), (7.2, 0.42), (6.75, -0.17),
       (5.2, -0.24), (3.2, -0.23), (1.2, -0.21), (-0.12, -0.12), (-0.3, 0.38), (-0.12, 0.84),
       (0.6, 0.99)]]

if __name__ == "__main__":
    for name, sel, pts, W, ascent in (("EN", ".ring > svg", EN, EN_W, EN_ASCENT),
                                      ("KO", "html:lang(ko) .ring > svg", KO, KO_W, KO_ASCENT)):
        d, vb, css = ring(pts, W)
        print(f"== {name}")
        print(f'<svg viewBox="{vb}" preserveAspectRatio="none" aria-hidden="true">'
              f'<path class="pen ink" pathLength="1" d="{d}"/></svg>')
        print(f"{sel} {{\n  left: {css['left']}em;\n"
              f"  top: {round(ascent - css['top_above_baseline'], 3)}em;  /* nudge by eye */\n"
              f"  width: calc(100% + {css['extra_w']}em);\n  height: {css['height']}em;\n}}\n")
