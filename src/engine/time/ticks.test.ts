import { describe, expect, it } from "vitest";

import {
  MAX_VIEWPORT_SPAN,
  MIN_VIEWPORT_SPAN,
  UNIVERSE_START,
} from "./TimePoint";
import { createTimeScale, viewportRange } from "./TimeScale";
import { formatTickLabel, generateTicks, niceStep } from "./ticks";
import type { Viewport } from "@/engine/types/timeline";

const WIDTH = 1440;

describe("niceStep — 1-2-5 사다리", () => {
  it("사다리 값으로 올림한다", () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23)).toBe(50);
  });

  it("모든 크기 자릿수에서 작동한다", () => {
    expect(niceStep(1.3e9)).toBe(2e9);
    expect(niceStep(0.03)).toBe(0.05);
  });

  it("퇴화 입력에도 안전하다", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
  });
});

describe("전 줌 범위 불변식 — Phase 1 완료 기준", () => {
  /** 138억 년부터 하루까지 로그 등간격으로 훑는다. */
  const viewports: Viewport[] = [];
  for (
    let span = MAX_VIEWPORT_SPAN;
    span >= MIN_VIEWPORT_SPAN;
    span /= 3
  ) {
    for (const center of [UNIVERSE_START / 2, -43, 1969, 2026]) {
      viewports.push({ center, span });
    }
  }

  it("모든 줌 레벨에서 눈금이 생성된다", () => {
    expect(viewports.length).toBeGreaterThan(50);
    for (const vp of viewports) {
      expect(generateTicks(vp, WIDTH).length).toBeGreaterThan(0);
    }
  });

  it("눈금이 항상 뷰포트 안에 있다", () => {
    for (const vp of viewports) {
      const { start, end } = viewportRange(vp);
      for (const tick of generateTicks(vp, WIDTH)) {
        expect(tick.time).toBeGreaterThanOrEqual(start);
        expect(tick.time).toBeLessThanOrEqual(end);
      }
    }
  });

  it("눈금이 시간 오름차순이다", () => {
    for (const vp of viewports) {
      const ticks = generateTicks(vp, WIDTH);
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i].time).toBeGreaterThan(ticks[i - 1].time);
      }
    }
  });

  it("눈금 개수가 상한을 넘지 않는다 (렌더 루프 보호)", () => {
    for (const vp of viewports) {
      expect(generateTicks(vp, WIDTH, { maxTicks: 400 }).length).toBeLessThanOrEqual(400);
    }
  });

  it("라벨이 비어있지 않다", () => {
    for (const vp of viewports) {
      for (const tick of generateTicks(vp, WIDTH)) {
        expect(tick.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("같은 화면 안에서 라벨이 중복되지 않는다", () => {
    // 중복은 소수 자릿수가 스텝에 못 미친다는 뜻이다.
    for (const vp of viewports) {
      const labels = generateTicks(vp, WIDTH)
        .filter((t) => t.level === "major")
        .map((t) => t.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("눈금 간격이 목표 간격과 같은 자릿수다", () => {
    /**
     * 하루가 눈금의 최소 단위이므로, 뷰포트가 한 달보다 좁아지면
     * 간격을 더 줄일 방법이 없다. (시(hour) 눈금은 MVP 범위 밖 —
     * 어떤 데이터셋도 시 단위 정밀도를 갖지 않는다.)
     */
    const CALENDAR_FLOOR_YEARS = 30 / 365;

    for (const vp of viewports) {
      const ticks = generateTicks(vp, WIDTH, { targetSpacingPx: 130 });
      if (ticks.length < 3) continue;
      const scale = createTimeScale(vp, WIDTH);
      const gap = scale.toPixel(ticks[1].time) - scale.toPixel(ticks[0].time);

      expect(gap).toBeGreaterThan(130 * 0.2);
      if (vp.span > CALENDAR_FLOOR_YEARS) {
        // 1-2-5 사다리와 달력 단위 때문에 목표의 5배 이내에 들어온다.
        expect(gap).toBeLessThan(130 * 5);
      }
    }
  });
});

describe("스케일별 라벨 표기", () => {
  it("심원한 시간은 Ga/Ma 로 표기한다", () => {
    const ticks = generateTicks({ center: -6e9, span: 1e10 }, WIDTH);
    expect(ticks.some((t) => t.label.endsWith("Ga"))).toBe(true);
  });

  it("역사 시대는 BCE/CE 로 표기한다", () => {
    const ticks = generateTicks({ center: 0, span: 2000 }, WIDTH);
    expect(ticks.some((t) => t.label.endsWith("BCE"))).toBe(true);
    expect(ticks.some((t) => t.label.endsWith("CE"))).toBe(true);
  });

  it("연 미만 줌에서는 월 이름이 나온다", () => {
    const ticks = generateTicks({ center: 1969.5, span: 0.9 }, WIDTH);
    expect(ticks.some((t) => /^[A-Z][a-z]{2} /.test(t.label))).toBe(true);
  });

  it("일 단위 줌에서는 일자가 나온다", () => {
    const ticks = generateTicks({ center: 1969.55, span: 0.05 }, WIDTH);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.some((t) => /^[A-Z][a-z]{2} \d+$/.test(t.label))).toBe(true);
  });

  it("단위와 자릿수가 스텝을 따라간다", () => {
    // 스텝이 1 Ga 면 소수점은 오히려 거짓 정밀도다.
    expect(formatTickLabel(-13.787e9, 1e9)).toBe("14 Ga");
    expect(formatTickLabel(-13.787e9, 1e8)).toBe("13.8 Ga");
    // Ga 의 소수 자릿수로 감당이 안 되면 단위가 Ma 로 내려간다.
    expect(formatTickLabel(-13.787e9, 1e6)).toBe("13,787 Ma");
    // 더 내려가면 절대 연도가 가장 정직하다.
    expect(formatTickLabel(-13.787e9, 100)).toBe("13,787,000,001 BCE");
  });
});

describe("퇴화 입력", () => {
  it("폭이 0 이면 빈 배열이다", () => {
    expect(generateTicks({ center: 0, span: 100 }, 0)).toEqual([]);
  });

  it("span 이 0 이면 빈 배열이다", () => {
    expect(generateTicks({ center: 0, span: 0 }, WIDTH)).toEqual([]);
  });
});
