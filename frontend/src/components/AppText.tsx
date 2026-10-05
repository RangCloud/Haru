/**
 * 글자 크기 설정이 적용되는 Text · TextInput
 *
 * 설정의 '글자 크기'(작게/보통/크게/아주 크게)를 모든 화면에 적용하기 위한 공용 컴포넌트.
 * 화면 파일에서는 react-native 대신 여기서 Text·TextInput을 가져오기만 하면 되고,
 * 각 스타일의 fontSize·lineHeight에 배율이 자동으로 곱해진다.
 *
 * 왜 이름을 Text 그대로 두었나: 화면마다 import 한 줄만 바꾸면 되어
 * 기존 JSX·스타일을 건드리지 않고 전체 화면에 적용할 수 있다.
 *
 * 주의: fontSize를 지정하지 않은 Text는 건드리지 않는다.
 * 다른 Text 안에 들어 있는 Text는 부모 크기를 물려받는데, 여기에 기본값을 넣으면
 * 물려받은 크기를 덮어써 버리기 때문이다.
 */

import { forwardRef } from "react";
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

import { FONT_SCALES, useSettingsStore } from "@/src/store/settingsStore";

/**
 * 지금 설정된 글자 배율.
 * max를 주면 그 값까지만 커진다 — 달력 칸처럼 공간이 고정된 곳에서 쓴다.
 */
export function useFontScale(max?: number): number {
  const scale = useSettingsStore((s) => FONT_SCALES[s.fontSize]);
  return max !== undefined ? Math.min(scale, max) : scale;
}

/** 스타일에 fontSize가 있을 때만 배율을 곱한 덮어쓰기 스타일을 만든다 */
function scaledStyle(style: StyleProp<TextStyle>, scale: number): TextStyle | null {
  if (scale === 1) return null;
  const flat = StyleSheet.flatten(style);
  if (!flat || typeof flat.fontSize !== "number") return null;
  return {
    fontSize: flat.fontSize * scale,
    // 줄 높이를 그대로 두면 커진 글자가 위아래로 잘린다
    ...(typeof flat.lineHeight === "number" ? { lineHeight: flat.lineHeight * scale } : null),
  };
}

interface AppTextProps extends TextProps {
  /** 이 배율까지만 커지게 제한 (예: 1.15) */
  maxScale?: number;
}

export function Text({ style, maxScale, ...rest }: AppTextProps) {
  const scaled = scaledStyle(style, useFontScale(maxScale));
  return <RNText {...rest} style={scaled ? [style, scaled] : style} />;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  const scaled = scaledStyle(style, useFontScale());
  return <RNTextInput ref={ref} {...rest} style={scaled ? [style, scaled] : style} />;
});
