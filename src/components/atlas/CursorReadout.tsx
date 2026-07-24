"use client";

import { useEffect, useRef } from "react";

import { formatTimePoint } from "@/engine/time/TimePoint";
import { createTimeScale } from "@/engine/time/TimeScale";
import type { ViewportController } from "@/engine/viewport/ViewportController";

/**
 * 커서 아래의 시점을 초대형으로 표시한다.
 *
 * ── 타이포그래피 위계를 만드는 장치
 * 이전 UI 는 전부 11px 이라 대시보드처럼 읽혔다. 화면에 압도적으로 큰 요소를
 * 하나 두면 나머지가 자동으로 배경이 된다 — Apple 이 늘 쓰는 수법이다.
 *
 * 반투명하게 깔려 있어 정보를 가리지 않고, 커서를 따라 값만 바뀐다.
 * React 를 거치지 않고 `textContent` 만 갱신한다.
 */
export function CursorReadout({
  controller,
  target,
}: {
  controller: ViewportController;
  /** 포인터 위치를 읽어올 요소. */
  target: HTMLElement | null;
}) {
  const primaryRef = useRef<HTMLDivElement>(null);
  const secondaryRef = useRef<HTMLDivElement>(null);
  /** 커서가 없으면 화면 중앙을 읽는다. */
  const cursorXRef = useRef<number | null>(null);

  useEffect(() => {
    const primary = primaryRef.current;
    const secondary = secondaryRef.current;
    if (!primary || !secondary) return;

    const render = () => {
      const width = controller.pixelWidth;
      if (width <= 1) return;
      const viewport = controller.getSnapshot();
      const scale = createTimeScale(viewport, width);
      const x = cursorXRef.current ?? width / 2;
      const time = scale.toTime(x);

      primary.textContent = formatTimePoint(time);

      const yearsAgo = 2026 - time;
      secondary.textContent =
        yearsAgo < 1
          ? "지금"
          : yearsAgo < 1e4
            ? `${Math.round(yearsAgo).toLocaleString("en-US")}년 전`
            : `${formatDurationShort(yearsAgo)} 전`;
    };

    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        render();
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!target) return;
      cursorXRef.current = event.clientX - target.getBoundingClientRect().left;
      schedule();
    };
    const onPointerLeave = () => {
      cursorXRef.current = null;
      schedule();
    };

    render();
    const unsubscribe = controller.subscribe(schedule);
    target?.addEventListener("pointermove", onPointerMove);
    target?.addEventListener("pointerleave", onPointerLeave);

    return () => {
      unsubscribe();
      target?.removeEventListener("pointermove", onPointerMove);
      target?.removeEventListener("pointerleave", onPointerLeave);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller, target]);

  return (
    <div className="pointer-events-none absolute bottom-[7%] left-1/2 -translate-x-1/2 select-none text-center">
      <div
        ref={primaryRef}
        className="tabular text-[64px] font-semibold leading-none tracking-tight text-foreground/25"
      />
      <div
        ref={secondaryRef}
        className="tabular mt-2 text-[13px] tracking-wide text-foreground/35"
      />
    </div>
  );
}

/** 한국어 수 단위: 억 = 1e8, 만 = 1e4. (137.87억 년 = 138억 년) */
function formatDurationShort(years: number): string {
  if (years >= 1e8) {
    const eok = years / 1e8;
    return `${eok >= 100 ? Math.round(eok) : eok.toFixed(1)}억 년`;
  }
  if (years >= 1e4) {
    return `${Math.round(years / 1e4).toLocaleString("en-US")}만 년`;
  }
  return `${Math.round(years).toLocaleString("en-US")}년`;
}
