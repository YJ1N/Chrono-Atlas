import { describe, expect, it } from "vitest";

import {
  DEFAULT_BASELINE,
  computeDensityField,
  fieldToPolyline,
  sampleField,
} from "./DensityField";
import { UNIVERSE_START } from "@/engine/time/TimePoint";
import type { ItemLayer, TimelineItem } from "@/engine/types/timeline";

function item(
  id: string,
  start: number,
  end = start,
  significance = 0.5,
  layer: ItemLayer = "primary",
): TimelineItem {
  return {
    id,
    span: { start, end, precision: "year" },
    title: id,
    significance,
    categoryId: "c",
    laneId: "l",
    layer,
  };
}

/** 필드에서 가장 높은 지점의 인덱스. */
const peakIndex = (f: Float64Array) => {
  let best = 0;
  for (let i = 1; i < f.length; i += 1) if (f[i] > f[best]) best = i;
  return best;
};

describe("불변식 — 화면은 절대 비지 않는다", () => {
  it("사건이 없어도 지평선이 남는다", () => {
    const field = computeDensityField([], 0, 1000);
    expect(field.length).toBeGreaterThan(0);
    for (const v of field) expect(v).toBe(DEFAULT_BASELINE);
  });

  it("모든 값이 [baseline, 1] 안에 있다", () => {
    const items = [
      item("a", 100, 100, 1),
      item("b", 500, 900, 0.8),
      item("c", 300, 300, 0.2),
    ];
    for (const v of computeDensityField(items, 0, 1000)) {
      expect(v).toBeGreaterThanOrEqual(DEFAULT_BASELINE);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("해상도를 지킨다", () => {
    expect(computeDensityField([], 0, 100, { resolution: 64 }).length).toBe(64);
    expect(computeDensityField([], 0, 100, { resolution: 1 }).length).toBe(2);
  });
});

describe("봉우리 — 점 사건", () => {
  it("사건 위치에 봉우리가 생긴다", () => {
    const field = computeDensityField([item("x", 500)], 0, 1000, {
      resolution: 100,
      smoothing: 0,
    });
    expect(peakIndex(field)).toBe(50);
  });

  it("사건이 몰린 곳이 더 높다", () => {
    const clustered = [item("a", 200), item("b", 205), item("c", 210)];
    const field = computeDensityField([...clustered, item("d", 800)], 0, 1000, {
      resolution: 100,
      smoothing: 2,
    });
    expect(field[20]).toBeGreaterThan(field[80]);
  });

  it("평활이 봉우리를 넓힌다", () => {
    const sharp = computeDensityField([item("x", 500)], 0, 1000, {
      resolution: 100,
      smoothing: 0,
    });
    const soft = computeDensityField([item("x", 500)], 0, 1000, {
      resolution: 100,
      smoothing: 8,
    });
    // 이웃 bin 이 값을 나눠 갖는다.
    expect(soft[45]).toBeGreaterThan(sharp[45]);
  });
});

describe("고원 — 구간 항목", () => {
  it("구간 전체에 고원이 생긴다", () => {
    const field = computeDensityField(
      [item("era", 300, 700, 0.6, "context")],
      0,
      1000,
      { resolution: 100, smoothing: 0 },
    );
    expect(field[50]).toBeCloseTo(0.6, 6);
    expect(field[40]).toBeCloseTo(0.6, 6);
    expect(field[10]).toBe(DEFAULT_BASELINE);
    expect(field[90]).toBe(DEFAULT_BASELINE);
  });

  it("고원 높이는 중요도 그 자체다 (절대값)", () => {
    const low = computeDensityField([item("e", 0, 1000, 0.3)], 0, 1000, {
      resolution: 50,
      smoothing: 0,
    });
    const high = computeDensityField([item("e", 0, 1000, 0.9)], 0, 1000, {
      resolution: 50,
      smoothing: 0,
    });
    expect(low[25]).toBeCloseTo(0.3, 6);
    expect(high[25]).toBeCloseTo(0.9, 6);
  });

  it("겹치는 구간은 합산이 아니라 최댓값이다", () => {
    // 합산이면 긴 시대가 벽이 되어 안쪽 사건 밀도를 가린다.
    const field = computeDensityField(
      [item("a", 0, 1000, 0.4), item("b", 0, 1000, 0.7)],
      0,
      1000,
      { resolution: 50, smoothing: 0 },
    );
    expect(field[25]).toBeCloseTo(0.7, 6);
  });

  it("긴 시대 위로 사건 봉우리가 솟는다", () => {
    const field = computeDensityField(
      [item("era", 0, 1000, 0.5, "context"), item("peak", 500, 500, 1)],
      0,
      1000,
      { resolution: 100, smoothing: 1 },
    );
    expect(field[50]).toBeGreaterThan(field[10]);
    expect(field[10]).toBeCloseTo(0.5, 6);
  });
});

describe("경계 처리", () => {
  it("화면 밖 항목은 무시한다", () => {
    const field = computeDensityField([item("far", 5000)], 0, 1000, {
      resolution: 50,
    });
    for (const v of field) expect(v).toBe(DEFAULT_BASELINE);
  });

  it("걸쳐 있는 구간은 보이는 부분만 그린다", () => {
    const field = computeDensityField([item("e", -500, 500, 0.8)], 0, 1000, {
      resolution: 100,
      smoothing: 0,
    });
    expect(field[10]).toBeCloseTo(0.8, 6);
    expect(field[90]).toBe(DEFAULT_BASELINE);
  });

  it("퇴화한 구간에 안전하다", () => {
    expect(computeDensityField([item("a", 5)], 100, 100).length).toBeGreaterThan(0);
    expect(computeDensityField([item("a", 5)], 100, 0).length).toBeGreaterThan(0);
    for (const v of computeDensityField([item("a", 5)], 100, 0)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("end < start 인 오염 데이터를 점으로 취급한다", () => {
    const field = computeDensityField([item("bad", 500, 100)], 0, 1000, {
      resolution: 100,
      smoothing: 0,
    });
    expect(peakIndex(field)).toBe(50);
  });
});

describe("심원한 시간", () => {
  it("138억 년 전체에서 동작한다", () => {
    const field = computeDensityField(
      [
        item("bigbang", UNIVERSE_START, UNIVERSE_START, 1),
        item("earth", -4.54e9, -4.54e9, 0.95),
        item("cenozoic", -6.6e7, 2026, 0.65, "context"),
        item("moon", 1969, 1969, 0.92),
      ],
      UNIVERSE_START,
      2026,
      { resolution: 256 },
    );
    expect(field.length).toBe(256);
    for (const v of field) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(DEFAULT_BASELINE);
      expect(v).toBeLessThanOrEqual(1);
    }
    // 빅뱅은 맨 왼쪽에 있다.
    expect(field[0]).toBeGreaterThan(DEFAULT_BASELINE);
  });
});

describe("결정성", () => {
  it("같은 입력이면 같은 필드다", () => {
    const items = [item("a", 100), item("b", 200, 400, 0.7)];
    const first = Array.from(computeDensityField(items, 0, 1000));
    for (let i = 0; i < 3; i += 1) {
      expect(Array.from(computeDensityField(items, 0, 1000))).toEqual(first);
    }
  });

  it("입력 순서가 결과를 바꾸지 않는다", () => {
    const items = [item("a", 100), item("b", 200, 400, 0.7), item("c", 900)];
    const forward = Array.from(computeDensityField(items, 0, 1000));
    const reversed = Array.from(
      computeDensityField([...items].reverse(), 0, 1000),
    );
    expect(reversed).toEqual(forward);
  });
});

describe("sampleField — 계단이 아니라 능선", () => {
  const field = Float64Array.from([0, 0.5, 1]);

  it("양 끝점을 정확히 재현한다", () => {
    expect(sampleField(field, 0)).toBe(0);
    expect(sampleField(field, 1)).toBe(1);
  });

  it("사이를 선형 보간한다", () => {
    expect(sampleField(field, 0.25)).toBeCloseTo(0.25, 9);
    expect(sampleField(field, 0.5)).toBeCloseTo(0.5, 9);
    expect(sampleField(field, 0.75)).toBeCloseTo(0.75, 9);
  });

  it("범위 밖을 클램프한다", () => {
    expect(sampleField(field, -5)).toBe(0);
    expect(sampleField(field, 5)).toBe(1);
  });

  it("퇴화한 필드에 안전하다", () => {
    expect(sampleField(new Float64Array(0), 0.5)).toBe(0);
    expect(sampleField(Float64Array.from([0.7]), 0.5)).toBe(0.7);
  });
});

describe("fieldToPolyline", () => {
  const field = Float64Array.from([0, 1]);

  it("픽셀 폭만큼의 점을 만든다", () => {
    expect(fieldToPolyline(field, 100, 50).length).toBe(200);
  });

  it("고도 1 은 화면 위, 0 은 바닥이다", () => {
    const line = fieldToPolyline(field, 100, 50);
    expect(line[1]).toBeCloseTo(50, 6); // 고도 0 → y = height
    expect(line[line.length - 1]).toBeCloseTo(0, 6); // 고도 1 → y = 0
  });

  it("x 가 왼쪽에서 오른쪽으로 증가한다", () => {
    const line = fieldToPolyline(field, 100, 50);
    for (let i = 2; i < line.length; i += 2) {
      expect(line[i]).toBeGreaterThan(line[i - 2]);
    }
  });

  it("크기가 맞으면 배열을 재사용한다 (프레임당 할당 회피)", () => {
    const buffer = new Float64Array(200);
    expect(fieldToPolyline(field, 100, 50, buffer)).toBe(buffer);
  });

  it("크기가 다르면 새로 만든다", () => {
    const buffer = new Float64Array(10);
    expect(fieldToPolyline(field, 100, 50, buffer)).not.toBe(buffer);
  });
});
