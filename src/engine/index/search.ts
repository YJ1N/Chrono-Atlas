/**
 * 제목 검색 — 도메인 무관.
 *
 * ── 왜 검색 색인이 따로 필요한가
 * 첫 페인트에 번들로 오는 것은 상위 중요도 항목뿐이고(ADR-015), 나머지
 * 수천 건은 청크에 들어 있다. 그런데 검색은 **아직 받지 않은 것도** 찾아야
 * 한다 — "임진왜란" 을 쳤는데 그 청크를 안 받았다는 이유로 없다고 답하면
 * 검색이 아니다.
 *
 * 그래서 전 항목의 최소 레코드만 담은 별도 색인을 만들고, 검색창을 처음 열
 * 때 한 번 받는다. 레코드에 **어느 청크에 있는지**를 함께 담아, 선택 시
 * 그 청크만 받아 정확히 집어낼 수 있게 한다.
 *
 * ── 왜 역색인이나 트라이가 아닌가
 * 항목이 수천~수만 건이다. 선형 훑기는 키 입력당 1ms 미만이고, 역색인은
 * 한국어 부분 문자열 검색에서 오히려 까다롭다(형태소 경계가 없다).
 * 실제로 느려지면 그때 바꾼다.
 */

/**
 * 검색 레코드 — 배열로 둔다.
 *
 * 객체로 두면 키 이름이 항목마다 반복되어 파일이 1.5배 커진다. 이 파일은
 * 전 항목을 담으므로 그 차이가 실제로 유의미하다.
 */
export type SearchRecord = readonly [
  id: string,
  title: string,
  start: number,
  significance: number,
  /** null 이면 overview(번들)에 있다. */
  chunkId: string | null,
];

export interface SearchHit {
  id: string;
  title: string;
  start: number;
  significance: number;
  chunkId: string | null;
}

/** 제목 앞머리에서 일치 — 가장 강한 신호. */
const SCORE_PREFIX = 1;
/** 단어 경계에서 일치. */
const SCORE_WORD = 0.7;
/** 어딘가에서 일치. */
const SCORE_CONTAINS = 0.4;

/**
 * 중요도의 가중치.
 *
 * 1 에 가까우면 유명한 것만 위로 올라와 정확히 친 제목이 묻힌다.
 * 0 이면 "전투" 검색에 아무도 모르는 전투가 먼저 나온다.
 * 일치 강도가 주(主), 중요도가 부(副)여야 한다.
 */
const SIGNIFICANCE_WEIGHT = 0.55;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFC").trim();
}

/** 단어 경계 뒤에서 시작하는 일치인가. */
function matchesWordStart(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    if (at === 0) return true;
    if (/[\s·,.()[\]{}·–—-]/.test(haystack[at - 1])) return true;
    from = at + 1;
  }
}

function matchScore(title: string, query: string): number {
  if (title.startsWith(query)) return SCORE_PREFIX;
  if (matchesWordStart(title, query)) return SCORE_WORD;
  if (title.includes(query)) return SCORE_CONTAINS;
  return 0;
}

/**
 * 검색.
 *
 * 빈 질의는 실패가 아니라 **가장 중요한 것들**을 돌려준다. 검색창을 열자마자
 * 빈 화면을 보여주면 무엇을 칠 수 있는지 알 수 없다.
 */
export function searchItems(
  records: readonly SearchRecord[],
  rawQuery: string,
  limit = 20,
): SearchHit[] {
  const query = normalize(rawQuery);

  const toHit = (r: SearchRecord): SearchHit => ({
    id: r[0],
    title: r[1],
    start: r[2],
    significance: r[3],
    chunkId: r[4],
  });

  if (query === "") {
    return [...records]
      .sort((a, b) => b[3] - a[3] || (a[0] < b[0] ? -1 : 1))
      .slice(0, limit)
      .map(toHit);
  }

  const scored: { record: SearchRecord; score: number }[] = [];

  for (const record of records) {
    const base = matchScore(normalize(record[1]), query);
    if (base === 0) continue;
    scored.push({ record, score: base + record[3] * SIGNIFICANCE_WEIGHT });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      // 동점은 id 로 갈라 같은 질의가 항상 같은 순서를 내게 한다.
      (a.record[0] < b.record[0] ? -1 : 1),
  );

  return scored.slice(0, limit).map((entry) => toHit(entry.record));
}
