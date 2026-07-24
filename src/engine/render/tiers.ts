/**
 * 의미 티어 — 줌에 따라 *표현 자체*가 변한다.
 *
 * ── 이것이 재설계의 핵심이다
 * 이전 구현의 치명적 실패는 138억 년에서도 점, 1년에서도 점을 그린 것이었다.
 * Google Maps 는 z3 에서 국가 윤곽을, z18 에서 건물 발자국과 횡단보도를
 * 보여준다 — **같은 것을 크게 그리는 게 아니라 다른 것을 그린다.**
 *
 * 이 모듈은 "지금 폭에서 무엇을 그릴 것인가"만 결정한다. 그리는 일은 하지
 * 않으므로 순수 함수이고 단위 테스트가 된다.
 */

import type { TimeDuration } from "@/engine/types/timeline";

export type Tier = "cosmic" | "epochal" | "historical" | "detail" | "moment";

/**
 * 좁은 폭 → 넓은 폭 순서. 각 티어는 `[minSpan, maxSpan)` 를 담당한다.
 *
 * 양 끝 티어에도 **유한한** 경계를 준다. `Infinity` 를 쓰면 그 티어만
 * 혼합 공식이 달라져 경계에서 불투명도가 튄다 — 실제로 그렇게 만들었다가
 * 테스트에 걸렸다. 센티널은 뷰포트 줌 한계(1/365 ~ 14e9) 바깥이라
 * 도달할 수 없고, 따라서 모든 티어가 같은 공식을 쓴다.
 */
const TIER_LADDER: ReadonlyArray<{
  tier: Tier;
  minSpan: number;
  maxSpan: number;
}> = [
  { tier: "moment", minSpan: 1e-3, maxSpan: 5 },
  { tier: "detail", minSpan: 5, maxSpan: 500 },
  { tier: "historical", minSpan: 500, maxSpan: 1e5 },
  { tier: "epochal", minSpan: 1e5, maxSpan: 1e8 },
  { tier: "cosmic", minSpan: 1e8, maxSpan: 1e11 },
];

export const TIERS: readonly Tier[] = TIER_LADDER.map((t) => t.tier);

/**
 * 경계 부근에서 두 티어가 섞이는 구간의 폭.
 * 티어 내부 로그 위치의 비율이며, 0.15 는 양 끝 15%씩을 전이에 쓴다.
 * 하드 스위치는 눈에 띄는 점프를 만들므로 반드시 섞어야 한다.
 */
const BLEND = 0.15;

/** 각 티어의 불투명도. 합은 항상 1 이다. */
export type TierWeights = Readonly<Record<Tier, number>>;

const ZERO_WEIGHTS: TierWeights = {
  cosmic: 0,
  epochal: 0,
  historical: 0,
  detail: 0,
  moment: 0,
};

function ladderIndex(span: TimeDuration): number {
  for (let i = 0; i < TIER_LADDER.length; i += 1) {
    if (span < TIER_LADDER[i].maxSpan) return i;
  }
  return TIER_LADDER.length - 1;
}

/** 이 폭에서 지배적인 티어. */
export function tierAt(span: TimeDuration): Tier {
  if (!(span > 0) || !Number.isFinite(span)) return "historical";
  return TIER_LADDER[ladderIndex(span)].tier;
}

/**
 * 렌더러가 실제로 쓰는 값 — 티어별 불투명도.
 *
 * 경계 근처에서는 인접한 두 티어가 함께 0 이 아닌 값을 갖는다.
 * 렌더러는 이 값을 레이어 `opacity` 에 그대로 꽂으면 되고,
 * 그러면 티어 전이가 React 재렌더 없이 컴포지터에서 처리된다.
 */
