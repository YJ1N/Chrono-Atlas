import { HISTORY_CATEGORIES, HISTORY_LANES } from "./lanes";
import { HISTORY_CHUNKS, HISTORY_OVERVIEW } from "./loader";
import { UNIVERSE_START } from "@/engine/time/TimePoint";
import type { Domain, Landmark, TimelineItem } from "@/engine/types/timeline";

/**
 * 역사 도메인.
 *
 * 새 도메인 추가 = 이런 객체 하나를 추가하는 것. `engine/` 은 이 타입만 알고
 * 그 안의 값은 알지 못한다 (ADR-003).
 *
 * 데이터는 Phase 3 의 Wikidata ETL 산출물이다 (`npm run etl`).
 * 상위 중요도는 `overview` 로 번들에 들어가고, 나머지는 `chunks` 로
 * 지연 로드된다 (ADR-015).
 */
export const HISTORY_DOMAIN: Domain = {
  id: "history",
  label: "역사",
  description: "빅뱅부터 현재까지",
  lanes: HISTORY_LANES,
  categories: HISTORY_CATEGORIES,
  defaultViewport: {
    // 문자 발명 이후 인류사가 한눈에 들어오는 창으로 시작한다.
    // 138억 년 전체에서 시작하면 첫인상이 거의 빈 화면이 된다.
    center: 0,
    span: 6000,
  },
  chunks: HISTORY_CHUNKS,
  get landmarks() {
    return HISTORY_LANDMARKS;
  },
};

/** 전체 범위 — "전체 보기" 버튼과 밀도 미니맵이 쓴다. */
export const HISTORY_FULL_RANGE = {
  start: UNIVERSE_START,
  end: 2026,
};

/**
 * 첫 페인트에 즉시 그려지는 항목.
 *
 * 전체가 아니다 — 나머지는 뷰포트에 따라 `loader.ts` 가 가져온다.
 */
export const HISTORY_ITEMS: TimelineItem[] = HISTORY_OVERVIEW;

/**
 * 시간의 해안선 — 어느 줌에서도 수평선에 보이는 고정 참조점.
 *
 * 개수가 중요하다. 너무 많으면 눈금자가 되고, 너무 적으면 길을 잃는다.
 * 여덟 개는 각 자릿수에 하나씩 놓이면서 서로 겹치지 않는 수다.
 */
export const HISTORY_LANDMARKS: Landmark[] = [
  { id: "lm-bigbang", label: "빅뱅", time: UNIVERSE_START },
  { id: "lm-earth", label: "지구", time: -4.54e9 },
  { id: "lm-life", label: "생명", time: -3.7e9 },
  { id: "lm-cambrian", label: "캄브리아", time: -538.8e6 },
  { id: "lm-dinosaurs", label: "공룡 멸종", time: -6.6e7 },
  { id: "lm-humans", label: "인류", time: -300_000 },
  { id: "lm-agriculture", label: "농업", time: -10_000 },
  { id: "lm-now", label: "현재", time: 2026 },
];
