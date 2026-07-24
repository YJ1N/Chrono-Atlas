import { describe, expect, it } from "vitest";

import { IntervalIndex, createItemIndex } from "./IntervalIndex";
import { UNIVERSE_START } from "@/engine/time/TimePoint";
import type { TimelineItem } from "@/engine/types/timeline";

interface Span {
  id: string;
  start: number;
  end: number;
}

const index = (spans: Span[]) =>
  new IntervalIndex(spans, (s) => ({ start: s.start, end: s.end }));

const ids = (out: Span[]) => out.map((s) => s.id).sort();

/** 참조 구현 — 트리 질의를 이것과 대조한다. */
const bruteForce = (spans: Span[], qs: number, qe: number) =>
  spans.filter((s) => s.start <= qe && Math.max(s.start, s.end) >= qs);

describe("기본 겹침 판정", () => {
  const spans: Span[] = [
    { id: "point", start: 100, end: 100 },
    { id: "short", start: 150, end: 160 },
    { id: "long", start: 0, end: 1000 },
    { id: "before", start: -500, end: -400 },
    { id: "after", start: 2000, end: 2100 },
  ];
  const idx = index(spans);

  it("뷰포트를 관통하는 긴 구간을 놓치지 않는다", () => {
    // 이 모듈이 존재하는 이유. 단순 이진탐색이면 "long" 이 누락된다.
    expect(ids(idx.query(140, 170))).toEqual(["long", "short"]);
  });

  it("완전히 벗어난 구간은 제외한다", () => {
    expect(ids(idx.query(140, 170))).not.toContain("before");
    expect(ids(idx.query(140, 170))).not.toContain("after");
  });

  it("점 사건을 잡는다", () => {
    expect(ids(idx.query(100, 100))).toEqual(["long", "point"]);
  });

  it("경계를 포함한다", () => {
    expect(ids(idx.query(160, 160))).toContain("short");
    expect(ids(idx.query(150, 150))).toContain("short");
  });

  it("겹치는 것이 없으면 빈 배열이다", () => {
    expect(idx.query(1200, 1500)).toEqual([]);
  });

  it("결과가 시작점 오름차순이다", () => {
    const out = idx.query(-1000, 3000);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].start);
    }
  });
});

describe("무작위 대조 — 참조 구현과 완전 일치", () => {
  it("길이 분포가 극단적으로 섞여도 일치한다", () => {
    // 결정적 의사난수 (테스트 재현성).
    let seed = 20260724;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const spans: Span[] = [];
    for (let i = 0; i < 2000; i += 1) {
      const start = (rand() - 0.5) * 4000;
      // 점 사건, 짧은 구간, 뷰포트를 통째로 삼키는 구간이 공존한다.
      const kind = rand();
      const len = kind < 0.5 ? 0 : kind < 0.9 ? rand() * 20 : rand() * 3000;
      spans.push({ id: `s${i}`, start, end: start + len });
    }
    const idx = index(spans);

    for (let q = 0; q < 300; q += 1) {
      const qs = (rand() - 0.5) * 4000;
      const qe = qs + rand() * 500;
      expect(ids(idx.query(qs, qe))).toEqual(ids(bruteForce(spans, qs, qe)));
    }
  });
});

describe("엣지 케이스", () => {
  it("빈 인덱스를 다룬다", () => {
    const idx = index([]);
    expect(idx.size).toBe(0);
    expect(idx.query(0, 100)).toEqual([]);
  });

  it("단일 원소를 다룬다", () => {
    const idx = index([{ id: "only", start: 5, end: 10 }]);
    expect(ids(idx.query(0, 100))).toEqual(["only"]);
    expect(idx.query(20, 30)).toEqual([]);
  });

  it("뒤집힌 질의는 빈 결과다", () => {
    expect(index([{ id: "a", start: 0, end: 10 }]).query(50, 10)).toEqual([]);
  });

  it("end < start 인 오염 데이터를 점 사건으로 정규화한다", () => {
    const idx = index([{ id: "bad", start: 100, end: 50 }]);
    expect(ids(idx.query(90, 110))).toEqual(["bad"]);
    expect(idx.query(50, 60)).toEqual([]);
  });

  it("동일 시작점이 겹쳐도 모두 반환한다", () => {
    const idx = index([
      { id: "a", start: 10, end: 20 },
      { id: "b", start: 10, end: 30 },
      { id: "c", start: 10, end: 10 },
    ]);
    expect(ids(idx.query(10, 15))).toEqual(["a", "b", "c"]);
  });
});

describe("심원한 시간 스케일", () => {
  it("138억 년 범위에서 동작한다", () => {
    const idx = index([
      { id: "universe", start: UNIVERSE_START, end: 2026 },
      { id: "earth", start: -4.54e9, end: 2026 },
      { id: "cretaceous", start: -1.45e8, end: -6.6e7 },
      { id: "apollo", start: 1969.55, end: 1969.55 },
    ]);

    expect(ids(idx.query(-1e8, -9e7))).toEqual([
      "cretaceous",
      "earth",
      "universe",
    ]);
    expect(ids(idx.query(1969, 1970))).toEqual([
      "apollo",
      "earth",
      "universe",
    ]);
  });
});

describe("queryInto — 할당 없는 재질의", () => {
  it("같은 배열을 재사용하며 이전 결과를 지운다", () => {
    const idx = index([
      { id: "a", start: 0, end: 10 },
      { id: "b", start: 100, end: 110 },
    ]);
    const buffer: Span[] = [];

    idx.queryInto(0, 10, buffer);
    expect(ids(buffer)).toEqual(["a"]);

    const same = idx.queryInto(100, 110, buffer);
    expect(same).toBe(buffer);
    expect(ids(buffer)).toEqual(["b"]);

    idx.queryInto(500, 600, buffer);
    expect(buffer).toHaveLength(0);
  });
});

describe("createItemIndex — TimelineItem 연동", () => {
  const item = (id: string, start: number, end: number): TimelineItem => ({
    id,
    span: { start, end, precision: "year" },
    title: id,
    significance: 0.5,
    categoryId: "c",
    laneId: "l",
    layer: "primary",
  });

  it("TimelineItem 의 span 을 그대로 색인한다", () => {
    const idx = createItemIndex([
      item("rome", -753, 476),
      item("moon", 1969, 1969),
    ]);
    expect(idx.query(0, 100).map((i) => i.id)).toEqual(["rome"]);
    expect(idx.query(1969, 1969).map((i) => i.id)).toEqual(["moon"]);
  });
});
