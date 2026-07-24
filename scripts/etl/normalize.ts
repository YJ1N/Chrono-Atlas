/**
 * SPARQL 바인딩 → TimelineItem 후보.
 *
 * significance 는 여기서 채우지 않는다. 그 값은 **전체 집합**을 봐야
 * 정할 수 있기 때문이다(전역 정규화, score.ts). 여기서는 sitelink 원본
 * 수치만 들고 다닌다.
 */

import { parseWikidataTime, precisionWidth } from "./wikitime";
import { PRESENT_EPOCH } from "@/engine/time/TimePoint";
import type { Binding } from "./sparql";
import type { QuerySource } from "./queries";
import type { TimelineItem } from "@/engine/types/timeline";

/** significance 이전 단계의 항목. */
export type Candidate = Omit<TimelineItem, "significance"> & {
  qid: string;
  sitelinks: number;
  /** 원시 Wikidata 정밀도. 리포트가 손실 정도를 센다. */
  rawPrecision: number;
  julian: boolean;
};

export type DropReason =
  | "malformed"
  | "unknown-precision"
  | "out-of-range"
  | "no-label"
  | "inverted-span"
  | "missing-end"
  | "duplicate";

export interface SourceStats {
  source: string;
  rows: number;
  accepted: number;
  drops: Record<DropReason, number>;
  julian: number;
  precisionHistogram: Record<number, number>;
}

function emptyDrops(): Record<DropReason, number> {
  return {
    malformed: 0,
    "unknown-precision": 0,
    "out-of-range": 0,
    "no-label": 0,
    "inverted-span": 0,
    "missing-end": 0,
    duplicate: 0,
  };
}

const QID = /\/(Q\d+)$/;

/**
 * 라벨이 없는 항목은 Wikidata 가 Q-id 를 그대로 라벨로 돌려준다.
 * "Q1339" 라고 적힌 봉우리는 정보가 아니라 잡음이므로 버린다.
 */
const BARE_QID = /^Q\d+$/;

function toSpan(
  binding: Binding,
): { start: number; end: number; precision: TimelineItem["span"]["precision"]; approximate: boolean; rawPrecision: number; julian: boolean } | DropReason {
  const start = parseWikidataTime(
    binding.t.value,
    Number(binding.prec.value),
    binding.cal?.value,
  );
  if (!start.ok) return start.reason;

  const isInterval = binding.t2 !== undefined;

  if (!isInterval) {
    /**
     * 거친 정밀도의 점 사건에는 정밀도가 함의하는 두께를 준다.
     * "17세기" 를 폭 0 으로 그리면 1601년 1월 1일이라고 주장하게 된다.
     *
     * ── 두께는 현재를 넘지 않는다
     * Wikidata 규약상 거친 값은 구간의 **시작**을 가리키므로 두께를 앞으로
     * 붙인다. 그런데 출처 데이터가 부정확하면 그 두께가 미래로 삐져나간다.
     * 실측: 12,600 BCE 의 유적이 십만 년 정밀도로 기록되어 있어 끝이
     * 87,400 CE 가 됐다. 과거의 사건이 미래까지 뻗는 막대가 되는 것은
     * 어떤 경우에도 옳지 않으므로 현재에서 자른다.
     */
    const width = precisionWidth(start.rawPrecision);
    const end =
      start.time < PRESENT_EPOCH
        ? Math.min(start.time + width, PRESENT_EPOCH)
        : start.time + width;
    return {
      start: start.time,
      end,
      precision: start.precision,
      approximate: start.approximate,
      rawPrecision: start.rawPrecision,
      julian: start.julian,
    };
  }

  const end = parseWikidataTime(binding.t2.value, Number(binding.prec2.value));
  if (!end.ok) return "missing-end";

  // 끝이 시작보다 앞서는 데이터가 실제로 존재한다. 조용히 뒤집지 않고 버린다.
  if (end.time < start.time) return "inverted-span";

  return {
    start: start.time,
    end: end.time,
    // 구간의 정밀도는 둘 중 거친 쪽이 지배한다.
    precision:
      start.rawPrecision <= end.rawPrecision ? start.precision : end.precision,
    approximate: start.approximate || end.approximate,
    rawPrecision: Math.min(start.rawPrecision, end.rawPrecision),
    julian: start.julian,
  };
}

