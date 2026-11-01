import test from "node:test";
import assert from "node:assert/strict";
import location from "../../api/location.mjs";
import { cityIdentity } from "../../assets/city-name.mjs";

const fallback = { city: null, label: "telicity" };

test("city labels use the actual city and a lowercase teli prefix", () => {
  assert.deepEqual(cityIdentity("Seoul"), { city: "Seoul", label: "teliseoul" });
  assert.deepEqual(cityIdentity("Tokyo"), { city: "Tokyo", label: "telitokyo" });
  assert.deepEqual(cityIdentity("New%20York"), { city: "New York", label: "telinewyork" });
  assert.deepEqual(cityIdentity("Seoul-si"), { city: "Seoul", label: "teliseoul" });
  assert.equal(cityIdentity("San Luis Potosí").label, "telisanluispotosi");
});

test("encoded local-script aliases have confirmed romanizations", () => {
  assert.deepEqual(cityIdentity(encodeURIComponent("서울특별시")), { city: "Seoul", label: "teliseoul" });
  assert.deepEqual(cityIdentity("부산광역시"), { city: "Busan", label: "telibusan" });
  assert.deepEqual(cityIdentity(encodeURIComponent("東京都")), { city: "Tokyo", label: "telitokyo" });
  assert.deepEqual(cityIdentity("大阪市"), { city: "Osaka", label: "teliosaka" });
});

test("Latin accents, city punctuation and spacing become a plain safe label", () => {
  assert.deepEqual(cityIdentity("  São   Paulo  "), { city: "São Paulo", label: "telisaopaulo" });
  assert.equal(cityIdentity("Zürich").label, "telizurich");
  assert.equal(cityIdentity("Tromsø").label, "telitromso");
  assert.equal(cityIdentity("St. John's").label, "telistjohns");
  assert.equal(cityIdentity("Washington, D.C.").label, "teliwashingtondc");
  assert.equal(cityIdentity("Baden-Baden").label, "telibadenbaden");
});

test("missing, malformed, invisible, HTML-like and unsupported names use the fallback", () => {
  for (const value of [null, undefined, 1, {}, "", "   ", "%", "%E0%A4%A", "%FF", "Seoul%0D%0A", "\nSeoul", "Seoul\u200b", "<script>Seoul</script>", "../../Seoul", "New+York", "12345", "---", "北京", "Seoul北京", "unknown", "UNKNOWN", "null", "undefined", "none", "(not set)"]) {
    assert.deepEqual(cityIdentity(value), fallback, String(value));
  }
});

test("oversized city input cannot create an unbounded cursor label", () => {
  assert.equal(cityIdentity("A".repeat(32)).label.length, 36);
  for (const value of ["A".repeat(33), "A".repeat(129), "A".repeat(513)]) assert.deepEqual(cityIdentity(value), fallback);
});

test("GET exposes only city and label, without sensitive request metadata or caching", async () => {
  const request = new Request("https://telicity.ai/api/location/", {
    headers: {
      "x-vercel-ip-city": "Seoul",
      "x-forwarded-for": "192.0.2.123",
      "x-vercel-ip-latitude": "37.5",
      "x-vercel-ip-longitude": "127.0",
      "authorization": "Bearer private-test-value",
    },
  });
  const response = await location.fetch(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), { city: "Seoul", label: "teliseoul" });
});

test("a local request without Vercel city metadata stays generic", async () => {
  const response = await location.fetch(new Request("http://localhost:4173/api/location/"));
  assert.deepEqual(await response.json(), fallback);
});

test("HEAD has the same successful headers and no body", async () => {
  const response = await location.fetch(new Request("https://telicity.ai/api/location/", { method: "HEAD", headers: { "x-vercel-ip-city": "Tokyo" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(await response.text(), "");
});

test("other methods are refused without exposing city or request data", async () => {
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await location.fetch(new Request("https://telicity.ai/api/location/", { method, headers: { "x-vercel-ip-city": "Seoul" } }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "GET, HEAD");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "method_not_allowed" });
  }
});
