import { describe, expect, it } from "vitest";

import {
  type Packable,
  estimateLabelWidth,
  packRows,
} from "./collision";

const p = (id: string, x: number, width: number): Packable => ({ id, x, width });

/** 같은 줄에 배정된 항목들이 실제로 겹치지 않는지 검사한다. */
function assertNoOverlap(items: Packable[], rows: Map<string, number>, gap: number) {
  const byRow = new Map<number, Packable[]>();
  for (const item of items) {
    const row = rows.get(item.id);
    if (row === undefined) continue;
    const list = byRow.get(row) ?? [];
    list.push(item);
    byRow.set(row, list);
  }
  for (const list of byRow.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i += 1) {
      const prevRight = list[i - 1].x + list[i - 1].width;
      expect(list[i].x).toBeGreaterThanOrEqual(prevRight + gap);
    }
  }
}

describe("기본 배치", () => {
  it("겹치지 않으면 모두 첫 줄이다", () => {
    const items = [p("a", 0, 50), p("b", 100, 50), p("c", 200, 50)];
    const { rows, rowCount } = packRows(items);
    expect(rowCount).toBe(1);
    expect([...rows.values()]).toEqual([0, 0, 0]);
  });

  it("겹치면 다음 줄로 내린다", () => {
    const items = [p("a", 0, 200), p("b", 50, 200), p("c", 100, 200)];
    const { rows, rowCount } = packRows(items);
    expect(rowCount).toBe(3);
    expect(rows.get("a")).toBe(0);
    expect(rows.get("b")).toBe(1);
    expect(rows.get("c")).toBe(2);
  });

  it("빈 줄이 생기면 재사용한다", () => {
    // a 는 [0,100], b 는 [10,110] → 두 줄. c 는 [200,300] → a 의 줄로 돌아간다.
    const items = [p("a", 0, 100), p("b", 10, 100), p("c", 200, 100)];
    const { rows, rowCount } = packRows(items);
    expect(rowCount).toBe(2);
    expect(rows.get("c")).toBe(0);
  });

  it("어떤 배치에서도 같은 줄 안에서는 겹치지 않는다", () => {
    const items: Packable[] = [];
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 300; i += 1) {
      items.push(p(`i${i}`, rand() * 1400, rand() * 200));
    }
    const { rows } = packRows(items, { gapPx: 6, maxRows: 12 });
    assertNoOverlap(items, rows, 6);
  });
});

describe("줄 수 상한 — 레인 높이는 유한하다", () => {
  it("상한을 넘으면 버린다", () => {
    const items = Array.from({ length: 10 }, (_, i) => p(`x${i}`, i, 500));
    const { rowCount, dropped, rows } = packRows(items, { maxRows: 3 });
    expect(rowCount).toBe(3);
    expect(rows.size).toBe(3);
    expect(dropped).toHaveLength(7);
  });

  it("버려진 항목은 rows 에 없다", () => {
    const items = Array.from({ length: 5 }, (_, i) => p(`x${i}`, i, 500));
    const { rows, dropped } = packRows(items, { maxRows: 2 });
    for (const id of dropped) expect(rows.has(id)).toBe(false);
  });
});

describe("여백", () => {
  it("gapPx 를 지킨다", () => {
    // a 는 [0,100]. b 가 105 에서 시작하면 여백 10 에는 못 미친다.
    const items = [p("a", 0, 100), p("b", 105, 50)];
    expect(packRows(items, { gapPx: 10 }).rowCount).toBe(2);
    expect(packRows(items, { gapPx: 4 }).rowCount).toBe(1);
  });
});

describe("결정성 — 팬 중 줄이 튀지 않아야 한다", () => {
  const items = [p("c", 100, 80), p("a", 0, 150), p("b", 100, 80)];

  it("입력 순서가 결과를 바꾸지 않는다", () => {
    const forward = packRows(items).rows;
    const reversed = packRows([...items].reverse()).rows;
    expect([...reversed.entries()].sort()).toEqual([...forward.entries()].sort());
  });

  it("반복 호출이 같은 결과를 낸다", () => {
    const first = [...packRows(items).rows.entries()].sort();
    for (let i = 0; i < 5; i += 1) {
      expect([...packRows(items).rows.entries()].sort()).toEqual(first);
    }
  });
});

describe("퇴화 입력", () => {
  it("빈 배열", () => {
    const { rows, rowCount, dropped } = packRows([]);
    expect(rowCount).toBe(0);
    expect(rows.size).toBe(0);
    expect(dropped).toEqual([]);
  });

  it("폭 0 인 점 항목", () => {
    const items = [p("a", 10, 0), p("b", 10, 0)];
    const { rowCount } = packRows(items, { gapPx: 1 });
    expect(rowCount).toBe(2);
  });

  it("음수 폭을 0 으로 취급한다", () => {
    const { rowCount } = packRows([p("a", 0, -50), p("b", 10, 0)], { gapPx: 0 });
    expect(rowCount).toBe(1);
  });
});

describe("estimateLabelWidth", () => {
  it("한글은 폰트 크기에 가깝다", () => {
    expect(estimateLabelWidth("로마", 11)).toBeCloseTo(22, 0);
  });

  it("라틴 문자는 그보다 좁다", () => {
    expect(estimateLabelWidth("Rome", 11)).toBeLessThan(
      estimateLabelWidth("로마제국", 11),
    );
  });

  it("길이에 비례한다", () => {
    expect(estimateLabelWidth("가나다라", 11)).toBeCloseTo(
      estimateLabelWidth("가나", 11) * 2,
      5,
    );
  });

  it("빈 문자열은 0 이다", () => {
    expect(estimateLabelWidth("", 11)).toBe(0);
  });
});
