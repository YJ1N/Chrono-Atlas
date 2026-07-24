"use client";

import { useSyncExternalStore } from "react";

import type { ViewportController } from "./ViewportController";
import type { Viewport } from "@/engine/types/timeline";

/**
 * 뷰포트를 React 상태처럼 읽는다.
 *
 * ── 신중하게 쓸 것
 * 이 훅을 쓰는 컴포넌트는 뷰포트가 바뀔 때마다 **매 프레임 다시 렌더된다.**
 * 시간축 눈금처럼 실제로 내용이 바뀌는 곳에만 쓰고,
 * 마크 위치처럼 좌표만 바뀌는 것은 DOM transform 을 직접 갱신한다.
 *
 * `getSnapshot` 이 값 불변 시 같은 참조를 돌려주는 것에 의존한다
 * (`ViewportController.commit` 참조). 그 계약이 깨지면 무한 렌더가 된다.
 */
export function useViewport(controller: ViewportController): Viewport {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    // 서버 렌더 시에도 같은 초기값을 쓴다 — 하이드레이션 불일치 방지.
    controller.getSnapshot,
  );
}
