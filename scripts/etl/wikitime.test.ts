/**
 * 실측 사례로 고정한다.
 *
 * 여기 나오는 리터럴은 전부 WDQS 에서 실제로 받은 값이다. 지어낸 예시로
 * 테스트하면 "내 파서가 내 상상과 일치한다" 만 증명된다.
 */

import { describe, expect, it } from "vitest";

import { parseWikidataTime, precisionWidth } from "./wikitime";
import { toDisplayYear } from "@/engine/time/TimePoint";

const GREGORIAN = "http://www.wikidata.org/entity/Q1985727";
const JULIAN = "http://www.wikidata.org/entity/Q1985786";

describe("parseWikidataTime — 실측 사례", () => {
  it("워털루 전투: 1815-06-18, 일 정밀도, 그레고리력", () => {
    const r = parseWikidataTime("1815-06-18T00:00:00Z", 11, GREGORIAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.floor(r.time)).toBe(1815);
    expect(r.precision).toBe("day");
    expect(r.approximate).toBe(false);
    expect(r.julian).toBe(false);
  });

  /**
   * 이 프로젝트에서 가장 값비싼 한 줄짜리 버그가 여기 있다.
   *
   * 테르모필레 전투는 기원전 480년이고 Wikidata 값은 `-0479` 다.
   * "BCE 니까 1을 빼야지" 라고 보정하면 조용히 1년씩 어긋난다.
   */
  it("테르모필레 전투: -0479 는 기원전 480년이다 (오프셋 보정 금지)", () => {
    const r = parseWikidataTime("-0479-08-06T00:00:00Z", 11, JULIAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.floor(r.time)).toBe(-479);
    expect(toDisplayYear(r.time)).toEqual({ year: 480, era: "BCE" });
    expect(r.julian).toBe(true);
  });

  it("캄브리아기 시작: -538800000, 십억 년대 정밀도", () => {
    const r = parseWikidataTime("-538800000-01-01T00:00:00Z", 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.time).toBe(-538_800_000);
    expect(r.precision).toBe("era");
    expect(r.approximate).toBe(true);
    expect(r.rawPrecision).toBe(3);
  });

  it("백악기 시작: -145000000 이 float64 를 통과해도 정확하다", () => {
    const r = parseWikidataTime("-145000000-01-01T00:00:00Z", 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.time).toBe(-145_000_000);
  });

  it("바드르 전투: 0624-03-15 는 서기 624년", () => {
    const r = parseWikidataTime("0624-03-15T00:00:00Z", 11, JULIAN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(toDisplayYear(r.time)).toEqual({ year: 624, era: "CE" });
  });
});

describe("parseWikidataTime — 없는 정밀도를 만들지 않는다", () => {
  /**
   * Wikidata 는 정밀도가 거칠어도 자리를 01-01 로 채워 보낸다.
   * 그 값을 믿으면 "17세기" 가 "1601년 1월 1일" 이 된다.
   */
  it("세기 정밀도는 월·일을 버린다", () => {
    const r = parseWikidataTime("1601-01-01T00:00:00Z", 7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.time).toBe(1601);
    expect(r.precision).toBe("century");
    expect(r.approximate).toBe(true);
  });

  it("월 정밀도는 월까지만 반영하고 일은 버린다", () => {
    const withDay = parseWikidataTime("1969-07-20T00:00:00Z", 10);
    const monthOnly = parseWikidataTime("1969-07-01T00:00:00Z", 10);
    expect(withDay.ok && monthOnly.ok).toBe(true);
    if (!withDay.ok || !monthOnly.ok) return;
    expect(withDay.time).toBe(monthOnly.time);
  });

  it("일 정밀도는 월·일을 모두 반영한다", () => {
    const a = parseWikidataTime("1969-07-20T00:00:00Z", 11);
    const b = parseWikidataTime("1969-07-01T00:00:00Z", 11);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.time).toBeGreaterThan(b.time);
  });
});

describe("parseWikidataTime — 불량 입력을 조용히 통과시키지 않는다", () => {
  it("형식이 깨진 값", () => {
    expect(parseWikidataTime("not-a-date", 11)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("알 수 없는 정밀도 코드", () => {
    const r = parseWikidataTime("1815-06-18T00:00:00Z", 99);
    expect(r).toEqual({ ok: false, reason: "unknown-precision" });
  });

  /** Wikidata 에는 실제로 오타로 들어온 극단값이 존재한다. */
  it("우주 나이보다 오래된 값은 거른다", () => {
    const r = parseWikidataTime("-999999999999-01-01T00:00:00Z", 0);
    expect(r).toEqual({ ok: false, reason: "out-of-range" });
  });

  it("미래 값은 거른다", () => {
    const r = parseWikidataTime("3000-01-01T00:00:00Z", 9);
    expect(r).toEqual({ ok: false, reason: "out-of-range" });
  });
});

describe("precisionWidth", () => {
  /** 연·월·일은 점으로 남는다 — 두께를 주면 화면이 막대밭이 된다. */
  it("연 이하 정밀도는 점이다", () => {
    expect(precisionWidth(11)).toBe(0);
    expect(precisionWidth(10)).toBe(0);
    expect(precisionWidth(9)).toBe(0);
  });

  it("십년 이상 거칠면 두께를 준다", () => {
    expect(precisionWidth(8)).toBe(10);
    expect(precisionWidth(7)).toBe(100);
    expect(precisionWidth(3)).toBe(1e6);
    expect(precisionWidth(0)).toBe(1e9);
  });

  it("정밀도 코드가 낮아질수록 단조 증가한다", () => {
    const widths = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(precisionWidth);
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]);
    }
  });
});
