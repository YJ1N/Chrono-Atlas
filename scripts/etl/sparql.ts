/**
 * WDQS 클라이언트 — 디스크 캐시 + 재시도.
 *
 * ── 왜 캐시가 필수인가
 * ETL 은 반드시 여러 번 돌린다. 정규화 규칙을 고칠 때마다 공용 엔드포인트를
 * 다시 두들기는 것은 남의 자원을 낭비하는 것이고, 개발 루프도 느려진다.
 * 원본 응답을 그대로 저장해 두면 이후 단계는 네트워크 없이 반복 실행된다.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUEST_DELAY_MS,
  SPARQL_ENDPOINT,
  USER_AGENT,
} from "./config";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(HERE, ".cache");

/** SPARQL JSON 결과의 한 행. 값은 전부 문자열로 온다. */
export type Binding = Record<string, { value: string; type: string }>;

interface SparqlResponse {
  results: { bindings: Binding[] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429/5xx 는 재시도, 4xx 는 즉시 실패. 쿼리 오류를 재시도해봐야 같은 답이다. */
const MAX_ATTEMPTS = 4;

async function readCache(file: string): Promise<Binding[] | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Binding[];
  } catch {
    return null;
  }
}

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = lastRequestAt + REQUEST_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export interface QueryOptions {
  /** true 면 캐시를 무시하고 새로 받는다. */
  refresh?: boolean;
}

/**
 * 쿼리 하나를 실행하고 바인딩 배열을 돌려준다.
 *
 * @param name 캐시 파일 이름이자 로그에 찍히는 식별자
 */
export async function runQuery(
  name: string,
  sparql: string,
  options: QueryOptions = {},
): Promise<Binding[]> {
  const file = join(CACHE_DIR, `${name}.json`);

  if (!options.refresh) {
    const cached = await readCache(file);
    if (cached) {
      process.stdout.write(`  ${name}: 캐시 ${cached.length}행\n`);
      return cached;
    }
  }

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await throttle();

    try {
      const response = await fetch(SPARQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/sparql-results+json",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ query: sparql }),
        signal: AbortSignal.timeout(90_000),
      });

      if (response.ok) {
        const json = (await response.json()) as SparqlResponse;
        const bindings = json.results.bindings;
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(file, JSON.stringify(bindings), "utf8");
        process.stdout.write(`  ${name}: 수집 ${bindings.length}행\n`);
        return bindings;
      }

      lastError = `HTTP ${response.status}`;
      // 쿼리 자체가 틀렸으면 몇 번을 보내도 같은 답이다.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < MAX_ATTEMPTS) {
      const backoff = 2000 * 2 ** (attempt - 1);
      process.stdout.write(
        `  ${name}: ${lastError} — ${backoff}ms 후 재시도 (${attempt}/${MAX_ATTEMPTS})\n`,
      );
      await sleep(backoff);
    }
  }

  /**
   * 실패를 예외로 올리지 않고 빈 배열로 삼키지 않는다 — 그러면 조용히
   * 항목이 사라진 채 파이프라인이 "성공" 한다. 호출자가 리포트에 세도록
   * 실패 사실을 던진다.
   */
  throw new Error(`쿼리 실패 [${name}]: ${lastError}`);
}
