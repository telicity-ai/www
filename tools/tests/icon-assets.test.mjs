import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const attributes = source => Object.fromEntries([...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
const links = page => [...read(page).toString().matchAll(/<link\b([^>]+)>/g)].map(([, source]) => attributes(source));
const localPath = href => `.${new URL(href, 'https://telicity.ai').pathname}`;
const paths = svg => [...svg.matchAll(/<path\b([^>]+)\/>/g)].map(([, source]) => {
  const attrs = attributes(source);
  return { d: attrs.d, transform: attrs.transform };
});

// Decode the generated non-interlaced, opaque RGB PNGs so regressions in brand
// color or transparent/black backgrounds fail even if dimensions stay correct.
function png(data) {
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  assert.equal(data[24], 8);
  assert.equal(data[25], 2, 'icons must have an opaque RGB ground');
  assert.equal(data[28], 0, 'the icon generator must emit non-interlaced PNGs');
  const chunks = [];
  for (let at = 8; at < data.length;) {
    const length = data.readUInt32BE(at);
    if (data.toString('ascii', at + 4, at + 8) === 'IDAT') chunks.push(data.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const packed = inflateSync(Buffer.concat(chunks));
  const stride = width * 3;
  const pixels = Buffer.alloc(width * height * 3);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    assert.ok(filter >= 0 && filter <= 4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const left = x >= 3 ? pixels[at - 3] : 0;
      const up = y ? pixels[at - stride] : 0;
      const upperLeft = y && x >= 3 ? pixels[at - stride - 3] : 0;
      const predicted = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      pixels[at] = (packed[y * (stride + 1) + x + 1] + predicted) & 255;
    }
  }
  return { width, height, pixels };
}
function assertBrandRaster(data, size) {
  const image = png(data);
  assert.equal(image.width, size);
  assert.equal(image.height, size);
  const paper = [245, 244, 238], petrol = [25, 62, 69];
  let inkPixels = 0;
  let minX = size, minY = size, maxX = 0, maxY = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const rgb = [...image.pixels.subarray((y * size + x) * 3, (y * size + x + 1) * 3)];
    if (!x || !y || x === size - 1 || y === size - 1) assert.deepEqual(rgb, paper);
    if (rgb.every((value, i) => value === petrol[i])) inkPixels++;
    if (rgb.some((value, i) => Math.abs(value - paper[i]) > 20)) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  assert.ok(inkPixels >= Math.max(1, Math.floor(size * size * 0.02)), 'the approved petrol mark must be visible');
  for (const margin of [minX, minY, size - 1 - maxX, size - 1 - maxY]) {
    assert.ok(margin >= Math.floor(size * 0.06), 'the mark must not touch the icon edge');
    assert.ok(margin <= Math.ceil(size * 0.16), 'the tab symbol must not be lost in excess padding');
  }
}

test('theme SVGs preserve the exact approved C1 paths and swap only the mark color', () => {
  const approved = paths(read('assets/telicity/logos/logo-petrol.svg').toString());
  assert.equal(approved.length, 2);
  for (const file of ['icon.svg', 'assets/telicity/icons/favicon-light.svg', 'assets/telicity/icons/favicon-dark.svg']) {
    const svg = read(file).toString();
    assert.deepEqual(paths(svg), approved);
    assert.match(svg, /viewBox="0 0 1000 1000"/);
    assert.doesNotMatch(svg, /<script\b|(?:href|src)="https?:/i);
  }
  const adaptive = read('icon.svg').toString();
  assert.match(adaptive, /\.mark\s*\{\s*fill:\s*#193E45;/);
  assert.match(adaptive, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*\.mark\s*\{\s*fill:\s*#F5F4EE;/);
  assert.match(read('assets/telicity/icons/favicon-light.svg').toString(), /<g fill="#193E45">/);
  assert.match(read('assets/telicity/icons/favicon-dark.svg').toString(), /<g fill="#F5F4EE">/);
});

for (const [file, size] of [['favicon-32x32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  test(`${file} has correct dimensions, brand colors, opaque ground, and tab-safe padding`, () => assertBrandRaster(read(file), size));
}

test('ICO includes valid 16, 32, and 48 pixel approved-symbol fallbacks', () => {
  const ico = read('favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    assert.equal(ico.readUInt16LE(entry + 4), 1);
    assert.equal(ico.readUInt16LE(entry + 6), 24);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.ok(offset + length <= ico.length);
    assertBrandRaster(ico.subarray(offset, offset + length), size);
  }
});

for (const page of ['index.html', 'ko/index.html']) {
  test(`${page} declares matching theme SVGs plus usable raster and Apple fallbacks`, () => {
    const entries = links(page);
    const icons = entries.filter(link => link.rel === 'icon');
    assert.ok(icons.some(link => localPath(link.href) === './favicon.ico'));
    assert.ok(icons.some(link => link.type === 'image/png' && link.sizes === '32x32'));
    assert.ok(icons.some(link => localPath(link.href) === './icon.svg' && link.sizes === 'any'));
    for (const theme of ['light', 'dark']) {
      const matches = icons.filter(link => !link.media || link.media === `(prefers-color-scheme: ${theme})`);
      const selected = matches.at(-1);
      assert.equal(selected.type, 'image/svg+xml');
      assert.equal(localPath(selected.href), `./assets/telicity/icons/favicon-${theme}.svg`);
    }
    const apple = entries.find(link => link.rel === 'apple-touch-icon');
    assert.equal(apple.sizes, '180x180');
    assert.equal(localPath(apple.href), './apple-touch-icon.png');
    for (const link of [...icons, apple]) {
      assert.ok(new URL(link.href, 'https://telicity.ai').searchParams.get('v'), 'new icons need a fresh cache key');
      assert.ok(read(localPath(link.href)).length);
    }
  });
}

test('the manifest declares current 192 and 512 pixel PNG home-screen icons', () => {
  const manifest = JSON.parse(read('site.webmanifest'));
  assert.equal(manifest.name, 'Telicity');
  assert.equal(manifest.background_color, '#F5F4EE');
  assert.equal(manifest.theme_color, '#F5F4EE');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    assert.equal(icon.purpose, 'any');
    const size = Number(icon.sizes.split('x')[0]);
    assertBrandRaster(read(localPath(icon.src)), size);
  }
});
