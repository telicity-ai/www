"""Cut the self-hosted font subsets from the page copy.

    python3 tools/fonts.py           # rebuild the subsets and update references
    python3 tools/fonts.py --check   # exit 1 if a rendered character is missing

Needs fontTools and brotli (`python3 -m pip install fonttools brotli`). The
full source fonts (all OFL) are downloaded once from Google Fonts into
tools/.cache/. Not deployed (.vercelignore).

Each subset holds exactly the characters its family renders on the pages,
including the words the sign-up's JavaScript and functions put there (the
form's data-msg-* / data-pen-* attributes and the JSON in api/_lib/copy.mjs):

  caveat              English handwriting: .cta, .wl-lead and data-note text
                      on the English pages and the 404, the functions' English
                      way-back links (one variable file, wght 500-600)
  gowun-batang        Korean print on /ko/, with the sign-up's replies and
                      dates (preloaded on /ko/)
  gowun-batang-ext    Korean print only the other Korean pages use
                      (/ko/privacy/, /ko/unsubscribe/, the functions' pages):
                      the characters gowun-batang lacks, outside Newsreader's
                      range. Its unicode-range in site.css is written here, so
                      /ko/ never fetches it
  gowun-batang-bold   Korean bold (strong, .doc h3, .wl-legend) on Korean pages
  nanum-pen           Korean handwriting on the Korean pages and the
                      functions' Korean way-back links
  gowun-batang-lite   lang="ko" text on the English pages and the 404 (한국어,
                      the 404's Korean line, Korean terms in /privacy/)

Files are named by content hash (assets/fonts is served as immutable for a
year), and the url() in assets/site.css and the /ko/ preload are rewritten
to match. Run it after any copy change, then commit the new files and drop
the old ones (the script deletes them from assets/fonts).
"""
import hashlib
import io
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
CSS = ROOT / "assets" / "site.css"
CACHE = Path(__file__).resolve().parent / ".cache"
PAGES = {
    "en": ROOT / "index.html",
    "ko": ROOT / "ko" / "index.html",
    "404": ROOT / "404.html",
    "privacy-en": ROOT / "privacy" / "index.html",
    "privacy-ko": ROOT / "ko" / "privacy" / "index.html",
    "unsub-en": ROOT / "unsubscribe" / "index.html",
    "unsub-ko": ROOT / "ko" / "unsubscribe" / "index.html",
}
EN_PAGES = ["en", "404", "privacy-en", "unsub-en"]
KO_DOCS = ["privacy-ko", "unsub-ko"]
COPY = ROOT / "api" / "_lib" / "copy.mjs"
# Files that reference the font files (url() and preload hrefs).
REFS = [CSS] + list(PAGES.values())

PEN = {"cta", "note", "wl-lead"}
BOLD_TAGS = {"strong", "b", "h3"}
BOLD = {"wl-legend"}
# The replies site.js shows on /ko/ itself (the rest of copy.mjs is for the
# functions' own pages).
INLINE_KEYS = {"success", "errorInvalid", "errorConsent", "errorRate", "errorServer"}
KO_DATE = "0123456789년월일 "
LEGACY_UA = "Mozilla/4.0"  # Google Fonts then serves one full TTF
MODERN_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")


class Text(HTMLParser):
    """Rendered text of <body>, sorted into pen / print and lang="ko"."""

    VOID = {"br", "img", "meta", "link", "input", "hr", "path", "circle", "rect", "line"}

    def __init__(self):
        super().__init__()
        self.stack = []  # (tag, pen, ko, skip, bold)
        self.pen, self.print, self.ko, self.bold = [], [], [], []
        self.in_body = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "body":
            self.in_body = True
        top = self.stack[-1] if self.stack else ("", False, False, False, False)
        classes = set((a.get("class") or "").split())
        pen = top[1] or bool(PEN & classes)
        ko = (a["lang"] == "ko") if "lang" in a else top[2]
        skip = top[3] or tag in ("script", "style", "svg", "head")
        bold = top[4] or tag in BOLD_TAGS or bool(BOLD & classes)
        if self.in_body and not skip:
            for name, value in a.items():
                # data-note follows its element; data-pen-* is shown in the
                # hand, data-msg-* in print (both by site.js).
                if name == "data-note" or name.startswith("data-msg-") or name.startswith("data-pen-"):
                    as_pen = name.startswith("data-pen-") or (name == "data-note" and pen)
                    (self.pen if as_pen else self.print).append(value or "")
                    if ko:
                        self.ko.append(value or "")
        if tag not in self.VOID and not tag.endswith("/"):
            self.stack.append((tag, pen, ko, skip, bold))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID and self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if not self.in_body or not self.stack or self.stack[-1][3]:
            return
        _, pen, ko, _, bold = self.stack[-1]
        (self.pen if pen else self.print).append(data)
        if bold and not pen:
            self.bold.append(data)
        if ko:
            self.ko.append(data)


