"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { createHorizonScale, viewportBand } from "@/engine/time/projection";
import type { ViewportController } from "@/engine/viewport/ViewportController";
import type { Landmark } from "@/engine/types/timeline";

/**
 * 수평선 — 항상 보이는 시간의 해안선.
 *
 * ── 두 가지 문제를 동시에 푼다
 *
 * ① 주변시가 없어 움직일 이유가 없었다.
 *    이전 UI 는 화면 밖에 무엇이 있는지 알려주지 않았다. 탐험은 당김이 있어야
 *    일어난다. 이 띠는 138억 년 전체를 한눈에 보여주고 현재 위치를 표시한다.
 *
 * ② 138억 년의 경외를 빈 화면으로 표현했다.
 *    본문은 선형이라 "전체 보기" 에서 인류사가 1픽셀로 붕괴한다. 이 띠는
 *    로그 투영을 써서 최근 12,000년에 화면의 40% 를 준다.
 *
 * ── 왜 본문이 아니라 여기에만 로그를 쓰는가
 * 로그 축 위에서는 두 사건의 간격을 눈으로 비교할 수 없다. 측정이 거짓말이
 * 된다. 본문은 재는 곳이고 수평선은 어디쯤인지 아는 곳이다 — 역할이 다르다.
 */
export function Horizon({
  controller,
  landmarks,
  oldest,
  newest,
}: {
  controller: ViewportController;
  landmarks: Landmark[];
  oldest: number;
  newest: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const scale = useMemo(
    () => createHorizonScale(oldest, newest),
    [oldest, newest],
  );

  /**
   * 라벨이 겹치지 않는 랜드마크만 남긴다.
   *
   * 로그 투영이라 오래된 쪽은 촘촘하고 최근 쪽은 성기다. 전부 그리면 왼쪽이
   * 글자 덩어리가 된다. 어느 것을 버릴지는 결정적이어야 팬 중에 깜빡이지 않으므로
   * 정의된 순서대로 훑는다.
   */
  const visibleLandmarks = useMemo(() => {
    /** 라벨 하나가 차지하는 최소 비율. 5% 는 1440px 에서 약 72px 이다. */
    const MIN_GAP = 0.055;
    const kept: {
      landmark: Landmark;
      position: number;
      align: "left" | "right";
    }[] = [];

    for (const landmark of landmarks) {
      const position = scale.toPosition(landmark.time);
      if (kept.some((k) => Math.abs(k.position - position) < MIN_GAP)) continue;
      kept.push({
        landmark,
        position,
        // 오른쪽 끝 라벨은 화면 밖으로 나가므로 안쪽으로 정렬한다.
        align: position > 0.94 ? "right" : "left",
      });
    }
    return kept;
  }, [landmarks, scale]);

  const dimLeftRef = useRef<HTMLDivElement>(null);
  const dimRightRef = useRef<HTMLDivElement>(null);

  /**
   * 뷰포트 띠 위치 갱신 — React 를 거치지 않는다.
   *
   * ── 띠를 칠하지 않고 **바깥을 어둡게** 한다
   * 띠를 반투명하게 칠하면 전체 범위를 볼 때 화면 전체가 같은 색이 되어
   * 아무것도 구별되지 않는다. 바깥을 덮으면 어느 배율에서든 "여기 있다" 가
   * 즉시 읽힌다 — 지도 미니맵이 쓰는 방식이다.
   */
  const syncBand = useCallback(() => {
    const track = trackRef.current;
    const band = bandRef.current;
    const dimLeft = dimLeftRef.current;
    const dimRight = dimRightRef.current;
    if (!track || !band || !dimLeft || !dimRight) return;

    const width = track.clientWidth;
    if (width <= 0) return;
    const { center, span } = controller.getSnapshot();
    const { x, width: w } = viewportBand(scale, center, span, width);

    band.style.transform = `translateX(${x}px)`;
    band.style.width = `${w}px`;
    dimLeft.style.width = `${Math.max(0, x)}px`;
    dimRight.style.transform = `translateX(${x + w}px)`;
    dimRight.style.width = `${Math.max(0, width - x - w)}px`;
  }, [controller, scale]);

  useEffect(() => {
    syncBand();
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        syncBand();
      });
    });
    const onResize = () => syncBand();
    globalThis.addEventListener("resize", onResize);
    return () => {
      unsubscribe();
      globalThis.removeEventListener("resize", onResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller, syncBand]);

  /** 수평선의 한 점을 누르면 그 시대로 날아간다 — Maps 의 미니맵과 같다. */
  const flyToPosition = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const position = (clientX - rect.left) / rect.width;
      controller.animateTo(
        { center: scale.toTime(position), span: controller.getSnapshot().span },
        620,
      );
    },
    [controller, scale],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let dragging = false;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      track.setPointerCapture(event.pointerId);
      flyToPosition(event.clientX);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      // 드래그 중에는 애니메이션 없이 즉시 따라간다.
      const rect = track.getBoundingClientRect();
      const position = (event.clientX - rect.left) / rect.width;
      controller.set({
        center: scale.toTime(position),
        span: controller.getSnapshot().span,
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (track.hasPointerCapture(event.pointerId)) {
        track.releasePointerCapture(event.pointerId);
      }
    };

    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerup", onPointerUp);
    track.addEventListener("pointercancel", onPointerUp);
    return () => {
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", onPointerUp);
      track.removeEventListener("pointercancel", onPointerUp);
    };
  }, [controller, scale, flyToPosition]);

  return (
    <div className="absolute inset-x-0 bottom-0 select-none">
      <div
        ref={trackRef}
        data-testid="horizon"
        role="slider"
        tabIndex={0}
        aria-label="시간 수평선. 클릭하면 그 시대로 이동합니다."
        aria-valuemin={oldest}
        aria-valuemax={newest}
        aria-valuenow={controller.getSnapshot().center}
        className="relative h-[52px] cursor-pointer border-t border-border/60 bg-surface/40 backdrop-blur-sm"
      >
        {/* 랜드마크 — 시간의 해안선. 겹치는 라벨은 버린다. */}
        {visibleLandmarks.map(({ landmark, position, align }) => (
          <div
            key={landmark.id}
            className="pointer-events-none absolute bottom-0 top-0"
            style={{ left: `${position * 100}%` }}
          >
            <div className="absolute bottom-0 top-0 w-px bg-border/70" />
            <span
              className={`absolute top-2.5 whitespace-nowrap text-[10px] tracking-wide text-muted/85 ${
                align === "right" ? "right-1.5 text-right" : "left-1.5"
              }`}
            >
              {landmark.label}
            </span>
          </div>
        ))}

        {/* 뷰포트 바깥을 덮어 "여기 있다" 를 만든다 */}
        <div
          ref={dimLeftRef}
          className="pointer-events-none absolute inset-y-0 left-0 bg-background/70"
        />
        <div
          ref={dimRightRef}
          className="pointer-events-none absolute inset-y-0 left-0 bg-background/70"
        />
        <div
          ref={bandRef}
          data-testid="horizon-band"
          className="pointer-events-none absolute inset-y-0 left-0 border-x-2 border-accent/80"
        />

        <span className="pointer-events-none absolute bottom-1 right-2 text-[9px] uppercase tracking-[0.14em] text-muted/35">
          로그 스케일
        </span>
      </div>
    </div>
  );
}
