/**
 * 검증 리포트.
 *
 * ── 왜 이것이 산출물인가
 * 데이터 파이프라인의 기본 실패 양식은 "조용히 성공하는 것" 이다. 절반이
 * 날짜 파싱에 실패해도 화면에는 봉우리가 그려지고, 아무도 모른 채 굳는다.
 * 그래서 통과 여부가 아니라 **분포를 눈으로 보게** 만든다.
 *
 * 특히 언어 편향은 문서 각주가 아니라 수치로 나와야 한다. significance 가
 * Y축이 된 이상(ADR-013) 편향은 제품의 지형 그 자체이기 때문이다.
 */

import { writeFile } from "node:fs/promises";

import { BIAS_LANGUAGES } from "./config";
import { formatTimePoint } from "@/engine/time/TimePoint";
import type { SourceStats } from "./normalize";
import type { LanguagePresence } from "./enrich";
import type { ChunkPlan } from "./chunk";
import type { Scorer } from "./score";
import type { TimelineItem } from "@/engine/types/timeline";

function bar(value: number, max: number, width = 28): string {
  if (max <= 0) return "";
  return "█".repeat(Math.max(0, Math.round((value / max) * width)));
}

function pct(n: number, total: number): string {
  return total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(1)}%`;
}

function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => [...(r[i] ?? "")].length)),
  );
  const line = (r: string[]) =>
    `| ${r.map((c, i) => (c ?? "").padEnd(widths[i])).join(" | ")} |`;
  const sep = `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`;
  return [line(rows[0]), sep, ...rows.slice(1).map(line)].join("\n");
}

export interface ReportInput {
  sourceStats: SourceStats[];
  crossSourceDuplicates: number;
  items: TimelineItem[];
  scorer: Scorer;
  presence: LanguagePresence;
  plan: ChunkPlan;
  failedSources: string[];
}

export function buildReport(input: ReportInput): string {
  const { sourceStats, items, scorer, presence, plan } = input;
  const out: string[] = [];

  const totalRows = sourceStats.reduce((s, x) => s + x.rows, 0);
  const totalAccepted = sourceStats.reduce((s, x) => s + x.accepted, 0);

  out.push("# ETL 검증 리포트");
  out.push("");
  out.push("`npm run etl` 이 생성한다. 손으로 고치지 않는다.");
  out.push("");
  out.push("## 요약");
  out.push("");
  out.push(
    table([
      ["항목", "값"],
      ["수집 행", String(totalRows)],
      ["채택 항목", String(totalAccepted)],
      ["최종 항목 (소스 간 중복 제거 후)", String(items.length)],
      ["overview (번들)", String(plan.overview.length)],
      ["detail 청크", `${plan.chunks.length}개`],
      ["overview 중요도 하한", plan.overviewFloor.toFixed(3)],
    ]),
  );
  out.push("");

  if (input.failedSources.length > 0) {
    out.push("> **실패한 소스가 있다.** 아래 카테고리는 비어 있거나 부족하다.");
    out.push(">");
    for (const f of input.failedSources) out.push(`> - ${f}`);
    out.push("");
  }

  // ── 소스별 수율 ────────────────────────────────────────────
  out.push("## 소스별 수율");
  out.push("");
  out.push(
    table([
      ["소스", "행", "채택", "수율", "중복", "무라벨", "파싱실패", "구간오류"],
      ...sourceStats.map((s) => {
        const parseFail =
          s.drops.malformed + s.drops["unknown-precision"] + s.drops["out-of-range"];
        const spanFail = s.drops["inverted-span"] + s.drops["missing-end"];
        return [
          s.source,
          String(s.rows),
          String(s.accepted),
          pct(s.accepted, s.rows),
          String(s.drops.duplicate),
          String(s.drops["no-label"]),
          String(parseFail),
          String(spanFail),
        ];
      }),
    ]),
  );
  out.push("");
  out.push(
    `소스 간 중복 제거: **${input.crossSourceDuplicates}건** (먼저 선언된 소스가 카테고리를 가져간다)`,
  );
  out.push("");

  // ── 날짜 파싱 ──────────────────────────────────────────────
  const parseFailures = sourceStats.reduce(
    (s, x) =>
      s + x.drops.malformed + x.drops["unknown-precision"] + x.drops["out-of-range"],
    0,
  );
  out.push("## 날짜 파싱");
  out.push("");
  out.push(
    `파싱 실패율: **${pct(parseFailures, totalRows)}** (${parseFailures} / ${totalRows})`,
  );
  out.push("");

  const precisionTotals: Record<number, number> = {};
  for (const s of sourceStats) {
    for (const [code, n] of Object.entries(s.precisionHistogram)) {
      precisionTotals[Number(code)] = (precisionTotals[Number(code)] ?? 0) + n;
    }
  }
  const PRECISION_LABEL: Record<number, string> = {
    0: "십억 년", 1: "억 년", 2: "천만 년", 3: "백만 년", 4: "십만 년",
    5: "만 년", 6: "천년", 7: "세기", 8: "십년", 9: "년", 10: "월",
    11: "일", 12: "시", 13: "분", 14: "초",
  };
  const precMax = Math.max(1, ...Object.values(precisionTotals));
  out.push("원시 정밀도 분포 — 0~5 는 `TimePrecision.era` 하나로 뭉개진다(알려진 손실):");
  out.push("");
  out.push("```");
  for (const code of Object.keys(precisionTotals).map(Number).sort((a, b) => a - b)) {
    const n = precisionTotals[code];
    out.push(
      `${String(code).padStart(2)} ${(PRECISION_LABEL[code] ?? "?").padEnd(7)} ${String(n).padStart(6)} ${bar(n, precMax)}`,
    );
  }
  out.push("```");
  out.push("");

  const julian = sourceStats.reduce((s, x) => s + x.julian, 0);
  out.push(
    `율리우스력 표기: **${julian}건** (${pct(julian, totalAccepted)}). 변환하지 않는다 — ADR-005. 최대 13일의 계통 오차를 가진다.`,
  );
  out.push("");

  // ── significance 분포 ──────────────────────────────────────
  out.push("## significance 분포");
  out.push("");
  out.push(
    `정규화 기준: sitelink **${scorer.anchors.lo.toFixed(1)}** (2백분위) ~ **${scorer.anchors.hi.toFixed(1)}** (98백분위), 로그 스케일 (ADR-009)`,
  );
  out.push("");
  const BUCKETS = 20;
  const hist = new Array<number>(BUCKETS).fill(0);
  for (const item of items) {
    const b = Math.min(BUCKETS - 1, Math.floor(item.significance * BUCKETS));
    hist[b] += 1;
  }
  const histMax = Math.max(1, ...hist);
  out.push("```");
  for (let i = 0; i < BUCKETS; i += 1) {
    const lo = (i / BUCKETS).toFixed(2);
    out.push(
      `${lo}  ${String(hist[i]).padStart(6)} ${bar(hist[i], histMax, 40)}`,
    );
  }
  out.push("```");
  out.push("");
  out.push(
    "이 분포가 좁은 띠로 뭉치면 지형이 평평해지고 Y축이 무의미해진다 (ADR-013).",
  );
  out.push("");

  // ── 언어 편향 ──────────────────────────────────────────────
  out.push("## 언어 편향 — 이 제품의 지형 그 자체");
  out.push("");
  out.push(
    "`significance` 는 sitelink 수에서 나오고, Phase 2R 부터 그 값이 화면의 세로 위치다.",
  );
  out.push("따라서 아래 격차는 문서의 각주가 아니라 **사용자가 보는 산맥의 모양**이다.");
  out.push("");

  const counts = new Map<string, number>();
  for (const langs of presence.byItem.values()) {
    for (const l of langs) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const measured = presence.byItem.size;
  const langMax = Math.max(1, ...counts.values());
  out.push(
    table([
      ["언어", "문서 보유", "비율", ""],
      ...BIAS_LANGUAGES.map((l) => {
        const n = counts.get(l.code) ?? 0;
        return [l.label, String(n), pct(n, measured), bar(n, langMax, 20)];
      }),
    ]),
  );
  out.push("");
  out.push(`측정 대상: ${measured}개 항목`);
  out.push("");

  const groupOf = (code: string) =>
    BIAS_LANGUAGES.find((l) => l.code === code)?.group;
  let westOnly = 0;
  let hasNonWest = 0;
  for (const langs of presence.byItem.values()) {
    const nonWest = [...langs].some((l) => groupOf(l) !== "west");
    if (nonWest) hasNonWest += 1;
    else westOnly += 1;
  }
  out.push(
    `**서구권 언어에만 존재하는 항목: ${westOnly}건 (${pct(westOnly, measured)})** — 비서구권 문서가 하나라도 있는 항목은 ${hasNonWest}건.`,
  );
  out.push("");
  out.push(
    "이 값이 높을수록 지형의 봉우리가 서유럽·북미 쪽으로 기운다. 향후 축을 다른 지표로 재바인딩할 수 있게 설계를 열어 두었다 (ADR-013).",
  );
  out.push("");

  // ── 카테고리·레인 ──────────────────────────────────────────
  out.push("## 카테고리 · 레인");
  out.push("");
  const byCategory = new Map<string, number>();
  const byLane = new Map<string, number>();
  const byLayer = new Map<string, number>();
  for (const item of items) {
    byCategory.set(item.categoryId, (byCategory.get(item.categoryId) ?? 0) + 1);
    byLane.set(item.laneId, (byLane.get(item.laneId) ?? 0) + 1);
    byLayer.set(item.layer, (byLayer.get(item.layer) ?? 0) + 1);
  }
  const catMax = Math.max(1, ...byCategory.values());
  out.push(
    table([
      ["카테고리", "건수", ""],
      ...[...byCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, String(v), bar(v, catMax, 20)]),
    ]),
  );
  out.push("");
  out.push(
    table([
      ["레인", "건수"],
      ...[...byLane.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)]),
    ]),
  );
  out.push("");
  out.push(
    `레이어: primary ${byLayer.get("primary") ?? 0} · context ${byLayer.get("context") ?? 0}`,
  );
  out.push("");

  // ── 시대별 밀도 ────────────────────────────────────────────
  out.push("## 시대별 밀도");
  out.push("");
  out.push("cosmic 티어가 비면 138억 년 뷰의 지형이 평평해진다. 그것이 Phase 3 의 핵심 목표였다.");
  out.push("");
  const EDGES = [
    -14e9, -1e9, -1e8, -1e7, -1e6, -1e5, -1e4, -3000, 0, 1000, 1500, 1800, 1900, 1950, 2030,
  ];
  const densityRows: string[][] = [["구간", "건수", ""]];
  const bandCounts: number[] = [];
  for (let i = 0; i < EDGES.length - 1; i += 1) {
    bandCounts.push(
      items.filter((it) => it.span.start >= EDGES[i] && it.span.start < EDGES[i + 1])
        .length,
    );
  }
  const bandMax = Math.max(1, ...bandCounts);
  for (let i = 0; i < EDGES.length - 1; i += 1) {
    densityRows.push([
      `${formatTimePoint(EDGES[i])} ~ ${formatTimePoint(EDGES[i + 1])}`,
      String(bandCounts[i]),
      bar(bandCounts[i], bandMax, 24),
    ]);
  }
  out.push(table(densityRows));
  out.push("");

  const deepCount = items.filter((it) => it.span.start < -1e6).length;
  out.push(`심원한 시간(100만 년 전 이전) 항목: **${deepCount}건**`);
  out.push("");

  // ── 청크 ───────────────────────────────────────────────────
  out.push("## 청크");
  out.push("");
  out.push(
    table([
      ["id", "건수", "구간", "중요도 대역"],
      ...plan.chunks.map((c) => [
        c.manifest.id,
        String(c.manifest.itemCount),
        `${formatTimePoint(c.manifest.range.start)} ~ ${formatTimePoint(c.manifest.range.end)}`,
        c.manifest.significanceRange
          ? `${c.manifest.significanceRange.min.toFixed(2)}~${c.manifest.significanceRange.max.toFixed(2)}`
          : "-",
      ]),
    ]),
  );
  out.push("");

  return out.join("\n");
}

export async function writeReport(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf8");
}
