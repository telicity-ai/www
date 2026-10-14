// Text the waitlist functions print: the JSON replies read by assets/site.js
// and the small pages shown to a visitor whose browser posted the form
// without JavaScript. The same words appear on the pages themselves (the
// form's data-msg-* attributes); tools/tests/waitlist.test.mjs checks that the
// two agree, and tools/fonts.py reads the JSON below (between the markers) to
// cut the font subsets, so keep it strict JSON.
//
//   consentVersions  every consent-notice version ever shown, oldest first.
//                    Each one has its exact text in legal/consent/<id>.md.
//                    Never remove an id: old pages may still post it.
//   pen              keys set in handwriting (the way back links)
//   bold             keys set in bold (the colophon's privacy link)
//   otherScript      keys in the other language's script (the colophon's
//                    language link)
//   {date}           the consent date in Korea time (see kstDate)
export const COPY = /* COPY-JSON */ {
  "consentVersions": [
    "2026-10-12"
  ],
  "pen": [
    "backHome",
    "backForm",
    "backUnsub"
  ],
  "bold": [
    "footerPrivacy"
  ],
  "otherScript": [
    "otherLang"
  ],
  "en": {
    "siteName": "Telicity",
    "copyright": "© 2026 Telicity",
    "otherLang": "한국어",
    "footerPrivacy": "Privacy Policy",
    "doneTitle": "Thank you.",
    "success": "You’re signed up. Telicity recorded your consent to receive advertising emails (launch and product news) on {date} (Korea time). We won’t send a separate confirmation email. You can withdraw at any time at telicity.ai/unsubscribe/ or by writing to hello@telicity.ai.",
    "errorTitle": "You’re not signed up yet.",
    "errorInvalid": "That email address is missing or incomplete. Check that it’s written like name@example.com.",
    "errorConsent": "We need both consents to send you the news. Check both boxes to sign up.",
    "errorRate": "Too many requests came from this network in a short time. Wait a while, then try again.",
    "errorServer": "Our server couldn’t save your sign-up just now. Try again in a few minutes. If it keeps failing, let us know at hello@telicity.ai.",
    "backHome": "Back to Telicity",
    "backForm": "Back to the sign-up form",
    "unsubDoneTitle": "You’re unsubscribed.",
    "unsubSuccess": "On {date} (Korea time), Telicity processed the withdrawal of consent to receive advertising emails for this address. The address and its consent record are no longer on our list, and we won’t write to it. Any copy left in our database provider’s backups is erased on that provider’s backup schedule, as our Privacy Policy explains.",
    "unsubErrorTitle": "You’re not unsubscribed yet.",
    "unsubErrorServer": "Our server couldn’t process your request just now. Try again in a few minutes, or write to hello@telicity.ai and we’ll unsubscribe you.",
    "backUnsub": "Back to the unsubscribe form"
  },
  "ko": {
    "siteName": "텔리시티",
    "copyright": "© 2026 텔리시티",
    "otherLang": "English",
    "footerPrivacy": "개인정보 처리방침",
    "doneTitle": "고맙습니다.",
    "success": "신청을 마쳤습니다. 텔리시티(Telicity)의 광고성 정보(출시 소식과 서비스 소식) 이메일 수신 동의가 {date}에 처리되었습니다. 확인 메일은 따로 보내지 않습니다. 수신 동의는 telicity.ai/ko/unsubscribe/에서 언제든 철회하실 수 있고 hello@telicity.ai로 요청하셔도 됩니다.",
    "errorTitle": "아직 신청되지 않았습니다.",
    "errorInvalid": "이메일 주소가 비어 있거나 형식이 맞지 않습니다. name@example.com처럼 적혀 있는지 확인해 주십시오.",
    "errorConsent": "소식을 보내 드리려면 두 항목에 모두 동의하셔야 합니다. 두 칸에 모두 표시해 주십시오.",
    "errorRate": "이 네트워크에서 짧은 시간에 요청이 많이 들어왔습니다. 잠시 뒤에 다시 시도해 주십시오.",
    "errorServer": "저희 서버에 문제가 있어 신청을 저장하지 못했습니다. 몇 분 뒤에 다시 시도해 주십시오. 계속 안 되면 hello@telicity.ai로 알려 주십시오.",
    "backHome": "텔리시티로 돌아가기",
    "backForm": "신청 양식으로 돌아가기",
    "unsubDoneTitle": "구독을 해지했습니다.",
    "unsubSuccess": "{date}에 텔리시티(Telicity)의 광고성 정보 이메일 수신 동의 철회가 처리되었습니다. 이 주소와 동의 기록은 이제 명단에 없으며 앞으로 이 주소로 메일을 보내지 않습니다. 데이터베이스 백업에 사본이 남아 있으면 개인정보 처리방침에 적은 대로 Upstash의 백업 삭제 주기에 따라 지워집니다.",
    "unsubErrorTitle": "아직 해지되지 않았습니다.",
    "unsubErrorServer": "저희 서버에 문제가 있어 요청을 처리하지 못했습니다. 몇 분 뒤에 다시 시도하시거나 hello@telicity.ai로 해지를 요청해 주십시오.",
    "backUnsub": "구독 해지 양식으로 돌아가기"
  }
} /* END-COPY-JSON */;
