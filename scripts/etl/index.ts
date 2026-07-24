/**
 * ETL 오케스트레이션.
 *
 *   SPARQL ──▶ normalize ──▶ score ──▶ enrich ──▶ chunk ──▶ 산출물
 *
 * 빌드타임에 로컬에서 수동 실행하고 산출물을 커밋한다. **런타임 API 는 0개다**
 * (ADR-007).
 *
 *   npm run etl              캐시 사용
 *   npm run etl -- --refresh 전부 새로 받는다
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHUNK_MAX_ITEMS,
  LABEL_LANGUAGES,
  LONG_SPAN_YEARS,
  OVERVIEW_TARGET,
} from "./config";
import { DEEP_TIME, buildDeepTimeCandidates, deepTimeQuery } from "./deep-time";
import { applyArticleUrls, fetchLanguagePresence } from "./enrich";
import { planChunks } from "./chunk";
import { buildReport, writeReport } from "./report";
import { createScorer } from "./score";
import { dedupeAcrossSources, normalizeSource } from "./normalize";
import { runQuery } from "./sparql";
import { SOURCES } from "./queries";
import type { Candidate, SourceStats } from "./normalize";
import type { ChunkManifest, TimelineItem } from "@/engine/types/timeline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 번들에 들어간다 — 타입 검사를 받고 SSR 첫 페인트에 쓰인다. */
const BUNDLED_DIR = join(ROOT, "src", "domains", "history", "data");
/** HTTP 로 지연 로드된다 — 브라우저·CDN 캐시를 탄다. */
const PUBLIC_DIR = join(ROOT, "public", "data", "history");
const PUBLIC_BASE = "/data/history";

const refresh = process.argv.includes("--refresh");

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function collect(): Promise<{
  candidates: Candidate[];
  sourceStats: SourceStats[];
  crossSourceDuplicates: number;
  failedSources: string[];
}> {
  const failedSources: string[] = [];
  const sourceStats: SourceStats[] = [];
  const groups: Candidate[][] = [];

  /**
   * 큐레이션한 심원한 시간을 **먼저** 넣는다.
   *
   * 소스 간 중복 제거는 먼저 온 쪽이 이긴다. K-Pg 대멸종처럼 Wikidata 쿼리에도
   * 잡히는 항목은 손으로 확인한 시간값 쪽이 정확하므로 우선권을 준다.
   */
  log("심원한 시간 (큐레이션 시간값 + Wikidata 라벨·sitelink)");
  try {
    const rows = await runQuery("deep-time", deepTimeQuery(LABEL_LANGUAGES), {
      refresh,
    });
    const { candidates, missing } = buildDeepTimeCandidates(rows);
    groups.push(candidates);
    log(`  ${candidates.length}/${DEEP_TIME.length}건`);
    if (missing.length > 0) {
      // Q-id 가 삭제·병합되면 여기서 드러난다. 조용히 사라지게 두지 않는다.
      const note = `deep-time: Q-id ${missing.join(", ")} 를 찾지 못함`;
      log(`  ⚠ ${note}`);
      failedSources.push(note);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  ✗ ${message}`);
    failedSources.push(message);
  }

  log("\nWikidata 소스");
  for (const source of SOURCES) {
    try {
      const rows = await runQuery(source.name, source.sparql, { refresh });
      const { candidates, stats } = normalizeSource(source, rows);
      groups.push(candidates);
      sourceStats.push(stats);
      log(`  ${source.name}: ${stats.accepted}건 채택 (${rows.length}행)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`  ✗ ${source.name}: ${message}`);
      /**
       * 소스 하나가 죽어도 파이프라인을 멈추지 않는다. 대신 리포트 맨 위에
       * 실패를 적는다 — 조용히 카테고리가 비는 것이 가장 나쁜 결과다.
       */
      failedSources.push(`${source.name}: ${message}`);
    }
  }

  const { candidates, crossSourceDuplicates } = dedupeAcrossSources(groups);
  return { candidates, sourceStats, crossSourceDuplicates, failedSources };
}

