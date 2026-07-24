/**
 * sitelink 수 → significance (ADR-009).
 *
 * 이 값은 LOD 의 입력이자 **화면상의 세로 위치 그 자체**다 (ADR-013).
 * 분포가 뭉치면 지형이 평평해지고, 지형이 평평하면 제품이 사라진다.
 */

/**
 * 왜 최댓값이 아니라 백분위로 정규화하는가.
 *
 * 최댓값으로 나누면 유별난 항목 하나(제2차 세계대전 같은)가 기준을 끌어올려
 * 나머지 전부를 좁은 띠 안으로 밀어 넣는다. 지형이 평평해지는 가장 흔한 원인이다.
 * 상·하위 꼬리를 잘라 기준을 잡고, 꼬리는 clamp 로 흡수한다.
 */
const LOWER_PERCENTILE = 0.02;
const UPPER_PERCENTILE = 0.98;

/**
 * 전부 같은 값일 때 돌려줄 값. 0 이면 아무것도 안 보이고 1 이면 전부 봉우리다.
 * 중간이 유일하게 정직하다.
 */
const DEGENERATE_FALLBACK = 0.5;

/** 정렬된 배열에서의 백분위(선형 보간). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export interface Scorer {
  (sitelinks: number): number;
  /** 정규화 기준 — 리포트가 그대로 출력한다. 숨은 상수를 만들지 않는다. */
  readonly anchors: { lo: number; hi: number };
}

/**
 * 수집된 전체 집합으로부터 점수 함수를 만든다.
 *
 * **카테고리별로 따로 정규화하지 않는다.** 그러면 항목이 빈약한 카테고리에서
 * 가짜 봉우리가 솟는다 — 지질시대 하나가 제2차 세계대전과 같은 높이가 된다.
 * 전역 정규화만이 서로 다른 카테고리를 같은 자로 잰다.
 */
export function createScorer(allSitelinks: readonly number[]): Scorer {
  const sorted = [...allSitelinks].sort((a, b) => a - b);
  const loRaw = percentile(sorted, LOWER_PERCENTILE);
  const hiRaw = percentile(sorted, UPPER_PERCENTILE);

  const lo = Math.log1p(loRaw);
  const hi = Math.log1p(hiRaw);
  const range = hi - lo;

  const score = (sitelinks: number): number => {
    if (range <= 0) return DEGENERATE_FALLBACK;
    const v = (Math.log1p(Math.max(0, sitelinks)) - lo) / range;
    return Math.min(1, Math.max(0, v));
  };

  return Object.assign(score, { anchors: { lo: loRaw, hi: hiRaw } });
}
