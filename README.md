# telicity.ai

Telicity 랜딩페이지. 빌드 단계 없는 정적 사이트로, `main`에 푸시하면 Vercel이 자동으로 프로덕션 배포한다.

## 구조

| 경로 | 내용 |
| --- | --- |
| `index.html`, `ko/index.html` | 영어(`/`) / 한국어(`/ko/`) 페이지 |
| `404.html` | 없는 경로 (noindex) |
| `assets/site.css`, `assets/site.js` | 공용 스타일, 예시 문구 hover 낙서 반응 |
| `assets/fonts/newsreader.woff2` | Newsreader (opsz 24, wght 400–600, latin) 자체 호스팅. 한글은 Google Fonts의 Noto Serif KR |
| `assets/mark.svg`, `icon.svg`, `favicon.ico`, `*.png` | 로고 마크, 파비콘, 앱 아이콘, OG 이미지 |
| `index.md`, `ko/index.md` | 페이지의 마크다운 사본 (LLM용) |
| `llms.txt`, `llms-full.txt` | [llmstxt.org](https://llmstxt.org) 형식 요약 / 전문 |
| `site.webmanifest` | 웹 앱 매니페스트 (name, description, 아이콘) |
| `robots.txt` | 검색·AI 크롤러 전부 허용 + `Content-Signal` |
| `sitemap.xml` | 두 페이지, `lastmod` |
| `4acb9e4c1b7422b8e68ecae7207ad4f4.txt` | IndexNow 키 |
| `.well-known/security.txt` | 보안 연락처 (Expires 2027-10-01 전에 갱신) |
| `vercel.json` | clean URL, 트레일링 슬래시, 리디렉트, 헤더 |

## 로컬 미리보기

```bash
python3 -m http.server 4173
```

## 카피를 고칠 때 함께 고칠 것

문구는 여러 파일에 복제되어 있다. 하나를 바꾸면 아래를 모두 맞춘다.

1. `index.html` / `ko/index.html`: 본문, `<title>`, description, OG/Twitter, JSON-LD. `site.webmanifest`의 `description`은 영어 meta description과 같은 문장
2. `index.md` / `ko/index.md`, `llms.txt`
3. `llms-full.txt` 재생성:
   ```bash
   { printf '# Telicity: full text\n\nSource: https://telicity.ai/llms.txt. This file contains the English page (https://telicity.ai/) followed by the Korean page (https://telicity.ai/ko/).\n\n---\n\n'; cat index.md; printf '\n---\n\n'; cat ko/index.md; } > llms-full.txt
   ```
4. `sitemap.xml`의 `lastmod`, JSON-LD의 `dateModified`
5. h1이 바뀌면 `og.png` / `og-ko.png`도 다시 만든다
6. 배포 후 IndexNow 핑 (Bing, Naver, Yandex 등에 공유됨):
   ```bash
   curl -sS -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json; charset=utf-8' -d '{"host":"telicity.ai","key":"4acb9e4c1b7422b8e68ecae7207ad4f4","keyLocation":"https://telicity.ai/4acb9e4c1b7422b8e68ecae7207ad4f4.txt","urlList":["https://telicity.ai/","https://telicity.ai/ko/"]}'
   ```

## 도메인 / 인프라

- DNS는 Cloudflare, 레코드는 **DNS only (회색 구름)** 로 Vercel을 가리킨다. 프록시(주황 구름)를 켜면 Cloudflare의 AI 봇 정책과 Bot Preference Sync가 robots.txt를 덮어써 AI 노출이 줄 수 있다.
- `www.telicity.ai` → `telicity.ai` 308 리디렉트는 Vercel Domains에서 설정.
- 미리보기 배포는 Vercel이 `X-Robots-Tag: noindex`를 붙인다.

## 검색엔진 등록

- Google Search Console: 도메인 속성, Cloudflare에 TXT 레코드로 인증, `sitemap.xml` 제출
- Bing Webmaster Tools: Search Console에서 가져오기
- 네이버 서치어드바이저: HTML 메타 태그로 `https://telicity.ai` 인증, 사이트맵 제출
- Daum 웹마스터도구: robots.txt PIN 주석 인증, 사이트맵 제출
