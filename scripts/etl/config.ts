/**
 * ETL 튜너블 — 이 파일만 고치면 산출물 규모와 형태가 바뀐다.
 *
 * 값이 코드 여기저기 흩어지면 "왜 8000건인가" 를 나중에 아무도 답하지 못한다.
 */

/** Wikidata Query Service. 익명 요청은 초당 ~1회, 쿼리당 60초 제한. */
export const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/**
 * WDQS 는 User-Agent 로 클라이언트를 식별한다. 연락처 없는 UA 는 차단 대상이다.
 * https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy
 */
export const USER_AGENT =
  "ChronoAtlas/0.1 (https://github.com/chronoatlas; portfolio project) node-fetch";

/** 쿼리 사이 대기(ms). 공용 엔드포인트에 예의를 지킨다. */
export const REQUEST_DELAY_MS = 1200;

/** 쿼리당 최대 수집 건수. 카테고리 편중을 막기 위해 쿼리 단위로 자른다. */
export const LIMIT_PER_QUERY = 1200;

/**
 * 번들에 들어가는 overview 의 목표 크기.
 *
 * 첫 페인트에 지형이 이미 있어야 하고(빈 화면 금지), 동시에 번들이
 * 무거워지면 안 된다. 화면에 동시에 그려지는 봉우리 상한이 300개이므로
 * (Atlas 의 maxItems), 그 두 배 남짓이면 어느 뷰포트에서도 부족하지 않다.
 */
export const OVERVIEW_TARGET = 700;

/** detail 청크 하나의 최대 항목 수. 네트워크 왕복당 payload 를 묶는 단위. */
export const CHUNK_MAX_ITEMS = 900;

/**
 * 이보다 긴 구간의 항목은 청크에 넣지 않고 번들로 올린다.
 *
 * 청크는 시작 시각으로 자르므로 긴 구간 하나가 청크의 끝 범위를 통째로
 * 늘리고, 그러면 범위 기반 로딩이 무뎌진다. 실측상 전체의 1% 남짓이다.
 */
export const LONG_SPAN_YEARS = 100;

/**
 * 편향 측정에 쓸 위키백과 언어판.
 *
 * "서구 중심" 을 주장하려면 서구 바깥을 실제로 세어야 한다. 화자 수가 많은데
 * 위키백과 규모는 작은 언어(hi, sw, bn)를 일부러 포함했다 — 그래야 격차가 보인다.
 */
export const BIAS_LANGUAGES = [
  { code: "en", label: "영어", group: "west" },
  { code: "de", label: "독일어", group: "west" },
  { code: "fr", label: "프랑스어", group: "west" },
  { code: "es", label: "스페인어", group: "west" },
  { code: "ru", label: "러시아어", group: "west" },
  { code: "ja", label: "일본어", group: "east" },
  { code: "zh", label: "중국어", group: "east" },
  { code: "ko", label: "한국어", group: "east" },
  { code: "ar", label: "아랍어", group: "other" },
  { code: "hi", label: "힌디어", group: "other" },
  { code: "bn", label: "벵골어", group: "other" },
  { code: "sw", label: "스와힐리어", group: "other" },
] as const;

/** VALUES 배치 크기. 90초 타임아웃을 피하면서 왕복 수를 줄이는 절충점. */
export const BIAS_BATCH_SIZE = 400;

/** 라벨 우선순위. 한국어가 없으면 영어로 떨어진다. */
export const LABEL_LANGUAGES = "ko,en";
