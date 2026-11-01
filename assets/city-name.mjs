// Shared by the Vercel endpoint and the cursor's optional city preview.
// This is a presentation label, never a location or access-control guarantee.

const FALLBACK = { city: null, label: "telicity" };
const MAX_RAW_LENGTH = 512;
const MAX_CITY_LENGTH = 128;
const MAX_SLUG_LENGTH = 32;

const CITY_ALIASES = new Map([
  ["서울", "Seoul"], ["서울시", "Seoul"], ["서울특별시", "Seoul"],
  ["부산", "Busan"], ["부산시", "Busan"], ["부산광역시", "Busan"],
  ["인천", "Incheon"], ["인천시", "Incheon"], ["인천광역시", "Incheon"],
  ["대구", "Daegu"], ["대구시", "Daegu"], ["대구광역시", "Daegu"],
  ["대전", "Daejeon"], ["대전시", "Daejeon"], ["대전광역시", "Daejeon"],
  ["광주", "Gwangju"], ["광주시", "Gwangju"], ["광주광역시", "Gwangju"],
  ["울산", "Ulsan"], ["울산시", "Ulsan"], ["울산광역시", "Ulsan"],
  ["세종", "Sejong"], ["세종시", "Sejong"], ["세종특별자치시", "Sejong"],
  ["제주", "Jeju"], ["제주시", "Jeju"],
  ["수원", "Suwon"], ["수원시", "Suwon"],
  ["성남", "Seongnam"], ["성남시", "Seongnam"],
  ["東京", "Tokyo"], ["東京都", "Tokyo"], ["도쿄", "Tokyo"],
  ["大阪", "Osaka"], ["大阪市", "Osaka"], ["오사카", "Osaka"],
  ["京都", "Kyoto"], ["京都市", "Kyoto"], ["교토", "Kyoto"],
  ["横浜", "Yokohama"], ["横浜市", "Yokohama"], ["요코하마", "Yokohama"],
  ["福岡", "Fukuoka"], ["福岡市", "Fukuoka"], ["후쿠오카", "Fukuoka"],
  ["札幌", "Sapporo"], ["札幌市", "Sapporo"], ["삿포로", "Sapporo"],
  ["名古屋", "Nagoya"], ["名古屋市", "Nagoya"], ["나고야", "Nagoya"],
]);

// NFKD handles accents; these Latin letters do not decompose into ASCII.
const LATIN_LETTERS = { "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ß": "ss" };

/** Convert a city header or explicit preview city into a bounded plain label. */
export function cityIdentity(rawCity) {
  if (typeof rawCity !== "string" || rawCity.length > MAX_RAW_LENGTH) return { ...FALLBACK };
  let city;
  try {
    // Vercel encodes non-ASCII city names according to RFC3986. A plus sign
    // is not decoded as a space: this is a header value, not form encoding.
    city = decodeURIComponent(rawCity).normalize("NFC");
  } catch {
    return { ...FALLBACK };
  }
  // Reject controls before trimming so encoded CR/LF and invisible formatting
  // cannot silently become a different, seemingly valid city.
  if (/[\p{Cc}\p{Cf}]/u.test(city)) return { ...FALLBACK };
  city = city.trim().replace(/\s+/gu, " ");
  if (["unknown", "null", "undefined", "none", "not set", "(not set)", "n/a"].includes(city.toLowerCase())) return { ...FALLBACK };
  if (!city || Array.from(city).length > MAX_CITY_LENGTH || !/^[\p{L}\p{M}\p{N} .'’(),-]+$/u.test(city)) return { ...FALLBACK };

  city = CITY_ALIASES.get(city) || city.replace(/-si$/i, "");
  let slug = city.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
  slug = slug.replace(/[æœøłđðþß]/g, letter => LATIN_LETTERS[letter]);
  // Do not drop an unsupported script and fabricate a partial romanization.
  if (/[^a-z0-9 .'’(),-]/.test(slug)) return { ...FALLBACK };
  slug = slug.replace(/[^a-z0-9]/g, "");
  if (!/[a-z]/.test(slug) || slug.length > MAX_SLUG_LENGTH) return { ...FALLBACK };
  return { city, label: `teli${slug}` };
}
