/**
 * ChronoAtlas 엔진 코어 타입 — 도메인 무관.
 *
 * 이 파일에는 "역사"라는 단어가 등장하지 않는다. 등장하는 순간
 * Time Engine 이 아니라 역사 웹사이트가 된다.
 */

// ─────────────────────────────────────────────────────────────
// 시간
// ─────────────────────────────────────────────────────────────

/**
 * 천문학적 연도 번호(astronomical year numbering)의 실수 표현.
 *
 *   0  = 기원전 1년   (BCE 1)
 *  -1  = 기원전 2년   (BCE 2)
 *   1  = 서기 1년     (CE 1)
 *
 * 소수부는 해당 연도 안에서의 진행률이다. (예: 1969.55 ≈ 1969년 중반)
 *
 * ── 왜 Date 가 아닌가 (ADR-001)
 * JavaScript `Date` 의 표현 범위는 ±8.64e15 ms ≈ ±271,821년이다.
 * ChronoAtlas 의 목표 범위는 138억 년으로 4자릿수 이상 초과한다.
 *
 * ── 왜 BigInt 가 아닌가
 * float64 의 유효자리는 약 15~16자리이므로 이 표현의 실제 해상도는:
 *   서기 2026년 지점  → 약 14 마이크로초
 *   138억 년 전 지점  → 약 96초
 * 정밀도가 필요한 구간에서는 남아돌고, 무의미한 구간에서만 성글어진다.
 * BigInt 는 산술이 느려 60fps 뷰포트 갱신에 부적합하다.
 */
export type TimePoint = number;

/** 시간 구간의 길이(연 단위). 항상 >= 0. */
export type TimeDuration = number;

/**
 * 출처가 주장하는 시간 정밀도.
 * 렌더링(오차 막대)과 LOD 양쪽에서 쓰인다.
 */
export type TimePrecision =
  | "exact"
  | "day"
  | "month"
  | "year"
  | "decade"
  | "century"
  | "millennium"
  | "era";

/**
 * 모든 시간 구간의 표현. 점 사건은 `start === end`.
 *
 * 별도의 "Point" 타입을 두지 않는 이유: 점과 구간을 갈라놓으면
 * 스케일·LOD·충돌회피 코드가 전부 두 벌이 된다.
 */
export interface TimeSpan {
  start: TimePoint;
  /** 점 사건은 start 와 동일. 항상 `end >= start`. */
  end: TimePoint;
  precision: TimePrecision;
  /** 출처가 "circa" 로 표기한 경우. */
  approximate?: boolean;
}

// ─────────────────────────────────────────────────────────────
// 아이템
// ─────────────────────────────────────────────────────────────

/**
 * 렌더링 역할. Era 와 Event 를 별도 엔티티로 나누지 않는 이유는
 * 둘의 데이터 모양이 동일하기 때문이다(구간 + 라벨 + 중요도).
 * 다른 것은 "어떻게 그리는가" 뿐이므로 필드 하나로 충분하다.
 *
 *   context — 배경 리본 (시대, 왕조, 지질시대, 제품 세대 …)
 *   primary — 전경 마크 (개별 사건)
 */
export type ItemLayer = "context" | "primary";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface SourceRef {
  /** 출처 시스템 식별자. 예: Wikidata 의 "Q1339". */
  externalId?: string;
  /** 출처 시스템 이름. 예: "wikidata". */
  provider?: string;
  url?: string;
  /** 저작권 표기가 필요한 출처(CC BY-SA 등)를 위한 필드. */
  attribution?: string;
}

export type RelationKind =
  | "causes"
  | "precedes"
  | "partOf"
  | "influences"
  | "sameAs";

export interface Relation {
  kind: RelationKind;
  targetId: string;
}

/**
 * 타임라인에 놓이는 단 하나의 엔티티.
 */
export interface TimelineItem {
  id: string;
  span: TimeSpan;
  title: string;
  summary?: string;

  /**
   * 0..1 정규화된 중요도. **이 모델에서 가장 중요한 단일 필드다.**
   *
   * LOD 가 이 값으로 "지금 이 줌 레벨에서 무엇을 보여줄지" 를 결정한다.
   * Google Maps 가 세계 줌에서 국가만, 거리 줌에서 카페까지 보여주는 것과
   * 같은 역할이며, 이것이 없으면 이 제품은 그냥 스크롤 막대가 된다.
   *
   * 역사 도메인 산출 방식은 Wikidata sitelink 수의 로그 정규화.
   * 알려진 편향(영어권·서구 중심)은 DATA_MODEL.md 에 기록한다.
   */
  significance: number;

  categoryId: string;
  laneId: string;
  layer: ItemLayer;

  /** MVP 에서는 저장만 하고 렌더링하지 않는다. 지도 레이어는 Phase 6. */
  location?: GeoPoint;

  sourceRef?: SourceRef;
  relations?: Relation[];
}

// ─────────────────────────────────────────────────────────────
// 도메인 구성
// ─────────────────────────────────────────────────────────────

/** 수평 트랙. 시간이 1D 이므로 이것이 사실상의 Y축이다. */
export interface Lane {
  id: string;
  label: string;
  /** 위에서 아래로의 정렬 순서. */
  order: number;
}

export interface Category {
  id: string;
  label: string;
  /** DESIGN_SYSTEM.md 의 색 토큰 이름. 색상값을 직접 넣지 않는다. */
  colorToken: string;
}

/** 시간 버킷 단위로 분할된 정적 데이터 파일 하나. */
export interface ChunkManifest {
  id: string;
  /** 이 청크가 담당하는 구간. */
  range: { start: TimePoint; end: TimePoint };
  /** public/ 기준 경로. */
  path: string;
  itemCount: number;
}

/**
 * 도메인 하나의 전체 기술(記述).
 *
 * 새 도메인 추가 = 이 객체 하나를 추가하는 것.
 * `engine/` 은 이 타입만 알고 그 안의 값은 알지 못한다.
 */
export interface Domain {
  id: string;
  label: string;
  description?: string;
  lanes: Lane[];
  categories: Category[];
  defaultViewport: Viewport;
  chunks: ChunkManifest[];
}

// ─────────────────────────────────────────────────────────────
// 뷰포트
// ─────────────────────────────────────────────────────────────

/**
 * 화면에 보이는 시간 창.
 *
 * ── 왜 {start, end} 가 아니라 {center, span} 인가 (ADR-002)
 * 줌은 `span *= factor`, 팬은 `center += delta` 로 표현된다.
 * d3-zoom 처럼 거대한 배율 스칼라(k)를 누적하지 않으므로
 * 138억 년 → 1일(약 5e12배) 구간 전체에서 수치적으로 안정하다.
 */
export interface Viewport {
  center: TimePoint;
  /** 화면 폭이 담는 시간의 길이(연 단위). 항상 > 0. */
  span: TimeDuration;
}
