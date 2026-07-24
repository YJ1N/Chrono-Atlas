import { describe, expect, it } from "vitest";

import {
  fadeInOpacity,
  significanceToY,
  visibleSignificanceRange,
} from "./significance";
import { MAX_VIEWPORT_SPAN, MIN_VIEWPORT_SPAN } from "./TimePoint";

describe("visibleSignificanceRange — 줌과 결합된 Y축", () => {
  it("좁게 보면 모든 것이 보인다", () => {
    expect(visibleSignificanceRange(1).floor).toBe(0);
    expect(visibleSignificanceRange(100).floor).toBe(0);
    expect(visibleSignificanceRange(MIN_VIEWPORT_SPAN).floor).toBe(0);
  });

  it("넓게 볼수록 하한이 올라간다", () => {
    let prev = -1;
    for (const span of [100, 1e3, 1e4, 1e6, 1e8, 1e9, MAX_VIEWPORT_SPAN]) {
      const { floor } = visibleSignificanceRange(span);
      expect(floor).toBeGreaterThanOrEqual(prev);
      prev = floor;
    }
  });

  it("138억 년에서도 화면이 비지 않는다", () => {
    // 하한이 1.0 이면 아무것도 안 남는다. 랜드마크는 살아야 한다.
    const { floor } = visibleSignificanceRange(MAX_VIEWPORT_SPAN);
    expect(floor).toBeLessThan(0.9);
    expect(floor).toBeGreaterThan(0.5);
  });

  it("상한은 항상 1 이다", () => {
    for (const span of [1, 1e5, 1e10]) {
      expect(visibleSignificanceRange(span).ceiling).toBe(1);
    }
  });

  it("기본 보기(6,000년)에서 시드 대부분이 살아남는다", () => {
    // 시드의 significance 최솟값은 0.42 다.
    expect(visibleSignificanceRange(6000).floor).toBeLessThan(0.42);
  });

  it("퇴화 입력에 안전하다", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const { floor } = visibleSignificanceRange(bad);
      expect(Number.isFinite(floor)).toBe(true);
      expect(floor).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("significanceToY — 중요할수록 위", () => {
  const range = { floor: 0, ceiling: 1 } as const;
  const H = 600;

  it("최상위는 위쪽, 최하위는 아래쪽", () => {
    const top = significanceToY(1, range, H);
    const bottom = significanceToY(0, range, H);
    expect(top).toBeLessThan(bottom);
  });

  it("여백 안에 머문다", () => {
    for (const s of [0, 0.3, 0.5, 1]) {
      const y = significanceToY(s, range, H, 24);
      expect(y).toBeGreaterThanOrEqual(24);
      expect(y).toBeLessThanOrEqual(H - 24);
    }
  });

  it("단조 감소한다", () => {
    let prev = Infinity;
    for (let s = 0; s <= 1; s += 0.1) {
      const y = significanceToY(s, range, H);
      expect(y).toBeLessThan(prev);
      prev = y;
    }
  });

  it("하한 아래는 바닥으로 눌린다 (음수가 되지 않는다)", () => {
    const narrow = { floor: 0.8, ceiling: 1 } as const;
    const y = significanceToY(0.1, narrow, H, 24);
    expect(y).toBeLessThanOrEqual(H - 24);
    expect(y).toBeGreaterThanOrEqual(24);
  });

  it("하한이 올라가면 같은 값이 아래로 내려간다", () => {
    const wide = { floor: 0, ceiling: 1 } as const;
    const narrow = { floor: 0.5, ceiling: 1 } as const;
    expect(significanceToY(0.6, narrow, H)).toBeGreaterThan(
      significanceToY(0.6, wide, H),
    );
  });

  it("퇴화한 범위에 안전하다", () => {
    const degenerate = { floor: 1, ceiling: 1 } as const;
    expect(Number.isFinite(significanceToY(1, degenerate, H))).toBe(true);
  });
});

describe("fadeInOpacity — 하한에서 깜빡이지 않게", () => {
  const range = { floor: 0.5, ceiling: 1 } as const;

  it("하한 이하는 완전 투명", () => {
    expect(fadeInOpacity(0.5, range)).toBe(0);
    expect(fadeInOpacity(0.2, range)).toBe(0);
  });

  it("페이드 구간을 넘으면 완전 불투명", () => {
    expect(fadeInOpacity(0.6, range, 0.06)).toBe(1);
    expect(fadeInOpacity(1, range)).toBe(1);
  });

  it("구간 안에서 단조 증가한다", () => {
    let prev = -1;
    for (let s = 0.5; s <= 0.56; s += 0.01) {
      const o = fadeInOpacity(s, range, 0.06);
      expect(o).toBeGreaterThanOrEqual(prev);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
      prev = o;
    }
  });
});
