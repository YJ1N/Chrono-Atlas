import { describe, expect, it } from "vitest";

import { createScorer, percentile } from "./score";

describe("percentile", () => {
  it("경계와 중앙", () => {
    const s = [0, 1, 2, 3, 4];
    expect(percentile(s, 0)).toBe(0);
    expect(percentile(s, 1)).toBe(4);
    expect(percentile(s, 0.5)).toBe(2);
  });

  it("보간한다", () => {
    expect(percentile([0, 10], 0.5)).toBe(5);
  });

  it("빈 배열과 한 원소", () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([7], 0.9)).toBe(7);
  });
});

describe("createScorer", () => {
  /** 꼬리가 두꺼운 실제 분포를 흉내낸다. */
  const realistic = [
    ...Array.from({ length: 400 }, (_, i) => 3 + (i % 12)),
    ...Array.from({ length: 120 }, (_, i) => 20 + (i % 40)),
    ...Array.from({ length: 20 }, (_, i) => 90 + i * 3),
    260,
    301,
  ];

  it("0..1 을 벗어나지 않는다", () => {
    const score = createScorer(realistic);
    for (const s of [0, 1, 5, 50, 300, 100_000]) {
      const v = score(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("단조 증가한다", () => {
    const score = createScorer(realistic);
    const samples = [0, 1, 3, 10, 30, 90, 200, 400];
    for (let i = 1; i < samples.length; i += 1) {
      expect(score(samples[i])).toBeGreaterThanOrEqual(score(samples[i - 1]));
    }
  });

  /**
   * 이 테스트가 이 파일의 존재 이유다.
   *
   * 최댓값 정규화를 쓰면 대다수 항목이 좁은 띠에 뭉쳐 지형이 평평해진다.
   * Y축이 significance 이므로(ADR-013) 그것은 곧 제품이 사라지는 것이다.
   */
  it("분포가 좁은 띠로 뭉치지 않는다", () => {
    const score = createScorer(realistic);
    const scores = realistic.map(score);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeGreaterThan(0.8);

    // 중간 대역(0.2~0.8)에 실질적인 양이 있어야 능선이 생긴다.
    const middle = scores.filter((v) => v > 0.2 && v < 0.8).length;
    expect(middle / scores.length).toBeGreaterThan(0.25);
  });

  it("이상치 하나가 전체를 압축하지 못한다", () => {
    const withoutOutlier = createScorer(realistic);
    const withOutlier = createScorer([...realistic, 50_000]);
    // 중간값의 점수가 이상치 때문에 크게 흔들리면 안 된다.
    expect(Math.abs(withOutlier(30) - withoutOutlier(30))).toBeLessThan(0.1);
  });

  it("전부 같은 값이면 중간값으로 떨어진다", () => {
    const score = createScorer([10, 10, 10, 10]);
    expect(score(10)).toBe(0.5);
    expect(score(999)).toBe(0.5);
  });

  it("빈 입력에도 터지지 않는다", () => {
    const score = createScorer([]);
    expect(Number.isFinite(score(5))).toBe(true);
  });

  it("정규화 기준을 숨기지 않고 드러낸다", () => {
    const score = createScorer(realistic);
    expect(score.anchors.hi).toBeGreaterThan(score.anchors.lo);
  });
});