def page(key):
    t = Text()
    t.feed(PAGES[key].read_text(encoding="utf-8"))
    return t


def chars(*texts):
    return {c for s in texts for c in " ".join(s) if c.isprintable()} | {" "}


def copy(lang, kind, keys=None):
    """Strings from api/_lib/copy.mjs: kind is pen, bold, other (the other
    script) or print (everything else); keys narrows them."""
    data = json.loads(COPY.read_text(encoding="utf-8").split("/* COPY-JSON */", 1)[1].split("/* END-COPY-JSON */", 1)[0])
    out = []
    for k, v in data[lang].items():
        if keys is not None and k not in keys:
            continue
        group = "pen" if k in data["pen"] else "other" if k in data["otherScript"] else "print"
        if kind == group or (kind == "bold" and k in data["bold"]):
            out.append(v.replace("{date}", ""))
    return out


def newsreader_range():
    """Code points Newsreader sets (its unicode-range in site.css): those
    never need a Korean face."""
    css = CSS.read_text(encoding="utf-8")
    block = re.search(r'font-family: "Newsreader";.*?unicode-range: ([^;]+);', css, re.S).group(1)
    cps = set()
    for part in block.split(","):
        lo, _, hi = part.strip()[2:].partition("-")
        cps.update(range(int(lo, 16), int(hi or lo, 16) + 1))
    return cps


def korean_only(cs):
    """Leaves out what Newsreader sets, except the middle dot: on Korean
    pages it is set in the Korean face (.mid in site.css)."""
    nr = newsreader_range()
    return {c for c in cs if ord(c) not in nr or c == "·"}


def ko_main():
    return chars(page("ko").print, copy("ko", "print", INLINE_KEYS), [KO_DATE])


def ko_ext():
    docs = [page(k).print for k in KO_DOCS]
    return korean_only(chars(*docs, copy("ko", "print"), copy("ko", "bold"), [KO_DATE]) - ko_main())


def ko_bold():
    return korean_only(chars(page("ko").bold, *[page(k).bold for k in KO_DOCS], copy("ko", "bold")))


def unicode_range(cs):
    cps = sorted(ord(c) for c in cs)
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f"U+{cps[i]:X}" if i == j else f"U+{cps[i]:X}-{cps[j]:X}")
        i = j + 1
    return ", ".join(out)


def css_range(family):
    css = CSS.read_text(encoding="utf-8")
    m = re.search(r'font-family: "' + re.escape(family) + r'";[^}]*?unicode-range: ([^;]+);', css, re.S)
    return m


def write_range(family, cs):
    css = CSS.read_text(encoding="utf-8")
    m = css_range(family)
    if not m:
        sys.exit(f"{family}: no unicode-range in {CSS.relative_to(ROOT)}")
    CSS.write_text(css[:m.start(1)] + unicode_range(cs) + css[m.end(1):], encoding="utf-8")


