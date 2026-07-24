import { describe, expect, it } from "vitest";

import {
  MAX_VIEWPORT_SPAN,
  MIN_VIEWPORT_SPAN,
  UNIVERSE_START,
} from "./TimePoint";
import {
  clampSpanAt,
  createTimeScale,
  interpolateViewport,
  panByPixels,
  viewportForRange,
  viewportRange,
  yearsPerPixel,
  zoomAt,
} from "./TimeScale";
import type { Viewport } from "@/engine/types/timeline";

const WIDTH = 1440;

describe("createTimeScale — 기본 매핑", () => {
  const vp: Viewport = { center: 1000, span: 2000 };
  const scale = createTimeScale(vp, WIDTH);

  it("화면 양끝이 뷰포트 구간과 일치한다", () => {
    expect(scale.start).toBe(0);
    expect(scale.end).toBe(2000);
    expect(scale.toPixel(0)).toBeCloseTo(0, 9);
    expect(scale.toPixel(2000)).toBeCloseTo(WIDTH, 9);
  });

  it("중심은 화면 한가운데다", () => {
    expect(scale.toPixel(1000)).toBeCloseTo(WIDTH / 2, 9);
  });

  it("픽셀당 연수를 정확히 보고한다", () => {
    expect(scale.yearsPerPixel).toBeCloseTo(2000 / WIDTH, 12);
    expect(yearsPerPixel(vp, WIDTH)).toBe(scale.yearsPerPixel);
  });

  it("구간 폭을 픽셀로 환산한다", () => {
    expect(scale.spanWidth(500, 1500)).toBeCloseTo(WIDTH / 2, 9);
    expect(scale.spanWidth(42, 42)).toBe(0);
  });
});

describe("전 구간 왕복 변환 — Phase 1 완료 기준", () => {
  /** 138억 년부터 하루까지, 17자릿수에 걸친 대표 뷰포트들. */
  const spans = [
    MAX_VIEWPORT_SPAN, // 140억 년
    1e9,
    1e6,
    1e4,
    1e3,
    100,
    10,
    1,
    MIN_VIEWPORT_SPAN, // 하루
  ];
  const centers = [UNIVERSE_START + 1e9, -1e6, -43, 0, 1969, 2026];

  it("도달 가능한 모든 뷰포트에서 time → pixel → time 이 왕복한다", () => {
    for (const rawSpan of spans) {
      for (const center of centers) {
        // 정밀도 한계를 존중하는 폭만이 실제로 도달 가능한 상태다 (ADR-006).
        const span = clampSpanAt(rawSpan, center, WIDTH);
        const scale = createTimeScale({ center, span }, WIDTH);
        for (const px of [0, 1, WIDTH / 3, WIDTH / 2, WIDTH - 1, WIDTH]) {
          const roundTrip = scale.toPixel(scale.toTime(px));
          expect(Math.abs(roundTrip - px)).toBeLessThan(0.25);
        }
      }
    }
  });

  it("정밀도 하한이 심원한 시간에서만 작동한다", () => {
    // 역사 시대에서는 하루 줌이 그대로 허용된다.
    expect(clampSpanAt(MIN_VIEWPORT_SPAN, 1969, WIDTH)).toBe(MIN_VIEWPORT_SPAN);
    expect(clampSpanAt(MIN_VIEWPORT_SPAN, -10_000, WIDTH)).toBe(MIN_VIEWPORT_SPAN);

    // 128억 년 전에서는 며칠 수준으로 하한이 올라간다. 그 시대 데이터에
    // 일 단위 정밀도가 없으므로 잃는 것이 없다.
    const deep = clampSpanAt(MIN_VIEWPORT_SPAN, UNIVERSE_START, WIDTH);
    expect(deep).toBeGreaterThan(MIN_VIEWPORT_SPAN);
    expect(deep).toBeLessThan(0.1); // 그래도 한 달 미만이다
  });

  it("정밀도 하한에서 양자화가 눈에 띄지 않는다", () => {
    const center = UNIVERSE_START;
    const span = clampSpanAt(MIN_VIEWPORT_SPAN, center, WIDTH);
    const scale = createTimeScale({ center, span }, WIDTH);
    let worst = 0;
    for (let px = 0; px <= WIDTH; px += 1) {
      worst = Math.max(worst, Math.abs(scale.toPixel(scale.toTime(px)) - px));
    }
    expect(worst).toBeLessThan(0.25);
  });

  it("역사 시대에서는 오차가 사실상 0 이다", () => {
    const scale = createTimeScale({ center: 0, span: 4000 }, WIDTH);
    for (let px = 0; px <= WIDTH; px += 37) {
      expect(scale.toPixel(scale.toTime(px))).toBeCloseTo(px, 9);
    }
  });
});

