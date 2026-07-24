/**
 * 언어별 위키백과 존재 여부 조사 — 편향 측정과 원문 링크를 **한 번에** 얻는다.
 *
 * ── 왜 본 쿼리에 넣지 않았는가
 * 실측했다. 무제한 집합에 언어별 `OPTIONAL` 조인을 5개 걸었더니 90초를 넘겨
 * 죽었다. 같은 정보를 `VALUES` 로 대상을 한정해 물으니 1.08초에 끝났다.
 * 그래서 선별이 끝난 뒤 배치로 돈다.
 *
 * ── 왜 이것이 선택 사항이 아닌가
 * significance 는 sitelink 수에서 나오고(ADR-009), Phase 2R 부터 그 값이
 * 화면의 세로 위치 그 자체다(ADR-013). 즉 **편향이 제품의 지형이다.**
 * 측정하지 않으면 편향을 주장만 하고 크기를 모르는 상태가 된다.
 */

import { BIAS_BATCH_SIZE, BIAS_LANGUAGES } from "./config";
import { runQuery } from "./sparql";
import type { Candidate } from "./normalize";

export interface LanguagePresence {
  /** qid → 문서가 존재하는 언어 코드 집합. */
  byItem: Map<string, Set<string>>;
  /** qid → 대표 위키백과 문서 URL (한국어 우선, 없으면 영어). */
  articleUrl: Map<string, string>;
}

const SITE_VALUES = BIAS_LANGUAGES.map(
  (l) => `(<https://${l.code}.wikipedia.org/> "${l.code}")`,
).join(" ");

function batchQuery(qids: string[]): string {
  const items = qids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?item ?lang ?article WHERE {
  VALUES ?item { ${items} }
  VALUES (?site ?lang) { ${SITE_VALUES} }
  ?article schema:about ?item ; schema:isPartOf ?site .
}`;
}

const QID = /\/(Q\d+)$/;

export async function fetchLanguagePresence(
  candidates: readonly Candidate[],
  options: { refresh?: boolean } = {},
): Promise<LanguagePresence> {
  const byItem = new Map<string, Set<string>>();
  const articleUrl = new Map<string, string>();
  const koUrl = new Map<string, string>();

  const qids = candidates.map((c) => c.qid);
  const batches = Math.ceil(qids.length / BIAS_BATCH_SIZE);

  for (let i = 0; i < batches; i += 1) {
    const slice = qids.slice(i * BIAS_BATCH_SIZE, (i + 1) * BIAS_BATCH_SIZE);
    const rows = await runQuery(
      `enrich-${String(i).padStart(3, "0")}`,
      batchQuery(slice),
      options,
    );

    for (const row of rows) {
      const qid = QID.exec(row.item?.value ?? "")?.[1];
      const lang = row.lang?.value;
      const url = row.article?.value;
      if (!qid || !lang) continue;

      let set = byItem.get(qid);
      if (!set) {
        set = new Set();
        byItem.set(qid, set);
      }
      set.add(lang);

      // 한국어 문서가 있으면 그쪽을 쓴다. 없을 때만 영어로 떨어진다.
      if (url) {
        if (lang === "ko") koUrl.set(qid, url);
        else if (lang === "en" && !articleUrl.has(qid)) articleUrl.set(qid, url);
      }
    }
  }

  for (const [qid, url] of koUrl) articleUrl.set(qid, url);

  return { byItem, articleUrl };
}

/**
 * 조사 결과를 항목에 반영한다.
 *
 * 본문 텍스트는 Wikidata description(CC0)만 쓰므로 CC BY-SA 의무가 발생하지
 * 않는다. 링크는 독자에게 유용한 위키백과 문서로 건다.
 */
export function applyArticleUrls(
  candidates: Candidate[],
  presence: LanguagePresence,
): void {
  for (const candidate of candidates) {
    const url = presence.articleUrl.get(candidate.qid);
    if (!url) continue;
    candidate.sourceRef = {
      ...candidate.sourceRef,
      url,
      attribution: "Wikidata (CC0) · 원문: Wikipedia",
    };
  }
}
