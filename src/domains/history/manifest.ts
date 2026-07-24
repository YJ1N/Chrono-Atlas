import { HISTORY_CATEGORIES, HISTORY_LANES } from "./lanes";
import { HISTORY_SEED } from "./seed";
import { UNIVERSE_START } from "@/engine/time/TimePoint";
import type { Domain, TimelineItem } from "@/engine/types/timeline";

/**
 * 역사 도메인.
 *
 * 새 도메인 추가 = 이런 객체 하나를 추가하는 것. `engine/` 은 이 타입만 알고
 * 그 안의 값은 알지 못한다 (ADR-003).
 *
 * `chunks` 는 비어 있다 — Phase 3 의 ETL 이 정적 JSON 청크를 만들 때 채워진다.
 * 지금은 시드가 번들에 직접 들어간다.
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
  chunks: [],
};

/** 전체 범위 — "전체 보기" 버튼과 밀도 미니맵이 쓴다. */
export const HISTORY_FULL_RANGE = {
  start: UNIVERSE_START,
  end: 2026,
};

export const HISTORY_ITEMS: TimelineItem[] = HISTORY_SEED;
