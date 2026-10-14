"""Look after the news list in Upstash Redis (no dependencies).

    python3 tools/waitlist.py count                  how many addresses are on the list
    python3 tools/waitlist.py export > list.csv      every record as CSV (see below)
    python3 tools/waitlist.py export --force > list.csv
                                                     the same, even with a value a spreadsheet
                                                     would read as a formula (see below)
    python3 tools/waitlist.py delete ADDRESS [REASON]
                                                     destroy one address and its record
                                                     (REASON: request | underage | bounce | other)
    python3 tools/waitlist.py due [DAYS]             records whose two-year check falls
                                                     within DAYS (default 60) or is past
    python3 tools/waitlist.py log                    the destruction log and the admin log

Reads KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL and
UPSTASH_REDIS_REST_TOKEN) from the environment: copy them from Vercel >
Storage > the database > .env.local. Never commit them.

Every export, due and delete adds a line to the admin log in Redis
(wl:log:admin: date, action, count, never an address); deletes also count in
wl:log:deleted like the unsubscribe page does. The privacy policy promises
those records, and that an export is kept encrypted and deleted after use:
write it to an encrypted disk image, not Downloads, and remove it when done.
Read and delete records only with this tool, never in the Upstash console,
so every access is logged.

A record holds one consent entry per notice version it was given under
(consent:<version> -> {"at", "lang", "page"}). The CSV has one row per
address, from its newest consent: the notice version (newest by its place
in consentVersions in api/_lib/copy.mjs), its date, and the language and
page it was given on. The two-year check counts from the latest consent.

export refuses to write a value that starts with = + - @ or a tab or
carriage return (a spreadsheet would run it as a formula), lists the
addresses on stderr and exits 1. The sign-up form refuses such addresses,
so this is a second guard; --force writes the file as it is.
Not deployed (.vercelignore).
"""
import csv
import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

SET, SUB, DELETED, ADMIN = "wl:emails", "wl:sub:", "wl:log:deleted", "wl:log:admin"
FIELDS = ["email", "lang", "consent_version", "consented_at", "page"]
KST = dt.timezone(dt.timedelta(hours=9))
COPY = Path(__file__).resolve().parent.parent / "api" / "_lib" / "copy.mjs"
FORMULA = ("=", "+", "-", "@", "\t", "\r")


def versions():
    """Every notice version, oldest first (consentVersions in copy.mjs)."""
    s = COPY.read_text(encoding="utf-8")
    return json.loads(s.split("/* COPY-JSON */", 1)[1].split("/* END-COPY-JSON */", 1)[0])["consentVersions"]


def env(*names):
    for n in names:
        v = os.environ.get(n, "").strip()
        if v:
            return v
    sys.exit(f"set {names[0]} (copy it from Vercel > Storage > the database > .env.local)")


URL = None
TOKEN = None


def call(path, body):
    req = urllib.request.Request(URL.rstrip("/") + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    items = data if isinstance(data, list) else [data]
    for item in items:
        if "error" in item:
            sys.exit("upstash: " + item["error"])
    return [i["result"] for i in items] if isinstance(data, list) else data["result"]


def today():
    return dt.datetime.now(KST).date().isoformat()


def admin(action, count):
    call("", ["RPUSH", ADMIN, json.dumps({"date": today(), "action": action, "count": count})])


def records():
    """One dict per address: email, and consents {version: {at, lang, page}}."""
    emails = sorted(call("", ["SMEMBERS", SET]))
    rows = []
    for i in range(0, len(emails), 100):
        chunk = emails[i:i + 100]
        for email, flat in zip(chunk, call("/pipeline", [["HGETALL", SUB + e] for e in chunk])):
            h = dict(zip(flat[::2], flat[1::2])) if flat else {}
            consents = {k[len("consent:"):]: json.loads(v) for k, v in h.items() if k.startswith("consent:")}
            rows.append({"email": h.get("email", email), "consents": consents})
    return rows


def newest(rec, order):
    """The CSV row: the address and its newest consent (by notice version)."""
    if not rec["consents"]:
        return {"email": rec["email"]}
    v = max(rec["consents"], key=lambda k: (order.index(k) if k in order else -1, rec["consents"][k].get("at", "")))
    c = rec["consents"][v]
    return {"email": rec["email"], "lang": c.get("lang", ""), "consent_version": v,
            "consented_at": c.get("at", ""), "page": c.get("page", "")}


def latest_consent(rec):
    """When the two-year check is counted from: the latest consent."""
    ats = [c.get("at", "") for c in rec["consents"].values() if c.get("at")]
    return max(ats) if ats else None


def main():
    global URL, TOKEN
    args = sys.argv[1:]
    if not args or args[0] not in {"count", "export", "delete", "due", "log"}:
        sys.exit(__doc__)
    URL = env("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL")
    TOKEN = env("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN")
    cmd = args[0]
    if cmd == "count":
        print(call("", ["SCARD", SET]))
    elif cmd == "export":
        order = versions()
        rows = [newest(r, order) for r in records()]
        risky = [r["email"] for r in rows if any(str(r.get(k, "")).startswith(FORMULA) for k in FIELDS)]
        if risky and "--force" not in args:
            admin("export refused (formula guard)", len(rows))
            print(f"{len(risky)} records start with = + - @ or a tab or return, which a spreadsheet "
                  "runs as a formula; nothing written. Delete them, or rerun with --force:", file=sys.stderr)
            for e in risky:
                print("  " + e, file=sys.stderr)
            sys.exit(1)
        w = csv.DictWriter(sys.stdout, FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
        admin("export", len(rows))
        print(f"{len(rows)} records exported; logged in {ADMIN}", file=sys.stderr)
    elif cmd == "delete":
        if len(args) < 2:
            sys.exit("usage: delete ADDRESS [request|underage|bounce|other]")
        email = args[1].strip().lower()
        reason = args[2] if len(args) > 2 else "request"
        removed, deleted = call("/multi-exec", [["SREM", SET, email], ["DEL", SUB + email]])
        n = 1 if removed or deleted else 0
        if n:
            call("", ["HINCRBY", DELETED, f"{today()} {reason}", 1])
        admin("delete " + reason, n)
        print("destroyed" if n else "not on the list (nothing to destroy)")
    elif cmd == "due":
        days = int(args[1]) if len(args) > 1 else 60
        now = dt.datetime.now(dt.timezone.utc)
        rows = records()
        due = []
        for r in rows:
            last = latest_consent(r)
            if not last:  # no consent on record: it should not be on the list
                due.append(("no-consent", r["email"]))
                continue
            at = dt.datetime.fromisoformat(last.replace("Z", "+00:00"))
            check = at.replace(year=at.year + 2) if not (at.month == 2 and at.day == 29) else at.replace(year=at.year + 2, day=28)
            if check - now <= dt.timedelta(days=days):
                due.append((check.astimezone(KST).date().isoformat(), r["email"]))
        for d, e in sorted(due):
            print(d, e)
        # Every record was read, so every record is counted, due or not.
        admin("due", len(rows))
        print(f"{len(due)} due within {days} days (send the two-year check before each date, or delete); "
              f"logged in {ADMIN}", file=sys.stderr)
    elif cmd == "log":
        print("destroyed:", json.dumps(dict(zip(*[iter(call("", ["HGETALL", DELETED]) or [])] * 2)), ensure_ascii=False))
        for line in call("", ["LRANGE", ADMIN, 0, -1]) or []:
            print("admin:", line)


if __name__ == "__main__":
    main()
