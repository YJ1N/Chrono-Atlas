/**
 * Wikidata 시간 리터럴 → TimePoint.
 *
 * ETL 전체에서 가장 조용히 틀릴 수 있는 곳이다. 1년 어긋나도 화면은 멀쩡해
 * 보이고, 아무도 눈치채지 못한 채 데이터가 굳는다. 그래서 순수 함수로
 * 떼어내고 실측 사례로 고정한다.
 *
 * `Date` 를 쓰지 않는다 — 입력이 -538800000년이다 (ADR-001).
 */

import { fromCalendarDate } from "@/engine/time/TimePoint";
import type { TimePoint, TimePrecision } from "@/engine/types/timeline";

/**
 * Wikidata 의 연도 표기는 **천문학적 연도 번호**다 — 우리 TimePoint 와 동일하다.
 *
 * 실측으로 확인했다: 테르모필레 전투(기원전 480년)의 값이 `-0479-08-06` 이다.
 * 즉 -479 = 480 BCE 이며, 이는 `toDisplayYear(-479) → 480 BCE` 와 정확히 맞는다.
 *
 * **오프셋 보정을 넣으면 안 된다.** "BCE 는 1을 빼야지" 라는 직관이 여기서
 * 1년짜리 오차를 만든다. 이 주석은 그 유혹을 막으려고 있다.
 */
const TIME_LITERAL = /^([+-]?)(\d{4,})-(\d{2})-(\d{2})T/;

/**
 * Wikidata `timePrecision` 정수 → 우리 등급.
 *
 * https://www.wikidata.org/wiki/Help:Dates#Precision
 *
 *   0 십억 년 · 1 억 년 · 2 천만 년 · 3 백만 년 · 4 십만 년 · 5 만 년
 *   6 천년 · 7 세기 · 8 십년 · 9 년 · 10 월 · 11 일 · 12~14 시·분·초
 *
 * ── 알려진 손실
 * 0~5 가 전부 `era` 하나로 뭉개진다. `TimePrecision` 에 그보다 거친 등급이
 * 없기 때문이다. 렌더러가 아직 오차 막대를 그리지 않으므로 지금은 무해하지만,
 * 원시 정수는 버리지 않고 리포트에 남긴다 — 손실을 숨기지 않기 위해서다.
 */
const PRECISION_BY_CODE: Record<number, TimePrecision> = {
  0: "era",
  1: "era",
  2: "era",
  3: "era",
  4: "era",
  5: "era",
  6: "millennium",
  7: "century",
  8: "decade",
  9: "year",
  10: "month",
  11: "day",
  12: "exact",
  13: "exact",
  14: "exact",
};

/** 이 등급보다 거칠면 출처가 스스로 근사임을 인정한 것이다. */
const APPROXIMATE_AT_OR_ABOVE: TimePrecision[] = [
  "decade",
  "century",
  "millennium",
  "era",
];

/** 율리우스력 달력 모델. 변환하지 않고 사실만 기록한다 (ADR-005). */
export const JULIAN_CALENDAR = "Q1985786";

export interface ParsedTime {
  time: TimePoint;
  precision: TimePrecision;
  approximate: boolean;
  /** 원시 Wikidata 정밀도 정수. 리포트가 손실 정도를 세는 데 쓴다. */
  rawPrecision: number;
  /** 출처가 율리우스력으로 표기한 값인가. */
  julian: boolean;
}

export interface ParseFailure {
  ok: false;
  reason: "malformed" | "unknown-precision" | "out-of-range";
}

export type ParseResult = ({ ok: true } & ParsedTime) | ParseFailure;

/**
 * 우리가 다루는 시간의 절대 상한. 138억 년보다 오래된 값은 데이터 오류다.
 * (Wikidata 에는 실제로 오타로 들어온 -1e12 같은 값이 존재한다.)
 */
const OLDEST_ALLOWED = -14e9;
const NEWEST_ALLOWED = 2100;

/**
 * `-538800000-01-01T00:00:00Z` / `+1969-07-20T00:00:00Z` 를 TimePoint 로.
 *
 * @param literal `wikibase:timeValue` 가 돌려주는 xsd:dateTime 문자열
 * @param precisionCode `wikibase:timePrecision` 정수
 * @param calendarModel `wikibase:timeCalendarModel` URI 또는 Q-id (선택)
 */
export function parseWikidataTime(
  literal: string,
  precisionCode: number,
  calendarModel?: string,
): ParseResult {
  const match = TIME_LITERAL.exec(literal);
  if (!match) return { ok: false, reason: "malformed" };

  const precision = PRECISION_BY_CODE[precisionCode];
  if (!precision) return { ok: false, reason: "unknown-precision" };

  const [, sign, yearDigits, monthDigits, dayDigits] = match;
  const year = (sign === "-" ? -1 : 1) * Number(yearDigits);

  /**
   * 월·일은 **연 이하 정밀도일 때만** 반영한다.
   *
   * Wikidata 는 정밀도가 거칠어도 자리를 `01-01` 로 채워서 돌려준다. 그 값을
   * 그대로 믿으면 "17세기" 가 "1601년 1월 1일" 이라는 없는 정밀도를 얻는다.
   */
  const useSubYear = precisionCode >= 10;
  // 원시 덤프에는 `00` 이 오기도 한다. 1로 흡수한다.
  const month = useSubYear ? Math.max(1, Number(monthDigits)) : 1;
  const day = precisionCode >= 11 ? Math.max(1, Number(dayDigits)) : 1;

  const time = fromCalendarDate({ year, month, day });

  if (!Number.isFinite(time) || time < OLDEST_ALLOWED || time > NEWEST_ALLOWED) {
    return { ok: false, reason: "out-of-range" };
  }

  return {
    ok: true,
    time,
    precision,
    approximate: APPROXIMATE_AT_OR_ABOVE.includes(precision),
    rawPrecision: precisionCode,
    julian: Boolean(calendarModel?.includes(JULIAN_CALENDAR)),
  };
}

/**
 * 정밀도가 함의하는 구간 폭(연).
 *
 * "17세기의 어느 시점" 을 폭 0 인 점으로 그리면 1601년 1월 1일이라고
 * 주장하게 된다. 거친 정밀도에는 정직한 두께를 준다.
 *
 * ── 왜 연·월 정밀도는 0 인가
 * 두께를 주는 순간 그 항목은 점이 아니라 **구간**이 되고, 구간은 막대로
 * 그려진다. Wikidata 사건 대다수가 연 정밀도이므로 여기에 두께를 주면
 * 화면 전체가 막대밭이 된다. 십년 이상 거칠 때만, 즉 점이라는 주장이
 * 실제로 거짓말이 될 때만 두께를 준다.
 */
export function precisionWidth(precisionCode: number): number {
  const BY_CODE: Record<number, number> = {
    8: 10,
    7: 100,
    6: 1000,
    5: 1e4,
    4: 1e5,
    3: 1e6,
    2: 1e7,
    1: 1e8,
    0: 1e9,
  };
  if (precisionCode >= 9) return 0;
  return BY_CODE[precisionCode] ?? 0;
}
