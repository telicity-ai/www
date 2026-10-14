"""Bake the procedural SVG weave tile into an indexed PNG (assets/weave.png is this, sign +1, 16 levels).

Usage: python3 tools/canvas/bake.py assets/weave.png [+1|-1|g] [levels=16]   (needs swiftc for tools/canvas/snap2.swift)

WebKit re-rasterizes an SVG background per element per paint, so pages with many
textured elements, or SVG <pattern> fills like the lakeside drawing's, use a PNG instead.
Renders the tile at 2x over black and over white (headless WebKit, snap2), solves
per-pixel colour + alpha (a = 1 - (W - B)/255, c = B / a), then writes a palette
PNG: neutral grey levels x N alpha levels (+ tRNS).
"""
import os
import struct
import subprocess
import sys
import tempfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen import weave_svg, data_uri, ground_tile


def snap2():
    """tools/.cache/snap2, built from snap2.swift on first use (tools/.cache is git-ignored)."""
    out = os.path.join(os.path.dirname(HERE), ".cache", "snap2")
    if not os.path.exists(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run(["swiftc", "-O", os.path.join(HERE, "snap2.swift"), "-o", out], check=True)
    return out


def read_png(path):
    data = open(path, "rb").read()
    pos, idat, w = 8, b"", 0
    while pos < len(data):
        n = struct.unpack(">I", data[pos:pos + 4])[0]; t = data[pos + 4:pos + 8]; c = data[pos + 8:pos + 8 + n]
        if t == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", c[:10]); assert bd == 8 and ct in (2, 6), (bd, ct)
            ch = 4 if ct == 6 else 3
        elif t == b"IDAT":
            idat += c
        pos += 12 + n
    raw = zlib.decompress(idat); stride = w * ch; out = bytearray(); prev = bytearray(stride); i = 0
    for _ in range(h):
        f = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for x in range(stride):
            a = line[x - ch] if x >= ch else 0; b = prev[x]; c = prev[x - ch] if x >= ch else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += line; prev = line
    return w, h, ch, bytes(out)


def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)


def main():
    out = sys.argv[1]; sign = sys.argv[2] if len(sys.argv) > 2 else "+1"; levels = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    tile = ground_tile(paint=None) if sign == "g" else weave_svg(+1 if sign == "+1" else -1)
    u = data_uri(tile)
    tmp = tempfile.mkdtemp()
    page = os.path.join(tmp, "bake.html")
    open(page, "w").write("<!doctype html><style>body{margin:0}div{width:120px;height:120px;background-size:120px 120px;"
                          f"background-image:url(\"{u}\")}}.b{{background-color:#000}}.w{{background-color:#fff}}</style><div class=b></div><div class=w></div>")
    shot = os.path.join(tmp, "bake-2x.png")
    subprocess.run([snap2(), page, shot, "120", "240", "1", "0", "2"], check=True, capture_output=True)
    w, h, ch, px = read_png(shot)
    T = 240
    idx = bytearray(); pal = []; key = {}
    GL = 12
    for y in range(T):
        row = bytearray([0])
        for x in range(T):
            bo = (y * w + x) * ch; wo = ((y + T) * w + x) * ch
            Bv = px[bo:bo + 3]; Wv = px[wo:wo + 3]
            a = 1 - sum(Wv[c] - Bv[c] for c in range(3)) / (3 * 255)
            a = max(0.0, min(1.0, a))
            g = min(255.0, (sum(Bv) / 3) / a) if a > 0.004 else 255.0
            col = min(GL - 1, max(0, round((g - 40) / (215 / (GL - 1)))))   # neutral grey level 40..255
            q = round(a * (levels - 1) / 0.7) if a < 0.7 else levels - 1   # alpha range used by the tile is < .7
            k = (col, q)
            if k not in key:
                key[k] = len(pal); pal.append(k)
            row.append(key[k])
        idx += row
    plte = b"".join(bytes([round(40 + c * 215 / (GL - 1))] * 3) for c, q in pal)
    trns = bytes(round(min(0.7, q * 0.7 / (levels - 1)) * 255) for c, q in pal)
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", T, T, 8, 3, 0, 0, 0)) + chunk(b"PLTE", plte)
            + chunk(b"tRNS", trns) + chunk(b"IDAT", zlib.compress(bytes(idx), 9)) + chunk(b"IEND", b""))
    open(out, "wb").write(data)
    print(out, len(data), "bytes,", len(pal), "palette entries")


if __name__ == "__main__":
    main()
