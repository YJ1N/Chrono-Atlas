"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  parseAtlasState,
  sameUrlViewport,
  serializeAtlasState,
} from "@/engine/viewport/urlState";
import type { ViewportController } from "@/engine/viewport/ViewportController";
import type { Viewport } from "@/engine/types/timeline";

/**
 * 뷰포트·선택을 URL 과 잇는다.
 *
 * 직렬화 규칙 자체는 `engine/viewport/urlState.ts` 에 있고 여기서는
 * `window.location` 과 이어 붙이기만 한다 — 엔진은 DOM 을 모른다 (ADR-003).
 *
 * ── 왜 pushState 가 아니라 replaceState 인가
 * 뷰포트는 연속적으로 바뀐다. pushState 면 한 번 탐험할 때마다 히스토리에
 * 수십 개가 쌓여 뒤로 가기가 쓸모없어진다. 주소창은 항상 "지금 보이는 것"
 * 을 가리키고, 뒤로 가기는 앱을 떠나는 원래 의미를 유지한다.
 */
export function useAtlasUrl({
  controller,
  viewport,
  selectedId,
  onRestoreSelection,
}: {
  controller: ViewportController;
  /** 확정된 뷰포트. 매 프레임이 아니라 LOD 재계산 시점의 값이어야 한다. */
  viewport: Viewport | null;
  selectedId: string | null;
  onRestoreSelection: (id: string) => void;
}): { hadUrlState: boolean } {
  /**
   * 첫 렌더에서 한 번만 읽는다.
   *
   * 이펙트로 읽지 않는 이유: 콜드 오픈을 건너뛸지 여부가 **첫 페인트 전에**
   * 정해져야 한다. 딥링크로 들어왔는데 인트로가 도는 것은 결함이다.
   * 서버 렌더 결과에는 URL 에 의존하는 DOM 이 없으므로 하이드레이션도 안전하다.
   */
  const [initial] = useState(() =>
    typeof window === "undefined"
      ? null
      : parseAtlasState(window.location.search),
  );

  const lastWritten = useRef<Viewport | null>(null);
  const lastWrittenId = useRef<string | null>(null);

  // ── 복원 ────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!initial) return;
    if (initial.viewport) {
      controller.set(initial.viewport);
      lastWritten.current = controller.getSnapshot();
    }
    if (initial.selectedId) onRestoreSelection(initial.selectedId);
    // 마운트 시 한 번만. 이후 URL 변화는 우리가 쓴 것이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 기록 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewport) return;
    if (
      sameUrlViewport(lastWritten.current, viewport) &&
      lastWrittenId.current === selectedId
    ) {
      return;
    }
    lastWritten.current = viewport;
    lastWrittenId.current = selectedId;

    const query = serializeAtlasState({
      viewport,
      ...(selectedId ? { selectedId } : {}),
    });
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", url);
  }, [viewport, selectedId]);

  return { hadUrlState: initial !== null };
}
