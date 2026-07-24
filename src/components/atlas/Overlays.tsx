"use client";

import { useEffect, useRef } from "react";

import { tierWeights } from "@/engine/render/tiers";
import { PRESENT_EPOCH, UNIVERSE_START } from "@/engine/time/TimePoint";
import { createTimeScale } from "@/engine/time/TimeScale";
import type { ViewportController } from "@/engine/viewport/ViewportController";

/**
 * 현재 시점 표시.
 *
 * ── 절벽을 정보로 바꾼다
 * 2026년 이후에는 데이터가 없어 지형이 뚝 끊긴다. 이전에는 그것이 렌더링
 * 결함처럼 보였다. 선 하나와 이름을 주면 같은 그림이 "여기가 지금이고
 * 그 너머는 아직 없다" 로 읽힌다.
 */
export function PresentMarker({
  controller,
  height,
}: {
  controller: ViewportController;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => {
      const w = controller.pixelWidth;
      if (w <= 1) return;
      const scale = createTimeScale(controller.getSnapshot(), w);
      const x = scale.toPixel(PRESENT_EPOCH);
      // 화면 밖이면 숨긴다 — 가장자리에 붙어 있으면 축처럼 보인다.
      el.style.opacity = x < -20 || x > w + 20 ? "0" : "1";
      el.style.transform = `translateX(${x}px)`;
    };

    sync();
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        sync();
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller]);

  return (
    <div
      ref={ref}
      data-testid="present-marker"
      className="pointer-events-none absolute left-0 top-0 transition-opacity duration-300"
      style={{ height }}
    >
      <div className="h-full w-px bg-gradient-to-b from-transparent via-accent/45 to-accent/10" />
      <span className="absolute -left-1 bottom-[13%] -translate-x-full whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-accent/70">
        지금
      </span>
    </div>
  );
}

/**
 * 심원한 시간에서만 나타나는 주석.
 *
 * ── 빈 화면을 경외로 바꾼다
 * 138억 년 전체를 선형으로 보면 인류사는 화면의 0.00004%, 1440px 에서
 * 0.0006px 이다. 이전 구현은 그것을 **빈 화면**으로 표현했다 — 이 제품이
 * 말할 수 있는 가장 놀라운 사실을 실패 상태처럼 보이게 만든 셈이다.
 *
 * 비어 있음 자체를 문장으로 만들면 같은 픽셀이 정보가 된다.
 */
export function ScaleNote({ controller }: { controller: ViewportController }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => {
      const viewport = controller.getSnapshot();
      const weights = tierWeights(viewport.span);
      const strength = weights.cosmic + weights.epochal * 0.4;
      el.style.opacity = String(Math.min(1, Math.max(0, strength)));
    };

    sync();
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        sync();
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller]);

  const humanShare =
    ((PRESENT_EPOCH - -10_000) / (PRESENT_EPOCH - UNIVERSE_START)) * 100;

  return (
    <div
      ref={ref}
      data-testid="scale-note"
      className="pointer-events-none absolute left-1/2 top-[30%] max-w-xs -translate-x-1/2 text-center transition-opacity duration-500"
      style={{ opacity: 0 }}
    >
      <div className="tabular text-[13px] font-medium tracking-wide text-foreground/55">
        문자 이후 인류사 12,000년
      </div>
      <div className="tabular mt-1.5 text-[11px] leading-relaxed text-muted/60">
        우주 전체의 {humanShare.toFixed(5)}%
        <br />이 화면에서 {(humanShare * 14.4).toFixed(3)}픽셀
      </div>
    </div>
  );
}

/**
 * 배경이 시대를 말한다.
 *
 * 뷰포트가 어느 시대에 있느냐에 따라 배경의 색조가 아주 미묘하게 변한다.
 * 의식적으로 읽히지는 않지만, 심원한 시간에서 문명으로 이동할 때
 * "장소가 바뀌었다" 는 감각을 만든다 — Maps 에서 바다에서 육지로 넘어갈 때와 같다.
 */
export function EraBackdrop({ controller }: { controller: ViewportController }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => {
      const { center } = controller.getSnapshot();
      el.style.background = backdropFor(center);
    };

    sync();
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        sync();
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 transition-[background] duration-700"
    />
  );
}

/** 시대별 색조. 우주=보라, 생명=청록, 문명=황금. */
function backdropFor(center: number): string {
  const stops: { at: number; rgb: [number, number, number] }[] = [
    { at: UNIVERSE_START, rgb: [58, 38, 96] },
    { at: -3.7e9, rgb: [26, 62, 74] },
    { at: -5e8, rgb: [24, 66, 58] },
    { at: -1e5, rgb: [66, 54, 30] },
    { at: PRESENT_EPOCH, rgb: [40, 46, 78] },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (center >= stops[i].at && center <= stops[i + 1].at) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  // 자릿수 차이가 크므로 로그 공간에서 섞는다.
  const toLog = (t: number) => Math.log1p(PRESENT_EPOCH - t + 1);
  const span = toLog(lower.at) - toLog(upper.at);
  const t = span === 0 ? 0 : (toLog(lower.at) - toLog(center)) / span;
  const mix = Math.min(1, Math.max(0, t));

  const rgb = lower.rgb.map((v, i) => Math.round(v + (upper.rgb[i] - v) * mix));
  return `radial-gradient(120% 90% at 50% 108%, rgba(${rgb.join(",")},0.34) 0%, rgba(${rgb.join(",")},0.10) 45%, transparent 78%)`;
}
