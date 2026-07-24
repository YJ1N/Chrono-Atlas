import { describe, expect, it } from "vitest";

import {
  TIERS,
  type Tier,
  blendedRecipe,
  tierAt,
  tierRecipe,
  tierWeights,
} from "./tiers";
import { MAX_VIEWPORT_SPAN, MIN_VIEWPORT_SPAN } from "@/engine/time/TimePoint";

/** 138억 년 ~ 하루를 로그 등간격으로 훑는 대표 폭들. */
const SPANS: number[] = [];
for (let span = MAX_VIEWPORT_SPAN; span >= MIN_VIEWPORT_SPAN; span /= 2) {
  SPANS.push(span);
}

describe("tierAt — 폭에 따른 지배 티어", () => {
  it("스케일마다 다른 티어를 고른다", () => {
    expect(tierAt(MAX_VIEWPORT_SPAN)).toBe("cosmic");
    expect(tierAt(1e9)).toBe("cosmic");
    expect(tierAt(1e7)).toBe("epochal");
    expect(tierAt(1e4)).toBe("historical");
    expect(tierAt(100)).toBe("detail");
    expect(tierAt(1)).toBe("moment");
  });

  it("폭이 좁아질수록 티어가 사다리를 따라 내려간다", () => {
    const seen: Tier[] = [];
    for (const span of SPANS) {
      const tier = tierAt(span);
      if (seen[seen.length - 1] !== tier) seen.push(tier);
    }
    expect(seen).toEqual([
      "cosmic",
      "epochal",
      "historical",
      "detail",
      "moment",
    ]);
  });

  it("퇴화 입력에 안전하다", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(TIERS).toContain(tierAt(bad));
    }
  });
});

describe("tierWeights — 경계에서 하드 스위치가 없어야 한다", () => {
  const sum = (w: Record<Tier, number>) =>
    TIERS.reduce((acc, t) => acc + w[t], 0);

  it("가중치 합은 항상 1 이다", () => {
    for (const span of SPANS) {
      expect(sum(tierWeights(span))).toBeCloseTo(1, 9);
    }
  });

  it("모든 가중치가 0..1 이다", () => {
    for (const span of SPANS) {
      const w = tierWeights(span);
      for (const tier of TIERS) {
        expect(w[tier]).toBeGreaterThanOrEqual(0);
        expect(w[tier]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("동시에 0 이 아닌 티어는 최대 2개다", () => {
    for (const span of SPANS) {
      const w = tierWeights(span);
      expect(TIERS.filter((t) => w[t] > 0).length).toBeLessThanOrEqual(2);
    }
  });

  it("티어 한가운데서는 단일 티어만 100% 다", () => {
    // historical 은 [1e5, 500] 구간. 로그 중앙은 약 7,071.
    const w = tierWeights(7071);
    expect(w.historical).toBe(1);
  });

  it("경계를 지날 때 가중치가 연속이다", () => {
    // 경계(1e5) 양쪽에서 지배 티어의 가중치 차이가 급변하지 않아야 한다.
    const before = tierWeights(1e5 * 1.001);
    const after = tierWeights(1e5 * 0.999);
    expect(Math.abs(before.epochal - after.epochal)).toBeLessThan(0.1);
    expect(Math.abs(before.historical - after.historical)).toBeLessThan(0.1);
  });

  it("경계 부근에서는 실제로 두 티어가 섞인다", () => {
    const w = tierWeights(1e5 * 0.98);
    expect(w.historical).toBeGreaterThan(0);
    expect(w.epochal).toBeGreaterThan(0);
  });

  it("퇴화 입력에서도 합이 1 이다", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(sum(tierWeights(bad))).toBeCloseTo(1, 9);
    }
  });
});

describe("표현의 변태 — 넓은 쪽과 좁은 쪽이 역전되어야 한다", () => {
  it("지형은 넓을수록 진하고 좁을수록 사라진다", () => {
    expect(tierRecipe("cosmic").terrainOpacity).toBe(1);
    expect(tierRecipe("moment").terrainOpacity).toBe(0);

    let prev = Infinity;
    for (const tier of ["cosmic", "epochal", "historical", "detail", "moment"] as const) {
      const value = tierRecipe(tier).terrainOpacity;
      expect(value).toBeLessThan(prev);
      prev = value;
    }
  });

  it("라벨 수는 좁을수록 늘어난다", () => {
    let prev = -1;
    for (const tier of ["cosmic", "epochal", "historical", "detail"] as const) {
      const value = tierRecipe(tier).maxLabels;
      expect(value).toBeGreaterThan(prev);
      prev = value;
    }
  });

  it("요약문은 좁은 티어에서만 나온다", () => {
    expect(tierRecipe("cosmic").showSummary).toBe(false);
    expect(tierRecipe("historical").showSummary).toBe(false);
    expect(tierRecipe("detail").showSummary).toBe(true);
    expect(tierRecipe("moment").showSummary).toBe(true);
  });
});

describe("blendedRecipe — 전 줌 범위 연속성", () => {
  it("모든 값이 유한하고 범위 안에 있다", () => {
    for (const span of SPANS) {
      const r = blendedRecipe(span);
      expect(r.terrainOpacity).toBeGreaterThanOrEqual(0);
      expect(r.terrainOpacity).toBeLessThanOrEqual(1);
      expect(r.markOpacity).toBeGreaterThanOrEqual(0);
      expect(r.markOpacity).toBeLessThanOrEqual(1);
      expect(r.maxLabels).toBeGreaterThanOrEqual(0);
      expect(r.markRadius).toBeGreaterThan(0);
      expect(Number.isFinite(r.markRadius)).toBe(true);
    }
  });

  it("인접한 폭 사이에서 지형 불투명도가 급변하지 않는다", () => {
    // 5% 씩 줌하며 프레임 간 점프를 확인한다. 0.05 를 넘으면 눈에 보인다.
    let prev: number | null = null;
    for (let span = MAX_VIEWPORT_SPAN; span >= MIN_VIEWPORT_SPAN; span /= 1.05) {
      const value = blendedRecipe(span).terrainOpacity;
      if (prev !== null) expect(Math.abs(value - prev)).toBeLessThan(0.05);
      prev = value;
    }
  });

  it("전체적으로 지형이 사라지는 방향이다", () => {
    expect(blendedRecipe(MAX_VIEWPORT_SPAN).terrainOpacity).toBeGreaterThan(0.8);
    expect(blendedRecipe(1).terrainOpacity).toBeLessThan(0.2);
  });
});
