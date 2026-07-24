/**
 * 가시 중요도 범위 — 줌과 결합된 Y축.
 *
 * ── 왜 세로 팬을 별도 제스처로 두지 않는가
 * Google Maps 에서 확대하면 국가 → 도시 → 카페가 *저절로* 나타난다.
 * 사용자가 "덜 중요한 것도 보여줘" 라는 별도 조작을 하지 않는다.
 *
 * 그래서 중요도 하한을 줌에 결합한다. 넓게 보면 큰 것만, 좁혀 들어가면
 * 사소한 것까지. 이것이 이 제품의 Y축이 범례가 아니라 차원인 이유다.
 *
 * 부수 효과로 `Viewport` 타입이 `{center, span}` 그대로 유지된다 (ADR-002).
 */

import type { TimeDuration } from "@/engine/types/timeline";

/** 이 폭 이하에서는 모든 것을 보여준다. */
const FLOOR_ZERO_SPAN = 100;
/** 이 폭 이상에서는 하한이 최대치에 도달한다. */
const FLOOR_MAX_SPAN = 1e9;
/**
 * 하한의 상한값.
 *
 * 1.0 이 아닌 이유: 138억 년 전체를 봤을 때 화면이 비면 안 된다.
 * 0.85 는 시드 데이터 기준 약 10개의 랜드마크를 남긴다 —
 * 빅뱅 · 지구 · 생명 · 농업 · 인류 · 2차대전 · 달 착륙 급.
 */
const MAX_FLOOR = 0.85;

export interface SignificanceRange {
  /** 이 값 미만은 화면에 존재하지 않는다. */
  floor: number;
  /** 항상 1. 상한은 고정이다. */
  ceiling: 1;
}

/**
 * 현재 뷰포트 폭에서 보이는 중요도 구간.
 *
 * `span` 의 로그에 선형이다 — 줌 한 단계가 어느 스케일에서든 같은 만큼
 * 하한을 움직인다.
 */
export function visibleSignificanceRange(span: TimeDuration): SignificanceRange {
  if (!(span > 0) || !Number.isFinite(span)) return { floor: 0, ceiling: 1 };

  const t =
    (Math.log10(span) - Math.log10(FLOOR_ZERO_SPAN)) /
    (Math.log10(FLOOR_MAX_SPAN) - Math.log10(FLOOR_ZERO_SPAN));

  return { floor: Math.min(1, Math.max(0, t)) * MAX_FLOOR, ceiling: 1 };
}

/**
 * 중요도를 화면 Y 로 변환한다. 중요할수록 위(작은 y).
 *
 * 하한 아래의 값은 0 미만이 아니라 바닥(height)으로 눌린다 —
 * 사라지는 것은 LOD 의 일이고, 이 함수는 좌표만 책임진다.
 */
export function significanceToY(
  significance: number,
  range: SignificanceRange,
  height: number,
  /**
   * 위아래 여백(px). 봉우리가 화면 끝에 붙지 않게 한다.
   * 상단 헤더(약 56px)와 하단 리드아웃을 피할 만큼 넉넉해야 한다.
   */
  padding = 72,
): number {
  const usable = Math.max(1, height - padding * 2);
  const denominator = range.ceiling - range.floor;
  const normalized =
    denominator <= 0 ? 1 : (significance - range.floor) / denominator;
  const clamped = Math.min(1, Math.max(0, normalized));
  return padding + (1 - clamped) * usable;
}

/**
 * 하한 근처에서 서서히 사라지게 하는 불투명도.
 *
 * 하한을 딱 잘라 없애면 줌 중에 마크가 깜빡이며 튀어나온다.
 * 하한 바로 위 구간에서 0→1 로 올라오게 해 등장을 부드럽게 만든다.
 */
export function fadeInOpacity(
  significance: number,
  range: SignificanceRange,
  /** 페이드 구간의 폭(중요도 단위). */
  band = 0.06,
): number {
  if (significance >= range.floor + band) return 1;
  if (significance <= range.floor) return 0;
  return (significance - range.floor) / band;
}
