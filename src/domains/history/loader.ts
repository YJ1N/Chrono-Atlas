/**
 * 역사 도메인 데이터 로더.
 *
 * ── 왜 overview 는 번들이고 detail 은 fetch 인가 (ADR-015)
 * overview 가 번들에 있으면 첫 페인트에 지형이 이미 존재한다. 콜드 오픈
 * 직후 빈 화면이 잠깐 보이는 것은 이 제품에서 가장 나쁜 첫인상이다.
 * 반면 나머지 수천 건까지 번들에 넣으면 초기 JS 가 무거워지고, 정작
 * 대부분의 사용자는 그 깊이까지 확대하지 않는다.
 *
 * detail 청크는 정적 파일이므로 **런타임 API 는 여전히 0개다** (ADR-007).
 * 브라우저·CDN 캐시를 그대로 탄다.
 */

import chunkManifest from "./data/chunks.json";
import overviewData from "./data/overview.json";
import { visibleSignificanceRange } from "@/engine/time/significance";
import type { ChunkManifest, TimelineItem, Viewport } from "@/engine/types/timeline";

/**
 * JSON 모듈은 문자열 리터럴을 넓은 타입으로 추론하므로 단언이 필요하다.
 * 산출물을 만드는 ETL 쪽이 `TimelineItem` 으로 타입 검사를 받으므로
 * 이 단언의 근거는 생성기에 있다.
 */
export const HISTORY_OVERVIEW = overviewData as unknown as TimelineItem[];

export const HISTORY_CHUNKS = chunkManifest.chunks as ChunkManifest[];

/** overview 에 포함된 항목의 최저 중요도. 이 위쪽은 이미 번들에 있다. */
export const OVERVIEW_FLOOR = chunkManifest.overviewFloor;

/**
 * 이 뷰포트에서 필요한 청크.
 *
 * ── 시간만으로 거르면 안 된다
 * 138억 년 전체를 보면 모든 청크가 시간상 겹친다. 그때 전부 받아오면
 * 지연 로딩이 아니라 지연된 일괄 로딩이다. 줌에 따라 보이는 중요도 하한이
 * 정해지므로(ADR-013), 청크의 중요도 상한이 그 하한보다 낮으면 통째로
 * 보이지 않는다는 뜻이고 네트워크 이전에 건너뛴다.
 */
export function chunksForViewport(
  viewport: Viewport,
  /** 뷰포트 폭 대비 미리 받아둘 여유. 팬 하다가 빈 구간을 만나지 않게 한다. */
  overscan = 0.5,
): ChunkManifest[] {
  const floor = visibleSignificanceRange(viewport.span).floor;
  const half = (viewport.span / 2) * (1 + overscan);
  const start = viewport.center - half;
  const end = viewport.center + half;

  return HISTORY_CHUNKS.filter((chunk) => {
    if (chunk.range.start > end || chunk.range.end < start) return false;
    if (chunk.significanceRange && chunk.significanceRange.max < floor) {
      return false;
    }
    return true;
  });
}

/**
 * 청크 하나를 가져온다. 같은 청크에 대한 동시 요청은 하나로 합쳐진다.
 *
 * 모듈 스코프 캐시가 곧 저장소다 — 상태 라이브러리도, 서버 상태 라이브러리도
 * 필요 없다 (ADR-007).
 */
const chunkCache = new Map<string, TimelineItem[]>();
const inflight = new Map<string, Promise<TimelineItem[]>>();

export async function loadChunk(manifest: ChunkManifest): Promise<TimelineItem[]> {
  const cached = chunkCache.get(manifest.id);
  if (cached) return cached;

  const pending = inflight.get(manifest.id);
  if (pending) return pending;

  const request = fetch(manifest.path)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`청크 로드 실패 ${manifest.id}: HTTP ${response.status}`);
      }
      const items = (await response.json()) as TimelineItem[];
      chunkCache.set(manifest.id, items);
      return items;
    })
    .finally(() => {
      inflight.delete(manifest.id);
    });

  inflight.set(manifest.id, request);
  return request;
}
