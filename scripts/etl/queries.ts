/**
 * 수집 소스 정의.
 *
 * ── 카테고리를 사후에 분류하지 않는 이유
 * 수집한 뒤 `P31` 값을 보고 카테고리를 역추론하려면, 수천 개의 클래스를
 * 일곱 개 통으로 매핑하는 표를 사람이 유지해야 한다. 그 표는 반드시 낡는다.
 *
 * 대신 **어느 쿼리가 뽑았는가**로 정한다. "전투를 묻는 쿼리가 가져온 것은
 * 전투다" 는 영원히 참이고, 새 카테고리 추가는 이 배열에 항목 하나를
 * 더하는 것으로 끝난다.
 *
 * 이 파일의 Q-id 와 P-id 는 전부 실제 조회로 존재를 확인한 것이다.
 * (Q55921 은 '몰리나라'라는 포도 품종이었다 — 추측했으면 카테고리 하나가
 * 통째로 비어 있었을 것이다.)
 */

import { LABEL_LANGUAGES, LIMIT_PER_QUERY } from "./config";
import type { ItemLayer } from "@/engine/types/timeline";

export interface QuerySource {
  /** 캐시 파일 이름. */
  name: string;
  laneId: string;
  categoryId: string;
  layer: ItemLayer;
  sparql: string;
}

interface ShapeOptions {
  /** `wd:` 접두어 없는 클래스 Q-id 목록. */
  classes: string[];
  /**
   * 하위 클래스까지 훑을지 여부.
   *
   * 넓은 클래스(주권국 등)에서 `P279*` 를 켜면 트리가 폭발해 60초 제한에
   * 걸린다. 좁고 깊은 분류(전투 등)에서만 켠다.
   */
  descend?: boolean;
  /**
   * 이 미만의 sitelink 는 아예 가져오지 않는다.
   *
   * 성능 대책인 동시에 품질 대책이다. sitelink 가 2개인 항목은 significance
   * 하위에 깔려 어차피 보이지 않으면서 파일 크기만 차지한다.
   */
  minSitelinks: number;
  limit?: number;
}

const LABEL_SERVICE = `SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABEL_LANGUAGES}". }`;

function classPattern({ classes, descend }: ShapeOptions): string {
  const values = classes.map((q) => `wd:${q}`).join(" ");
  const path = descend ? "wdt:P31/wdt:P279*" : "wdt:P31";
  return `VALUES ?class { ${values} }\n  ?item ${path} ?class .`;
}

/**
 * 시점 사건 — `P585`(point in time) 또는 `P575`(time of discovery or invention).
 *
 * `wikibase:BestRank` 로 거른다. 이것이 없으면 한 항목의 폐기된 옛 주장까지
 * 같이 딸려와 같은 사건이 여러 번 그려진다.
 */
function pointQuery(options: ShapeOptions & { timeProp: string }): string {
  const { timeProp, minSitelinks, limit = LIMIT_PER_QUERY } = options;
  return `SELECT ?item ?itemLabel ?itemDescription ?t ?prec ?cal ?sitelinks WHERE {
  ${classPattern(options)}
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  ?item p:${timeProp} ?st .
  ?st a wikibase:BestRank ;
      psv:${timeProp} ?tv .
  ?tv wikibase:timeValue ?t ;
      wikibase:timePrecision ?prec ;
      wikibase:timeCalendarModel ?cal .
  ${LABEL_SERVICE}
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}`;
}

/** 구간 — 시작·끝이 모두 있어야 한다. 끝이 없으면 막대를 그릴 수 없다. */
function intervalQuery(
  options: ShapeOptions & { startProp: string; endProp: string },
): string {
  const { startProp, endProp, minSitelinks, limit = LIMIT_PER_QUERY } = options;
  return `SELECT ?item ?itemLabel ?itemDescription ?t ?prec ?cal ?t2 ?prec2 ?sitelinks WHERE {
  ${classPattern(options)}
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${minSitelinks})
  ?item p:${startProp} ?st .
  ?st a wikibase:BestRank ;
      psv:${startProp} ?tv .
  ?tv wikibase:timeValue ?t ;
      wikibase:timePrecision ?prec ;
      wikibase:timeCalendarModel ?cal .
  ?item p:${endProp} ?se .
  ?se a wikibase:BestRank ;
      psv:${endProp} ?tv2 .
  ?tv2 wikibase:timeValue ?t2 ;
       wikibase:timePrecision ?prec2 .
  ${LABEL_SERVICE}
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}`;
}

/**
 * ── 카테고리 균형에 대한 판단
 * 영화·앨범·선거처럼 20세기 이후에만 존재하는 분류를 넣으면 최근 100년에
 * 항목이 쏠려 지형이 오른쪽 끝의 벽 하나가 된다. 사실이긴 하지만 탐험할
 * 것이 없어진다. 전 구간에 걸쳐 존재하는 분류를 우선했다.
 */