async function main(): Promise<void> {
  log("ChronoAtlas ETL\n");

  const { candidates, sourceStats, crossSourceDuplicates, failedSources } =
    await collect();

  if (candidates.length === 0) {
    throw new Error("수집된 항목이 0건이다. 산출물을 덮어쓰지 않고 중단한다.");
  }

  // ── 점수 ──────────────────────────────────────────────────
  log(`\n총 ${candidates.length}건 · significance 산출`);
  const scorer = createScorer(candidates.map((c) => c.sitelinks));

  // ── 보강: 언어 편향 + 원문 링크 ────────────────────────────
  log("\n언어별 위키백과 조사 (편향 측정 + 원문 링크)");
  const presence = await fetchLanguagePresence(candidates, { refresh });
  applyArticleUrls(candidates, presence);

  /**
   * 후보 → 산출물.
   *
   * 필드를 명시적으로 옮긴다. 스프레드로 훑으면 ETL 내부 필드(`qid`,
   * `sitelinks`, `rawPrecision`, `julian`)가 산출물에 새어 들어가고, 커밋된
   * JSON 은 한번 굳으면 되돌리기 번거롭다. 이 경계는 눈에 보여야 한다.
   */
  const items: TimelineItem[] = candidates.map((candidate) => ({
    id: candidate.id,
    span: candidate.span,
    title: candidate.title,
    ...(candidate.summary ? { summary: candidate.summary } : {}),
    significance: scorer(candidate.sitelinks),
    categoryId: candidate.categoryId,
    laneId: candidate.laneId,
    layer: candidate.layer,
    ...(candidate.location ? { location: candidate.location } : {}),
    ...(candidate.sourceRef ? { sourceRef: candidate.sourceRef } : {}),
  }));

  // ── 분할 ──────────────────────────────────────────────────
  const plan = planChunks(items, {
    overviewTarget: OVERVIEW_TARGET,
    chunkMaxItems: CHUNK_MAX_ITEMS,
    longSpanYears: LONG_SPAN_YEARS,
    basePath: PUBLIC_BASE,
    idPrefix: "history",
  });

  // ── 산출 ──────────────────────────────────────────────────
  await mkdir(BUNDLED_DIR, { recursive: true });
  // 항목 수가 줄면 옛 청크가 남는다. 매번 비우고 다시 쓴다.
  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_DIR, { recursive: true });

  await writeFile(
    join(BUNDLED_DIR, "overview.json"),
    `${JSON.stringify(plan.overview, null, 1)}\n`,
    "utf8",
  );

  for (const chunk of plan.chunks) {
    await writeFile(
      join(PUBLIC_DIR, `${chunk.manifest.id}.json`),
      JSON.stringify(chunk.items),
      "utf8",
    );
  }

  const manifest: { chunks: ChunkManifest[]; overviewFloor: number } = {
    chunks: plan.chunks.map((c) => c.manifest),
    overviewFloor: plan.overviewFloor,
  };
  await writeFile(
    join(BUNDLED_DIR, "chunks.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  // ── 리포트 ────────────────────────────────────────────────
  const report = buildReport({
    sourceStats,
    crossSourceDuplicates,
    items,
    scorer,
    presence,
    plan,
    failedSources,
  });
  const reportPath = join(ROOT, "scripts", "etl", "REPORT.md");
  await writeReport(reportPath, report);

  log(`\n산출`);
  log(`  overview   ${plan.overview.length}건 → src/domains/history/data/overview.json`);
  log(`  detail     ${plan.chunks.length}개 청크 → public${PUBLIC_BASE}/`);
  log(`  리포트     scripts/etl/REPORT.md`);
  if (failedSources.length > 0) {
    log(`\n⚠ 실패한 소스 ${failedSources.length}개 — 리포트 맨 위를 볼 것`);
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
