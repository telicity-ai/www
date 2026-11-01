import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
function metadata(path) {
  const html = readFileSync(new URL(path, root), 'utf8');
  const tags = [...html.matchAll(/<meta\b([^>]+)>/g)];
  return new Map(tags.map(([, attributes]) => {
    const attrs = Object.fromEntries([...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    return [attrs.property || attrs.name, attrs.content];
  }));
}

for (const path of ['index.html', 'ko/index.html']) {
  test(`${path} supplies a usable image to link-preview crawlers`, () => {
    const meta = metadata(path);
    const image = new URL(meta.get('og:image'));
    assert.equal(image.protocol, 'https:');
    assert.equal(image.hostname, 'telicity.ai');
    assert.equal(meta.get('og:image:secure_url'), image.href);
    assert.equal(meta.get('og:image:type'), 'image/png');
    assert.equal(meta.get('og:image:width'), '1200');
    assert.equal(meta.get('og:image:height'), '630');
    assert.ok(meta.get('og:image:alt')?.trim());
    assert.ok(image.searchParams.get('v'), 'shared cards need a version for preview caches');
    const local = new URL(`.${image.pathname}`, root);
    assert.ok(existsSync(fileURLToPath(local)), 'the declared social image must ship with the site');
    const png = readFileSync(local);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), Number(meta.get('og:image:width')));
    assert.equal(png.readUInt32BE(20), Number(meta.get('og:image:height')));
    assert.equal(png[24], 8);
    assert.equal(png[25], 2, 'use an opaque RGB PNG for broad crawler support');
    assert.ok(png.length < 5 * 1024 * 1024);
    assert.equal(meta.get('twitter:card'), 'summary_large_image');
    assert.equal(meta.get('twitter:title'), meta.get('og:title'));
    assert.equal(meta.get('twitter:description'), meta.get('og:description'));
    assert.ok(meta.get('twitter:title')?.trim());
    assert.ok(meta.get('twitter:description')?.trim());
    assert.equal(meta.get('og:locale'), path.startsWith('ko/') ? 'ko_KR' : 'en_US');
    assert.equal(meta.get('og:locale:alternate'), path.startsWith('ko/') ? 'en_US' : 'ko_KR');
    assert.equal(meta.get('og:url'), path.startsWith('ko/') ? 'https://telicity.ai/ko/' : 'https://telicity.ai/');
    assert.equal(meta.get('twitter:image'), image.href);
    assert.ok(meta.get('twitter:image:alt')?.trim());
  });
}
