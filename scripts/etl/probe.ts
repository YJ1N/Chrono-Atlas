/**
 * 쿼리 건전성 점검 — 각 소스가 60초 제한을 통과하고 실제로 행을 돌려주는지.
 *
 * 정규화 규칙을 다듬기 전에 이걸 먼저 돌린다. 쿼리가 죽는데 파서를 고치고
 * 있으면 시간을 통째로 버린다. 결과는 캐시에 남아 본 실행에서 재사용된다.
 */

import { runQuery } from "./sparql";
import { SOURCES } from "./queries";

const refresh = process.argv.includes("--refresh");

async function main(): Promise<void> {
  const failures: string[] = [];

  for (const source of SOURCES) {
    const started = Date.now();
    try {
      const rows = await runQuery(source.name, source.sparql, { refresh });
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      const unique = new Set(rows.map((r) => r.item?.value)).size;
      const status = rows.length === 0 ? "빈 결과" : `${unique}개 항목`;
      process.stdout.write(
        `${rows.length === 0 ? "✗" : "✓"} ${source.name.padEnd(22)} ${String(rows.length).padStart(5)}행 · ${status} · ${elapsed}s\n`,
      );
      if (rows.length === 0) failures.push(`${source.name}: 빈 결과`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`✗ ${source.name.padEnd(22)} ${message}\n`);
      failures.push(message);
    }
  }

  process.stdout.write(
    `\n${SOURCES.length - failures.length}/${SOURCES.length} 소스 정상\n`,
  );
  if (failures.length > 0) {
    process.stdout.write(`실패:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

void main();
