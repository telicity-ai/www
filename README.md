# telicity.ai

Telicity 랜딩페이지. 빌드 단계 없는 정적 사이트로, `main`에 푸시하면 Vercel이 자동으로 프로덕션 배포한다. 소식 메일 신청만 Vercel Function 두 개(`api/`)가 받아 Upstash Redis에 저장한다(아래 ‘소식 메일 신청’).

## 구조

| 경로 | 내용 |
| --- | --- |
| `index.html`, `ko/index.html` | 영어(`/`) / 한국어(`/ko/`) 페이지 |
| `404.html` | 없는 경로 (noindex) |
| `privacy/index.html`, `ko/privacy/index.html` | 개인정보 처리방침(영어 번역본 / 한국어 원본). `legal/privacy.*.md`에서 `tools/legal.py`가 만든다. 직접 고치지 않는다 |
| `unsubscribe/index.html`, `ko/unsubscribe/index.html` | 구독 해지(수신 동의 철회) 양식 (noindex, 사이트맵에 넣지 않음) |
| `api/waitlist.mjs`, `api/unsubscribe.mjs` | Vercel Function: 신청과 해지. 로직은 `api/_lib/waitlist-core.mjs`, 문구는 `api/_lib/copy.mjs`, JavaScript 없이 보낸 양식에 답하는 페이지는 `api/_lib/page.mjs`, 플랫폼 연결은 `api/_lib/runtime.mjs`(밑줄로 시작하는 경로는 함수가 되지 않는다) |
| `legal/` | 처리방침 원문(`privacy.en.md`, `privacy.ko.md`)과 판마다의 동의 문구(`consent/<버전>.md`). 배포되지 않는다(`.vercelignore`) |
| `assets/site.css` | 공용 스타일. 캔버스 바탕과 팔레트, 레이아웃, 크레용 필터 연결, 선이 드러나는 애니메이션 타이밍, 그림의 자리까지 전부 여기 있다 |
| `assets/site.js` | 화면 아래쪽 선 묶음(`[data-draw]`: run/run a mile 낙서, “someday” / ‘언제 한번’에 그은 줄, 신청 줄의 손글씨·화살표·밑줄)을 스크롤로 닿았을 때 드러내게 하는 IntersectionObserver, 그리고 신청·해지 양식(`form[data-wl]`)을 fetch로 보내 그 자리에서 답하게 하는 점진적 향상. 없으면 선은 로드 때 한 번에 드러나고 양식은 보통의 POST로 동작 |
| `assets/fonts/` | 폰트는 전부 자체 호스팅이다(외부 폰트 요청 없음). `newsreader.woff2`: Newsreader (opsz 24, wght 400–600, latin). 나머지는 페이지 문구만 담은 서브셋으로, `tools/fonts.py`가 만들고 파일 이름에 내용 해시를 붙인다: `caveat.*`(영어 손글씨, wght 500–600), `gowun-batang.*`(`/ko/`의 한국어 본문과 신청 답장, `/ko/`에서 preload), `gowun-batang-ext.*`(`/ko/privacy/`, `/ko/unsubscribe/`, 함수의 답장 페이지에만 있는 글자. site.css의 `unicode-range`를 스크립트가 써서 `/ko/`는 받지 않는다), `gowun-batang-bold.*`(한국어 굵은 글자: 동의 안내의 목적·보유 기간, 처리방침의 소제목, 푸터의 개인정보 처리방침), `nanum-pen.*`(한국어 손글씨), `gowun-batang-lite.*`(영어 페이지의 한국어: ‘한국어’, 404의 한국어 줄, `/privacy/`의 한국어 용어) |
| `assets/weave.png` | 그림의 칠을 덮는 캔버스 직조 타일(240×240, 바탕과 같은 천). 만드는 법은 디자인 메모 |
| `assets/mark.svg`, `icon.svg`, `favicon.ico`, `*.png` | 생쥐 낙서 로고, 파비콘(SVG는 다크 탭바에서 밝은 캔버스색 `#f6f6f3`으로 바뀜), 앱 아이콘·`logo.png`(불투명한 `#f6f6f3` 바탕), OG 이미지. 모두 목탄색 `#171b22`이고, 아이콘과 OG는 `tools/brand/gen.py`가 만든다(디자인 메모의 ‘아이콘과 공유 카드’) |
| `index.md`, `ko/index.md` | 페이지의 마크다운 사본 (LLM용) |
| `llms.txt`, `llms-full.txt` | [llmstxt.org](https://llmstxt.org) 형식 요약 / 전문 |
| `site.webmanifest` | 웹 앱 매니페스트 (name, description, 아이콘) |
| `robots.txt` | 검색·AI 크롤러 전부 허용 + `Content-Signal` |
| `sitemap.xml` | 첫 화면 두 개와 처리방침 두 개, `lastmod`, hreflang 짝 |
| `4acb9e4c1b7422b8e68ecae7207ad4f4.txt` | IndexNow 키 |
| `.well-known/security.txt` | 보안 연락처 (Expires 2027-10-01 전에 갱신) |
| `vercel.json` | clean URL, 트레일링 슬래시, 리디렉트, 헤더(CSP의 `form-action 'self'`는 신청 양식 때문), 함수 리전 `iad1`(미국 동부, Redis와 같은 곳). `/.well-known/` 아래에는 Vercel이 이 헤더와 트레일링 슬래시 리디렉트를 적용하지 않는다(플랫폼 동작. 거기에는 평문 `security.txt`만 있어 그대로 둔다) |
| `tools/legal.py`, `tools/waitlist.py`, `tools/tests/` | 처리방침 페이지 생성·법적 문구 검사기, 명단 관리 도구(개수, 내보내기, 삭제, 2년 확인 대상, 로그), 신청 함수의 단위 테스트. 배포되지 않는다 |
| `tools/ring.py`, `tools/fonts.py`, `tools/lake/`, `tools/canvas/`, `tools/brand/` | 고리 경로 생성기, 폰트 서브셋 생성·검사기, 호숫가 그림 생성기(`gen.py`, 장면 데이터 `wide.py`·`narrow.py`, 산 능선 `mtn.py`), 캔버스 직조·크레용 필터 생성기(`gen.py`)와 PNG 굽기(`bake.py`)·칠 색 풀이(`solve.py`), OG 카드·아이콘 생성기(`gen.py`). 배포되지 않는다(`.vercelignore`) |

## 디자인 메모

옅은 캔버스 천에 세리프로 인쇄한 지면 한 장. 그 위에 목탄 크레용으로 표시를 해 두었고, 페이지는 그림 한 점으로 끝난다. 징검돌을 건너 물 위의 바위에 앉은 생쥐가 있는 고요한 호수다.

- **캔버스(바탕)**: body 배경은 120px 직조 타일 `--weave-ground`(SVG data URI) 하나다. 타일의 첫 층이 칠 `#dfdfd8`이고, 그 위에 흰색 알파로만 된 씨실·날실·능직 사선 줄무늬를 이음매 없이 이어지는(stitch) feTurbulence로 끊어 깔았다. 벡터 타일이라 1x·2x·3x 어디서나 기기 해상도로 다시 그려져 선명하다. 눈에 보이는 평균은 `#f6f6f3`(실측 2x·3x `#f6f6f4`, 1x `#f7f7f5`), 밝기 표준편차는 2x·3x에서 약 3.4, 1x에서 4.0이다. 팔 길이 거리에서도 천으로 읽히는 세기로, 예전 아이보리 종이(가운데 영역에서 약 2.4)보다 조금 거칠다. 칠이 타일 안에 있으므로 body 배경색은 눈에 보이는 색 `--paper-seen #f6f6f3`이다. 타일이 늦게 그려지거나 아예 막혀도 회색 칠이 잠깐 드러나지 않고 그 색이 보인다. `html` 배경(오버스크롤), `theme-color`, 매니페스트의 두 색도 같은 색이다. 120px마다의 반복은 1440px 2x의 넓은 빈 여백에서도 드러나지 않는다(8px로 흐린 뒤 표준편차 약 0.6). 라이트 전용이다. `color-scheme: light`, 다크 모드 CSS 없음. 타일 값은 `python3 tools/canvas/gen.py site`가 출력하는 것과 같다(`GROUND_THREADS`, `GROUND_PAINT`).
- **팔레트와 대비**: WCAG 대비는 바탕 평균 `#f6f6f3`, 어두운 쪽 2% 텍셀(p02, 약 `#ededea`), 가장 어두운 실(약 `#e5e5e1`)에 대해 잰다. 인쇄 `--ink #1d2128`(14.9:1 / 13.8:1 / 12.8:1), 보조 인쇄 `--ink-2 #454c57`(콜로폰, 8.0:1 / 7.4:1 / 6.9:1), 목탄 `--pen #171b22`(손글씨, 메일 링크, 로고, 크레용 선, 포커스 링, 16.0:1 / 14.7:1). 영어와 한국어가 같은 잉크를 쓴다. 따뜻한 색은 버터 `--butter #f7ec98` 하나다. ‘run a mile’ / ‘한 바퀴 달리다’ 끝점의 점에 쓰고, 맺는 그림의 낮은 저녁 해에 한 번 더 쓴다. 해는 끝점을 받으려고 일부러 둔 두 번째 자리다. 둘 다 글자가 아니라 목탄 테두리 안의 점이다. 그 밖의 색(물과 산의 파랑, 언덕의 초록, 돌의 회색)은 맺는 그림 안에만 있다(`--water #cfe0f9`, 텍스트 선택 배경은 이 색을 0.9 알파로 둔 `--selection`. 불투명한 선택 색은 WebKit과 Blink가 흰색과 섞어 옅게 만든다). 예전 만년필 파랑(`#2d4a86`, `#1f3a70`)과 `--pen-deep`은 없앴다.
- **선은 크레용, 글자는 또렷하게**: 손으로 그은 선(고리, h1 메모의 화살표, run 물결과 점, run a mile 선과 끝점 테두리, “someday” / ‘언제 한번’에 그은 줄, 메일 링크의 화살표와 밑줄)에는 목탄 크레용 SVG 필터를 건다. 획을 흐려 단면을 만들고, 프랙탈 입자를 더해 문턱값으로 자른 뒤, 선에서 한 획 굵기 안쪽의 반점만 남긴다. 필터 세 개(`cr-pen`, `cr-ring`, `cr-strike`)는 세 페이지 모두 `<body>` 바로 뒤의 숨은 `<svg class="crayon-defs">`에 있다. `display: none`이 아니라 크기 0에 `overflow: hidden`이다. 필터마다 W가 그 선이 놓인 svg 단위의 획 굵기라서(고리 5.6, 그은 줄 9.5, 나머지 2.2) 글자 크기가 달라도 입자 크기가 같다. 크레용은 2dppx 이상에서만 켠다. 1x(와 Windows 125–150%)에서는 입자가 픽셀보다 작아 밧줄처럼 뭉개지므로, 표시와 그림의 윤곽선 모두 같은 경로를 둥근 끝의 단색 목탄 획으로 그린다. 그래서 어느 해상도에서나 선의 결이 한 가지이고, 캔버스 결은 칠한 면에 그대로 남는다. “someday” / ‘언제 한번’에 그은 줄은 svg 전체를 `opacity: 0.6`으로 옅게 둔다. 목탄이 인쇄와 같은 톤이라 제 세기로 그으면 한글 가운데의 가로획(언·제·한·번)과 붙어 글자가 뭉개지기 때문이다. 옅게 두면 그은 낱말이 비쳐 읽힌다. 글자(Newsreader·Gowun Batang 본문, Caveat·Nanum Pen 손글씨와 메일 링크), 로고, 콜로폰과 그 괘선, 포커스 링(2px 단색)은 어느 해상도에서나 필터 없이 또렷하다. 펜과 고리는 그림의 목탄과 같은 크레용으로 읽히도록 반점 노이즈를 15% 낮췄다(aa 0.153). 필터를 고칠 때는 `tools/canvas/gen.py`의 `site_defs()`를 고치고, `site` 출력의 svg로 세 페이지의 defs를 바꾼다.
- **드러나는 방식**: 크레용 필터의 결과는 그 아래가 바뀌지 않는 한 캐시된다. 그래서 크레용 선은 필터 바깥에서 드러낸다. svg 전체를 `clip-path`로 왼쪽부터 쓸어 내고(`wipe`, 고리를 가리키는 h1 메모 화살표만 오른쪽부터 `wipe-rtl`), 고리는 `@property --sweep`으로 conic-gradient 마스크를 펜이 시작하는 왼쪽 위(-82deg)에서 시계 방향으로 돌린다. `stroke-dashoffset`은 매 프레임 필터를 다시 돌리게 하므로 크레용 선에는 쓰지 않는다. 필터가 없는 로고만 예전처럼 한 획으로 그려지고(`.mark .ink`, 0.1s부터 0.95s, 눈은 1.02s), 손글씨는 예전처럼 `clip-path`로 써진다. 타이밍은 예전 획 그리기와 같다: 고리 0.45s부터 0.8s, h1 메모 화살표 1.15s부터 0.55s, run 물결 t0+0.1s부터 0.6s, run a mile 선과 끝점 t0+0.45s부터 0.45s(끝점이 마지막), 그은 줄 t0+0.2s부터 0.32s, 메일 링크 화살표 t0부터 0.87s, 밑줄 t0+0.85s부터 0.3s. 가만히 있을 때, `prefers-reduced-motion`일 때, 인쇄할 때는 모두 보인다(`--sweep` 초깃값 360deg; `@property`를 모르는 브라우저에서는 마스크가 무효가 되어 고리가 그냥 보인다). 메일 링크에 마우스를 올리면 밑줄이 다시 그어진다. 이 애니메이션은 svg가 아니라 안쪽 path에 건다. svg에 걸면 마우스가 떠날 때 svg의 등장 애니메이션이 지연째로 다시 시작돼 밑줄이 잠깐 사라진다. 푸터 링크와 머리의 언어 링크는 마우스를 올리면 색 대신 1px 밑줄이 기준선 2px 아래에 생긴다(Safari 때문에 longhand로 쓴다). `prefers-reduced-motion`에서는 밑줄을 다시 긋지 않는 대신 메일 링크가 1px 내려앉는다. 누르는 동안(`:active`) 메일 링크는 1px 내려가고, 로고와 언어 링크, 푸터 링크, 404의 한국어 링크는 0.7로 옅어진다. 둘 다 즉시이고 레이아웃을 움직이지 않는다. iOS에서는 시스템 탭 하이라이트가 그대로 누름 표시다. 애니메이션 곡선은 `:root`의 `--ease-pen`(크레용 선, 고리, 로고 획), `--ease-write`(손글씨), `--ease-dab`(로고의 눈) 토큰이다.
- **화면 아래쪽 묶음**: `[data-draw]` 묶음(run/run a mile 낙서, 그은 줄, 신청 줄의 손글씨·화살표·밑줄)은 화면에 닿을 때 `site.js`가 풀어 준다(`.is-waiting svg`와 `.is-waiting .writes` 일시정지). run/run a mile 낙서는 절반 이상 들어올 때, 신청 줄은 안내가 있어 키가 크므로 첫 줄(`data-draw-at`)이 통째로 들어올 때, 일요일 저녁 장면은 그은 낱말(`.strike`)이 통째로 화면에 들어올 때다. 장면 묶음은 문단 두 개라 키가 커서, 묶음의 절반을 기준으로 하면 휴대폰에서 독자가 긋지 않은 ‘언제 한번’을 읽고 지나간 뒤에야 줄이 그어진다. 처음 판단은 스타일이 적용된 뒤에 오는 IntersectionObserver의 첫 콜백이 한다(Safari는 defer 스크립트를 스타일시트보다 먼저 돌리므로 시작할 때 레이아웃을 재지 않는다). JS가 없으면 모든 선이 로드 때 한 번 위에서부터 드러난다(화면 아래쪽 것은 독자가 닿기 전에 끝나 있다).
- **타이밍은 전부 `site.css`**: CSP(`script-src 'self'`, `style-src`에 `'unsafe-inline'` 없음) 때문에 `style=` 속성과 인라인 `<style>`/`<script>`는 쓰지 않는다(JSON-LD만 예외). 인라인 svg는 표현 속성만 쓴다. 묶음 시작(`--t0`)은 `.is-late`로, 손글씨의 지연(`--d`)·길이(`--dur`)는 클래스로 바뀐다.
- **호숫가(페이지의 끝)**: 페이지는 그림 한 점, 길고 고요한 호수로 끝난다. 메일 링크 아래, 콜로폰 바로 위다. 가까운 물가에서 징검돌 네 개(휴대폰은 세 개)가 물 위로 이어진다. 멀어질수록 작아지고 간격이 좁아지며, 자로 그은 사선이 아니라 살짝 굽는다. 그 끝, 가운데에서 조금 왼쪽의 넓적한 바위 위에 생쥐가 앉아 있다. 마지막 걸음, 끝점이다. 생쥐는 탁 트인 물 너머 먼 물가를 본다. 왼쪽에는 흐린 산줄기와 초록 언덕이 저마다 따로 나란히 서 있고, 생쥐 위로는 하늘이 비어 있다. 오른쪽에는 봉우리가 둘인 짙은 하늘빛 산이, 맨 오른쪽에는 낮은 풀밭과 그 위에 낮게 걸린 작은 저녁 해가 있다. 휴대폰에서는 낮은 초록 언덕, 어깨가 있는 짙은 산, 풀밭과 해다. 산과 언덕과 풀밭은 제 모양 그대로 뒤집혀 물에 흐릿하게 비치고, 돌과 바위 아래에는 옅은 그림자가, 생쥐 아래에는 끊긴 물결 한 줄이 있다. 열린 물은 비워 둔다. 고요함이 거기서 나온다. 제목의 고리와 ‘run a mile’의 끝점을 그림으로 한 번 더, 말없이 닫는 장면이다. 생쥐는 로고와 같은 `assets/mark.svg` 경로라서 페이지가 같은 생쥐로 열리고 닫힌다. 예전에 장면 문단 옆 여백에 있던 그림(연못가 돌 위의 생쥐)은 없앴다. 한 화면 안에 같은 장면이 두 번 나오고, 끝맺음을 빼앗기 때문이다.
  - 참고 그림(다른 작가의 서명된 작품)에서는 재질과 분위기만 빌렸다. 캔버스 결, 크레용 윤곽선, 파스텔 칠, 흰 틈으로 떨어진 섬들, 큰 호수다. 그 그림의 구성과 순서(덤불, 전나무, 비구름, 굴 속 인물이 있는 언덕, 돌 줄, 그 아래의 큰 호수), 비구름, 언덕 속 인물, 서명은 가져오지 않는다. 생쥐를 먼 물가의 기준선이 아니라 물 위의 바위에, 가운데보다 왼쪽에 둔 것도 그래서다. 반영 속 목탄 조각은 짝을 짓지 않는다. 나란한 두 호는 감은 눈처럼 읽힌다.
  - 자리: `</main>`과 `<footer>` 사이의 `<div class="lakeside" aria-hidden="true">`다. 안에 인라인 svg가 두 개 있다. 휴대폰용 `lakeside-narrow`(viewBox 360 폭, 40rem 미만)와 파노라마 `lakeside-wide`(864 폭, 40rem 이상)다. 한 번에 하나만 보이고, 다른 하나는 `display: none`이다. 텍스트는 없고 `focusable="false"`이며, id는 `ln-`, `lw-` 접두사다. 60rem 이상에서는 콘텐츠 폭 864px에 1단위 = 1 CSS px로 그려지고, 잉크가 본문 열의 왼쪽 끝에서 콜로폰 괘선의 오른쪽 끝까지 닿는다. 40–60rem(태블릿)에서는 576px 열에 2/3 크기로 그려지므로, site.css가 윤곽선 굵기를 3단위로 올려 약 2px를 지킨다. 휴대폰용은 440px에서 더 커지지 않고 가운데에 놓인다. 그보다 키우면 선이 페이지의 펜보다 굵어진다. 생쥐는 데스크톱에서 약 54px, 태블릿 36px, 390px 폭 48px, 320px 폭 38px이다.
  - 간격: 메일 링크와 그림 사이는 `.page`의 아래 여백(휴대폰 72px, 60rem 이상 88px), 그림과 콜로폰 사이는 `.lakeside`의 아래 패딩(30px, 38px)이다. 그림이 없는 404는 `.page-404`가 예전 여백(96px, 120px)을 지킨다. `.lakeside`는 `margin-top: auto`이고 바로 뒤의 콜로폰은 `margin-top: 0`(`.lakeside + .foot`)이다. 그래서 페이지보다 키가 큰 화면에서는 남는 높이가 그림 위로 가고, 그림은 늘 콜로폰 위에 얹힌다. 404의 콜로폰은 예전처럼 화면 바닥에 있다.
  - 재질: 칠은 평평한 파스텔이고, 그 위를 바탕과 같은 천인 `/assets/weave.png`가 SVG `<pattern>`으로 덮는다(110–112단위, 약 110 CSS px). 태블릿(40–60rem)에서는 파노라마가 2/3 크기로 그려지므로, site.css가 직조 층(`.ls-wv`, 물은 `.ls-ww`)을 180단위 타일(`lw-wvt`, 뒤집은 `lw-wwt`)로 바꿔 약 120 CSS px, 바탕 타일과 같은 크기를 지킨다. 땅과 돌은 “/” 능직, 물은 좌우로 뒤집은 “\”다. 칠 색은 칠과 직조를 합친 결과가 목표색에 떨어지도록 `tools/canvas/solve.py`로 풀었다. 물 `#adcdf9`→`#cfe0f9`, 짙은 산 `#87a5cc`→`#bccce1`, 흐린 산 `#b2c3d9`→`#d3dce8`, 언덕과 풀밭 `#c9e383`→`#deecb9`, 바위 `#a0a8b5`→`#c8ccd4`, 반영 세이지 `#9cbeaa`, 해 `#f6e143`→`#f7ec98`이다. 징검돌은 바위보다 한 톤 짙은 `#7d8799`(약 `#b6bbc5`)라서 물과 색상뿐 아니라 밝기로도 갈린다. 생쥐의 몸은 바탕색(`#f4f4ee`→`#f6f6f3`)과 직조로 채워, 물 위에서도 비치지 않고 또렷하다. 윤곽선은 그림 전용 목탄 필터(`ls-ch` W 2.1, 반영 조각 `ls-cr`, 생쥐는 더 촘촘한 `ls-cm`)다. 2dppx 미만에서는 site.css가 필터를 끄고 둥근 끝의 단색 획으로 그린다. 획 색은 페이지의 목탄 `#171b22`다(순검정이 아니다). 생쥐 선은 거기서 로고 단위 1.5로 조금 가늘다. 생쥐의 눈은 필터 바깥의 단색 점(`mark.svg`와 같은 r 1.4)이라 어느 해상도에서나 또렷하다. 해는 끝점의 점과 같은 방식으로, 버터 칠 위에 목탄 테두리를 조금 어긋나게 둔다. 필터 영역은 모두 `userSpaceOnUse`로 그리는 내용의 경계 상자에 맞췄다.
  - 다시 만들기: `python3 tools/lake/gen.py`. 그림 데이터는 `tools/lake/wide.py`와 `narrow.py`(손으로 놓은 점과 봉우리, 칠 색, 반영)에, 산 능선은 `tools/lake/mtn.py`에 있다. 능선은 손으로 고른 봉우리 몇 개의 부드러운 최댓값이라 안부가 둥글다. 산과 언덕은 서로 겹치지 않는다. 흰 틈을 둔 섬처럼 나란히 선다. 능선은 바닥에서 8단위보다 낮아지는 곳에서 끊고 거기서 짧게 한 번에 바닥으로 내려오므로, 발치가 바닥선을 따라 바늘처럼 늘어지지 않고 뭉툭하게 둥글다. 생성기는 점을 Catmull-Rom 곡선으로 잇고 손떨림을 입힌다. 호수의 먼 쪽 가장자리는 먼 물가에서 일정한 8단위 틈을 두고 긋는다(손떨림 뒤 가장 좁은 틈이 8이 될 때까지 넓힌다). 가까운 쪽 가장자리는 손으로 놓은 점을 따라가고, 휴대폰용은 8단위마다 짚어(`bstep`) 아래 두 모서리가 둥근 호로 남는다. 생쥐는 바위 윗면에 앉힌다. 그다음 크기(변형마다 25KB 이하), `style=`·`<script>`·`<title>`·`data:`·절대 URL이 없는지, `aria-hidden`과 id 접두사, 돌과 바위가 물가에서 6단위 넘게 안쪽에 있는지, 먼 물가의 이웃끼리 틈이 있는지, 윤곽선이 스스로 꼬이지 않는지 검사하고, 두 페이지의 `</main>` 뒤에 블록을 바꿔 넣는다. 두 페이지 모두 블록이 하나뿐이고 id가 겹치지 않을 때만 쓰고, 아니면 아무것도 쓰지 않고 멈춘다. 지금 파노라마 19.2KB(gzip 6.9KB), 휴대폰용 18.1KB(gzip 6.5KB), 블록 전체 37.4KB(gzip 12.7KB)다. `--dry-run`은 검사만 하고, `--out DIR`은 svg 두 개와 그림만 놓은 미리보기 `art.html`을 쓴다(애셋 주소는 `--origin`, 기본 `http://127.0.0.1:4173`).
  - 성능: 움직이지 않는다. 어떤 `[data-draw]` 묶음에도 들지 않아 `.is-late`의 `--t0` 변화가 닿지 않으므로, 필터는 처음 한 번만 돌고 캐시된다. `will-change`는 두지 않는다. 주 필터 영역은 데스크톱 2x에서 약 1730×470, 390px 3x에서 약 1070×545 기기 픽셀로, 예전 여백 그림(3x에서 약 900×630)과 비슷하다.
- **`assets/weave.png`**: 240×240 팔레트 PNG(23,077 B). 16단계 알파의 흰색과 중성 회색 반점, “/” 능직이다. `tools/canvas/gen.py`의 절차적 직조 타일(그림용, 어두운 반점 포함)을 WebKit에서 2x로 검정 위·흰색 위에 렌더해 색과 알파를 풀어 구웠다: `python3 tools/canvas/bake.py assets/weave.png +1 16`(같은 명령으로 바이트까지 같은 파일이 나온다). 그림이 SVG 타일 대신 PNG를 쓰는 이유는 WebKit이 SVG 이미지를 요소마다, 칠할 때마다 다시 래스터화하기 때문이다. 칠 색은 `python3 tools/canvas/solve.py '#목표색' …`으로 푼다. 선형 근사라 채널당 1–3 오차가 있으니 출발점으로 쓰고 페이지에서 확인한다. 바탕 칠 `#dfdfd8`도 solve.py 값(`#dcdcd1`)이 아니라 페이지에서 재서 고른 값이다. `/`와 `/ko/`는 이 파일을 preload해서, 진한 칠이 직조 없이 잠깐 어둡게 보이는 일이 없다.
- **머리**: 왼쪽에 생쥐 로고, 오른쪽 끝(콜로폰 괘선과 그림이 끝나는 선)에 다른 언어로 가는 링크(영어 페이지는 ‘한국어’, 한국어 페이지는 ‘English’). 콜로폰의 같은 링크와 같은 14px 글자이고, 생쥐의 세로 가운데에 놓여 머리의 높이를 바꾸지 않는다. 콜로폰의 링크도 그대로 둔다. 404에는 두지 않는다(한국어 줄과 콜로폰이 이미 한 화면에 있다). 404의 한국어 줄 아래에는 ‘한국어 첫 화면으로 가기’(`/ko/`) 링크가 인쇄체 밑줄로 따로 한 줄 있다.
- **글자 크기는 rem**: `--text`, `--h1`(한국어 포함)과 콜로폰 글자는 rem이다(기본 16px에서 각각 19–21px, 31–48px, 18–20px, 26–40px, 14px). 중단점과 열 폭이 rem이므로, 브라우저 기본 글자 크기를 키운 독자에게는 글자와 레이아웃이 함께 커진다. 그보다 좁아서(320px 상당 미만) 한국어 `.nw` 묶음이 가장자리를 넘을 때는 묶음을 푼다.
- **신청 줄(예전의 메일 링크 자리)**: 맺는 그림 위의 CTA는 인쇄된 회신 쪽지다. 펜이 한 줄을 쓰고(‘We’ll write when there’s news.’ / ‘새 소식이 나오면 메일로 전해 드리겠습니다.’, `.wl-lead`, t0부터 0.75s), 생쥐 꼬리의 고리 화살표를 괘선까지 긋고(t0+0.6s), 끝의 손글씨 버튼 ‘Sign up’ / ‘신청하기’에 밑줄을 긋는다(t0+1.45s). 나머지는 인쇄다. 이메일 칸은 밑줄만 있는 괘선(`--line #80868f`, 바탕에 3.4:1)이고 레이블은 칸 위에 작게 둔다. 버튼 바로 아래의 작은 인쇄 줄 하나가 동의 안내다. 신청하면 소식 메일 수신에 동의한 것으로 본다는 문장과 처리방침, 해지 페이지 링크가 들어 있다. 체크 상자는 없다(소유자 결정, 2026-10-15. 예전 판의 제목, 요약 줄, 접힌 안내, 체크 상자 두 개는 진입 장벽이 높다는 이유로 걷어냈다).
  - 여덟 상태: 기본, hover(괘선이 진해지고 네모가 굵어지며 버튼 밑줄이 다시 그어진다, `(hover: hover)`에서만), 포커스(칸은 괘선이 2px 목탄으로. 오류와 완료 상태에서도 같다. 버튼은 2px 목탄 링), 누름(1px 내려앉음), 비활성(0.55, `not-allowed`), 로딩(버튼 글이 ‘Signing you up…’ / ‘신청하는 중입니다...’로 바뀌고 밑줄이 계속 그어진다. Nanum Pen에는 ‘…’ 글자가 없어 한국어만 마침표 셋), 오류(칸의 괘선이 교정 부호 같은 물결선이 되고 그 아래에 글, 포커스는 고칠 곳으로), 완료(버튼과 그 아래 안내 줄이 물러나고 괘선 끝에 run a mile과 같은 버터색 끝점이 찍히며 확인 글이 포커스를 받는다. 키보드로 보냈으면 확인 글에도 2px 목탄 링). 상태는 색이 아니라 모양과 글로 알린다(팔레트에 빨강이 없다). 오류의 물결선은 괘선보다 4px 위에 있어 포커스 괘선과 겹치지 않고, 포커스가 오가도 움직이지 않는다.
  - 자동 완성: 브라우저가 채운 칸을 파랑(Chrome)·노랑(Safari)으로 `!important` 칠하므로, 바탕색 `--paper-seen`을 inset 그림자로 덮고 괘선을 그 위에 둔다(`:-webkit-autofill`, hover·포커스·완료 상태도 같은 순서로). 그동안은 브라우저가 물결선을 지우므로 오류는 아래 글로만 보인다.
  - 그 인쇄 줄(`.wl-aside`)은 ‘By signing up, you agree to receive news from Telicity by email. Details are in our Privacy Policy, and you can unsubscribe anytime.’ / ‘신청하시면 소식 메일 수신에 동의하시는 것으로 봅니다. 자세한 내용은 개인정보 처리방침에 있습니다. 구독 해지는 언제든 하실 수 있습니다.’다. 해지가 신청보다 어렵지 않도록 해지 링크를 같은 줄에 둔다. 신청을 마치면 물러난다(확인 글이 해지 주소를 링크한다).
  - 굵은 한국어는 합성 볼드가 아니라 Gowun Batang Bold 서브셋이다. 한국어 가운뎃점(수집·이용)은 Newsreader의 낮은 점 대신 `.mid`로 한국어 글꼴에서 가져온다(처리방침은 `tools/legal.py`가 감싼다).
  - 휴대폰에서 콜로폰은 네 항목이 한 줄에 들어가지 않아 두 줄(연도·처리방침 / 언어·주소)이 된다. 두 줄 사이 틈(12–15px)은 위아래 링크의 터치 영역이 반씩 나눈다(맞닿는 쪽만 6px, 바깥쪽은 14px). 그래서 처리방침 링크 바로 아래를 눌러도 메일 앱이 열리지 않는다.
- **손글씨 링크(`.cta`)**: 404와 함수의 답장 페이지의 ‘돌아가기’ 링크, 신청·해지 버튼이 같은 스타일이다. 손글씨 링크는 한 줄을 지킨다(`white-space: nowrap`). 열이 좁으면(확대한 작은 휴대폰) 화살표가 90px에서 56px까지 모양 그대로 줄어들고, 그래도 모자라는 17.2rem 이하에서만 줄을 바꾼다. 링크 상자는 글자 아래 8px까지 내려가고 4px을 음수 여백으로 돌려줘서, 포커스 링이 크레용 밑줄을 안에 품고 가만히 있을 때는 아무것도 움직이지 않는다. `::after`로 터치 영역을 약 48px 높이로 넓혔다.
- **로고**: 한 획으로 그린 생쥐(꼬리, 몸의 고리, 귀)와 점 눈. 목탄색(`.mark { color: var(--pen) }`)이고 획 굵기는 1.8 그대로다. 필터는 어느 해상도에서도 걸지 않는다. 62–70px에서 크레용을 걸면 털 난 애벌레처럼 보인다. 로드 때 예전처럼 한 획으로 그려진다. 메일 링크로 들어가는 화살표는 이 생쥐의 꼬리와 고리를 그대로 가져와 이었다. `assets/mark.svg`도 목탄색이고, 그림 생성기가 이 파일에서 생쥐 경로를 읽는다.
- **아이콘과 공유 카드**: 파비콘(`icon.svg`, `favicon.ico`), 앱 아이콘(`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`), `logo.png`, `og.png` / `og-ko.png`도 목탄색이다. OG 카드는 각 페이지의 로고(왼쪽 위), 손글씨 주소(오른쪽 위), 제목과 고리, 맺는 그림(파노라마 전체를 아래쪽에 980px 폭으로)을 사이트 스타일시트 그대로 1200×630에 놓은 것이다(2x로 렌더해 크레용 필터를 건 뒤 줄임). 바탕은 평평한 `#f6f6f3`이다. 미리보기가 카드를 줄이고 다시 압축하므로 천 결은 반짝이기만 한다(그림은 제 결을 지닌다). 그림의 직조 때문에 무거워서, 알파를 빼고 채널마다 4단계로 양자화한 RGB PNG로 다시 저장한다(바탕 `#f6f6f3`은 그대로이고 눈에 띄는 차이는 없다). 크기는 약 250KB / 245KB로, WhatsApp이 og:image 미리보기를 버리는 약 300KB 아래다. 생성기는 카드가 300KB를 넘으면 멈춘다. 앱 아이콘과 `logo.png`는 불투명한 `#f6f6f3` 바탕에 로고의 고리를 폭의 357/512로 놓는다(iOS는 투명한 터치 아이콘을 검게 채운다). `icon.svg`는 탭 크기용으로 단순화한 그림 그대로이고, 다크 탭바에서는 `#f6f6f3`으로 바뀐다. 다시 만들기: `python3 tools/brand/gen.py og`, `python3 tools/brand/gen.py icons`. head의 `?v=2`는 그대로 둔다. 배포된 HEAD에는 `?v`가 없으므로 `?v=2`는 처음 배포되는 키이고, 이미 예전 캐시를 비켜 간다.
- **고대비 모드(forced colors)**: Windows 고대비에서는 `url()` 배경이 살아남아, 어두운 테마에서 흰 알파 직조가 강제 색 글자·로고·포커스 링 뒤에 회색 결로 깔린다. 그래서 `forced-colors: active`에서는 바탕 타일을 빼고, 손 선은 필터 없이 테마 색(`CanvasText`, 메일 링크 밑줄은 `LinkText`)으로 그린다. 맺는 그림은 어두운 고대비 테마에서 목탄 윤곽선이 검은 바탕에 묻혀 파스텔 덩어리만 남으므로 감춘다(장식이고 `aria-hidden`이다). 그때 콜로폰은 다시 `margin-top: auto`로 화면 바닥에 간다. 밝은 고대비 테마에서는 그대로 보인다.
- **고리(ring)**: “sees it through.” / “끝까지 해내 주는”을 두르는 고리는 em 단위로 설계한 경로(1em = viewBox 100)라 글자 크기와 상관없이 위아래 여백이 같다. 고리는 시작점으로 돌아와 닫힌다. 위쪽을 되짚는 꼬리가 없어서 두 획이 나란히 겹친 굵은 선이 생기지 않는다. 한국어 구절은 Gowun Batang으로 고정해 고리 위치가 한 가지 폰트 메트릭에만 묶이고, 띄어쓰기 폭은 `word-spacing`으로 제목의 나머지(Newsreader 공백)와 맞춘다. 영어는 `.ring`의 왼쪽 여백 0.3em과 앞 공백을 합쳐 잉크가 앞 단어(then)에서 약 0.2em, 고리 안쪽 여백과 같은 만큼 떨어진다. 한국어는 고리 왼쪽 여백을 앞 단어(`.pre-ring`, 뒤 공백도 그 안에)에 둔다. 그래서 구절이 줄 맨 앞에 와도 글자는 왼쪽 끝을 지키고 잉크만 여백으로 나간다. 고리 SVG는 `.ring`의 첫 자식이고, 고리 앞뒤 공백은 공백만 있는 텍스트 노드로 두지 않는다. 절대 위치 SVG 옆의 공백 노드는 Chrome 접근성 트리에서 빠져 h1 이름이 ‘정리하고끝까지’처럼 붙기 때문이다.
- **고리 다시 만들기**: 고리 경로·오프셋은 `python3 tools/ring.py`로 다시 만든다. W는 구절 폭을 em으로 잰 값이다(브라우저에서 `.ring` 폭 ÷ font-size, 현재 EN 6.03, KO 6.694). 점 목록을 W에 맞게 옮긴 뒤 출력된 viewBox·d를 h1의 `<svg>`에, 오프셋을 site.css `.ring > svg`에 넣는다. `top`은 320–1440px 스크린샷으로 확인해 미세 조정한다. OG 이미지도 같은 점으로 다시 그린다.
- **한국어 제목**: 휴대폰 폭(37.5rem 미만)에서는 ‘하려던 일을’, ‘분명한 목표로’를 `.nw-sm`으로 묶어서 Chrome과 Safari 모두 ‘텔리시티는 하려던 일을 / 분명한 목표로 정리하고 / 끝까지 해내 주는 / 개인 AI 비서를 만들고 있습니다.’로 나뉜다(360px 이하에서는 마지막 줄이 ‘개인 AI 비서를 / 만들고 있습니다.’ 두 줄). 37.5–60rem(태블릿)에서는 `.nw-sm`을 그대로 두고 제목을 38px로 줄여 ‘텔리시티는 하려던 일을 분명한 목표로 / 정리하고 끝까지 해내 주는 / 개인 AI 비서를 만들고 있습니다.’다(610px부터. 600–609px은 휴대폰처럼 네 줄). 60rem 이상에서는 40px로 ‘텔리시티는 하려던 일을 분명한 / 목표로 정리하고 끝까지 해내 주는 / 개인 AI 비서를 만들고 있습니다.’다. ‘분명한’ 뒤에서 일부러 끊는다. 그래야 고리가 둘째 줄 끝에 와서 여백 메모의 화살표가 고리에 닿는다. ‘개인 AI 비서를’과 ‘만들고 있습니다.’는 늘 한 덩어리(`.nw`)다. 여백 메모 ‘끝이 있는 일’은 60rem 이상에서만 보인다. 그보다 좁으면 고리가 제목 마지막 줄에 오지 않아서, 제목 아래 화살표가 엉뚱한 줄을 가리키기 때문이다.
- **영어 제목**: 22.5rem(360px)부터 ‘personal AI assistant’와 ‘that turns what you mean’을 `.nw-md`로 묶어서 Chrome과 Safari 모두 어느 폭에서나 ‘Telicity is building a / personal AI assistant / that turns what you mean / into a clear goal, / then sees it through.’로 구절째 나뉜다(데스크톱도 다섯 줄). 그보다 좁으면 다섯 줄에 구절이 다 들어가지 않고, 묶으면 여섯 줄이 되므로 묶지 않는다(320–359px은 ‘that turns what you / mean into a clear goal,’). 고리가 짧은 마지막 줄에 오므로, 60rem 이상에서 “the endpoint” 메모는 여백에서 왼쪽으로 들어와(`html:lang(en) .note-h1`) 화살표 끝이 고리에서 약 36px 떨어진 자리에 온다. OG 카드는 이 묶음을 걷어 내고 제 줄바꿈을 쓴다.
- **여백 메모**: “the endpoint”, “run / run a mile” 같은 손글씨 메모는 `data-note` 속성에 두고 CSS `content: attr()`로 그린다. 페이지 텍스트(크롤러·스크린 리더가 읽는 것)는 인쇄된 문장 그대로 남는다.
- **일요일 저녁 장면**: 예전 체크리스트 자리에 있는, 인쇄된 문단 두 개(`.row-scene`)다. 앞 문단과 1.7em 띄워 새 대목으로 시작하므로 첫 문단은 들여쓰지 않고, 맺는 줄만 책처럼 들여쓴다. 이 장면에 그은 선은 “someday” / ‘언제 한번’을 긋는 한 획뿐이다. 따옴표, 마침표, ‘가자’는 긋지 않는다. 손글씨 여백 메모는 일부러 두지 않고, 옆 여백도 비워 둔다. 그래야 제목의 고리가 페이지에서 가장 큰 손 선으로 남는다. 맺는 줄의 고요함에는 메일 링크 아래의 호수가 답한다. 그은 낱말은 고리처럼 nowrap span(`.strike`)이다. 첫 자식이 `aria-hidden` SVG라서 스크린 리더와 텍스트 추출에는 낱말이 그대로 남고, `index.md`의 문장과 글자 하나까지 같다. 줄 그은 낱말은 줄이 바뀌어도 함께 움직여서 휴대폰용 규칙이 따로 없다. 경로는 em 단위(1em = viewBox 100)이고 상자는 span의 content box(두 페이지 모두 Newsreader, 기준선 y = 73.5)다. 낱말이 바뀌면 W(`.strike` 폭 ÷ font-size, 현재 EN 3.554, KO 3.763)를 재서 viewBox 폭을 (W + 0.13) × 100으로 하고, 획의 끝점을 그 폭에 맞춘다. 한국어 장면은 ‘‘언제 한번 가자’고만’, ‘제주도 여행’, ‘될 겁니다.’, ‘그 통화도,’, ‘그 여행도’, ‘마음 쓴 적은’, ‘없을 겁니다.’를, 맺는 줄은 ‘해야지, 해야지’와 ‘마음 한구석에 걸려 있지 않습니다.’를 `.nw`로 묶는다. 맺는 줄은 한국어에서만 `text-wrap: wrap`이다. 들여쓴 문단에 nowrap 묶음이 있으면 WebKit의 `text-wrap: pretty`가 414–445px에서 ‘저희가 만들어 가려는 / 일상에서는 해야지, 해야지 / 하던 일이 더는 / …’처럼 네 줄로 흩어 놓는다. 묶음 없이 pretty로 두면 그 폭에서 ‘해야지, / 해야지’로 갈라진다. 지금은 휴대폰 폭(320–440px) 어디서나 ‘저희가 만들어 가려는 일상에서는 / 해야지, 해야지 하던 일이 더는 / 마음 한구석에 걸려 있지 않습니다.’ 세 줄이다.
- **한국어 본문 묶음(`.nw`)**: 첫 문단은 ‘되어 갑니다.’, ‘이 비서는’, ‘가려는 곳은’, ‘AI를 위한’, ‘운영체제와 인프라입니다.’를, 이름 문단은 ‘텔리시티(telicity)는’, ‘‘달리다’에는’, ‘‘운동장을 한 바퀴 달리다’에는’(예시 구절 통째. 휴대폰에서 한 줄 늘지만 Chrome 데스크톱에서도 갈라지지 않는다), ‘열 번’, ‘한 번’, ‘멈출 때도’를 묶는다(장면 문단은 위 ‘일요일 저녁 장면’). 닫는 따옴표·괄호와 조사, 이·그·한·열과 뒤의 명사, 의존 명사와 그 앞말(될 겁니다, 쓴 적, 멈출 때), 굳은 말(마음 쓰다, 마음 한구석, AI를 위한, 해야지, 해야지)이 줄에서 갈라지지 않게 하려는 것이다. 본용언과 보조 용언 사이(‘정해져 / 있다는’ 570–600px, ‘말씀드리게 / 될 겁니다.’ 320–570px)는 나뉘어도 둔다. ‘말씀드리게 될 겁니다.’를 통째로 묶으면 320px에서 장면 첫 문단이 한 줄 늘기 때문이다. ‘되어 갑니다.’는 묶어도 어느 폭에서도 줄이 늘지 않고, 320px에서 줄이 문장 단위로 맞으므로 묶는다. 묶음을 고칠 때는 WebKit에서 320–1440px를 10–20px 간격으로 훑으며 묶음을 하나씩 풀어 보고, 실제 레이아웃(pretty)과 문단을 greedy로 줄바꿈한 경우(Chrome의 pretty는 마지막 몇 줄만 고치므로 이쪽에 가깝다) 모두에서 어디가 갈라지는지 본다. 새 문구의 묶음은 모두 어느 폭에서는 실제로 갈라짐을 막는다(‘그 통화도,’, ‘이 비서는’, ‘없을 겁니다.’는 greedy에서). 넘침은 WebKit이 nowrap 묶음을 몇 px 넘겨 놓는 590px(‘‘언제 한번 가자’고만’, 3px)과 450px(‘해야지, 해야지’, 1px)뿐이고, 둘 다 20px 가장자리 안이다.
- **Newsreader `unicode-range`**: 일부러 유지한다. 파일이 Latin 서브셋이라 한글은 바로 Gowun Batang으로 간다. U+0020이 범위 안에 있어 줄 메트릭은 그대로 Newsreader 기준이다(WebKit·Chrome에서 확인).
- **폰트 서브셋**: Caveat, Gowun Batang, Nanum Pen Script는 페이지에 실제로 그려지는 글자만 담은 woff2다. 한국어 페이지용 글꼴 이름은 `html:lang(ko)` 안에서만 쓰여서 영어 페이지는 받지 않고, 한국어 페이지는 Caveat를 받지 않는다. 로딩 중에 줄이 밀리지 않도록 메트릭을 맞춘 대체 글꼴도 둔다(`Gowun Batang Fallback`: 로컬 명조를 90.6%로, `Nanum Pen Fallback`: 로컬 고딕을 70%로). 문구를 바꾸면 서브셋을 다시 만든다(아래 3번).

## 소식 메일 신청

첫 화면 맨 아래의 양식으로 새 소식을 받을 이메일 주소를 모은다. 지금은 **저장만** 한다. 발송 도구는 아직 없다.

### 흐름

1. 양식(`/`와 `/ko/`의 `#waitlist`)은 `POST /api/waitlist/`로 `application/x-www-form-urlencoded`를 보낸다. 주소 끝의 `/`는 빼지 않는다(`trailingSlash: true`라 `/api/waitlist`는 308을 한 번 더 거친다).
   - JavaScript가 있으면 `site.js`가 같은 본문을 `fetch`로 보내며 `Accept: application/json`을 붙이고, 답(JSON)의 `message`를 그 자리에 보여 준다.
   - 없으면 브라우저가 그냥 보내고, 함수가 작은 HTML 페이지(`api/_lib/page.mjs`, 404와 같은 생김새, noindex)로 답한다. 이 페이지는 날짜를 찍어야 해서 정적 페이지로 리디렉트하지 않는다.
2. 함수(`api/_lib/waitlist-core.mjs`)는 차례로 확인한다.
   - 메서드: GET/HEAD는 `/#waitlist`로 303, 그 밖은 405.
   - 같은 출처: Origin, 없으면 Sec-Fetch-Site, 그것도 없으면 Referer를 본다. 다른 사이트에서 온 POST는 403.
   - 크기(4KB 넘으면 413. Content-Length가 없는 chunked 요청도 4KB를 넘는 순간 읽기를 멈춘다)와 형식(urlencoded·JSON 말고는 415).
   - 허니팟(신청만): 숨은 `wl_note` 칸이 차 있으면 아무것도 하지 않고 평소와 같은 성공 답을 준다. 공백만 있으면 빈 칸으로 본다. 자동 완성이 노리는 이름(`website` 같은)을 쓰지 않고, 1Password·LastPass·Bitwarden이 건너뛰도록 표시해 두었다.
   - 이메일: 소문자로 바꾸고 앞뒤 공백을 지운 뒤 254자 이하, 엄격한 형식.
   - 동의: 신청 자체가 동의다(2026-10-15 판부터). 체크 상자 칸은 보지 않는다.
   - 동의 문구 버전과 페이지: `consent_version`이 `copy.mjs`의 `consentVersions`에 있고 `page`가 `/`나 `/ko/`여야 한다. 빠졌거나 모르는 값이면 400이고 Upstash에 묻지 않는다. 기록은 어떤 안내를 어느 페이지에서 보았는지 말해야 하므로, 페이지를 열지 않은 클라이언트 대신 채워 넣지 않는다.
   - Upstash 설정이 없으면 503과 로그 한 줄. 그다음 속도 제한, 저장.
3. 처음 주소든 이미 있는 주소든 같은 길을 같은 횟수로 거치고 **글자 하나까지 같은 답**을 받는다. 명단에 있는지 알려 주지 않는다.
4. 해지는 `/unsubscribe/`, `/ko/unsubscribe/`의 양식이 `POST /api/unsubscribe/`로 보낸다. 주소만 묻고, 그 자리에서 명단에서 지우며, 주소가 명단에 있었든 없었든 같은 답을 준다. 데이터베이스 백업의 사본은 처리방침 4번에 적은 대로 Upstash의 백업 삭제 주기에 따라 지워지므로 답에도 그렇게 적는다.
   - 해지 양식에는 허니팟을 두지 않는다. 자동 완성이 숨은 칸을 채울 수 있는데, 해지의 성공 답은 처리결과 통지라서 철회는 언제나 실제로 처리해야 한다. 지우기만 하므로 막을 것도 없다.
   - 신청 양식 아래에도 해지 페이지로 가는 줄이 있다. 철회가 동의보다 어려우면 안 된다(개인정보 보호법 제38조④).

답의 문구는 `api/_lib/copy.mjs` 하나에 있다. 양식의 `data-msg-*`(브라우저가 먼저 잡는 오류)와 같아야 하며 테스트가 확인한다. 성공 답에는 정보통신망법 시행령 제62조의2의 네 가지(보낸 이, 동의 사실, 동의한 날짜(한국 시간, ‘오늘’이 아닌 날짜), 처리 결과)가 들어 있다. 이 화면 안내가 처리결과 통지다.

### 저장 형태 (Upstash Redis, REST API)

| 키 | 형태 | 내용 |
| --- | --- | --- |
| `wl:emails` | SET | 수신 동의한 주소 전부 |
| `wl:sub:<주소>` | HASH | `email`(주소), 그리고 동의를 받은 안내 문구 판마다 `consent:<버전>` → `{"at": 동의 일시(UTC ISO), "lang": "en"/"ko", "page": "/" 또는 "/ko/"}`(JSON). 이것 말고는 저장하지 않는다 |
| `wl:rl:s:<해시>`, `wl:rl:u:<해시>` | 문자열(카운터) | 신청·해지 속도 제한. 네트워크(IPv4 주소, IPv6는 /64)를 HMAC-SHA256한 값의 앞 32자. 600초 뒤 저절로 사라진다. IP 자체는 어디에도 저장하지 않는다 |
| `wl:log:deleted` | HASH | 파기 기록: `"<날짜> <사유>"` → 건수. 주소는 적지 않는다 |
| `wl:log:admin` | LIST | `tools/waitlist.py`의 내보내기·2년 확인 조회(`due`)·삭제 기록(날짜, 작업, 건수) |

- 신청은 한 번의 `/multi-exec`로 `SADD`, `HSETNX email`, `HSETNX consent:<버전>`을 보낸다. 같은 판으로 다시 신청하면 아무것도 바뀌지 않는다. 남이 주소를 넣어 남의 기록을 바꿀 수 없게 하려는 것이다. 새 판의 안내로 신청하면 그 판의 항목이 하나 더 생기고 예전 판의 동의는 그대로 남는다. 그래서 다시 받은 동의와 그 전의 동의를 모두 증명할 수 있다. 캐시된 옛 페이지로 옛 판을 다시 보내도 이미 있는 항목은 바뀌지 않는다. 화면에 찍히는 날짜는 그날의 의사 표시 날짜다.
- 속도 제한은 네트워크마다 신청은 10분에 30번, 해지는 10분에 10번이고 따로 센다. 사무실, 학교, 이동통신사 NAT처럼 IPv4 주소 하나 뒤에 여러 사람이 있고, 출시 글이나 시연 때 한꺼번에 신청하므로 신청을 넉넉히 둔다. `SET … EX 600 NX`와 `INCR`를 한 트랜잭션으로 보낸다.
- 제한을 넘은 네트워크는 함수 인스턴스의 메모리(`Map`)에 Redis와 같은 해시로 넘은 때부터 10분 동안 두고, 그동안은 Upstash에 묻지 않고 429를 준다. 한 IP에서 쏟아지는 요청이 하나마다 Upstash 명령 두 개를 써서 무료 한도를 다 쓰면 신청과 해지가 모두 멈추기 때문이다. 검사할 때마다 기한이 지난 항목부터 지우므로 해시는 길어야 처음 요청부터 20분 남는다(처리방침의 ‘1시간 안’). 1,000개가 차면 더 넣지 않는다. 여러 IP에서 오는 폭주는 막지 못하므로 Vercel Firewall 규칙이 맡는다(아래 ‘Upstash 연결’ 9번).
- 해지는 Lua 스크립트 하나(`EVAL`)로 `SREM`, `DEL`, 그리고 기록이 있었을 때만 `HINCRBY wl:log:deleted`를 한다. 있던 주소와 없던 주소가 같은 한 번의 왕복이라 시간으로도 구별되지 않는다.
- 함수 로그에는 이메일 주소, IP, 요청 본문을 남기지 않는다. 오류는 상태 코드나 정해진 문구만 남긴다. Upstash의 오류 글도 남기지 않는다(‘unknown command’ 오류는 인자, 곧 주소를 되풀이한다). 요청 한도를 다 쓴 경우만 `upstash quota exceeded`로 따로 남겨 장애와 구별한다. 이 줄이 보이면 Upstash 콘솔에서 사용량을 보고 한도가 풀릴 때까지 기다리거나 플랜을 올린다.

### 환경 변수

| 이름 | 필요 | 설명 |
| --- | --- | --- |
| `KV_REST_API_URL` | 필수 | Upstash REST 주소(`https://…upstash.io`). Marketplace에서 연결하면 Vercel이 넣어 준다. `UPSTASH_REDIS_REST_URL`도 읽는다 |
| `KV_REST_API_TOKEN` | 필수 | 쓰기 가능한 REST 토큰. `UPSTASH_REDIS_REST_TOKEN`도 읽는다. `KV_REST_API_READ_ONLY_TOKEN`은 쓰지 않는다(쓰기가 실패한다) |
| `WAITLIST_HMAC_SECRET` | 선택 | 속도 제한용 해시 키. 없으면 REST 토큰에서 따로 파생한 키를 쓴다 |
| `CRON_SECRET` | 필수(크론) | 16자 이상 무작위 문자열. Vercel이 크론 호출마다 `Authorization: Bearer …`로 보내고, `/api/keepalive/`는 이 값이 맞을 때만 Upstash에 쓴다. 없으면 503을 주고 아무것도 하지 않는다 |

`KV_URL`, `REDIS_URL`(`rediss://`)은 REST 주소가 아니다. 연결할 때 접두사(Custom Prefix)를 정하면 이름이 바뀌므로 비워 둔다. 둘 중 하나라도 없으면 함수는 503을 주고 로그에 `waitlist: KV_REST_API_URL / KV_REST_API_TOKEN are not set …`을 남긴다. 변수를 바꾼 뒤에는 다시 배포해야 반영된다.

### Upstash 연결 (처음 한 번)

1. Vercel 대시보드 > telicity-www > Storage > Create Database > Upstash for Redis(Marketplace). 계정 연결과 약관 동의는 직접 한다.
2. **Primary Region: `iad1` (미국 동부)**. 2026-10-14에 만든 DB(`upstash-kv-cerise-book`)가 여기 있다. 만든 뒤에는 바꿀 수 없다. 읽기 리전(Read Regions)은 더하지 않는다. 함수도 `vercel.json`에서 `iad1`에 고정해 DB와 같은 곳에서 돈다. 처리방침에는 두 곳 모두 ‘미국 동부’로 적어 두었으니, DB를 다른 리전에 다시 만들면 `vercel.json`의 `regions`와 `legal/privacy.*.md`를 함께 고치고 `python3 tools/legal.py`를 다시 돌린다.
3. 플랜은 Free로 충분하다(명단 하나는 무료 한도의 1%도 쓰지 않는다).
4. 프로젝트에 연결할 때 환경은 **Production만** 고른다. 미리보기 배포에서 시험한 주소가 실제 명단에 섞이지 않게 하려는 것이다. 미리보기에서도 시험하려면 무료 DB를 하나 더 만들어 Preview에만 연결한다. Custom Prefix는 비워 둔다.
5. Project > Settings > Environment Variables에서 `KV_REST_API_URL`, `KV_REST_API_TOKEN`이 생겼는지 확인한다.
6. 다시 배포한다(Deployments > 최신 배포 > Redeploy, 또는 `main`에 푸시).
7. Settings > Build and Deployment에서 Node.js 버전이 24.x(또는 22.x)인지 확인한다.
8. Production 환경 변수에 `CRON_SECRET`(16자 이상 무작위 문자열)을 넣는다. 아래 ‘DB 깨우기(크론)’가 쓴다.
9. Vercel Firewall에 속도 제한 규칙을 하나 둔다(Hobby는 Rate Limit 규칙 1개, 고정 창, IP 키). Project > Firewall > Configure > New Rule: 조건은 Request Path가 `/api/`로 시작하고 Method가 `POST`, 동작은 Rate Limit(Fixed Window 60초에 20번, 키 IP, 넘으면 429). 함수와 Upstash까지 가기 전에 막으므로 여러 IP에서 오는 폭주까지 덮는 첫 방어선이다. 함수 안의 제한(위 ‘저장 형태’)은 그 뒤의 둘째 방어선이다.

### DB 깨우기(크론)

Upstash 무료 DB는 30일 넘게 요청이 없으면 보관 처리(archive)되고, 그러면 신청과 해지가 모두 실패한다(https://upstash.com/docs/redis/help/faq). 그래서 `vercel.json`의 `crons`가 하루 한 번(`23 18 * * *`, UTC. 한국 시각 새벽 3시대) `GET /api/keepalive/`를 부른다. Hobby는 하루 한 번까지만 되고 실행 시각은 그 시간 안에서 흔들린다(https://vercel.com/docs/cron-jobs/usage-and-pricing).

- 하는 일은 `SET wl:keepalive <ISO 시각> EX 7776000` 하나다. 개인정보는 읽지도 쓰지도 않는다. 같은 실행이 두 번 와도 결과는 같다.
- `Authorization: Bearer <CRON_SECRET>`이 맞을 때만 Upstash에 간다. 비교는 시간으로 값이 새지 않게 한다. 다른 요청은 401(값이 다를 때), 405(GET이 아닐 때), 503(`CRON_SECRET`이나 DB 변수가 없을 때)으로 끝나고 Upstash를 부르지 않는다.
- 크론은 리디렉트를 따라가지 않으므로 경로는 끝에 `/`가 있어야 한다(`trailingSlash: true`).
- 확인: Vercel > telicity-www > Settings > Cron Jobs > View Logs. 또는 Upstash 콘솔에서 `wl:keepalive` 값의 시각.

### 배포 후 확인

```bash
# JSON 답 (시험용 주소로. 끝나면 아래의 delete로 지운다)
curl -i -X POST https://telicity.ai/api/waitlist/ \
  -H 'Origin: https://telicity.ai' -H 'Accept: application/json' \
  --data 'email=test%2Bwl%40example.com&lang=ko&page=%2Fko%2F&consent_version=2026-10-15'
# 다른 출처는 403이어야 한다
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://telicity.ai/api/waitlist/ -H 'Origin: https://example.com' --data 'email=a%40b.co'
# 함수 응답에도 CSP와 noindex가 붙는지
curl -sI -X POST https://telicity.ai/api/waitlist/ -H 'Origin: https://telicity.ai' | grep -i -E 'content-security|x-robots|cache-control'
```

미리보기 배포는 Vercel Deployment Protection 뒤에 있을 수 있어, 로그인한 브라우저에서 보거나 프로덕션에서 확인한다. 브라우저에서도 JavaScript를 켜고 한 번, 끄고(개발자 도구 > 설정 > Disable JavaScript) 한 번, 영어와 한국어로 신청해 본다.

### 명단 보기, 내보내기, 지우기

`tools/waitlist.py`(표준 라이브러리만 씀)를 쓴다. 토큰은 Vercel > Storage > 그 DB > `.env.local` 탭에서 복사해 셸에만 둔다(`.env*`는 `.gitignore`에 있다).

```bash
export KV_REST_API_URL='https://….upstash.io' KV_REST_API_TOKEN='…'
python3 tools/waitlist.py count                      # 몇 명인지
python3 tools/waitlist.py export > /Volumes/암호화된-디스크/list.csv   # CSV. 쓰고 나면 지운다
python3 tools/waitlist.py delete name@example.com request   # 요청을 받아 파기 (사유: request | underage | bounce | other)
python3 tools/waitlist.py due 60                     # 60일 안에 2년 확인일이 오는 기록
python3 tools/waitlist.py log                        # 파기 기록과 관리 기록
```

명단 조회, 내보내기, 파기는 기록(`wl:log:admin`)이 남도록 `tools/waitlist.py`로만 한다. Upstash 콘솔의 Data Browser로 `wl:emails`나 `wl:sub:*` 값을 열어 보지 않는다(처리방침 8번이 접근 기록을 약속한다).

`export`는 `=`, `+`, `-`, `@`, 탭, 줄바꿈으로 시작하는 값이 있으면 아무것도 쓰지 않고 그 주소들을 stderr에 보이고 멈춘다(스프레드시트가 수식으로 실행한다). 신청 양식이 그런 주소를 받지 않으므로 생길 일은 없지만, 생기면 지우거나 `export --force`로 그대로 쓴다. CSV는 주소마다 한 줄이고, 가장 새 판의 동의(판, 일시, 언어, 페이지)를 담는다.

도구를 쓸 수 없을 때의 파기만 REST API로 직접 한다. 관리 기록을 같은 트랜잭션에 넣는다(날짜는 그날로):

```bash
H="Authorization: Bearer $KV_REST_API_TOKEN"
curl -s "$KV_REST_API_URL/multi-exec" -H "$H" -d '[["SREM","wl:emails","name@example.com"],["DEL","wl:sub:name@example.com"],["HINCRBY","wl:log:deleted","2026-10-12 request","1"],["RPUSH","wl:log:admin","{\"date\":\"2026-10-12\",\"action\":\"delete request (manual)\",\"count\":1}"]]'
```

토큰을 URL(`?_token=`)에 넣지 않는다. 내보낸 파일은 암호화한 곳에만 두고 쓴 뒤 지운다. 메일로 해지·삭제 요청을 받으면 10일 안에 처리하고, 14일 안에 보낸 이·사실·날짜·결과를 적어 답한다(처리방침 10번).

### 동의 문구 버전

- 동의 안내(버튼 아래 인쇄 줄과 버튼)는 판마다 읽는 순서 그대로 `legal/consent/<버전>.md`에 남긴다. 지금 판은 `2026-10-15`(체크 상자 없이 신청 자체가 동의)이고, `2026-10-12`(요약 줄, 접힌 안내, 필수 체크 상자 두 개)는 2026-10-14 하루만 공개됐다. 기록마다 `consent_version`이 있어 어떤 문구를 보고 신청했는지 보일 수 있다.
- 문구를 고칠 때 옛 파일은 건드리지 않는다.
  1. 새 파일 `legal/consent/<새 날짜>.md`를 만든다.
  2. `index.html`·`ko/index.html`의 문구와 숨은 칸 `consent_version`을 바꾼다.
  3. `api/_lib/copy.mjs`의 `consentVersions` 끝에 새 id를 더한다. 옛 id는 지우지 않는다(캐시된 옛 페이지가 보낼 수 있다).
  4. `python3 tools/legal.py --check`를 돌린다.
- 목적·항목·보유 기간 같은 고지 사항이 바뀌면 기존 구독자에게 다시 알리고 동의를 받아야 한다(개인정보 보호법 제15조②). 새 판의 양식으로 다시 신청하면 같은 기록에 `consent:<새 버전>` 항목이 더해지고 예전 판의 동의는 남는다. `tools/waitlist.py export`는 가장 새 판의 동의를 내보내고, `due`는 마지막 동의일부터 2년을 센다.
- `python3 tools/legal.py --check`는 두 페이지의 안내 줄과 버튼이 그 버전 파일과 글자까지 같은지(링크 주소까지), 버전이 `consentVersions`의 마지막인지, 처리방침에 채우지 않은 `{자리}`가 남았는지, 처리방침 페이지가 Markdown과 같은지 본다.

### 처리방침

- 원문은 `legal/privacy.ko.md`(한국어가 기준), 번역은 `legal/privacy.en.md`다. 고친 뒤 `python3 tools/legal.py`(페이지 생성), `python3 tools/fonts.py`(새 글자), `python3 tools/legal.py --check` 순서로 돌린다.
- **채운 자리와 출처**: 공개 전에 채울 `{자리}`는 이제 없다(`{자리}`가 하나라도 남으면 `--check`가 실패한다). 업체에 관한 문장은 모두 그 업체의 현재 문서에서 가져왔고 2026-10-12에 확인했다. 업체 문서가 바뀌면 처리방침도 바꾼다. `legal/*.md`에 주석을 넣으면 `body()`가 글로 찍으므로 출처는 여기에만 둔다. 처리방침에 적은 업체 주소(vercel.com/legal/privacy-policy, datacenters.google/locations/)는 `tools/legal.py`의 `LINKS`가 링크로 만든다.
  - 2번 웹사이트 접속 기록의 보유 기간: Vercel은 기간을 공개하지 않는다. 처리방침(https://vercel.com/legal/privacy-policy, 2026-06-01)에는 법적·계약상 의무에 필요한 최소 기간이라는 말뿐이다. 관리 화면에서 볼 수 있는 기간은 보관 기간이 아니므로 처리방침에 적지 않는다. Firewall 문서(https://vercel.com/docs/vercel-firewall/firewall-observability, 2026-09-10, 2026-10-12 확인)도 Overview의 접속량 그래프만 최근 24시간까지 늘릴 수 있다고 적을 뿐, IP 주소별로 묶은 Traffic 화면의 기간은 밝히지 않는다. 7번 Vercel 블록은 2번을 가리킨다.
  - 2번 문의 메일의 보유 기간 1년: 업체 사실이 아니라 운영 선택이다(남은 결정 7).
  - 4번 Upstash 백업: 정기 스냅숏(https://upstash.com/docs/common/help/compliance), 클러스터와 같은 리전에 보관하고 해지한 클러스터의 사본은 최대 4주(https://upstash.com/static/trust/security-measures.pdf, 2022-05-23 개정, 6.2와 4.5), 정해진 백업 삭제 주기(https://upstash.com/static/trust/dpa.pdf, 2025-04, 11.1). 살아 있는 데이터베이스의 스냅숏에서 지운 키가 언제 사라지는지는 공개돼 있지 않아 숫자를 적지 않았다. privacy@upstash.com에 서면으로 물어 숫자를 받으면 4번을 ‘N일 안에 함께 지워집니다’로 바꾼다(`copy.mjs`의 해지 답은 그대로 맞다). 무료 플랜에는 고객이 쓰는 일일 백업이 없다(https://upstash.com/docs/redis/help/production-checklist). 2번의 ‘IP 주소 변환값 1시간’과 ‘문의 메일 1년’은 살아 있는 데이터의 이야기이고, 백업에 남는 사본은 4번이 따로 말한다. 7번의 Upstash 블록과 Google 블록도 백업 사본은 4번을 가리킨다.
  - 4번 Gmail: 지운 메일은 약 2개월 뒤 Google 서버에서 사라지고 암호화된 백업에는 최대 6개월 남는다(https://policies.google.com/technologies/retention).
  - 6번과 7번 Google LLC(Gmail): 소유자 결정(2026-10-12). hello@telicity.ai는 Cloudflare Email Routing이 Gmail 메일함으로 넘긴다. 받는 개인 주소는 어디에도 적지 않는다. 연락처는 한국 보충 문서(https://policies.google.com/privacy/additional?hl=ko&gl=kr)의 googlekrsupport@google.com과 우편 주소다. 같은 문서가 국내대리인(구글코리아 유한회사, data-access-requests@google.com)도 적고 있다. 국가: https://policies.google.com/privacy(2026-10-01 시행)의 ‘전 세계의 서버’, 데이터센터 위치 https://datacenters.google/locations/. 그 페이지의 숫자(활성 11개국)와 위치 데이터(개발 중이 아닌 13개국)가 달라 국가 이름은 적지 않았다.
  - 7번 Cloudflare: 연락처는 https://www.cloudflare.com/privacypolicy/(2025-11-04 시행)의 본사 주소와 privacyquestions@cloudflare.com(DPO는 dpo@cloudflare.com, 권리 행사는 sar@cloudflare.com). 국가는 같은 문서 7절(주로 미국과 EEA에 저장, 전 세계에서 이전·접근)과 https://developers.cloudflare.com/data-localization/metadata-boundary/(2026-07-23). Email Routing이 메일을 처리하는 국가 목록은 어디에도 없다. 보관: ‘메일 내용을 저장하거나 열람하지 않는다’는 제품 페이지 https://www.cloudflare.com/products/email-routing/ 의 ‘Private by Design’ 항목(“storing and accessing no email content”, 2026-10-12 확인, 2026-10-14 공개 직전 재확인)이다. 개발자 문서의 https://developers.cloudflare.com/email-routing/ 는 이제 /email-service/ 로 301 이동하고, Email Service 문서에는 이 문장이 없다. 예전 문서의 문장은 https://developers.cloudflare.com/email-routing/llms-full.txt 에만 남아 있다. 공개 전에 제품 페이지에 문장이 아직 있는지 다시 확인하고, 사라졌으면 7번 Cloudflare 블록의 보유·이용 기간에서 앞 문장을 뺀다. 보낸 사람(이름 포함), 받는 주소, 제목, 메시지 ID, 처리 결과를 담은 라우팅 기록 31일은 https://developers.cloudflare.com/email-service/observability/metrics-analytics/(2026-06-09)에서 가져왔다. Email Routing 문서는 이제 Cloudflare Email Service에 합쳐졌다고 적고 있고, 기존 설정은 그대로 동작한다.
  - 7번 Vercel과 Upstash의 연락처와 국가는 다시 확인했고 그대로다(https://vercel.com/legal/privacy-policy, https://vercel.com/docs/regions의 `iad1` = 미국 동부(Washington, D.C., AWS us-east-1), https://vercel.com/legal/dpa; https://upstash.com/static/trust/dpa.pdf의 privacy@upstash.com, https://upstash.com/docs/redis/features/globaldatabase의 N. Virginia `us-east-1`). Upstash는 우편 주소를 공개하지 않아 메일 주소만 둔다.
  - 13번 개인정보 보호책임자: 소유자 결정(2026-10-12)으로 직함 ‘대표’(영어 Representative), 연락처 hello@telicity.ai(남은 결정 2).
  - 메일함을 국내 서비스로 바꾸면 7번의 Google 블록은 빼고 6번에만 둔다.
- 시행일(2026-10-14, 실제 공개일)보다 늦게 공개하면 두 판의 시행일과 `tools/legal.py`의 JSON-LD 날짜를 고친다. 처리방침을 바꿀 때는 옛 판을 적용 기간과 함께 남긴다(16번).
- 처리방침이 지금 사실로 적고 있는 것: 2단계 인증(Vercel, Upstash, GitHub, 메일), 접근 권한을 필요한 사람으로 한정, 내보낸 명단의 암호화와 사용 후 삭제, 접근·내보내기·파기 기록 1년 이상 보관(그래서 명단은 `tools/waitlist.py`로만 다룬다), 쿠키·분석 도구 없음, IP 해시 1시간 안에 삭제(실제로는 Redis 600초, 함수 메모리의 차단 목록은 길어야 20분), 서버 로그에 주소 없음, 데이터베이스 백업을 따로 만들거나 백업에서 되살리지 않음(그래서 Upstash 콘솔의 Backup & Export를 쓰지 않는다), 문의 메일 1년 보관. 메일함에서 지운 메일은 휴지통까지 비워야 4번의 ‘늦어도 5일’이 지켜진다. 이 중 하나라도 바뀌면 처리방침도 바꾼다.

### 법적 메모와 남은 결정

근거는 개인정보 보호법과 시행령(2026.9.11 시행), 정보통신망법 제50조(2026.10.2 시행)와 시행령 제61조–제62조의3, PIPC 「개인정보 처리 통합 안내서」(2025.7)와 「개인정보 처리방침 작성지침」(2026.4), KISA 「불법스팸 방지를 위한 정보통신망법 안내서」(제7차, 2025.12)다. 법률 자문이 아니다.

- **동의 방식**: 2026-10-15부터 체크 상자 없이, 버튼 바로 아래 한 줄로 ‘신청하면 소식 메일 수신에 동의한 것으로 본다’고 알리고 신청 자체를 동의로 본다(소유자 결정, 2026-10-15: 임시 랜딩이고 아직 구독자가 없으며 동의 UI가 진입 장벽을 높인다). 법이 요구하는 형식(개인정보 수집·이용 동의 제15조①1과 광고성 정보 수신 동의 정보통신망법 제50조①을 따로, 고지 사항을 알리고 명시적으로 받기, 14세 이상 확인)에는 못 미친다. 메일을 실제로 보내기 전, 또는 정식 서비스로 바꿀 때 체크 상자 판(`legal/consent/2026-10-12.md`)으로 되돌리거나 법률 검토를 받는다.
- **광고성 정보**: 출시·서비스 소식 메일은 광고성 정보다. 발송 도구를 붙이기 전에 갖출 것이 있다.
  - 제목 맨 앞의 `(광고)`, 본문의 보낸 이 이름·이메일·전화번호·주소.
  - 한글과 영문의 수신 거부 안내, 로그인 없이 한 번에 되는 거부(이 명단에서 바로 지우도록).
  - 메일 발송 업체를 수탁자·국외 이전으로 처리방침에 더하고, 첫 메일에서 알린다(제26조③).
  - 구독자마다의 2년 확인. 마지막으로 동의한 날로부터 2년(2026-10-12에 신청했다면 2028-10-12)이 되기 전에 확인 메일을 보내거나 그 기록을 지운다(`tools/waitlist.py due`. 새 판으로 다시 동의했으면 그날부터 센다).
- **확인 메일은 따로 보내지 않는다**: 화면 안내로 처리결과 통지를 한다. 발송 도구가 생기면 이중 확인(double opt-in)을 변호사와 정한다.
- **남은 결정**:
  1. Vercel Hobby는 비상업 용도로만 쓸 수 있고(https://vercel.com/docs/plans/hobby) Vercel DPA는 Pro·Enterprise에만 적용된다(https://vercel.com/legal/dpa, 2026-03-31 시행). 위탁 계약서(제26조①)가 없을 수 있다. 명단을 받기 전에 Pro로 옮기거나 데이터 처리 조건을 서면으로 확인한다. 개인 Gmail도 같다. 데이터 처리 계약이 없으므로 Google Workspace(Cloud Data Processing Addendum)로 옮기거나 변호사 판단을 받는다. Cloudflare는 셀프서브 약관에 붙는 고객 DPA(v6.4, 2026-04-03 시행, https://www.cloudflare.com/cloudflare-customer-dpa/)가 적용된다. Upstash DPA도 받아 보관한다.
  2. 운영 주체(개인인지 사업자인지). 개인정보 보호책임자는 직함 ‘대표’로 적었다(소유자 결정). 제30조①6은 보호책임자의 성명 또는 담당 부서의 명칭과 전화번호 등 연락처를 적으라고 하므로, 직함만으로 충분한지 변호사에게 묻는다(조문은 law.go.kr의 현행 판으로 확인한다). 광고 메일에는 전화번호와 주소가 필요하다.
  3. hello@telicity.ai 수신은 Cloudflare Email Routing에서 Gmail로 정했다. 처리방침의 연락처이자 두 번째 철회 창구이므로 공개 전에 실제로 메일이 오가는지 확인한다. 답장(10번의 10일·14일 안의 답)도 hello@telicity.ai 주소로 나가야 한다. 받는 개인 주소를 숨기기로 했기 때문이다(소유자 결정 2). Gmail 도움말 ‘Send emails from a different address or alias’(https://support.google.com/mail/answer/22370, 2026-10-12 확인)에 따르면 보내는 주소만 바꾸면 답장은 기본으로 원래 Gmail 주소로 가므로 reply-to도 바꿔야 하고, 상대가 Outlook 같은 다른 서비스를 쓰면 ‘(Gmail 주소) on behalf of (보낸 주소)’로 보일 수 있으며, 부재중 자동 응답이나 자동 응답 필터를 쓰거나 메일함이 가득 차 상대에게 알림이 가면 원래 주소가 보일 수 있다. 그래서 이 메일함에는 자동 응답을 켜지 않는다. 같은 문서는 2027년 1월부터 Gmail이 @yahoo.com, @outlook.com 같은 다른 회사 주소의 ‘Send as’를 지원하지 않는다고 적고 있다(Google Workspace 별칭과 소유한 다른 Gmail 주소는 해당하지 않는다). hello@telicity.ai가 여기에 드는지도 확인한다. 공개 전에 Gmail이 아닌 바깥 주소(Outlook 포함)에서 hello@telicity.ai로 메일을 보내고 그 메일에 답장해, 받은 답장의 화면상 보낸 사람과 From, Sender, Reply-To, Return-Path 어디에도 개인 주소가 없는지 본다. 보이거나 2027년 1월 뒤에 그렇게 보낼 수 없게 되면 답장용 발송 경로를 따로 정한다(남은 결정 1의 Google Workspace도 그 하나다). 그 경로에 새 업체가 들어가면(외부 SMTP 서버나 다른 메일 계정 등) 처리방침 6번과 7번에 수탁자와 국외 이전으로 더하고, 그 업체의 현재 문서와 확인 날짜를 위 출처 목록에 적는다. 경로를 정하면 6번 Google 줄의 업무(지금은 ‘메일 보관’)와 7번의 이용 목적(‘메일 보관과 답장’, 영어 ‘keeping and answering email’)을 실제 경로에 맞춘다. 개인 주소는 이 README에도 적지 않는다.
  4. 국외 이전 근거(제28조의8①3, 처리방침 공개)가 사이트 방문자와 문의 메일까지 덮는지.
  5. 영어 명단에도 한국 규칙을 그대로 적용한다(처리방침 11번). GDPR·CAN-SPAM은 조사하지 않았다.
  6. 서비스를 접거나 명단을 더 쓰지 않게 될 때의 일괄 파기 시점.
  7. 문의 메일 보유 기간 1년은 운영 선택이다(8번의 접근·파기 기록 1년과 맞추고, 이의 제기와 10일·14일 안의 처리를 보일 수 있게). 3개월로 줄여도 된다. 바꾸면 처리방침 2번을 고친다.
  8. Upstash Free 플랜: 30일 넘게 요청이 없으면 데이터베이스가 보관 처리(archive)될 수 있고(https://upstash.com/docs/redis/help/faq), 약관은 요청이 없는 무료 리소스를 1주 뒤 지울 수 있게 한다(https://upstash.com/trust/terms.pdf, 2025-04, I.5). 그러면 신청과 해지(법이 요구하는 철회 창구)가 모두 멈추고, 보관 처리의 백업 사본은 보관 기간이 공개돼 있지 않다. 주기적인 요청이나 유료 플랜 중 하나를 정한다. 저장 데이터 암호화는 Prod Pack이 있어야 하므로(https://upstash.com/docs/common/help/compliance) 처리방침 8번에 넣지 않는다.
  9. 동의 안내를 접은 것(소유자 결정 3): 요약 줄이 목적, 항목, 보유 기간을 늘 보여 주고 전문은 한 번 눌러 그 자리에서 열린다. 이 방식으로 충분한지 변호사 확인을 받아 두면 좋다.

### 테스트

```bash
# 함수 로직 (macOS의 JavaScriptCore로, Node 없이. node로도 돈다)
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tools/tests/waitlist.test.mjs
python3 tools/legal.py --check   # 동의 문구, 버전, 처리방침의 빈자리
python3 tools/fonts.py --check   # 새 글자가 서브셋에 있는지
```

테스트는 Upstash REST의 응답 형태를 흉내 낸 가짜로 신청, 중복 신청, 새 판의 동의(예전 동의가 남는지), 해지(숨은 칸이 채워져도 처리되는지), 속도 제한(신청과 해지의 한도, 메모리 차단과 그 만료), Upstash 한도 초과 로그, 허니팟, 빠진 버전과 페이지, 수식으로 시작하는 주소, 출처, 크기와 형식, Upstash 장애, HTML 답장(CSP: `style=`와 인라인 스크립트 없음), 로그에 개인정보가 없는지, 페이지와 서버의 문구가 같은지, 신청 페이지가 해지 페이지를 링크하는지, 동의 안내가 요약 줄과 처리방침 링크를 밖에 두고 여섯 항목을 처음에 닫힌 `<details>`에 접어 두는지를 확인한다.

## 로컬 미리보기

```bash
python3 -m http.server 4173
```

이 서버는 함수를 돌리지 못한다. JavaScript가 있으면 양식의 오류 상태까지는 보이고, 보내기는 ‘서버 문제’ 안내로 끝난다.

## 카피를 고칠 때 함께 고칠 것

문구는 여러 파일에 복제되어 있다. 하나를 바꾸면 아래를 모두 맞춘다.

1. `index.html` / `ko/index.html`: 본문, `<title>`, description, OG/Twitter, JSON-LD. `site.webmanifest`의 `description`은 영어 meta description과 같은 문장. 신청 양식의 동의 안내를 고칠 때는 ‘소식 메일 신청 > 동의 문구 버전’을 따른다. 오류·답장 문구는 `api/_lib/copy.mjs`와 양식의 `data-msg-*`를 함께 고친다
2. `index.md` / `ko/index.md`, `llms.txt`
3. 폰트 서브셋: `python3 tools/fonts.py`(fontTools·brotli 필요: `python3 -m pip install fonttools brotli`). 원본 글꼴은 처음 한 번 Google Fonts에서 `tools/.cache/`로 받는다. 해시 이름의 새 woff2를 만들고, `site.css`의 `url()`과 `/ko/`의 preload를 고치고, 옛 파일을 지운다. 새 파일을 커밋한다. `python3 tools/fonts.py --check`는 그려지는 글자가 서브셋에 하나라도 없으면 실패한다
4. `llms-full.txt` 재생성:
   ```bash
   { printf '# Telicity: full text\n\nSource: https://telicity.ai/llms.txt. This file contains the English page (https://telicity.ai/) followed by the Korean page (https://telicity.ai/ko/).\n\n---\n\n'; cat index.md; printf '\n---\n\n'; cat ko/index.md; } > llms-full.txt
   ```
5. `sitemap.xml`의 `lastmod`, JSON-LD의 `dateModified`
6. 처리방침을 고쳤으면 `python3 tools/legal.py`, 그다음 3번(폰트)과 `python3 tools/legal.py --check`
7. h1이 바뀌면 `og.png` / `og-ko.png`(1200×630, 평평한 `#f6f6f3` 바탕, 목탄 로고, Newsreader / Gowun Batang 제목, 크레용 고리, 오른쪽 위의 Caveat 손글씨 `telicity.ai`, 아래쪽의 호숫가 파노라마)도 `python3 tools/brand/gen.py og`로 다시 만든다. 그림을 바꿨을 때도 `python3 tools/lake/gen.py` 다음에 다시 만든다. 제목의 줄바꿈 위치는 생성기의 `card()`에 있다. 고리를 두른 구절이 바뀌면 디자인 메모의 ‘고리 다시 만들기’대로 페이지의 고리도 다시 맞춘다. OG 이미지를 바꾸면 SNS가 이미지를 URL로 캐시하므로 `index.html`·`ko/index.html`의 `og:image`, `twitter:image`, JSON-LD `primaryImageOfPage`(모두 6곳)의 `?v=` 값을 올린다(지금의 `?v=2`는 아직 배포 전이라, 처음 배포할 때는 올리지 않는다). 배포 후에는 Facebook Sharing Debugger(“Scrape Again”), Kakao Developers의 OG 캐시 초기화, LinkedIn Post Inspector로 `https://telicity.ai/`와 `https://telicity.ai/ko/`를 다시 긁게 한다. X는 일주일쯤 지나면 스스로 갱신한다
8. 배포 후 IndexNow 핑 (Bing, Naver, Yandex 등에 공유됨):
   ```bash
   curl -sS -X POST https://api.indexnow.org/indexnow -H 'Content-Type: application/json; charset=utf-8' -d '{"host":"telicity.ai","key":"4acb9e4c1b7422b8e68ecae7207ad4f4","keyLocation":"https://telicity.ai/4acb9e4c1b7422b8e68ecae7207ad4f4.txt","urlList":["https://telicity.ai/","https://telicity.ai/ko/","https://telicity.ai/privacy/","https://telicity.ai/ko/privacy/"]}'
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
