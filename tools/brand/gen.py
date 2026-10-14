"""Share cards and icons, drawn from the live pages and assets/mark.svg.

    python3 tools/brand/gen.py og       # og.png, og-ko.png (1200x630)
    python3 tools/brand/gen.py icons    # favicon.ico (16/32/48 from icon.svg),
                                        # apple-touch-icon.png, icon-192.png, icon-512.png, logo.png

Needs macOS (headless WebKit via tools/canvas/snap2.swift, AppKit via rsvg.swift,
sips) and, for the cards, the full Caveat that `python3 tools/fonts.py` keeps in
tools/.cache/ (the page's Caveat subset has no "y", "." or "/").

The cards are each page's own headline markup, ring and logo, set in the
site's stylesheet at 50px (KO 45px) on a flat --paper-seen ground over the
page's closing drawing (the lakeside panorama, whole, across the bottom),
rendered at 2x so the crayon filters apply and scaled to 1200x630. The ground
is flat on purpose: previews shrink and recompress the card, where a cloth
texture would only shimmer (the drawing keeps its own weave). That weave is
what makes the cards heavy, so they are re-encoded as plain RGB PNGs with each
channel quantised to steps of 4 (offset so the flat ground stays exactly
#f6f6f3; no visible change) to stay under about 300KB, past which WhatsApp
drops og:image previews; og() stops if a card comes out heavier. The icons are the logo's loop
in charcoal #171b22; the app icons and logo.png sit on an opaque #f6f6f3 ground
(iOS fills a transparent touch icon with black).

The file names, sizes and the ?v= in the pages' og:image tags stay as they are:
after a change the old ?v= key must be bumped only if it was already deployed.
"""
import functools
import http.server
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(ROOT, "tools", ".cache")
sys.path.insert(0, os.path.join(ROOT, "tools", "canvas"))
from bake import chunk, read_png, snap2  # noqa: E402

INK = "#171b22"
GROUND = "#f6f6f3"
OG_LIMIT = 300_000     # bytes: WhatsApp drops og:image previews heavier than about this

CARD_CSS = """
@font-face { font-family: "Caveat OG"; font-weight: 400 700; src: url("/caveat-full.woff2") format("woff2"); }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body.og { display: block; min-height: 0; background-image: none; }
.card { position: relative; width: 1200px; height: 630px; }
.og .mark { position: absolute; left: 86px; top: 38px; }
.og .mark svg { width: 84px; }
.og .url { position: absolute; right: 86px; top: 50px; margin: 0; font-family: "Caveat OG", cursive; font-weight: 600; font-size: 40px; line-height: 1; color: var(--pen); }
.og h1 { position: absolute; left: 85px; top: 134px; margin: 0; font-size: 50px; line-height: 1.26; width: 1060px; text-wrap: wrap; }
html:lang(ko) .og h1 { top: 128px; font-size: 45px; line-height: 1.4; }
.og .pano { position: absolute; left: 110px; bottom: 26px; width: 980px; }
.og .pano svg { display: block; width: 100%; height: auto; }
"""


def grab(h, pat):
    m = re.search(pat, h, re.S)
    if not m:
        sys.exit(f"not found in page: {pat}")
    return m.group(0)


def card(lang, page):
    """One card page from the live page's own markup, with the headline broken as on the old cards."""
    h = open(os.path.join(ROOT, page)).read()
    h1 = re.search(r"<h1>(.*?)</h1>", h, re.S).group(1)
    if lang == "en":
        # the page's phrase bundles (.nw-md) are for its own column; the card sets its own breaks
        h1 = re.sub(r'<span class="nw-md">(.*?)</span>', r"\1", h1)
        h1 = h1.replace("a personal AI", "a personal<br>AI", 1).replace("you mean into", "you mean<br>into", 1)
        url = "telicity.ai"
    else:
        h1 = h1.replace('<span class="nw-sm">분명한 목표로</span> ', '<span class="nw-sm">분명한 목표로</span><br>', 1)
        h1 = h1.replace('<span class="nw">개인 AI 비서를</span> ', '<span class="nw">개인 AI 비서를</span><br>', 1)
        url = "telicity.ai/ko"
    if h1.count("<br>") != 2:
        sys.exit(f"{lang}: the headline changed; update the line breaks in card()")
    return (f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8">'
            '<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/card.css"></head>'
            f'<body class="og">{grab(h, r"<svg class=.crayon-defs.*?</svg>")}<div class="card">'
            f'<span class="mark">{grab(h, r"<svg viewBox=.0 0 32[.]7 21[.]7.*?</svg>")}</span>'
            f'<div class="pano">{grab(h, r"<svg class=.lakeside-art lakeside-wide.*?</svg>")}</div>'
            f'<h1>{h1}</h1><p class="url">{url}</p></div></body></html>')


