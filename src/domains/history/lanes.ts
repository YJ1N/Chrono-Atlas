import type { Category, Lane } from "@/engine/types/timeline";

/**
 * 레인 — 시간이 1D 이므로 이것이 사실상의 Y축이다.
 *
 * 각 레인이 전 구간에 고루 분포하지 않는 것은 의도된 것이다.
 * "우주·지구" 는 심원한 시간에만, "문화·예술" 은 최근 수천 년에만 존재하며,
 * 그 비어 있음 자체가 정보다.
 */
export const HISTORY_LANES: Lane[] = [
  { id: "cosmos", label: "우주 · 지구", order: 0 },
  { id: "life", label: "생명", order: 1 },
  { id: "civilization", label: "문명 · 정치", order: 2 },
  { id: "science", label: "과학 · 기술", order: 3 },
  { id: "culture", label: "문화 · 예술", order: 4 },
];

/**
 * 카테고리 — `colorToken` 은 색상값이 아니라 토큰 이름이다.
 * 색상 리터럴이 데이터에 들어가면 테마와 대비를 한 곳에서 관리할 수 없다
 * (DESIGN_SYSTEM.md).
 *
 * 카테고리는 8개를 넘지 않는다. 그 이상은 사람이 색으로 구별하지 못한다.
 */
export const HISTORY_CATEGORIES: Category[] = [
  { id: "cosmic", label: "우주", colorToken: "category-cosmic" },
  { id: "geology", label: "지질", colorToken: "category-geology" },
  { id: "biology", label: "생명", colorToken: "category-biology" },
  { id: "civilization", label: "문명", colorToken: "category-civilization" },
  { id: "conflict", label: "전쟁 · 분쟁", colorToken: "category-conflict" },
  { id: "science", label: "과학 · 기술", colorToken: "category-science" },
  { id: "culture", label: "문화 · 예술", colorToken: "category-culture" },
];