export function tierWeights(span: TimeDuration): TierWeights {
  if (!(span > 0) || !Number.isFinite(span)) {
    return { ...ZERO_WEIGHTS, historical: 1 };
  }

  const index = ladderIndex(span);
  const { tier, minSpan, maxSpan } = TIER_LADDER[index];

  // 티어 내부에서의 로그 위치 (0 = 좁은 쪽 경계, 1 = 넓은 쪽 경계)
  const p = Math.log10(span / minSpan) / Math.log10(maxSpan / minSpan);

  /**
   * 경계에서 정확히 50:50 이 되도록 최대 혼합을 0.5 로 둔다.
   * 그래야 어느 쪽에서 접근하든 같은 값이 나와 연속이다.
   */
  if (p > 1 - BLEND && index + 1 < TIER_LADDER.length) {
    const amount = ((p - (1 - BLEND)) / BLEND) * 0.5;
    return {
      ...ZERO_WEIGHTS,
      [tier]: 1 - amount,
      [TIER_LADDER[index + 1].tier]: amount,
    };
  }
  if (p < BLEND && index > 0) {
    const amount = ((BLEND - p) / BLEND) * 0.5;
    return {
      ...ZERO_WEIGHTS,
      [tier]: 1 - amount,
      [TIER_LADDER[index - 1].tier]: amount,
    };
  }

  return { ...ZERO_WEIGHTS, [tier]: 1 };
}

// ─────────────────────────────────────────────────────────────
// 티어별 렌더 지시 — 컴포넌트가 분기문을 갖지 않게 한다
// ─────────────────────────────────────────────────────────────

export interface TierRecipe {
  /** 지형 실루엣의 불투명도. */
  terrainOpacity: number;
  /** 개별 사건 마크의 불투명도. */
  markOpacity: number;
  /** 라벨을 붙일 최대 개수. 0 이면 라벨 없음. */
  maxLabels: number;
  /** 마크 반경의 기준값(px). */
  markRadius: number;
  /** 요약문 첫 줄을 노출할지. */
  showSummary: boolean;
}

/**
 * 티어별 렌더 파라미터.
 *
 * 넓은 쪽에서는 지형이 주인공이고 사건은 존재하지 않는다.
 * 좁은 쪽에서는 지형이 사라지고 사건이 카드가 된다.
 * 이 역전이 "표현의 변태"다.
 */
const RECIPES: Readonly<Record<Tier, TierRecipe>> = {
  cosmic: {
    terrainOpacity: 1,
    markOpacity: 0.9,
    maxLabels: 6,
    markRadius: 7,
    showSummary: false,
  },
  epochal: {
    terrainOpacity: 0.9,
    markOpacity: 0.95,
    maxLabels: 14,
    markRadius: 6,
    showSummary: false,
  },
  historical: {
    terrainOpacity: 0.55,
    markOpacity: 1,
    maxLabels: 26,
    markRadius: 5,
    showSummary: false,
  },
  detail: {
    terrainOpacity: 0.22,
    markOpacity: 1,
    maxLabels: 40,
    markRadius: 5.5,
    showSummary: true,
  },
  moment: {
    terrainOpacity: 0,
    markOpacity: 1,
    maxLabels: 40,
    markRadius: 6,
    showSummary: true,
  },
};

export function tierRecipe(tier: Tier): TierRecipe {
  return RECIPES[tier];
}

/**
 * 가중치로 섞은 렌더 파라미터.
 *
 * 경계에서 값이 튀지 않도록 각 항목을 가중 평균한다.
 * `maxLabels` 는 반올림해 정수로 만든다.
 */
export function blendedRecipe(span: TimeDuration): TierRecipe {
  const weights = tierWeights(span);
  let terrainOpacity = 0;
  let markOpacity = 0;
  let maxLabels = 0;
  let markRadius = 0;
  let summaryWeight = 0;

  for (const tier of TIERS) {
    const w = weights[tier];
    if (w <= 0) continue;
    const recipe = RECIPES[tier];
    terrainOpacity += recipe.terrainOpacity * w;
    markOpacity += recipe.markOpacity * w;
    maxLabels += recipe.maxLabels * w;
    markRadius += recipe.markRadius * w;
    summaryWeight += (recipe.showSummary ? 1 : 0) * w;
  }

  return {
    terrainOpacity,
    markOpacity,
    maxLabels: Math.round(maxLabels),
    markRadius,
    showSummary: summaryWeight >= 0.5,
  };
}
