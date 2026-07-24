import { describe, expect, it } from "vitest";

import {
  MAX_VIEWPORT_SPAN,
  MIN_VIEWPORT_SPAN,
  PRESENT_EPOCH,
  UNIVERSE_START,
  clampSpan,
  clampTimePoint,
  daysInYear,
  formatDuration,
  formatTimePoint,
  fromCalendarDate,
  fromDisplayYear,
  isLeapYear,
  toCalendarDate,
  toDisplayYear,
} from "./TimePoint";

describe("표현 범위 — ADR-001 의 근거", () => {
  it("Date 의 안전 범위를 4자릿수 이상 초과한다", () => {
    const DATE_MAX_YEARS = 271_821;
    expect(Math.abs(UNIVERSE_START)).toBeGreaterThan(DATE_MAX_YEARS * 10_000);
  });

  it("우주 시작점에서도 유한하고 정상적인 수다", () => {
    expect(Number.isFinite(UNIVERSE_START)).toBe(true);
    expect(UNIVERSE_START).toBeLessThan(-13.7e9);
  });

  it("138억 년 지점에서 연 단위 구분이 살아있다", () => {
    // float64 해상도가 이 스케일에서 약 96초이므로 1년은 충분히 구분된다.
    expect(UNIVERSE_START + 1).not.toBe(UNIVERSE_START);
  });

  it("현재 근방에서 하루 단위 구분이 살아있다", () => {
    expect(PRESENT_EPOCH + 1 / 365).not.toBe(PRESENT_EPOCH);
  });
});

describe("천문학적 연도 ↔ BCE/CE", () => {
  it("연도 0 은 기원전 1년이다", () => {
    expect(toDisplayYear(0)).toEqual({ year: 1, era: "BCE" });
  });

  it("카이사르 암살(기원전 44년)은 천문학적 -43 이다", () => {
    expect(toDisplayYear(-43)).toEqual({ year: 44, era: "BCE" });
    expect(fromDisplayYear({ year: 44, era: "BCE" })).toBe(-43);
  });

  it("서기 연도는 그대로다", () => {
    expect(toDisplayYear(1969)).toEqual({ year: 1969, era: "CE" });
    expect(fromDisplayYear({ year: 1969, era: "CE" })).toBe(1969);
  });

  it("연도 내 소수부는 그 해에 속한다", () => {
    // -43.5 는 [-44, -43) 구간, 즉 기원전 45년.
    expect(toDisplayYear(-43.5)).toEqual({ year: 45, era: "BCE" });
    expect(toDisplayYear(1969.99)).toEqual({ year: 1969, era: "CE" });
  });

  it("BCE/CE 경계를 넘어 왕복한다", () => {
    for (let y = -50; y <= 50; y += 1) {
      expect(fromDisplayYear(toDisplayYear(y))).toBe(y);
    }
  });
});

describe("proleptic Gregorian 윤년", () => {
  it("표준 규칙을 따른다", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // 100 의 배수
    expect(isLeapYear(2000)).toBe(true); // 400 의 배수
  });

  it("음수 연도에도 같은 규칙이 적용된다 (천문 표기의 이점)", () => {
    expect(isLeapYear(-4)).toBe(true);
    expect(isLeapYear(-1)).toBe(false);
    expect(daysInYear(-4)).toBe(366);
  });
});

describe("달력 ↔ TimePoint 왕복", () => {
  it("아폴로 11호 착륙일이 정확히 왕복한다", () => {
    const t = fromCalendarDate({ year: 1969, month: 7, day: 20 });
    expect(toCalendarDate(t)).toEqual({ year: 1969, month: 7, day: 20 });
  });

  it("윤일(2월 29일)이 정확히 왕복한다", () => {
    const t = fromCalendarDate({ year: 2024, month: 2, day: 29 });
    expect(toCalendarDate(t)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("평년/윤년 모든 날짜가 왕복한다", () => {
    for (const year of [2023, 2024, -43, 0, -4]) {
      const total = daysInYear(year);
      let checked = 0;
      for (let month = 1; month <= 12; month += 1) {
        const monthLen = [
          31,
          isLeapYear(year) ? 29 : 28,
          31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
        ][month - 1];
        for (let day = 1; day <= monthLen; day += 1) {
          const t = fromCalendarDate({ year, month, day });
          expect(toCalendarDate(t)).toEqual({ year, month, day });
          checked += 1;
        }
      }
      expect(checked).toBe(total);
    }
  });

  it("연중 시간 순서가 단조 증가한다", () => {
    const jan = fromCalendarDate({ year: 1969, month: 1, day: 1 });
    const jul = fromCalendarDate({ year: 1969, month: 7, day: 20 });
    const dec = fromCalendarDate({ year: 1969, month: 12, day: 31 });
    expect(jan).toBeLessThan(jul);
    expect(jul).toBeLessThan(dec);
    expect(dec).toBeLessThan(1970);
  });

  it("월/일 생략 시 그 해의 시작이다", () => {
    expect(fromCalendarDate({ year: 1969 })).toBe(1969);
  });
});

describe("포맷팅 — 스케일에 따라 표기법이 바뀐다", () => {
  it("심원한 시간은 Ga/Ma 로 표기한다", () => {
    expect(formatTimePoint(UNIVERSE_START)).toBe("13.8 Ga");
    expect(formatTimePoint(PRESENT_EPOCH - 65.5e6)).toBe("65.5 Ma");
  });

  it("10만 년 이상은 ka 로 표기한다", () => {
    expect(formatTimePoint(PRESENT_EPOCH - 200_000)).toBe("200 ka");
  });

  it("역사 시대는 BCE/CE 로 표기한다", () => {
    expect(formatTimePoint(-43)).toBe("44 BCE");
    expect(formatTimePoint(1969)).toBe("1,969 CE");
  });

  it("구간 길이를 단위에 맞춰 표기한다", () => {
    expect(formatDuration(13.787e9)).toBe("13.79 Ga");
    expect(formatDuration(500)).toBe("500 yr");
    expect(formatDuration(1 / 365)).toBe("1 d");
  });
});

describe("클램프", () => {
  it("시점을 우주 범위로 제한한다", () => {
    expect(clampTimePoint(-1e12)).toBe(UNIVERSE_START);
    expect(clampTimePoint(9999)).toBe(PRESENT_EPOCH);
    expect(clampTimePoint(1969)).toBe(1969);
  });

  it("뷰포트 폭을 줌 한계로 제한한다", () => {
    expect(clampSpan(1e30)).toBe(MAX_VIEWPORT_SPAN);
    expect(clampSpan(0)).toBe(MIN_VIEWPORT_SPAN);
    expect(clampSpan(-5)).toBe(MIN_VIEWPORT_SPAN);
  });

  it("전체 줌 범위가 약 5e12 배다 (ADR-002 의 전제)", () => {
    expect(MAX_VIEWPORT_SPAN / MIN_VIEWPORT_SPAN).toBeGreaterThan(1e12);
  });
});
