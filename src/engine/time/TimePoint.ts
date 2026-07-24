/**
 * TimePoint 커널 — 천문학적 연도 실수와 사람이 읽는 표현 사이의 변환.
 *
 * 이 모듈에는 `Date` 가 등장하지 않는다 (ADR-001, ESLint 로 강제).
 */

import type { TimeDuration, TimePoint, TimePrecision } from "@/engine/types/timeline";

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

/**
 * "몇 년 전" 계산의 기준점.
 *
 * 이 값은 Ga/Ma 급 표시에만 쓰이며, 그 스케일에서 몇 년의 차이는
 * 상대오차 1e-6 미만이므로 매년 갱신할 필요가 없다.
 */
export const PRESENT_EPOCH: TimePoint = 2026;

/** 우주의 시작. 우주 나이 13.787 Ga (Planck 2018) 기준. */
export const UNIVERSE_START: TimePoint = PRESENT_EPOCH - 13.787e9;

/** 뷰포트가 확대할 수 있는 최소 폭(연). 약 1일. */
export const MIN_VIEWPORT_SPAN: TimeDuration = 1 / 365;

/** 뷰포트가 축소할 수 있는 최대 폭(연). 우주 전체 + 여백. */
export const MAX_VIEWPORT_SPAN: TimeDuration = 14e9;

// ─────────────────────────────────────────────────────────────
// 달력 변환 (proleptic Gregorian)
// ─────────────────────────────────────────────────────────────

/**
 * 율리우스력/그레고리력 전환(1582, 영국 1752, 러시아 1918)은 구현하지 않는다.
 * 전 구간을 proleptic Gregorian 으로 통일한다. — DECISIONS.md ADR-005
 *
 * 천문학적 연도 번호를 쓰면 윤년 규칙이 음수 연도에도 그대로 적용된다.
 * (천문학이 이 표기를 쓰는 이유가 바로 이것이다.)
 */