export const SOURCES: QuerySource[] = [
  // ── 우주 · 지구 ─────────────────────────────────────────────
  {
    name: "geological-periods",
    laneId: "cosmos",
    categoryId: "geology",
    layer: "context",
    sparql: intervalQuery({
      classes: ["Q392928", "Q754897", "Q630830"], // 기 · 세 · 대
      minSitelinks: 5,
      startProp: "P580",
      endProp: "P582",
      limit: 400,
    }),
  },
  {
    name: "earthquakes",
    laneId: "cosmos",
    categoryId: "geology",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q7944"],
      minSitelinks: 7,
      timeProp: "P585",
      limit: 500,
    }),
  },
  {
    name: "volcanic-eruptions",
    laneId: "cosmos",
    categoryId: "geology",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q7692360"],
      minSitelinks: 4,
      timeProp: "P585",
      limit: 400,
    }),
  },

  // ── 생명 ────────────────────────────────────────────────────
  {
    name: "extinction-events",
    laneId: "life",
    categoryId: "biology",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q55814"],
      descend: true,
      minSitelinks: 3,
      timeProp: "P585",
      limit: 200,
    }),
  },

  // ── 문명 · 정치 ─────────────────────────────────────────────
  {
    name: "battles",
    laneId: "civilization",
    categoryId: "conflict",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q178561"],
      descend: true,
      minSitelinks: 7,
      timeProp: "P585",
      limit: 2200,
    }),
  },
  {
    name: "wars",
    laneId: "civilization",
    categoryId: "conflict",
    layer: "primary",
    sparql: intervalQuery({
      classes: ["Q198", "Q350604"],
      descend: true,
      minSitelinks: 15,
      startProp: "P580",
      endProp: "P582",
      // limit 1400 으로 올렸더니 HTTP 504 가 났다. 구간 쿼리는 시작·끝
      // 주장의 곱집합을 만든 뒤 정렬하므로 시점 쿼리보다 훨씬 비싸다.
      limit: 800,
    }),
  },
  {
    name: "treaties",
    laneId: "civilization",
    categoryId: "civilization",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q131569"],
      descend: true,
      minSitelinks: 6,
      timeProp: "P585",
      limit: 1000,
    }),
  },
  {
    name: "dynasties",
    laneId: "civilization",
    categoryId: "civilization",
    layer: "context",
    sparql: intervalQuery({
      classes: ["Q164950"],
      descend: true,
      minSitelinks: 4,
      startProp: "P580",
      endProp: "P582",
      limit: 300,
    }),
  },
  {
    name: "states-founded",
    laneId: "civilization",
    categoryId: "civilization",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q3624078"],
      minSitelinks: 14,
      timeProp: "P571",
      limit: 1000,
    }),
  },
  {
    name: "epidemics",
    laneId: "civilization",
    categoryId: "civilization",
    layer: "primary",
    sparql: intervalQuery({
      classes: ["Q3241045"],
      descend: true,
      minSitelinks: 8,
      startProp: "P580",
      endProp: "P582",
      limit: 300,
    }),
  },
  {
    name: "archaeological-sites",
    laneId: "civilization",
    categoryId: "civilization",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q839954"],
      minSitelinks: 9,
      timeProp: "P571",
      limit: 500,
    }),
  },

  // ── 과학 · 기술 ─────────────────────────────────────────────
  {
    name: "discoveries",
    laneId: "science",
    categoryId: "science",
    layer: "primary",
    // 클래스가 아니라 **속성**으로 잡는다. "발견·발명된 것" 은 클래스가
    // 아니라 사건의 성질이므로, P575 를 가진 모든 항목이 곧 그 집합이다.
    //
    // 클래스 제한이 없어 스캔 범위가 넓다. sitelinks>=11 · LIMIT 1500 으로
    // 넓혔더니 HTTP 502 가 났다. 15/900 이 실측으로 통과한 값이다.
    sparql: `SELECT ?item ?itemLabel ?itemDescription ?t ?prec ?cal ?sitelinks WHERE {
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= 15)
  ?item p:P575 ?st .
  ?st a wikibase:BestRank ;
      psv:P575 ?tv .
  ?tv wikibase:timeValue ?t ;
      wikibase:timePrecision ?prec ;
      wikibase:timeCalendarModel ?cal .
  ${LABEL_SERVICE}
}
ORDER BY DESC(?sitelinks)
LIMIT 900`,
  },
  {
    name: "spaceflights",
    laneId: "science",
    categoryId: "science",
    layer: "primary",
    // 우주비행은 P585(시점)가 아니라 P619(발사일)를 쓴다.
    // P585 로 물었을 때 2행만 나온 것이 그 증거였다.
    sparql: pointQuery({
      classes: ["Q5916"],
      descend: true,
      minSitelinks: 10,
      timeProp: "P619",
      limit: 600,
    }),
  },

  // ── 문화 · 예술 ─────────────────────────────────────────────
  {
    name: "paintings",
    laneId: "culture",
    categoryId: "culture",
    layer: "primary",
    sparql: pointQuery({
      classes: ["Q3305213"],
      // 13 으로 낮췄더니 HTTP 504. 20 이 실측으로 통과한 값이다.
      minSitelinks: 20,
      timeProp: "P571",
      limit: 600,
    }),
  },
  {
    name: "literary-works",
    laneId: "culture",
    categoryId: "culture",
    layer: "primary",
    // 소설·희곡은 P571(설립)이 아니라 P577(출판일)을 쓴다.
    // P571 로 물었을 때 3행만 나온 것이 그 증거였다.
    sparql: pointQuery({
      classes: ["Q7725634"],
      descend: true,
      minSitelinks: 18,
      timeProp: "P577",
      // 18/600 조합을 실측했다(600행·25초). 늘리지 않는다.
      limit: 600,
    }),
  },
  {
    name: "monuments",
    laneId: "culture",
    categoryId: "culture",
    layer: "primary",
    // Q41176(건물)은 인스턴스가 수백만이라 스캔만으로 60초 제한을 넘겼다.
    // 좁고 시대가 다양한 세 클래스로 대체했다 — 실측 3초.
    sparql: pointQuery({
      classes: ["Q23413", "Q12280", "Q2977"],
      minSitelinks: 16,
      timeProp: "P571",
      limit: 700,
    }),
  },
];
