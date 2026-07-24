import { describe, expect, it } from "vitest";

import { createItemIndex } from "./IntervalIndex";
import {
  DEFAULT_MIN_SPACING_PX,
  countVisible,
  selectVisible,
} from "./lod";
import { UNIVERSE_START } from "@/engine/time/TimePoint";
import { createTimeScale } from "@/engine/time/TimeScale";
import type { ItemLayer, TimelineItem, Viewport } from "@/engine/types/timeline";

const WIDTH = 1440;

function item(
  id: string,
  start: number,
  end = start,
  significance = 0.5,
  laneId = "lane-a",
  layer: ItemLayer = "primary",
): TimelineItem {
  return {
    id,
    span: { start, end, precision: "year" },
    title: id,
    significance,
    categoryId: "cat",
    laneId,
    layer,
  };
}

describe("기본 선별", () => {
  it("뷰포트 밖 아이템은 제외한다", () => {
    const index = createItemIndex([
      item("in", 1000),
      item("far-past", -50_000),
      item("far-future", 1990),
    ]);
    const out = selectVisible(index, { center: 1000, span: 100 }, WIDTH);
    expect(out.map((p) => p.item.id)).toEqual(["in"]);
  });

  it("픽셀 좌표와 폭을 계산한다", () => {
    const index = createItemIndex([item("span", 1000, 1500)]);
    const viewport: Viewport = { center: 1000, span: 2000 };
    const [placed] = selectVisible(index, viewport, WIDTH);
    const scale = createTimeScale(viewport, WIDTH);

    expect(placed.x).toBeCloseTo(scale.toPixel(1000), 6);
    expect(placed.width).toBeCloseTo(scale.spanWidth(1000, 1500), 6);
  });

  it("점 사건의 폭은 0 이다", () => {
    const index = createItemIndex([item("point", 1000)]);
    const [placed] = selectVisible(index, { center: 1000, span: 100 }, WIDTH);
    expect(placed.width).toBe(0);
  });

  it("결과가 시간 오름차순이다", () => {
    const index = createItemIndex([
      item("c", 1800),
      item("a", 1000),
      item("b", 1400),
    ]);
    const out = selectVisible(index, { center: 1400, span: 2000 }, WIDTH);
    expect(out.map((p) => p.item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("중요도가 충돌을 이긴다 — LOD 의 핵심", () => {
  it("같은 위치에 겹치면 중요한 쪽만 남는다", () => {
    const index = createItemIndex([
      item("minor", 1000, 1000, 0.1),
      item("major", 1000.01, 1000.01, 0.9),
    ]);
    const out = selectVisible(index, { center: 1000, span: 2000 }, WIDTH);
    expect(out.map((p) => p.item.id)).toEqual(["major"]);
  });

  it("줌 인하면 밀려났던 것이 다시 나타난다", () => {
    const index = createItemIndex([
      item("minor", 1000, 1000, 0.1),
      item("major", 1001, 1001, 0.9),
    ]);
    const wide = selectVisible(index, { center: 1000, span: 5000 }, WIDTH);
    const tight = selectVisible(index, { center: 1000.5, span: 10 }, WIDTH);

    expect(wide.map((p) => p.item.id)).toEqual(["major"]);
    expect(tight.map((p) => p.item.id)).toEqual(["minor", "major"]);
  });

  it("다른 레인은 서로를 밀어내지 않는다", () => {
    const index = createItemIndex([
      item("a", 1000, 1000, 0.5, "lane-a"),
      item("b", 1000, 1000, 0.4, "lane-b"),
      item("c", 1000, 1000, 0.3, "lane-c"),
    ]);
    const out = selectVisible(index, { center: 1000, span: 2000 }, WIDTH);
    expect(out).toHaveLength(3);
  });
});

describe("DOM 노드 상한 — 성능 계약", () => {
  const dense: TimelineItem[] = [];
  for (let i = 0; i < 5000; i += 1) {
    dense.push(item(`d${i}`, 1000 + i * 0.2, 1000 + i * 0.2, (i % 100) / 100));
  }
  const index = createItemIndex(dense);

  it("아무리 조밀해도 maxItems 를 넘지 않는다", () => {
    for (const span of [10, 100, 1000, 10_000]) {
      const out = selectVisible(index, { center: 1200, span }, WIDTH, {
        maxItems: 300,
      });
      expect(out.length).toBeLessThanOrEqual(300);
    }
  });

  it("최소 간격을 실제로 지킨다", () => {
    const out = selectVisible(index, { center: 1200, span: 500 }, WIDTH, {
      minSpacingPx: DEFAULT_MIN_SPACING_PX,
    });
    const xs = out.map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(DEFAULT_MIN_SPACING_PX);
    }
  });

  it("간격을 넓히면 개수가 줄어든다", () => {
    const viewport: Viewport = { center: 1200, span: 500 };
    const tight = selectVisible(index, viewport, WIDTH, { minSpacingPx: 5 });
    const loose = selectVisible(index, viewport, WIDTH, { minSpacingPx: 60 });
    expect(loose.length).toBeLessThan(tight.length);
  });
});

describe("결정성 — 팬 중 깜빡임 방지", () => {
  it("같은 입력이면 언제나 같은 결과다", () => {
    const items: TimelineItem[] = [];
    for (let i = 0; i < 500; i += 1) {
      // 중요도 동점을 많이 만들어 tie-break 를 시험한다.
      items.push(item(`x${i}`, 1000 + i * 0.5, 1000 + i * 0.5, 0.5));
    }
    const index = createItemIndex(items);
    const viewport: Viewport = { center: 1100, span: 300 };

    const first = selectVisible(index, viewport, WIDTH).map((p) => p.item.id);
    for (let run = 0; run < 5; run += 1) {
      expect(selectVisible(index, viewport, WIDTH).map((p) => p.item.id)).toEqual(
        first,
      );
    }
  });

  it("입력 배열 순서가 결과를 바꾸지 않는다", () => {
    const base = [
      item("a", 1000, 1000, 0.5),
      item("b", 1000.01, 1000.01, 0.5),
      item("c", 1000.02, 1000.02, 0.5),
    ];
    const viewport: Viewport = { center: 1000, span: 2000 };
    const forward = selectVisible(createItemIndex(base), viewport, WIDTH);
    const reversed = selectVisible(
      createItemIndex([...base].reverse()),
      viewport,
      WIDTH,
    );
    expect(reversed.map((p) => p.item.id)).toEqual(forward.map((p) => p.item.id));
  });
});

describe("레이어 필터", () => {
  const index = createItemIndex([
    item("era", 1000, 1500, 0.9, "lane-a", "context"),
    item("event", 1200, 1200, 0.8, "lane-a", "primary"),
  ]);

  it("primary 만 고른다", () => {
    const out = selectVisible(index, { center: 1200, span: 2000 }, WIDTH, {
      layer: "primary",
    });
    expect(out.map((p) => p.item.id)).toEqual(["event"]);
  });

  it("context 만 고른다", () => {
    const out = selectVisible(index, { center: 1200, span: 2000 }, WIDTH, {
      layer: "context",
    });
    expect(out.map((p) => p.item.id)).toEqual(["era"]);
  });

  it("생략하면 전부 대상이다", () => {
    const out = selectVisible(index, { center: 1200, span: 2000 }, WIDTH);
    expect(out).toHaveLength(2);
  });
});

describe("오버스캔 — 팬 중 가장자리 팝인 방지", () => {
  it("화면 밖 아이템도 여유분만큼 포함한다", () => {
    const index = createItemIndex([item("just-off", 2000)]);
    // 뷰포트는 [0, 1000]. 2000 은 화면 밖이다.
    const viewport: Viewport = { center: 500, span: 1000 };

    expect(selectVisible(index, viewport, WIDTH, { overscanPx: 0 })).toHaveLength(0);
    // 1px = 0.694년이므로 2000px 여유면 약 1389년까지 미리 잡는다.
    expect(
      selectVisible(index, viewport, WIDTH, { overscanPx: 2000 }),
    ).toHaveLength(1);
  });
});

describe("퇴화 입력", () => {
  const index = createItemIndex([item("a", 1000)]);

  it("폭이 0 이면 빈 배열이다", () => {
    expect(selectVisible(index, { center: 1000, span: 100 }, 0)).toEqual([]);
  });

  it("span 이 0 이면 빈 배열이다", () => {
    expect(selectVisible(index, { center: 1000, span: 0 }, WIDTH)).toEqual([]);
  });

  it("maxItems 가 0 이면 빈 배열이다", () => {
    expect(
      selectVisible(index, { center: 1000, span: 100 }, WIDTH, { maxItems: 0 }),
    ).toEqual([]);
  });

  it("빈 인덱스를 다룬다", () => {
    expect(
      selectVisible(createItemIndex([]), { center: 0, span: 100 }, WIDTH),
    ).toEqual([]);
  });
});

describe("심원한 시간", () => {
  it("138억 년 전체 줌아웃에서도 동작한다", () => {
    const index = createItemIndex([
      item("universe", UNIVERSE_START, UNIVERSE_START, 1),
      item("earth", -4.54e9, -4.54e9, 0.9),
      item("cambrian", -5.39e8, -5.39e8, 0.7),
      item("moon", 1969, 1969, 0.8),
    ]);
    const out = selectVisible(
      index,
      { center: UNIVERSE_START / 2, span: 1.4e10 },
      WIDTH,
    );
    expect(out.length).toBeGreaterThan(0);
    for (const placed of out) {
      expect(Number.isFinite(placed.x)).toBe(true);
      expect(Number.isFinite(placed.width)).toBe(true);
    }
  });
});

describe("countVisible", () => {
  const index = createItemIndex([
    item("a", 1000, 1000, 0.5, "lane-a", "primary"),
    item("b", 1100, 1100, 0.5, "lane-a", "primary"),
    item("era", 900, 1200, 0.9, "lane-a", "context"),
  ]);

  it("선별과 무관하게 전체를 센다", () => {
    expect(countVisible(index, { center: 1050, span: 400 })).toBe(3);
  });

  it("레이어로 거를 수 있다", () => {
    expect(countVisible(index, { center: 1050, span: 400 }, "primary")).toBe(2);
    expect(countVisible(index, { center: 1050, span: 400 }, "context")).toBe(1);
  });
});
