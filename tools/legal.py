"""Build the privacy policy pages and check the legal text is consistent.

    python3 tools/legal.py           # legal/privacy.{en,ko}.md -> privacy/index.html, ko/privacy/index.html
    python3 tools/legal.py --check   # exit 1 if anything below is off

The Markdown in legal/ is the source: edit it, then run this, then
python3 tools/fonts.py (new words need new glyphs). The pages are written in
the site's print, with the masthead and colophon of the other pages.

--check fails when
  - a {PLACEHOLDER} is still in a policy (the owner must fill them before
    the pages go live),
  - the built pages differ from what the Markdown gives (run this script),
  - the consent notice on / or /ko/ (the printed line under the button,
    links included, and the button) differs from legal/consent/<version>.md
    for the version the form posts, or that version is not the newest id in
    consentVersions (api/_lib/copy.mjs), or an id there has no file.
Not deployed (.vercelignore).
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGAL = ROOT / "legal"
OUT = {"en": ROOT / "privacy" / "index.html", "ko": ROOT / "ko" / "privacy" / "index.html"}
HOME = {"en": "/", "ko": "/ko/"}
URL = {"en": "https://telicity.ai/privacy/", "ko": "https://telicity.ai/ko/privacy/"}
PLACEHOLDER = re.compile(r"\{[A-Z][A-Z0-9_]*\}")

META = {
    "en": dict(
        title="Privacy Policy | Telicity",
        description="How Telicity handles the email addresses people leave on telicity.ai for news, and what else the site processes.",
        locale="en_US", alt_locale="ko_KR", site="Telicity", mark="Telicity",
        other=("/ko/privacy/", "ko", "한국어"), copyright="© 2026 Telicity", privacy="Privacy Policy",
    ),
    "ko": dict(
        title="개인정보 처리방침 | 텔리시티",
        description="텔리시티가 telicity.ai에서 소식 메일을 받으려고 남기신 이메일 주소와 그 밖의 개인정보를 어떻게 처리하는지 적었습니다.",
        locale="ko_KR", alt_locale="en_US", site="Telicity", mark="텔리시티",
        other=("/privacy/", "en", "English"), copyright="© 2026 텔리시티", privacy="개인정보 처리방침",
    ),
}

def mark_svg():
    """The logo, read from index.html so it stays one drawing."""
    s = (ROOT / "index.html").read_text(encoding="utf-8")
    return re.search(r'<svg viewBox="0 0 32.7 21.7".*?</svg>', s, re.S).group(0)


# ---------- Markdown, the small subset the policies use ----------

LINKS = [
    (re.compile(r"\btelicity\.ai(/(?:ko/)?(?:privacy|unsubscribe)/)"), lambda m: f'<a href="{m.group(1)}">{m.group(0)}</a>'),
    # ASCII only: Korean particles follow addresses directly (hello@telicity.ai로).
    (re.compile(r"(?<![A-Za-z0-9._+-])[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![A-Za-z0-9-])"), lambda m: f'<a href="mailto:{m.group(0)}">{m.group(0)}</a>'),
    (re.compile(r"\b(?:www\.kopico\.go\.kr|privacy\.kisa\.or\.kr|ecrm\.police\.go\.kr)\b"), lambda m: f'<a href="https://{m.group(0)}/">{m.group(0)}</a>'),
    # The vendor pages the policy points to (section 2 and 7).
    (re.compile(r"\b(?:vercel\.com/legal/privacy-policy|datacenters\.google/locations/)"), lambda m: f'<a href="https://{m.group(0)}">{m.group(0)}</a>'),
]
HANGUL = re.compile(r"[가-힣](?:[가-힣 ]*[가-힣])?")


def inline(text, lang):
    s = html.escape(text, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    # Links, without touching text already inside a tag.
    for rx, fn in LINKS:
        parts = re.split(r"(<[^>]+>)", s)
        s = "".join(p if p.startswith("<") else rx.sub(fn, p) for p in parts)
    if lang == "ko":  # the middle dot from the Korean face (see .mid in site.css)
        s = s.replace("·", '<span class="mid">·</span>')
    if lang == "en":  # Korean words on the English page are marked as Korean
        parts = re.split(r"(<[^>]+>)", s)
        s = "".join(p if p.startswith("<") else HANGUL.sub(lambda m: f'<span lang="ko">{m.group(0)}</span>', p) for p in parts)
    return s


def body(md, lang):
    """Returns (h1, effective line, html of the sections)."""
    lines = md.strip("\n").split("\n")
    assert lines[0].startswith("# "), "the policy starts with its # title"
    h1 = lines[0][2:].strip()
    blocks, para, lst = [], [], None

    def flush():
        nonlocal para, lst
        if para:
            blocks.append(("p", " ".join(para)))
            para = []
        if lst:
            blocks.append(lst)
            lst = None

    for line in lines[1:]:
        if not line.strip():
            flush()
            continue
        m = re.match(r"(#{2,3}) (.*)", line)
        if m:
            flush()
            blocks.append(("h%d" % len(m.group(1)), m.group(2).strip()))
            continue
        m = re.match(r"(- |\d+\. )(.*)", line)
        if m:
            if para:
                flush()
            kind = "ul" if m.group(1) == "- " else "ol"
            if not lst or lst[0] != kind:
                if lst:
                    blocks.append(lst)
                lst = (kind, [])
            lst[1].append(m.group(2))
            continue
        if lst:
            flush()
        para.append(line.strip())
    flush()

    assert blocks and blocks[0][0] == "p", "the effective date follows the title"
    effective = blocks.pop(0)[1]
    out, open_section = [], False
    for kind, val in blocks:
        if kind == "h2":
            if open_section:
                out.append("        </section>")
            n = re.match(r"(\d+)\.", val)
            sid = f"s{n.group(1)}" if n else "summary"
            cls = "" if n else ' class="doc-short"'
            out.append(f'        <section{cls} aria-labelledby="{sid}">')
            out.append(f'          <h2 id="{sid}">{inline(val, lang)}</h2>')
            open_section = True
        elif kind == "h3":
            out.append(f"          <h3>{inline(val, lang)}</h3>")
        elif kind == "p":
            out.append(f"          <p>{inline(val, lang)}</p>")
        else:
            items = "\n".join(f"            <li>{inline(i, lang)}</li>" for i in val)
            out.append(f"          <{kind}>\n{items}\n          </{kind}>")
    if open_section:
        out.append("        </section>")
    return h1, effective, "\n".join(out)


def page(lang):
    md = (LEGAL / f"privacy.{lang}.md").read_text(encoding="utf-8")
    h1, effective, sections = body(md, lang)
    m = META[lang]
    other_href, other_lang, other_name = m["other"]
    alt = {"en": URL["en"], "ko": URL["ko"]}
    ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": URL[lang] + "#webpage",
        "url": URL[lang],
        "name": m["title"],
        "description": m["description"],
        "inLanguage": lang,
        "isPartOf": {"@id": "https://telicity.ai/#website"},
        "about": {"@id": "https://telicity.ai/#organization"},
        "datePublished": "2026-10-14",
        "dateModified": "2026-10-15",
    }
    head_lang = f'<a class="mast-lang" href="{other_href}" hreflang="{other_lang}" lang="{other_lang}">{other_name}</a>'
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(m["title"])}</title>
<meta name="description" content="{html.escape(m["description"])}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{URL[lang]}">
<link rel="alternate" hreflang="en" href="{alt["en"]}">
<link rel="alternate" hreflang="ko" href="{alt["ko"]}">
<link rel="alternate" hreflang="x-default" href="{alt["en"]}">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#f6f6f3">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/newsreader.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{m["site"]}">
<meta property="og:url" content="{URL[lang]}">
<meta property="og:title" content="{html.escape(m["title"])}">
<meta property="og:description" content="{html.escape(m["description"])}">
<meta property="og:locale" content="{m["locale"]}">
<meta property="og:locale:alternate" content="{m["alt_locale"]}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=2)}
</script>
</head>
<body>
<div class="sheet">
  <header class="masthead">
    <a class="mark" href="{HOME[lang]}" aria-label="{m["mark"]}">
      {mark_svg()}
    </a>
    {head_lang}
  </header>

  <main class="page page-404 page-doc">
    <div class="row">
      <article class="doc-wrap">
        <header class="doc-head">
          <h1>{inline(h1, lang)}</h1>
          <p class="doc-meta">{inline(effective, lang)}</p>
        </header>
        <div class="doc">
{sections}
        </div>
      </article>
    </div>
  </main>

  <footer class="foot">
    <p>{m["copyright"]}</p>
    <a class="foot-privacy" href="{HOME[lang]}privacy/" aria-current="page"><strong>{m["privacy"]}</strong></a>
    <a href="{other_href}" hreflang="{other_lang}" lang="{other_lang}">{other_name}</a>
    <a href="mailto:hello@telicity.ai">hello@telicity.ai</a>
  </footer>
</div>
</body>
</html>
"""


