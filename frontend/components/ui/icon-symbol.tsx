// Fallback for using MaterialIcons on Android and web.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  // 기본
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  // 탭 아이콘
  "cloud.sun.fill": "wb-cloudy",
  "wonsign.circle.fill": "account-balance-wallet",
  "calendar": "event",
  "ellipsis.circle.fill": "more-horiz",
  // 운세·뉴스·친구 탭 — Android에서 매핑이 없으면 아이콘이 표시되지 않는다
  "sparkles": "auto-awesome",
  "newspaper.fill": "newspaper",
  "person.2.fill": "people",
  // 할 일 중요 표시·뉴스 새로고침
  "star.fill": "star",
  "arrow.clockwise": "refresh",
  // 테마 토글
  "moon.fill": "bedtime",
  "sun.max.fill": "wb-sunny",
  "gearshape.fill": "settings",
  // 리디자인 선 아이콘 — 실제 Android 표시는 아래 OUTLINE_MAPPING이 맡고, 여기 값은 만일을 위한 대체용
  house: "home",
  creditcard: "credit-card",
  moon: "bedtime",
  newspaper: "article",
  "slider.horizontal.3": "tune",
} as IconMapping;

/**
 * 테두리(선)형 아이콘 — 2026-11 리디자인(시안 1)의 하단 탭·헤더 버튼용.
 * MaterialIcons에는 집·카드·달 같은 테두리형 아이콘이 거의 없어, 같은 @expo/vector-icons 묶음에 들어 있는
 * MaterialCommunityIcons에서 가져온다(새 라이브러리 추가 아님). iOS는 SF Symbols 이름 그대로 선 아이콘이 나온다.
 */
const OUTLINE_MAPPING: Partial<
  Record<SymbolViewProps['name'], ComponentProps<typeof MaterialCommunityIcons>['name']>
> = {
  house: 'home-outline',
  calendar: 'calendar-blank-outline',
  creditcard: 'credit-card-outline',
  moon: 'moon-waning-crescent',
  newspaper: 'newspaper-variant-outline',
  'slider.horizontal.3': 'tune-variant',
};

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const outline = OUTLINE_MAPPING[name];
  if (outline) {
    return <MaterialCommunityIcons color={color} size={size} name={outline} style={style} />;
  }
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