export function isLeapYear(astronomicalYear: number): boolean {
  const y = astronomicalYear;
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

export function daysInYear(astronomicalYear: number): 365 | 366 {
  return isLeapYear(astronomicalYear) ? 366 : 365;
}

const CUMULATIVE_DAYS_COMMON = [
  0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
] as const;

/** 1월 1일을 1로 하는 연중 일차. */
export function dayOfYear(
  astronomicalYear: number,
  month: number,
  day: number,
): number {
  const leapAdjust = month > 2 && isLeapYear(astronomicalYear) ? 1 : 0;
  return CUMULATIVE_DAYS_COMMON[month - 1] + day + leapAdjust;
}

export interface CalendarDate {
  /** 천문학적 연도 번호. 0 = BCE 1. */
  year: number;
  /** 1-12. 생략 시 1월. */
  month?: number;
  /** 1-31. 생략 시 1일. */
  day?: number;
}

/**
 * 달력 날짜 → TimePoint.
 *
 * 소수부는 `(연중 일차 - 1) / 그 해의 일수` 이므로
 * 같은 해 안에서 단조 증가하고 `toCalendarDate` 로 정확히 되돌아온다.
 */
export function fromCalendarDate({ year, month = 1, day = 1 }: CalendarDate): TimePoint {
  const doy = dayOfYear(year, month, day);
  return year + (doy - 1) / daysInYear(year);
}

/** TimePoint → 달력 날짜. `fromCalendarDate` 의 정확한 역함수(일 단위). */
export function toCalendarDate(t: TimePoint): Required<CalendarDate> {
  const year = Math.floor(t);
  const total = daysInYear(year);
  // 부동소수 오차를 흡수하기 위해 반올림한다. 이것이 왕복 정확성을 보장한다.
  let doy = Math.round((t - year) * total) + 1;
  if (doy < 1) doy = 1;
  if (doy > total) doy = total;

  const leap = isLeapYear(year);
  let month = 12;
  for (let m = 0; m < 12; m += 1) {
    const startOfNext =
      CUMULATIVE_DAYS_COMMON[m] + (m + 1 > 2 && leap ? 1 : 0);
    if (doy <= startOfNext) {
      month = m;
      break;
    }
  }
  const monthStart =
    CUMULATIVE_DAYS_COMMON[month - 1] + (month > 2 && leap ? 1 : 0);
  return { year, month, day: doy - monthStart };
}

// ─────────────────────────────────────────────────────────────
// 표시 변환
// ─────────────────────────────────────────────────────────────

export interface DisplayYear {
  /** 항상 양수인 표시용 연도. */
  year: number;
  era: "BCE" | "CE";
}

/**
 * 천문학적 연도 → BCE/CE 표시.
 *
 *    0 → 1 BCE      (연도 0 문제를 여기서 흡수한다)
 *  -43 → 44 BCE
 *    1 → 1 CE
 */
export function toDisplayYear(t: TimePoint): DisplayYear {
  const yearIndex = Math.floor(t);
  return yearIndex >= 1
    ? { year: yearIndex, era: "CE" }
    : { year: 1 - yearIndex, era: "BCE" };
}

/** BCE/CE 표시 → 천문학적 연도. `toDisplayYear` 의 역함수. */
export function fromDisplayYear({ year, era }: DisplayYear): number {
  return era === "CE" ? year : 1 - year;
}

// ─────────────────────────────────────────────────────────────
// 포맷팅
// ─────────────────────────────────────────────────────────────

const GIGA = 1e9;
const MEGA = 1e6;
/** 이 값 이상으로 오래되면 BCE 대신 ka(천년) 표기를 쓴다. */
const KILO_THRESHOLD = 1e5;

function withThousands(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * 사람이 읽는 시점 표기. 스케일에 따라 표기법이 자동으로 바뀐다.
 *
 *   -13.787e9 → "13.8 Ga"
 *   -65.5e6   → "65.5 Ma"
 *   -200000   → "202 ka"
 *   -43       → "44 BCE"
 *   1969      → "1969 CE"
 */
export function formatTimePoint(t: TimePoint): string {
  const yearsAgo = PRESENT_EPOCH - t;

  if (yearsAgo >= GIGA) return `${(yearsAgo / GIGA).toFixed(1)} Ga`;
  if (yearsAgo >= MEGA) return `${(yearsAgo / MEGA).toFixed(1)} Ma`;
  if (yearsAgo >= KILO_THRESHOLD) {
    return `${withThousands(Math.round(yearsAgo / 1e3))} ka`;
  }

  const { year, era } = toDisplayYear(t);
  return `${withThousands(year)} ${era}`;
}

/**
 * 구간 길이 표기. 축 눈금 간격과 상세 패널 양쪽에서 쓴다.
 */
export function formatDuration(years: TimeDuration): string {
  const v = Math.abs(years);
  if (v >= GIGA) return `${(v / GIGA).toFixed(2)} Ga`;
  if (v >= MEGA) return `${(v / MEGA).toFixed(2)} Ma`;
  if (v >= 1e3) return `${withThousands(Math.round(v / 1e3))} ka`;
  if (v >= 1) return `${withThousands(Math.round(v))} yr`;
  const days = v * 365.2425;
  if (days >= 1) return `${Math.round(days)} d`;
  return `${Math.round(days * 24)} h`;
}

// ─────────────────────────────────────────────────────────────
// 정밀도
// ─────────────────────────────────────────────────────────────

/** 정밀도 등급이 함의하는 불확실 구간의 폭(연). 오차 막대 렌더링에 쓴다. */
export const PRECISION_YEARS: Record<TimePrecision, number> = {
  exact: 0,
  day: 1 / 365,
  month: 1 / 12,
  year: 1,
  decade: 10,
  century: 100,
  millennium: 1000,
  era: 10000,
};

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

export function clampTimePoint(
  t: TimePoint,
  min: TimePoint = UNIVERSE_START,
  max: TimePoint = PRESENT_EPOCH,
): TimePoint {
  return Math.min(max, Math.max(min, t));
}

export function clampSpan(span: TimeDuration): TimeDuration {
  return Math.min(MAX_VIEWPORT_SPAN, Math.max(MIN_VIEWPORT_SPAN, span));
}