# ---------- Checks ----------

class NoticeText(HTMLParser):
    """The consent notice as a reader sees it, in the form
    legal/consent/<version>.md records it: the printed line under the button
    (p.wl-aside, links as [text](href), bold as **text**), and the button's
    words. Signing up is the consent, so there are no boxes to read."""

    def __init__(self):
        super().__init__()
        self.cur = None  # text of the notice line being read
        self.href = None
        self.parts = []
        self.button = None
        self.in_button = False
        self.version = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        if tag == "input" and a.get("name") == "consent_version":
            self.version = a.get("value")
        if tag == "button" and "wl-submit" in cls:
            self.in_button, self.button = True, ""
        if tag == "p" and "wl-aside" in cls:
            self.cur = ""
            return
        if self.cur is None:
            return
        if tag == "a":
            self.cur += "["
            self.href = a.get("href")
        if tag == "strong":
            self.cur += "**"

    def handle_endtag(self, tag):
        if tag == "button":
            self.in_button = False
        if self.cur is None:
            return
        if tag == "p":
            self.parts.append(" ".join(self.cur.split()))
            self.cur = None
        elif tag == "a":
            self.cur += f"]({self.href})"
        elif tag == "strong":
            self.cur += "**"

    def handle_data(self, data):
        if self.cur is not None:
            self.cur += data
        if self.in_button:
            self.button += data


