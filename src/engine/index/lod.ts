/**
 * LOD (Level of Detail) — 지금 이 줌 레벨에서 무엇을 보여줄지 결정한다.
 *
 * ── 이것이 이 제품의 심장이다
 * Google Maps 가 세계 줌에서 국가만, 거리 줌에서 카페까지 보여주는 것과 같은
 * 역할이다. 시간축에서 "가상화"의 올바른 형태는 스크롤 윈도잉이 아니라
 * **중요도 기반 선별**이다 (ADR-010).
 *
 * 성능 대책인 동시에 UX 그 자체다 — 사람은 화면에 300개 넘는 마크를 인지하지
 * 못하므로, 다 그리는 것은 느릴 뿐 아니라 쓸모도 없다.
 *
 * ── 알고리즘
 * 1. 뷰포트와 겹치는 후보를 IntervalIndex 로 뽑는다.        O(log n + k)
 * 2. 중요도 내림차순으로 정렬한다.                          O(k log k)
 * 3. 픽셀 공간을 `minSpacingPx` 폭의 빈으로 나누고, 앞에서부터
 *    이웃 빈과 충돌하지 않는 것만 채택한다.                 O(k)
 * 4. `maxItems` 에 도달하면 멈춘다.
 *
 * 빈 하나의 폭이 최소 간격과 같으므로 한 빈에는 채택된 아이템이 최대 하나다.
 * 따라서 좌우 한 칸씩만 확인하면 충돌 검사가 끝난다.
 */

import type { IntervalIndex } from "./IntervalIndex";
import { createTimeScale } from "@/engine/time/TimeScale";
import type { ItemLayer, TimelineItem, Viewport } from "@/engine/types/timeline";

export interface PlacedItem {
  item: TimelineItem;
  /** 구간 시작의 x 좌표(px). 라벨 기준점이기도 하다. */
  x: number;
  /** 구간의 픽셀 폭. 점 사건은 0. */
  width: number;
}

export interface LodOptions {
  /** 화면에 허용할 최대 마크 수. DOM 노드 상한을 고정하는 값이다. */
  maxItems?: number;
  /** 같은 레인에서 두 마크가 최소한 떨어져야 하는 픽셀. */
  minSpacingPx?: number;
  /** 뷰포트 밖으로 미리 확보할 여유(px). 팬 중 가장자리 팝인을 막는다. */
  overscanPx?: number;
  /** 이 레이어만 선별한다. 생략하면 전부. */
  layer?: ItemLayer;
}

export const DEFAULT_MAX_ITEMS = 300;
export const DEFAULT_MIN_SPACING_PX = 14;
export const DEFAULT_OVERSCAN_PX = 200;

/**
 * 중요도 내림차순. 동점은 id 로 갈라 **결정적**으로 만든다.
 *
 * 결정성이 중요한 이유: 같은 뷰포트에서 매번 같은 결과가 나와야 팬 중에
 * 마크가 깜빡이지 않는다.
 */
function byImportance(a: TimelineItem, b: TimelineItem): number {
  if (b.significance !== a.significance) return b.significance - a.significance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 레인별 빈 점유 상황. 키는 `laneId` + 빈 번호.
 * 한 빈에는 채택된 x 가 최대 하나다.
 */
class BinOccupancy {
  private readonly taken = new Map<string, number>();

  constructor(private readonly binSize: number) {}

  /** 이 위치를 채택할 수 있으면 점유하고 true 를 돌려준다. */
  claim(laneId: string, x: number): boolean {
    const bin = Math.floor(x / this.binSize);
    for (let b = bin - 1; b <= bin + 1; b += 1) {
      const occupied = this.taken.get(`${laneId}:${b}`);
      if (occupied !== undefined && Math.abs(occupied - x) < this.binSize) {
        return false;
      }
    }
    this.taken.set(`${laneId}:${bin}`, x);
    return true;
  }
}

/**
 * 현재 뷰포트에서 그릴 아이템을 고른다.
 *
 * 결과는 시작 시각 오름차순이며, 개수는 `maxItems` 이하가 보장된다.
 */
export function selectVisible(
  index: IntervalIndex<TimelineItem>,
  viewport: Viewport,
  pixelWidth: number,
  options: LodOptions = {},
): PlacedItem[] {
  const {
    maxItems = DEFAULT_MAX_ITEMS,
    minSpacingPx = DEFAULT_MIN_SPACING_PX,
    overscanPx = DEFAULT_OVERSCAN_PX,
    layer,
  } = options;

  if (!(pixelWidth > 0) || !(viewport.span > 0) || maxItems <= 0) return [];

  const scale = createTimeScale(viewport, pixelWidth);
  const overscanYears = overscanPx * scale.yearsPerPixel;

  const candidates = index.query(
    scale.start - overscanYears,
    scale.end + overscanYears,
  );

  const ranked = (layer ? candidates.filter((i) => i.layer === layer) : candidates)
    .slice()
    .sort(byImportance);

  const occupancy = new BinOccupancy(Math.max(1, minSpacingPx));
  const accepted: PlacedItem[] = [];

  for (const item of ranked) {
    if (accepted.length >= maxItems) break;

    const x = scale.toPixel(item.span.start);
    if (!occupancy.claim(item.laneId, x)) continue;

    accepted.push({
      item,
      x,
      width: scale.spanWidth(item.span.start, item.span.end),
    });
  }

  // DOM 순서를 안정시키기 위해 시간순으로 되돌린다.
  accepted.sort((a, b) => a.item.span.start - b.item.span.start);
  return accepted;
}

/**
 * 현재 뷰포트에서 화면에 들어오는 아이템의 **총 개수**.
 * 밀도 미니맵과 "N개 더 있음" 표시에 쓴다. 선별 비용 없이 세기만 한다.
 */
export function countVisible(
  index: IntervalIndex<TimelineItem>,
  viewport: Viewport,
  layer?: ItemLayer,
): number {
  const start = viewport.center - viewport.span / 2;
  const end = viewport.center + viewport.span / 2;
  const found = index.query(start, end);
  return layer ? found.filter((i) => i.layer === layer).length : found.length;
}
