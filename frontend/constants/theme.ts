/**
 * 하루 앱 디자인 토큰
 *
 * 인디고-바이올렛 계열 팔레트 — 차분하고 세련된 느낌.
 * 모든 화면은 Colors[scheme]에서 토큰을 가져와 사용한다.
 */

import { Platform } from "react-native";

const PRIMARY_LIGHT = "#6B6EE7"; // 인디고-바이올렛
const PRIMARY_DARK = "#9196F3";  // 다크 배경에서 가독성 높은 밝은 인디고

export const Colors = {
  light: {
    background: "#F6F6FB",      // 아주 연한 쿨 화이트
    card: "#FFFFFF",             // 카드 배경
    cardBorder: "#EBEBF5",       // 카드 테두리 (미세한 보라빛)
    text: "#18182E",             // 메인 텍스트 (진한 네이비)
    subtext: "#6D6D8E",          // 보조 텍스트
    icon: "#6D6D8E",             // 아이콘 (하위 호환)
    tint: PRIMARY_LIGHT,
    tintLight: "#EEEEFF",        // 아이템 배경용 연한 틴트
    tabBar: "#FFFFFF",
    tabIconDefault: "#A8A8C8",
    tabIconSelected: PRIMARY_LIGHT,
    income: "#16A34A",           // 수입 초록
    expense: "#DC2626",          // 지출 빨강
    separator: "#EBEBF5",
    // 중요 할 일 체크박스 — 별 색(#F5B400)은 흰 카드 위에서 1.84:1이라 테두리는 더 진한 호박색(3.61:1)을 쓴다
    important: "#B87A00",        // 안 한 일 테두리
    importantSoft: "#FFF5D6",    // 안 한 일 바탕 (일반 체크박스와 면으로도 구분되게)
    importantFill: "#F5B400",    // 완료 채움 — 인디고보다 밝아서 흑백에서도 구분됨
    importantCheck: "#18182E",   // 완료 체크 — 흰 체크는 호박 위에서 1.84:1이라 진한 색(9.44:1)
  },
  dark: {
    background: "#0E0E1A",       // 짙은 다크 네이비
    card: "#1A1A2C",             // 카드 배경
    cardBorder: "#28284A",       // 카드 테두리
    text: "#EDEEFF",             // 메인 텍스트
    subtext: "#8080AA",          // 보조 텍스트
    icon: "#8080AA",             // 아이콘 (하위 호환)
    tint: PRIMARY_DARK,
    tintLight: "#1C1C3A",        // 아이템 배경용 어두운 틴트
    tabBar: "#12121E",
    tabIconDefault: "#50507A",
    tabIconSelected: PRIMARY_DARK,
    income: "#4ADE80",           // 다크 모드용 밝은 초록
    expense: "#F87171",          // 다크 모드용 밝은 빨강
    separator: "#28284A",
    // 중요 할 일 체크박스 — 다크 카드 위에서는 별 색 그대로도 9.29:1이라 충분하다
    important: "#F5B400",
    importantSoft: "#2B2513",
    importantFill: "#F5B400",
    importantCheck: "#1A1A2C",   // 카드색 체크 (9.29:1)
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

/** 카드 공통 shadow 스타일 (iOS + Android) */
export const cardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.07,
  shadowRadius: 6,
  elevation: 2,
};
