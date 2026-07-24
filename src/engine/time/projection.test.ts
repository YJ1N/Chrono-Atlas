import { describe, expect, it } from "vitest";

import { PRESENT_EPOCH, UNIVERSE_START } from "./TimePoint";
import { createHorizonScale, viewportBand } from "./projection";

const scale = createHorizonScale();

describe("createHorizonScale — 양 끝 고정", () => {
  it("가장 오래된 끝이 0, 현재가 1 이다", () => {
    expect(scale.toPosition(UNIVERSE_START)).toBeCloseTo(0, 9);
    expect(scale.toPosition(PRESENT_EPOCH)).toBeCloseTo(1, 9);
  });

  it("범위 밖을 클램프한다", () => {
    expect(scale.toPosition(UNIVERSE_START - 1e9)).toBe(0);
    expect(scale.toPosition(PRESENT_EPOCH + 1e6)).toBe(1);
  });

  it("시간 순서를 보존한다 (단조 증가)", () => {
    const times = [UNIVERSE_START, -1e9, -1e6, -1e4, -3000, 0, 1500, 2026];
    let prev = -1;
    for (const t of times) {
      const p = scale.toPosition(t);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });
});

describe("왜곡의 목적 — 인류사가 보이는 크기가 되어야 한다", () => {
  it("선형이라면 인류 문명은 사실상 0 이다", () => {
    // 이것이 로그 투영이 필요한 이유의 정량적 근거다.
    const linearShare = (PRESENT_EPOCH - -10_000) / (PRESENT_EPOCH - UNIVERSE_START);
    expect(linearShare).toBeLessThan(1e-6);
    expect(linearShare * 1440).toBeLessThan(0.01); // 1440px 화면에서 0.01px 미만
  });

  it("로그 투영에서는 최근 12,000년이 30% 이상을 차지한다", () => {
    const share = 1 - scale.toPosition(-10_000);
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.6);
  });

  it("각 자릿수가 비슷한 몫을 갖는다", () => {
    // 로그 투영의 핵심 성질: 10배 차이가 일정한 거리로 나타난다.
    const decades = [1e9, 1e8, 1e7, 1e6, 1e5, 1e4, 1e3];
    const shares: number[] = [];
    for (let i = 1; i < decades.length; i += 1) {
      shares.push(
        scale.toPosition(PRESENT_EPOCH - decades[i]) -
          scale.toPosition(PRESENT_EPOCH - decades[i - 1]),
      );
    }
    for (const s of shares) {
      expect(s).toBeGreaterThan(0.05);
      expect(s).toBeLessThan(0.15);
    }
  });
});

describe("왕복 변환", () => {
  it("전 구간에서 position → time → position 이 왕복한다", () => {
    for (let p = 0; p <= 1; p += 0.02) {
      expect(scale.toPosition(scale.toTime(p))).toBeCloseTo(p, 6);
    }
  });

  it("대표 시점들이 왕복한다", () => {
    for (const t of [UNIVERSE_START, -4.54e9, -6.6e7, -10_000, 0, 1969, 2026]) {
      expect(scale.toTime(scale.toPosition(t))).toBeCloseTo(t, 0);
    }
  });

  it("범위 밖 위치를 클램프한다", () => {
    expect(scale.toTime(-1)).toBeCloseTo(UNIVERSE_START, 0);
    expect(scale.toTime(2)).toBeCloseTo(PRESENT_EPOCH, 6);
  });
});

describe("임의 구간", () => {
  it("우주가 아닌 범위에도 쓸 수 있다 (도메인 무관)", () => {
    const ai = createHorizonScale(1950, 2026);
    expect(ai.toPosition(1950)).toBeCloseTo(0, 9);
    expect(ai.toPosition(2026)).toBeCloseTo(1, 9);
    expect(ai.toPosition(2020)).toBeGreaterThan(ai.toPosition(2000));
  });

  it("퇴화한 구간에 안전하다", () => {
    const degenerate = createHorizonScale(100, 100);
    expect(Number.isFinite(degenerate.toPosition(100))).toBe(true);
    expect(Number.isFinite(degenerate.toTime(0.5))).toBe(true);
  });
});

describe("viewportBand — '지금 여기' 표시", () => {
  const W = 1000;

  it("전체 범위면 띠가 전체를 덮는다", () => {
    const band = viewportBand(
      scale,
      (UNIVERSE_START + PRESENT_EPOCH) / 2,
      PRESENT_EPOCH - UNIVERSE_START,
      W,
    );
    expect(band.x).toBeCloseTo(0, 3);
    expect(band.width).toBeCloseTo(W, 0);
  });

  it("아주 좁게 확대해도 최소 폭이 보장된다", () => {
    // 폭이 0px 이 되면 어디 있는지 알 수 없다 — 이 띠의 존재 이유가 사라진다.
    const band = viewportBand(scale, 1969, 1 / 365, W, 3);
    expect(band.width).toBeGreaterThanOrEqual(3);
  });

  it("띠가 항상 화면 안에 있다", () => {
    for (const center of [UNIVERSE_START + 1e8, -1e6, 0, 2026]) {
      for (const span of [1e10, 1e6, 1e3, 1]) {
        const band = viewportBand(scale, center, span, W);
        expect(band.x).toBeGreaterThanOrEqual(0);
        expect(band.x + band.width).toBeLessThanOrEqual(W + 1e-6);
      }
    }
  });

  it("현재로 갈수록 띠가 오른쪽으로 간다", () => {
    const past = viewportBand(scale, -1e9, 1e6, W);
    const recent = viewportBand(scale, 1900, 1e6, W);
    expect(recent.x).toBeGreaterThan(past.x);
  });

  it("확대할수록 띠가 좁아진다", () => {
    const wide = viewportBand(scale, 0, 1e8, W);
    const narrow = viewportBand(scale, 0, 1e3, W);
    expect(narrow.width).toBeLessThan(wide.width);
  });
});