FACES = [
    dict(name="caveat", family="Caveat", axes={"wght": (500, 600)},
         source=("Caveat:wght@400..700", MODERN_UA, "latin"),
         chars=lambda: chars(*[page(k).pen for k in EN_PAGES], copy("en", "pen"))),
    dict(name="gowun-batang", family="Gowun Batang",
         source=("Gowun+Batang", LEGACY_UA, None),
         chars=ko_main),
    dict(name="gowun-batang-ext", family="Gowun Batang Ext", range=True,
         source=("Gowun+Batang", LEGACY_UA, None),
         chars=ko_ext),
    dict(name="gowun-batang-bold", family="Gowun Batang",
         source=("Gowun+Batang:wght@700", LEGACY_UA, None),
         chars=ko_bold),
    dict(name="nanum-pen", family="Nanum Pen Script",
         source=("Nanum+Pen+Script", LEGACY_UA, None),
         chars=lambda: chars(page("ko").pen, *[page(k).pen for k in KO_DOCS], copy("ko", "pen"))),
    dict(name="gowun-batang-lite", family="Gowun Batang Lite",
         source=("Gowun+Batang", LEGACY_UA, None),
         chars=lambda: chars(*[page(k).ko for k in EN_PAGES], copy("en", "other"))),
]


def fetch(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req) as r:
        return r.read()


def source(face):
    family, ua, block = face["source"]
    CACHE.mkdir(exist_ok=True)
    path = CACHE / (re.sub(r"\W+", "_", family) + ".bin")
    if not path.exists():
        css = fetch(f"https://fonts.googleapis.com/css2?family={family}", ua).decode()
        if block:  # pick the /* latin */ slice of a sliced response
            css = css.split(f"/* {block} */", 1)[1].split("}", 1)[0]
        url = re.search(r"url\((https://[^)]+)\)", css).group(1)
        path.write_bytes(fetch(url, ua))
    return path


def pattern(name):
    return re.compile(r"/assets/fonts/" + re.escape(name) + r"(?:\.[0-9a-f]{8})?\.woff2")


def current_file(name):
    m = pattern(name).search(CSS.read_text(encoding="utf-8"))
    if not m:
        sys.exit(f"{name}: no url() in {CSS.relative_to(ROOT)}")
    return ROOT / m.group(0).lstrip("/")


def build(face):
    from fontTools import subset
    from fontTools.ttLib import TTFont

    font = TTFont(source(face), recalcTimestamp=False, lazy=False)
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.flavor = "woff2"
    sub = subset.Subsetter(opts)
    sub.populate(text="".join(sorted(face["chars"]())))
    sub.subset(font)
    if face.get("axes"):  # keep only the weights the CSS uses
        from fontTools.varLib import instancer
        font = instancer.instantiateVariableFont(font, face["axes"])
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    data = buf.getvalue()
    name = f"{face['name']}.{hashlib.sha256(data).hexdigest()[:8]}.woff2"
    for old in FONTS.glob(face["name"] + ".*woff2"):
        if pattern(face["name"]).fullmatch("/assets/fonts/" + old.name) and old.name != name:
            old.unlink()
    (FONTS / name).write_bytes(data)
    for ref in REFS:
        s = ref.read_text(encoding="utf-8")
        t = pattern(face["name"]).sub("/assets/fonts/" + name, s)
        if t != s:
            ref.write_text(t, encoding="utf-8")
    if face.get("range"):
        write_range(face["family"], face["chars"]())
    print(f"{name}: {len(data):,} bytes, {len(face['chars']())} characters")


def check():
    from fontTools.ttLib import TTFont

    bad = 0
    for face in FACES:
        path = current_file(face["name"])
        if not path.exists():
            print(f"{face['name']}: {path.relative_to(ROOT)} does not exist")
            bad += 1
            continue
        cmap = TTFont(path).getBestCmap()
        missing = sorted(c for c in face["chars"]() if ord(c) not in cmap)
        if missing:
            bad += 1
            print(f"{face['name']}: missing {''.join(missing)!r} -> run python3 tools/fonts.py")
        elif face.get("range") and css_range(face["family"]).group(1) != unicode_range(face["chars"]()):
            bad += 1
            print(f"{face['name']}: unicode-range in site.css is stale -> run python3 tools/fonts.py")
        else:
            print(f"{face['name']}: ok ({path.name})")
    for ref in REFS:
        for m in re.finditer(r"/assets/fonts/[\w.-]+\.woff2", ref.read_text(encoding="utf-8")):
            if not (ROOT / m.group(0).lstrip("/")).exists():
                bad += 1
                print(f"{ref.relative_to(ROOT)}: {m.group(0)} does not exist")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        for f in FACES:
            build(f)
