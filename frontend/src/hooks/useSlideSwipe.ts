/**
 * 밀어서 넘기기 + 미끄러지는 전환
 *
 * 달력(이전·다음 달)과 뉴스(이전·다음 카테고리)에서 함께 쓴다.
 * 예전에는 손을 떼는 순간 내용만 툭 바뀌어 "넘어갔다"는 느낌이 없었다. 이제는
 *   1) 미는 동안 내용이 손가락을 따라 움직이고
 *   2) 손을 떼면 미는 방향으로 화면 밖까지 나간 뒤
 *   3) 새 내용이 반대쪽에서 들어온다.
 * 화살표·칩을 눌러 바꿀 때도 같은 방향으로 들어오는 전환이 나온다.
 *
 * 세로로 스크롤되는 화면 안에서 쓰이므로, 가로 움직임이 보이는 즉시 제스처를 잡고
 * 잡은 동안에는 바깥 스크롤을 잠그도록 알린다(onActiveChange). 세로로 끌면 잡지 않는다.
 *
 * PanResponder(React Native 기본 기능)와 Animated만 쓴다 — 새 라이브러리가 필요 없다.
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, PanResponder, useWindowDimensions, type GestureResponderHandlers } from "react-native";

const SWIPE_START = 8;        // 가로로 이만큼 움직이면 스와이프로 본다 (작을수록 스크롤보다 먼저 잡는다)
const SWIPE_DISTANCE = 40;    // 이만큼 밀어야 넘어간다
const SWIPE_VELOCITY = 0.35;  // 짧게 튕기듯 밀어도 넘어가도록 속도로도 판정한다
const EXIT_MS = 115;          // 지금 내용이 화면 밖으로 나가는 시간
const ENTER_MS = 165;         // 새 내용이 들어오는 시간 (합쳐서 0.28초 — 처음 0.34초에서 조금 줄였다)
const EDGE_RESISTANCE = 0.25; // 더 넘길 곳이 없을 때는 조금만 따라오게 해 "끝"임을 알린다

interface Options {
  /**
   * 지금 보여 주는 쪽의 순번 (달력: 연×12+월, 뉴스: 카테고리 순서).
   * 값이 커지면 다음 쪽으로, 작아지면 이전 쪽으로 넘어간 것으로 보고 들어오는 방향을 정한다.
   */
  pageIndex: number;
  /** 넘기기로 판정됐을 때 — +1 다음, -1 이전. 여기서 실제 내용을 바꾼다 */
  onSwipe: (direction: -1 | 1) => void;
  /** 그 방향으로 넘길 수 있는지 (첫·마지막 쪽이면 false). 생략하면 항상 가능 */
  canSwipe?: (direction: -1 | 1) => boolean;
  /** 가로 스와이프를 잡은 동안 true — 바깥 ScrollView를 잠그는 데 쓴다 */
  onActiveChange?: (active: boolean) => void;
}

interface Result {
  /** 손가락을 받을 영역(움직이지 않는 바깥 틀)에 펼쳐 넣는다 */
  panHandlers: GestureResponderHandlers;
  /** 미끄러질 내용(안쪽 Animated.View)의 style에 넣는다 */
  slideStyle: { transform: { translateX: Animated.Value }[] };
}

export function useSlideSwipe({ pageIndex, onSwipe, canSwipe, onActiveChange }: Options): Result {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;

  // PanResponder는 한 번만 만들고 최신 값은 ref로 읽는다 (다시 만들면 진행 중인 제스처가 끊긴다)
  const latest = useRef({ onSwipe, canSwipe, onActiveChange, width });
  latest.current = { onSwipe, canSwipe, onActiveChange, width };

  const pan = useRef(
    PanResponder.create({
      // Capture: 안쪽 버튼과 바깥 스크롤보다 먼저 판단한다. 가로 이동이 세로보다 클 때만 잡는다.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > SWIPE_START && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => latest.current.onActiveChange?.(true),
      onPanResponderMove: (_, g) => {
        // 왼쪽으로 밀면(dx < 0) 다음 쪽. 넘길 곳이 없으면 저항을 줘서 조금만 움직인다.
        const direction: -1 | 1 = g.dx < 0 ? 1 : -1;
        const allowed = latest.current.canSwipe?.(direction) ?? true;
        x.setValue(allowed ? g.dx : g.dx * EDGE_RESISTANCE);
      },
      onPanResponderRelease: (_, g) => {
        latest.current.onActiveChange?.(false);
        const direction: -1 | 1 = g.dx < 0 ? 1 : -1;
        const far = Math.abs(g.dx) >= SWIPE_DISTANCE;
        const fast = Math.abs(g.vx) >= SWIPE_VELOCITY && Math.abs(g.dx) >= SWIPE_START * 2;
        const allowed = latest.current.canSwipe?.(direction) ?? true;

        if ((far || fast) && allowed) {
          // 미는 방향으로 화면 밖까지 내보낸 다음 내용을 바꾼다. 들어오는 전환은 아래 effect가 맡는다.
          Animated.timing(x, {
            toValue: -direction * latest.current.width,
            duration: EXIT_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start(() => latest.current.onSwipe(direction));
        } else {
          // 덜 밀었거나 넘길 곳이 없으면 제자리로 돌아간다
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
        }
      },
      // 시스템이 제스처를 끊은 경우에도 스크롤 잠금을 풀고 제자리로 돌린다
      onPanResponderTerminate: () => {
        latest.current.onActiveChange?.(false);
        Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
      },
      // 한번 잡은 스와이프는 스크롤에 넘겨주지 않는다 — 넘겨주면 밀던 도중에 화면이 위아래로 움직인다
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // 쪽이 바뀌면(스와이프든 버튼이든) 새 내용을 넘어간 방향의 반대쪽에서 들여보낸다
  const previousIndex = useRef(pageIndex);
  useEffect(() => {
    if (previousIndex.current === pageIndex) return;
    const direction = pageIndex > previousIndex.current ? 1 : -1;
    previousIndex.current = pageIndex;
    x.stopAnimation();
    x.setValue(direction * latest.current.width);
    Animated.timing(x, { toValue: 0, duration: ENTER_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [pageIndex, x]);

  return { panHandlers: pan.panHandlers, slideStyle: { transform: [{ translateX: x }] } };
}
