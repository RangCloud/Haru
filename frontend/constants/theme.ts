/**
 * 하루 앱 디자인 토큰
 *
 * 2026-11 리디자인(시안 1) — 따뜻한 미색 바탕 위에 흰 묶음 목록을 얹고, 파랑 하나만 강조색으로 쓴다.
 * 모든 화면은 Colors[scheme]에서 토큰을 가져와 사용한다(화면에서 색을 직접 쓰지 않는다).
 *
 * 대비(WCAG 2.1 AA, 본문 4.5:1 이상)는 값마다 옆에 적었다. 흰 카드(#FFFFFF)·다크 카드(#1B1C1F) 기준.
 * 수입·지출은 사용자 요청으로 시안의 파랑/검정 대신 초록/빨강을 쓴다 — 금액만 보고도 바로 구분되게.
 */

import { Platform } from "react-native";

const PRIMARY_LIGHT = "#2C64D8"; // 파랑 — 흰 카드 5.36:1, 미색 바탕 4.91:1
const PRIMARY_DARK = "#7FA2F0";  // 다크 카드 위 6.76:1

export const Colors = {
  light: {
    background: "#F5F5F4",       // 따뜻한 미색 바탕
    card: "#FFFFFF",             // 묶음 목록(카드) 바탕
    cardBorder: "#E7E7E5",       // 카드 테두리 — 그림자 대신 얇은 선으로 구분한다
    text: "#1A1C1E",             // 본문
    subtext: "#5F646A",          // 보조 글자 — 흰 카드 5.97:1, 미색 바탕 5.47:1
    faint: "#A3A8AE",            // 다른 달 날짜처럼 '없어도 되는' 글자 전용(2.39:1) — 정보 글자에는 쓰지 않는다
    icon: "#5F646A",             // 아이콘 (하위 호환)
    tint: PRIMARY_LIGHT,
    tintStrong: "#1F4FB3",       // 연한 파랑 버튼 위 글자 — tintLight 위 6.24:1
    tintLight: "#E3ECFB",        // 연한 파랑 바탕(보조 버튼·선택 표시)
    onTint: "#FFFFFF",           // 파랑 바탕 위 글자 — 5.36:1
    segment: "#E9E9E7",          // 구간 선택(전체/수입/지출 등) 바탕 — 선택된 칸은 card색으로 떠 보이게 한다
    tabBar: "#FFFFFF",
    tabIconDefault: "#5F646A",
    tabIconSelected: PRIMARY_LIGHT,
    income: "#15803D",           // 수입 초록 — 5.02:1 (예전 #16A34A는 3.3:1이라 기준 미달이었다)
    expense: "#DC2626",          // 지출 빨강 — 4.83:1
    sunday: "#B4361F",           // 일요일·공휴일 — 6.02:1 (지출 빨강과 겹치지 않게 갈색 기운의 빨강)
    saturday: "#2C5AA0",         // 토요일 — 6.82:1
    separator: "#E7E7E5",
    // 중요 할 일 — 시안 1: 파란 테두리 + 오른쪽 '중요' 글자. 색만으로 구분하지 않도록 글자 꼬리표를 함께 쓴다
    important: PRIMARY_LIGHT,    // 안 한 일 테두리
    importantSoft: "#FFFFFF",    // 안 한 일 바탕 (일반 체크박스와 같은 흰 바탕)
    importantFill: PRIMARY_LIGHT, // 완료 채움
    importantCheck: "#FFFFFF",   // 완료 체크
  },
  dark: {
    background: "#111214",       // 바탕
    card: "#1B1C1F",             // 묶음 목록(카드) 바탕
    cardBorder: "#2A2C30",       // 카드 테두리
    text: "#ECEDEF",             // 본문 — 14.55:1
    subtext: "#A2A7AE",          // 보조 글자 — 7.04:1
    faint: "#5C6168",            // 다른 달 날짜 전용
    icon: "#A2A7AE",             // 아이콘 (하위 호환)
    tint: PRIMARY_DARK,
    tintStrong: "#A9C1F5",       // 연한 파랑 버튼 위 글자 — tintLight 위 7.81:1
    tintLight: "#1F2B45",        // 어두운 파랑 바탕
    onTint: "#111214",           // 밝은 파랑 바탕 위 글자 — 흰 글자는 2.5:1 정도라 어두운 글자(7.43:1)를 쓴다
    segment: "#26282B",
    tabBar: "#1B1C1F",
    tabIconDefault: "#A2A7AE",
    tabIconSelected: PRIMARY_DARK,
    income: "#4ADE80",           // 9.78:1
    expense: "#F87171",          // 6.16:1
    sunday: "#F08A75",           // 6.98:1
    saturday: "#8AB0F0",         // 7.75:1
    separator: "#2A2C30",
    important: PRIMARY_DARK,
    importantSoft: "#1B1C1F",
    importantFill: PRIMARY_DARK,
    importantCheck: "#111214",
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * 카드 공통 그림자 — 시안 1은 그림자 없이 얇은 테두리(cardBorder)로만 구분한다.
 * 여러 화면이 이 값을 펼쳐 쓰고 있어서, 지우는 대신 빈 값으로 두어 한곳에서 그림자를 끈다.
 */
export const cardShadow = {};