export function normalizeSource(
  source: QuerySource,
  rows: Binding[],
): { candidates: Candidate[]; stats: SourceStats } {
  const drops = emptyDrops();
  const precisionHistogram: Record<number, number> = {};
  let julian = 0;

  /**
   * 같은 항목이 여러 행으로 온다 — 정밀도가 다른 주장이 병존하기 때문이다.
   * (실측: 테르모필레 전투가 일 정밀도와 월 정밀도로 두 번 나왔다.)
   * 순진하게 받으면 같은 사건이 두 번 그려지고 밀도가 부풀려진다.
   */
  const best = new Map<string, { candidate: Candidate; rawPrecision: number }>();

  for (const row of rows) {
    const qid = QID.exec(row.item?.value ?? "")?.[1];
    if (!qid) {
      drops.malformed += 1;
      continue;
    }

    const label = row.itemLabel?.value?.trim();
    if (!label || BARE_QID.test(label)) {
      drops["no-label"] += 1;
      continue;
    }

    const span = toSpan(row);
    if (typeof span === "string") {
      drops[span] += 1;
      continue;
    }

    const sitelinks = Number(row.sitelinks?.value ?? 0);
    const description = row.itemDescription?.value?.trim();

    const candidate: Candidate = {
      id: `wd-${qid}`,
      qid,
      sitelinks,
      rawPrecision: span.rawPrecision,
      julian: span.julian,
      span: {
        start: span.start,
        end: span.end,
        precision: span.precision,
        ...(span.approximate ? { approximate: true } : {}),
      },
      title: label,
      ...(description && !BARE_QID.test(description) ? { summary: description } : {}),
      categoryId: source.categoryId,
      laneId: source.laneId,
      layer: source.layer,
      sourceRef: {
        externalId: qid,
        provider: "wikidata",
        url: `https://www.wikidata.org/wiki/${qid}`,
      },
    };

    const existing = best.get(qid);
    if (existing) {
      drops.duplicate += 1;
      // 더 정밀한 주장을 남긴다.
      if (span.rawPrecision > existing.rawPrecision) {
        best.set(qid, { candidate, rawPrecision: span.rawPrecision });
      }
      continue;
    }

    best.set(qid, { candidate, rawPrecision: span.rawPrecision });
    precisionHistogram[span.rawPrecision] =
      (precisionHistogram[span.rawPrecision] ?? 0) + 1;
    if (span.julian) julian += 1;
  }

  const candidates = [...best.values()].map((entry) => entry.candidate);

  return {
    candidates,
    stats: {
      source: source.name,
      rows: rows.length,
      accepted: candidates.length,
      drops,
      julian,
      precisionHistogram,
    },
  };
}

/**
 * 소스 간 중복 제거.
 *
 * 같은 항목이 두 쿼리에 잡히는 일이 흔하다(전쟁이자 무력분쟁인 것 등).
 * **먼저 선언된 소스가 이긴다** — `SOURCES` 배열의 순서가 곧 카테고리
 * 우선순위이며, 그래서 그 배열의 순서에 의미가 있다.
 */
export function dedupeAcrossSources(groups: Candidate[][]): {
  candidates: Candidate[];
  crossSourceDuplicates: number;
} {
  const seen = new Map<string, Candidate>();
  let crossSourceDuplicates = 0;

  for (const group of groups) {
    for (const candidate of group) {
      if (seen.has(candidate.qid)) {
        crossSourceDuplicates += 1;
        continue;
      }
      seen.set(candidate.qid, candidate);
    }
  }

  return { candidates: [...seen.values()], crossSourceDuplicates };
}