def rgb_png(src, dst):
    """Re-encode sips' RGBA card as an RGB PNG: alpha dropped (always opaque),
    each channel quantised to steps of 4 with an offset (2, 2, 3) so the
    ground #f6f6f3 stays exact, per-row adaptive filters (none, sub, up,
    Paeth; least sum of absolute values), zlib 9, tagged sRGB."""
    w, h, ch, px = read_png(src)
    rgb = bytearray(w * h * 3)
    for c, off in enumerate((2, 2, 3)):
        lut = bytes(max(0, min(255, ((v - off + 2) & ~3) + off)) for v in range(256))
        rgb[c::3] = px[c::ch].translate(lut)
    stride, absv = w * 3, bytes(min(v, 256 - v) for v in range(256))
    raw, prev = bytearray(), bytes(stride)
    for y in range(h):
        line = bytes(rgb[y * stride:(y + 1) * stride])
        left, ul = bytes(3) + line[:-3], bytes(3) + prev[:-3]
        cands = [(0, line),
                 (1, bytes((x - a) & 255 for x, a in zip(line, left))),
                 (2, bytes((x - b) & 255 for x, b in zip(line, prev)))]
        paeth = bytearray(stride)
        for i, (x, a, b, c) in enumerate(zip(line, left, prev, ul)):
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            paeth[i] = (x - (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        cands.append((4, bytes(paeth)))
        f, best = min(cands, key=lambda fc: sum(fc[1].translate(absv)))
        raw.append(f)
        raw += best
        prev = line
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"sRGB", b"\x00")
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
    open(dst, "wb").write(data)
    return len(data)


def og():
    caveat = os.path.join(CACHE, "Caveat_wght_400_700.bin")
    if not os.path.exists(caveat):
        sys.exit("run python3 tools/fonts.py first: it downloads the full Caveat into tools/.cache/")
    tmp = tempfile.mkdtemp()
    os.symlink(os.path.join(ROOT, "assets"), os.path.join(tmp, "assets"))
    shutil.copy(caveat, os.path.join(tmp, "caveat-full.woff2"))
    open(os.path.join(tmp, "card.css"), "w").write(CARD_CSS)
    for lang, page in (("en", "index.html"), ("ko", os.path.join("ko", "index.html"))):
        open(os.path.join(tmp, f"{lang}.html"), "w").write(card(lang, page))
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=tmp))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    for lang, out in (("en", "og.png"), ("ko", "og-ko.png")):
        shot = os.path.join(tmp, f"{lang}@2x.png")
        subprocess.run([snap2(), f"http://127.0.0.1:{port}/{lang}.html", shot, "1200", "630", "2", "0", "2"],
                       check=True, capture_output=True)
        small = os.path.join(tmp, f"{lang}.png")
        subprocess.run(["sips", "-z", "630", "1200", shot, "--out", small], check=True, capture_output=True)
        size = rgb_png(small, os.path.join(ROOT, out))
        print(out, size, "bytes")
        if size > OG_LIMIT:
            sys.exit(f"{out}: {size} B is over {OG_LIMIT}; WhatsApp drops larger og:image previews")
    srv.shutdown()


def rsvg():
    out = os.path.join(CACHE, "rsvg")
    if not os.path.exists(out):
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["swiftc", "-O", os.path.join(HERE, "rsvg.swift"), "-o", out], check=True)
    return out


def icons():
    tmp = tempfile.mkdtemp()
    # app icons: the logo's loop, 357/512 of the width, centred a little low
    d = re.search(r' d="([^"]+)"', open(os.path.join(ROOT, "assets", "mark.svg")).read()).group(1)
    s = 357 / 32.7
    app = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="{GROUND}"/>'
           f'<g transform="translate({255.5 - 16.35 * s:.2f} {265 - 10.8 * s:.2f}) scale({s:.4f})" fill="none" stroke="{INK}" '
           'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
           f'<path d="{d}"/><circle cx="27.15" cy="13.88" r="1.4" fill="{INK}" stroke="none"/></g></svg>')
    open(os.path.join(tmp, "app.svg"), "w").write(app)
    for n, names in ((180, ["apple-touch-icon.png"]), (192, ["icon-192.png"]), (512, ["icon-512.png", "logo.png"])):
        png = os.path.join(tmp, f"app-{n}.png")
        subprocess.run([rsvg(), os.path.join(tmp, "app.svg"), png, str(n)], check=True)
        for name in names:
            shutil.copy(png, os.path.join(ROOT, name))
            print(name, n, "px")
    # favicon.ico: the simplified tab-size drawing in icon.svg, PNG entries at 16, 32 and 48
    imgs = []
    for n in (16, 32, 48):
        png = os.path.join(tmp, f"fav-{n}.png")
        subprocess.run([rsvg(), os.path.join(ROOT, "icon.svg"), png, str(n)], check=True)
        imgs.append((n, open(png, "rb").read()))
    head, ent, data = struct.pack("<HHH", 0, 1, len(imgs)), b"", b""
    for n, b in imgs:
        ent += struct.pack("<BBBBHHII", n, n, 0, 0, 1, 32, len(b), 6 + 16 * len(imgs) + len(data))
        data += b
    open(os.path.join(ROOT, "favicon.ico"), "wb").write(head + ent + data)
    print("favicon.ico", len(head + ent + data), "bytes")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    if what not in ("og", "icons"):
        sys.exit(__doc__)
    {"og": og, "icons": icons}[what]()
