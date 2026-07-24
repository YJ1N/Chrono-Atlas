/**
 * TimeScale — TimePoint ↔ 픽셀 양방향 매핑.
 *
 * d3-scale 을 쓰지 않는 이유: 이 매핑은 선형 변환 두 줄이고,
 * 우리에게 필요한 것은 스케일 객체가 아니라 뷰포트 대수(zoom/pan)다.
 * 의존성을 늘리는 대신 30줄을 직접 소유한다.
 */

import { clampSpan, clampTimePoint } from "./TimePoint";
import type { TimeDuration, TimePoint, Viewport } from "@/engine/types/timeline";

export interface TimeScale {
  readonly viewport: Viewport;
  readonly width: number;
  /** 화면 왼쪽 끝의 시점. */
  readonly start: TimePoint;
  /** 화면 오른쪽 끝의 시점. */
  readonly end: TimePoint;
  /** 픽셀당 연수. LOD 임계값 계산의 기본 단위. */
  readonly yearsPerPixel: number;

  toPixel(t: TimePoint): number;
  toTime(px: number): TimePoint;
  /** 구간의 픽셀 폭. 점 사건은 0. */
  spanWidth(from: TimePoint, to: TimePoint): number;
}

/**
 * 한 픽셀의 오차도 허용하지 않을 양자화 허용치(px).
 * `minResolvableSpan` 이 이 값을 지키도록 줌 한계를 동적으로 정한다.
 */
const QUANTIZATION_TOLERANCE_PX = 0.25;

/**
 * 이 중심점에서 float64 가 매끄럽게 표현할 수 있는 최소 뷰포트 폭.
 *
 * ── 문제 (ADR-006)
 * `t - start` 는 큰 수끼리의 뺄셈이라 상쇄 오차가 생긴다.
 * 절대 해상도는 `|center| * EPSILON` 이며, 128억 년 지점에서 약 2.8e-6년(≈90초)이다.
 * 그 지점에서 하루 폭까지 확대하면 마크가 약 1.5px 단위로 튄다.
 *
 * ── 해법
 * 정밀도 한계를 감추는 대신 **줌 한계로 승격**한다.
 * 128억 년 전에서 최소 폭은 약 6일이 되는데, 그 시대에 일 단위 정밀도를 가진
 * 데이터는 존재하지 않으므로 잃는 것이 없다.
 * 역사 시대(|center| < 1e5)에서는 이 하한이 MIN_VIEWPORT_SPAN 아래라 무영향이다.
 */
export function minResolvableSpan(center: TimePoint, width: number): TimeDuration {
  return (
    (Math.abs(center) * Number.EPSILON * width) / QUANTIZATION_TOLERANCE_PX
  );
}

/** 전역 줌 한계와 정밀도 한계를 함께 적용한다. */
export function clampSpanAt(
  span: TimeDuration,
  center: TimePoint,
  width: number,
): TimeDuration {
  return Math.max(clampSpan(span), minResolvableSpan(center, width));
}

export function createTimeScale(viewport: Viewport, width: number): TimeScale {
  const span = viewport.span;
  const start = viewport.center - span / 2;
  const end = viewport.center + span / 2;
  const yearsPerPixel = span / width;

  return {
    viewport,
    width,
    start,
    end,
    yearsPerPixel,
    toPixel: (t) => ((t - start) / span) * width,
    toTime: (px) => start + (px / width) * span,
    spanWidth: (from, to) => ((to - from) / span) * width,
  };
}

// ─────────────────────────────────────────────────────────────
// 뷰포트 대수 — 순수 함수. 상태는 Phase 2 의 ViewportController 가 소유한다.
// ─────────────────────────────────────────────────────────────

/**
 * 커서 위치를 고정점으로 하는 줌.
 *
 * `factor < 1` 이면 확대(span 축소), `> 1` 이면 축소.
 * 커서 아래의 시점이 줌 전후로 같은 픽셀에 남는 것이 핵심 조건이며,
 * 이것이 Google Maps 급 조작감의 전부다.
 */
export function zoomAt(
  viewport: Viewport,
  anchorPx: number,
  factor: number,
  width: number,
): Viewport {
  const scale = createTimeScale(viewport, width);
  const anchorTime = scale.toTime(anchorPx);

  // 앵커가 화면에서 차지하는 비율(0..1)을 보존한다.
  const anchorRatio = anchorPx / width;
  const nextSpan = clampSpanAt(viewport.span * factor, anchorTime, width);
  const nextStart = anchorTime - anchorRatio * nextSpan;

  return {
    center: clampTimePoint(nextStart + nextSpan / 2),
    span: nextSpan,
  };
}

/** 픽셀 단위 팬. 오른쪽으로 끌면 과거로 이동하므로 부호가 반전된다. */
export function panByPixels(
  viewport: Viewport,
  deltaPx: number,
  width: number,
): Viewport {
  const yearsPerPixel = viewport.span / width;
  return {
    center: clampTimePoint(viewport.center - deltaPx * yearsPerPixel),
    span: viewport.span,
  };
}

/** 지정 구간이 화면에 들어오도록 하는 뷰포트. `padding` 은 비율(0.1 = 10%). */
export function viewportForRange(
  from: TimePoint,
  to: TimePoint,
  padding = 0.1,
): Viewport {
  const raw = Math.max(to - from, 0);
  const span = clampSpan(raw * (1 + padding * 2) || 1);
  return { center: (from + to) / 2, span };
}

/** 두 뷰포트 사이의 보간. 폭은 로그 보간해야 줌이 등속으로 느껴진다. */
export function interpolateViewport(
  a: Viewport,
  b: Viewport,
  t: number,
): Viewport {
  return {
    center: a.center + (b.center - a.center) * t,
    // 선형 보간하면 줌 아웃이 처음에만 빠르고 끝에서 멈춘 것처럼 보인다.
    span: Math.exp(Math.log(a.span) + (Math.log(b.span) - Math.log(a.span)) * t),
  };
}

/** 뷰포트가 담는 구간. */
export function viewportRange(viewport: Viewport): {
  start: TimePoint;
  end: TimePoint;
} {
  return {
    start: viewport.center - viewport.span / 2,
    end: viewport.center + viewport.span / 2,
  };
}

/** 픽셀당 연수 — LOD 가 "얼마나 촘촘한가"를 판단하는 단위. */
export function yearsPerPixel(
  viewport: Viewport,
  width: number,
): TimeDuration {
  return viewport.span / width;
}