describe("zoomAt — 앵커 고정이 조작감의 전부다", () => {
  const vp: Viewport = { center: 1000, span: 2000 };

  it("커서 아래 시점이 줌 후에도 같은 픽셀에 남는다", () => {
    for (const anchorPx of [0, 100, WIDTH / 2, WIDTH - 1]) {
      for (const factor of [0.5, 0.8, 1.25, 2]) {
        const before = createTimeScale(vp, WIDTH).toTime(anchorPx);
        const next = zoomAt(vp, anchorPx, factor, WIDTH);
        const after = createTimeScale(next, WIDTH).toTime(anchorPx);
        expect(after).toBeCloseTo(before, 6);
      }
    }
  });

  it("확대는 폭을 줄이고 축소는 폭을 늘린다", () => {
    expect(zoomAt(vp, WIDTH / 2, 0.5, WIDTH).span).toBeCloseTo(1000, 9);
    expect(zoomAt(vp, WIDTH / 2, 2, WIDTH).span).toBeCloseTo(4000, 9);
  });

  it("줌 한계에서 폭이 클램프된다", () => {
    expect(zoomAt(vp, WIDTH / 2, 1e-30, WIDTH).span).toBe(MIN_VIEWPORT_SPAN);
    expect(zoomAt(vp, WIDTH / 2, 1e30, WIDTH).span).toBe(MAX_VIEWPORT_SPAN);
  });

  it("반복 줌인이 수치적으로 안정하다 (ADR-002)", () => {
    // d3-zoom 의 누적 k 가 무너지는 지점을 우리 방식으로 통과하는지 확인한다.
    let current: Viewport = { center: 0, span: MAX_VIEWPORT_SPAN };
    for (let i = 0; i < 200; i += 1) {
      current = zoomAt(current, WIDTH / 3, 0.8, WIDTH);
      expect(Number.isFinite(current.center)).toBe(true);
      expect(Number.isFinite(current.span)).toBe(true);
      expect(current.span).toBeGreaterThan(0);
    }
    // 200회 줌인 후 폭은 해당 중심점의 하한에 정확히 안착한다.
    // (0 이 아니라 앵커가 끌고 간 중심점 기준이라는 점이 ADR-006 의 요점이다.)
    // 하한은 앵커 시점 기준으로 계산되므로 최종 중심과 12자리째에서 갈린다.
    const floorAtCenter = clampSpanAt(0, current.center, WIDTH);
    expect(current.span / floorAtCenter).toBeCloseTo(1, 9);
    expect(current.span).toBeLessThan(0.01); // 며칠 수준까지 내려갔다
  });
});

describe("panByPixels", () => {
  const vp: Viewport = { center: 1000, span: 1440 };

  it("오른쪽으로 끌면 과거로 이동한다", () => {
    expect(panByPixels(vp, 100, WIDTH).center).toBeCloseTo(900, 9);
  });

  it("폭은 변하지 않는다", () => {
    expect(panByPixels(vp, 250, WIDTH).span).toBe(vp.span);
  });

  it("팬 후 되돌리면 원위치다", () => {
    const there = panByPixels(vp, 333, WIDTH);
    expect(panByPixels(there, -333, WIDTH).center).toBeCloseTo(vp.center, 9);
  });
});

describe("viewportForRange", () => {
  it("구간을 여백과 함께 담는다", () => {
    const vp = viewportForRange(1900, 2000, 0.1);
    expect(vp.center).toBe(1950);
    expect(vp.span).toBeCloseTo(120, 9);
    const { start, end } = viewportRange(vp);
    expect(start).toBeLessThan(1900);
    expect(end).toBeGreaterThan(2000);
  });

  it("점 사건도 유효한 뷰포트를 만든다", () => {
    const vp = viewportForRange(1969, 1969);
    expect(vp.span).toBeGreaterThan(0);
    expect(Number.isFinite(vp.span)).toBe(true);
  });
});

describe("interpolateViewport", () => {
  const a: Viewport = { center: 0, span: 1e9 };
  const b: Viewport = { center: 2000, span: 100 };

  it("양 끝점을 정확히 재현한다", () => {
    expect(interpolateViewport(a, b, 0).span).toBeCloseTo(a.span, 3);
    expect(interpolateViewport(a, b, 1).span).toBeCloseTo(b.span, 9);
  });

  it("폭을 로그 보간한다 — 중간점은 기하평균이다", () => {
    const mid = interpolateViewport(a, b, 0.5);
    expect(mid.span).toBeCloseTo(Math.sqrt(a.span * b.span), 3);
    // 선형 보간이었다면 5e8 이 되어 줌이 뚝 끊겨 보인다.
    expect(mid.span).toBeLessThan(1e8);
  });

  it("단조 감소한다", () => {
    let prev = Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const s = interpolateViewport(a, b, t).span;
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });
});
