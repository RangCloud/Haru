/**
 * 앱 밖의 안내 페이지 주소
 *
 * App Store 심사 지침 5.1.1(i): 개인정보처리방침은 스토어 등록정보뿐 아니라 앱 안에서도 쉽게 열 수 있어야 한다.
 * 로그인 화면과 설정 화면 두 곳에서 같은 주소를 쓰므로 한곳에 모아 둔다.
 * 스토어에 입력한 주소(store/01_스토어_설명문.md)와 반드시 같아야 한다 — 페이지를 옮기면 세 곳을 함께 고친다.
 *
 * 2026-11-18: claude.ai 게시 페이지 → 하루 서버(backend/app/api/pages.py)로 이전.
 * App Store 4.2.6(앱 생성 서비스) 반려 대응 — 방침 주소가 AI 서비스 도메인이면 오해받을 수 있어
 * 앱이 이미 쓰는 서버 주소에서 직접 제공한다. 페이지 원본은 backend/app/static/pages/.
 */

export const PRIVACY_POLICY_URL = "https://haru-api.duckdns.org/privacy";
export const SUPPORT_URL = "https://haru-api.duckdns.org/support";
