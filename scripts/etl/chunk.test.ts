import { describe, expect, it } from "vitest";

import { planChunks } from "./chunk";
import type { ItemLayer, TimelineItem } from "@/engine/types/timeline";

function item(
  id: string,
  start: number,
  significance: number,
  layer: ItemLayer = "primary",
  end = start,
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

const OPTIONS = {
  overviewTarget: 10,
  chunkMaxItems: 4,
  longSpanYears: 100,
  basePath: "/data/history",
  idPrefix: "history",
};

/** 시간과 중요도가 서로 무관하게 흩어진 집합 — 실제 데이터와 같은 성질. */
const SAMPLE: TimelineItem[] = [
  ...Array.from({ length: 40 }, (_, i) =>
    item(`p${i}`, 1000 + i * 13, ((i * 37) % 100) / 100),
  ),
  item("era-a", -66_000_000, 0.9, "context", 2026),
  item("era-b", -2_500_000_000, 0.8, "context", -538_800_000),
];

describe("planChunks", () => {
  it("모든 항목이 정확히 한 번씩 나타난다", () => {
    const plan = planChunks(SAMPLE, OPTIONS);
    const seen = [
      ...plan.overview.map((i) => i.id),
      ...plan.chunks.flatMap((c) => c.items.map((i) => i.id)),
    ];
    expect(seen).toHaveLength(SAMPLE.length);
    expect(new Set(seen).size).toBe(SAMPLE.length);
  });

  /**
   * 긴 context 항목이 detail 청크에 들어가면 그 청크 범위가 통째로 늘어나
   * 아무 뷰포트에서나 겹치게 되고 범위 기반 로딩이 무의미해진다.
   */
  it("context 항목은 전부 overview 에 있다", () => {
    const plan = planChunks(SAMPLE, OPTIONS);
    const inChunks = plan.chunks
      .flatMap((c) => c.items)
      .filter((i) => i.layer === "context");
    expect(inChunks).toHaveLength(0);
    expect(plan.overview.filter((i) => i.layer === "context")).toHaveLength(2);
  });

  it("청크가 상한을 넘지 않는다", () => {
    const plan = planChunks(SAMPLE, OPTIONS);
    for (const c of plan.chunks) {
      expect(c.items.length).toBeGreaterThan(0);
      expect(c.items.length).toBeLessThanOrEqual(OPTIONS.chunkMaxItems);
      expect(c.manifest.itemCount).toBe(c.items.length);
    }
  });

  it("overview 는 중요도 상위를 가져간다", () => {
    const plan = planChunks(SAMPLE, OPTIONS);
    const overviewPrimary = plan.overview.filter((i) => i.layer === "primary");
    const chunked = plan.chunks.flatMap((c) => c.items);
    const lowestInOverview = Math.min(
      ...overviewPrimary.map((i) => i.significance),
    );
    const highestInChunks = Math.max(...chunked.map((i) => i.significance));
    expect(lowestInOverview).toBeGreaterThanOrEqual(highestInChunks);
    expect(plan.overviewFloor).toBe(lowestInOverview);
  });

  it("매니페스트 범위가 실제 항목을 담는다", () => {
    const plan = planChunks(SAMPLE, OPTIONS);
    for (const c of plan.chunks) {
      for (const i of c.items) {
        expect(i.span.start).toBeGreaterThanOrEqual(c.manifest.range.start);
        expect(i.span.end).toBeLessThanOrEqual(c.manifest.range.end);
        expect(i.significance).toBeGreaterThanOrEqual(
          c.manifest.significanceRange!.min,
        );
        expect(i.significance).toBeLessThanOrEqual(
          c.manifest.significanceRange!.max,
        );
      }
    }
  });

  /**
   * 긴 구간 항목 하나가 청크에 끼면 그 청크의 끝 범위가 통째로 늘어나
   * 아무 뷰포트에서나 겹치게 된다. 실측으로 걸린 결함이다.
   */
  it("긴 구간 항목은 청크에 들어가지 않는다", () => {
    const withLong = [...SAMPLE, item("long", 1100, 0.01, "primary", 9000)];
    const plan = planChunks(withLong, OPTIONS);
    expect(plan.chunks.flatMap((c) => c.items).map((i) => i.id)).not.toContain(
      "long",
    );
    expect(plan.overview.map((i) => i.id)).toContain("long");
    for (const c of plan.chunks) {
      expect(c.manifest.range.end - c.manifest.range.start).toBeLessThanOrEqual(
        400 + OPTIONS.longSpanYears,
      );
    }
  });

  it("청크가 시간 순으로 늘어선다", () => {
    const plan = planChunks(SAMPLE, OPTIONS);
    for (let i = 1; i < plan.chunks.length; i += 1) {
      expect(plan.chunks[i].manifest.range.start).toBeGreaterThanOrEqual(
        plan.chunks[i - 1].manifest.range.start,
      );
    }
  });

  it("id 와 경로가 겹치지 않는다", () => {
    const plan = planChunks(SAMPLE, OPTIONS);
    const ids = plan.chunks.map((c) => c.manifest.id);
    const paths = plan.chunks.map((c) => c.manifest.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  /** ETL 은 여러 번 돌린다. 같은 입력이 같은 출력을 내야 diff 가 의미를 갖는다. */
  it("동점이 있어도 결과가 재현 가능하다", () => {
    const tied = Array.from({ length: 20 }, (_, i) => item(`t${i}`, i, 0.5));
    const a = planChunks(tied, OPTIONS);
    const b = planChunks([...tied].reverse(), OPTIONS);
    expect(a.overview.map((i) => i.id)).toEqual(b.overview.map((i) => i.id));
    expect(a.chunks.flatMap((c) => c.items.map((i) => i.id))).toEqual(
      b.chunks.flatMap((c) => c.items.map((i) => i.id)),
    );
  });

  it("항목이 overview 보다 적으면 청크가 생기지 않는다", () => {
    const plan = planChunks([item("a", 1, 0.5)], OPTIONS);
    expect(plan.chunks).toHaveLength(0);
    expect(plan.overview).toHaveLength(1);
  });

  it("빈 입력에도 터지지 않는다", () => {
    const plan = planChunks([], OPTIONS);
    expect(plan.overview).toHaveLength(0);
    expect(plan.chunks).toHaveLength(0);
  });
});