def notice_md(page_html):
    p = NoticeText()
    p.feed(page_html)
    return p.version, p.parts, " ".join(p.button.split())


def version_md(path, lang):
    s = path.read_text(encoding="utf-8")
    sec = s.split(f"\n## {lang}\n", 1)[1].split("\n## ", 1)[0]
    lines = [l for l in sec.strip().split("\n") if l.strip()]
    button = [l for l in lines if l.startswith("Button: ")][0][len("Button: "):]
    return [l for l in lines if not l.startswith("Button: ")], button


def copy_versions():
    s = (ROOT / "api" / "_lib" / "copy.mjs").read_text(encoding="utf-8")
    return json.loads(s.split("/* COPY-JSON */", 1)[1].split("/* END-COPY-JSON */", 1)[0])["consentVersions"]


def check():
    bad = []
    for lang in ("en", "ko"):
        md = (LEGAL / f"privacy.{lang}.md").read_text(encoding="utf-8")
        holes = sorted(set(PLACEHOLDER.findall(md)))
        if holes:
            bad.append(f"legal/privacy.{lang}.md: fill before publishing: {' '.join(holes)}")
        if not OUT[lang].exists() or OUT[lang].read_text(encoding="utf-8") != page(lang):
            bad.append(f"{OUT[lang].relative_to(ROOT)} is out of date: run python3 tools/legal.py")
    versions = copy_versions()
    for v in versions:
        if not (LEGAL / "consent" / f"{v}.md").exists():
            bad.append(f"legal/consent/{v}.md is missing (listed in api/_lib/copy.mjs)")
    for lang, path in (("en", ROOT / "index.html"), ("ko", ROOT / "ko" / "index.html")):
        version, shown, button = notice_md(path.read_text(encoding="utf-8"))
        if version != versions[-1]:
            bad.append(f"{path.relative_to(ROOT)}: the form posts consent_version {version!r}, the newest is {versions[-1]!r}")
            continue
        want, want_button = version_md(LEGAL / "consent" / f"{version}.md", lang)
        if shown != want or button != want_button:
            bad.append(f"{path.relative_to(ROOT)}: the consent notice differs from legal/consent/{version}.md "
                       "(changed wording needs a new version)")
            for a, b in zip(shown + [button], want + [want_button]):
                if a != b:
                    bad.append(f"    page: {a}\n    file: {b}")
    for b in bad:
        print(b)
    if not bad:
        print("legal: ok")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        for lang in ("en", "ko"):
            OUT[lang].parent.mkdir(parents=True, exist_ok=True)
            OUT[lang].write_text(page(lang), encoding="utf-8")
            print(f"wrote {OUT[lang].relative_to(ROOT)}")
