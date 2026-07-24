/**
 * 적응형 시간 눈금 — 138억 년부터 하루까지 하나의 함수로 대응한다.
 *
 * ── 왜 d3-array 의 ticks() 를 쓰지 않는가
 * d3 의 눈금 생성기는 1-2-5 사다리만 안다. 시간축은 그 아래에 달력이 있어서
 * 1/12(월)·1/365(일) 처럼 10의 거듭제곱이 아닌 단위로 내려가야 하고,
 * 라벨도 "1969.4521" 이 아니라 "Jul 1969" 여야 한다.
 * 그래서 1년 이상은 1-2-5 사다리로, 1년 미만은 달력을 직접 걸어서 만든다.
 */

import { PRESENT_EPOCH, daysInYear, fromCalendarDate, isLeapYear } from "./TimePoint";
import { viewportRange } from "./TimeScale";
import type { TimePoint, Viewport } from "@/engine/types/timeline";

export type TickLevel = "major" | "minor";

export interface Tick {
  time: TimePoint;
  label: string;
  level: TickLevel;
}

export interface TickOptions {
  /** 라벨이 붙는 눈금의 목표 간격(px). 라벨 폭보다 넉넉해야 한다. */
  targetSpacingPx?: number;
  /** 렌더 루프를 보호하기 위한 상한. */
  maxTicks?: number;
}

const GIGA = 1e9;
const MEGA = 1e6;
const KILO = 1e3;

const DEFAULT_SPACING_PX = 130;
const DEFAULT_MAX_TICKS = 400;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MONTH_LENGTHS_COMMON = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

// ─────────────────────────────────────────────────────────────
// 스텝 선택
// ─────────────────────────────────────────────────────────────

/** 1-2-5 × 10^k 사다리에서 `raw` 이상인 첫 값. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

/** 스텝 크기에 맞춰 소수 자릿수를 정한다. 라벨이 중복되지 않게 하는 장치다. */
function decimalsFor(step: number, unit: number): number {
  const d = Math.ceil(-Math.log10(step / unit));
  return Math.min(3, Math.max(0, d));
}

function withThousands(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * 연 단위 눈금의 라벨.
 *
 * ── 단위는 시점의 크기가 아니라 **스텝 크기**로 고른다
 * 시점 크기로 고르면 68억 년 전을 촘촘히 확대했을 때 소수 자릿수가 모자라
 * "6.894 Ga" 가 열 번 반복된다. 스텝 기준으로 고르면 그 상황에서 자동으로
 * Ma 나 절대 연도로 내려가므로 라벨이 항상 서로 구별된다.
 *
 * ka 를 쓰지 않는 이유: 20만 년 전을 "200 ka" 로 쓰면 읽기 좋지만,
 * 68억 년 전에서는 "6,893,499 ka" 가 되어 오히려 나빠진다.
 * 그 구간은 절대 연도(BCE)가 더 정직하다.
 */
export function formatTickLabel(t: TimePoint, step: number): string {
  const yearsAgo = PRESENT_EPOCH - t;

  if (step >= 1e8) {
    return `${(yearsAgo / GIGA).toFixed(decimalsFor(step, GIGA))} Ga`;
  }
  if (step >= KILO * 100) {
    return `${withThousands(
      Number((yearsAgo / MEGA).toFixed(decimalsFor(step, MEGA))),
    )} Ma`;
  }

  const yearIndex = Math.round(t);
  return yearIndex >= 1
    ? `${withThousands(yearIndex)} CE`
    : `${withThousands(1 - yearIndex)} BCE`;
}

// ─────────────────────────────────────────────────────────────
// 생성
// ─────────────────────────────────────────────────────────────

function yearTicks(
  start: TimePoint,
  end: TimePoint,
  step: number,
  maxTicks: number,
): Tick[] {
  const ticks: Tick[] = [];
  const firstIndex = Math.ceil(start / step);
  const lastIndex = Math.floor(end / step);

  for (let i = firstIndex; i <= lastIndex && ticks.length < maxTicks; i += 1) {
    // 누적 덧셈(t += step)은 오차가 쌓인다. 항상 인덱스 × 스텝으로 계산한다.
    const time = i * step;
    ticks.push({ time, label: formatTickLabel(time, step), level: "major" });
  }
  return ticks;
}

/** 월 단위 눈금. `monthStep` 은 1, 3, 6 중 하나. */
function monthTicks(
  start: TimePoint,
  end: TimePoint,
  monthStep: number,
  maxTicks: number,
): Tick[] {
  const ticks: Tick[] = [];
  for (
    let year = Math.floor(start);
    year <= Math.floor(end) && ticks.length < maxTicks;
    year += 1
  ) {
    for (let m = 1; m <= 12 && ticks.length < maxTicks; m += monthStep) {
      const time = fromCalendarDate({ year, month: m, day: 1 });
      if (time < start || time > end) continue;
      const yearIndex = year >= 1 ? year : 1 - year;
      const era = year >= 1 ? "" : " BCE";
      ticks.push({
        time,
        label: `${MONTH_NAMES[m - 1]} ${withThousands(yearIndex)}${era}`,
        level: m === 1 ? "major" : "minor",
      });
    }
  }
  return ticks;
}

/** 일 단위 눈금. `dayStep` 은 1, 2, 5, 10 중 하나. */
function dayTicks(
  start: TimePoint,
  end: TimePoint,
  dayStep: number,
  maxTicks: number,
): Tick[] {
  const ticks: Tick[] = [];
  for (
    let year = Math.floor(start);
    year <= Math.floor(end) && ticks.length < maxTicks;
    year += 1
  ) {
    const leap = isLeapYear(year);
    for (let m = 1; m <= 12 && ticks.length < maxTicks; m += 1) {
      const monthLen =
        MONTH_LENGTHS_COMMON[m - 1] + (m === 2 && leap ? 1 : 0);
      for (let d = 1; d <= monthLen && ticks.length < maxTicks; d += dayStep) {
        const time = fromCalendarDate({ year, month: m, day: d });
        if (time < start || time > end) continue;
        ticks.push({
          time,
          label: `${MONTH_NAMES[m - 1]} ${d}`,
          level: d === 1 ? "major" : "minor",
        });
      }
    }
  }
  return ticks;
}

/**
 * 현재 뷰포트에 맞는 눈금 집합.
 *
 * 반환 순서는 시간 오름차순이며, 개수는 `maxTicks` 이하가 보장된다.
 */
export function generateTicks(
  viewport: Viewport,
  width: number,
  options: TickOptions = {},
): Tick[] {
  const {
    targetSpacingPx = DEFAULT_SPACING_PX,
    maxTicks = DEFAULT_MAX_TICKS,
  } = options;

  if (!(width > 0) || !(viewport.span > 0)) return [];

  const { start, end } = viewportRange(viewport);
  const desiredCount = Math.max(2, width / targetSpacingPx);
  const rawStep = viewport.span / desiredCount;

  if (rawStep >= 1) {
    return yearTicks(start, end, niceStep(rawStep), maxTicks);
  }

  // 1년 미만 — 달력으로 내려간다.
  const approxDays = rawStep * daysInYear(Math.floor(viewport.center));

  if (approxDays > 45) {
    const monthStep = approxDays > 135 ? 6 : 3;
    return monthTicks(start, end, monthStep, maxTicks);
  }
  if (approxDays > 20) return monthTicks(start, end, 1, maxTicks);

  const dayStep = approxDays > 7 ? 10 : approxDays > 3 ? 5 : approxDays > 1.5 ? 2 : 1;
  return dayTicks(start, end, dayStep, maxTicks);
}
