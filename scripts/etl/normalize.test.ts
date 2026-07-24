import { describe, expect, it } from "vitest";

import { dedupeAcrossSources, normalizeSource } from "./normalize";
import { PRESENT_EPOCH } from "@/engine/time/TimePoint";
import type { Binding } from "./sparql";
import type { QuerySource } from "./queries";

const SOURCE: QuerySource = {
  name: "battles",
  laneId: "civilization",
  categoryId: "conflict",
  layer: "primary",
  sparql: "",
};

function row(over: Record<string, string>): Binding {
  const base: Record<string, string> = {
    item: "http://www.wikidata.org/entity/Q1",
    itemLabel: "어떤 전투",
    t: "1815-06-18T00:00:00Z",
    prec: "11",
    cal: "http://www.wikidata.org/entity/Q1985727",
    sitelinks: "50",
    ...over,
  };
  return Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, { value: v, type: "literal" }]),
  ) as Binding;
}

describe("normalizeSource", () => {
  it("카테고리·레인은 쿼리에서 온다", () => {
    const { candidates } = normalizeSource(SOURCE, [row({})]);
    expect(candidates[0].categoryId).toBe("conflict");
    expect(candidates[0].laneId).toBe("civilization");
    expect(candidates[0].layer).toBe("primary");
    expect(candidates[0].id).toBe("wd-Q1");
  });

  it("Wikidata 출처를 기록한다", () => {
    const { candidates } = normalizeSource(SOURCE, [row({})]);
    expect(candidates[0].sourceRef).toEqual({
      externalId: "Q1",
      provider: "wikidata",
      url: "https://www.wikidata.org/wiki/Q1",
    });
  });

  /**
   * 실측: 테르모필레 전투가 일 정밀도와 월 정밀도로 두 행 나왔다.
   * 순진하게 받으면 같은 사건이 두 번 그려지고 밀도가 부풀려진다.
   */
  it("같은 항목의 중복 주장에서 더 정밀한 쪽을 남긴다", () => {
    const { candidates, stats } = normalizeSource(SOURCE, [
      row({ t: "-0479-07-01T00:00:00Z", prec: "10" }),
      row({ t: "-0479-08-06T00:00:00Z", prec: "11" }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].rawPrecision).toBe(11);
    expect(stats.drops.duplicate).toBe(1);
  });

  it("라벨이 Q-id 그대로면 버린다", () => {
    const { candidates, stats } = normalizeSource(SOURCE, [
      row({ itemLabel: "Q12345" }),
    ]);
    expect(candidates).toHaveLength(0);
    expect(stats.drops["no-label"]).toBe(1);
  });

  it("파싱 실패를 조용히 삼키지 않고 센다", () => {
    const { candidates, stats } = normalizeSource(SOURCE, [
      row({ t: "쓰레기" }),
      row({ item: "http://www.wikidata.org/entity/Q2", prec: "77" }),
    ]);
    expect(candidates).toHaveLength(0);
    expect(stats.drops.malformed).toBe(1);
    expect(stats.drops["unknown-precision"]).toBe(1);
    expect(stats.rows).toBe(2);
  });

  it("율리우스력 표기를 센다 (변환은 하지 않는다 — ADR-005)", () => {
    const { candidates, stats } = normalizeSource(SOURCE, [
      row({ cal: "http://www.wikidata.org/entity/Q1985786" }),
    ]);
    expect(stats.julian).toBe(1);
    expect(candidates[0].julian).toBe(true);
    // 시간값은 손대지 않는다.
    expect(Math.floor(candidates[0].span.start)).toBe(1815);
  });

  it("거친 정밀도의 점 사건에 정직한 두께를 준다", () => {
    const { candidates } = normalizeSource(SOURCE, [
      row({ t: "1601-01-01T00:00:00Z", prec: "7" }),
    ]);
    expect(candidates[0].span.start).toBe(1601);
    expect(candidates[0].span.end).toBe(1701);
    expect(candidates[0].span.approximate).toBe(true);
  });

  /**
   * 실측으로 걸린 결함이다. 12,600 BCE 의 유적이 십만 년 정밀도로 기록되어
   * 있어 파생된 끝이 87,400 CE 가 됐다. 과거의 사건이 미래까지 뻗는 막대가
   * 되는 것은 어떤 경우에도 옳지 않다.
   */
  it("파생된 두께는 현재를 넘지 않는다", () => {
    const { candidates } = normalizeSource(SOURCE, [
      row({ t: "-12600-01-01T00:00:00Z", prec: "4" }),
    ]);
    expect(candidates[0].span.start).toBe(-12600);
    expect(candidates[0].span.end).toBe(PRESENT_EPOCH);
  });

  it("두께를 줘도 현재 이전이면 그대로 둔다", () => {
    const { candidates } = normalizeSource(SOURCE, [
      row({ t: "1601-01-01T00:00:00Z", prec: "7" }),
    ]);
    expect(candidates[0].span.end).toBe(1701);
  });

  it("일 정밀도는 점으로 남는다", () => {
    const { candidates } = normalizeSource(SOURCE, [row({})]);
    expect(candidates[0].span.start).toBe(candidates[0].span.end);
    expect(candidates[0].span.approximate).toBeUndefined();
  });

  describe("구간", () => {
    const interval = (over: Record<string, string> = {}) =>
      row({ t: "1939-09-01T00:00:00Z", t2: "1945-09-02T00:00:00Z", prec2: "11", ...over });

    it("시작과 끝을 모두 반영한다", () => {
      const { candidates } = normalizeSource(SOURCE, [interval()]);
      expect(Math.floor(candidates[0].span.start)).toBe(1939);
      expect(Math.floor(candidates[0].span.end)).toBe(1945);
    });

    /** 끝이 시작보다 앞서는 데이터가 실제로 존재한다. 조용히 뒤집지 않는다. */
    it("뒤집힌 구간은 버린다", () => {
      const { candidates, stats } = normalizeSource(SOURCE, [
        interval({ t: "1945-09-02T00:00:00Z", t2: "1939-09-01T00:00:00Z" }),
      ]);
      expect(candidates).toHaveLength(0);
      expect(stats.drops["inverted-span"]).toBe(1);
    });

    it("끝을 파싱하지 못하면 버린다", () => {
      const { candidates, stats } = normalizeSource(SOURCE, [
        interval({ t2: "쓰레기" }),
      ]);
      expect(candidates).toHaveLength(0);
      expect(stats.drops["missing-end"]).toBe(1);
    });

    it("구간 정밀도는 거친 쪽이 지배한다", () => {
      const { candidates } = normalizeSource(SOURCE, [
        interval({ prec2: "7" }),
      ]);
      expect(candidates[0].span.precision).toBe("century");
    });
  });
});

describe("dedupeAcrossSources", () => {
  /** SOURCES 배열의 순서가 곧 카테고리 우선순위다. */
  it("먼저 선언된 소스가 이긴다", () => {
    const make = (categoryId: string) =>
      normalizeSource({ ...SOURCE, categoryId }, [row({})]).candidates;

    const { candidates, crossSourceDuplicates } = dedupeAcrossSources([
      make("conflict"),
      make("culture"),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].categoryId).toBe("conflict");
    expect(crossSourceDuplicates).toBe(1);
  });

  it("서로 다른 항목은 모두 남는다", () => {
    const a = normalizeSource(SOURCE, [row({})]).candidates;
    const b = normalizeSource(SOURCE, [
      row({ item: "http://www.wikidata.org/entity/Q2" }),
    ]).candidates;
    expect(dedupeAcrossSources([a, b]).candidates).toHaveLength(2);
  });
});
