/**
 * 산출 항목을 overview(번들) + detail 청크(지연)로 가른다.
 *
 * ── 왜 시간만으로 자르면 안 되는가
 * 138억 년을 시간 버킷으로 균등 분할하면 마지막 버킷 하나에 99% 가 들어간다.
 * 로그 버킷으로 잘라도 경계가 임의적이고 청크 크기가 들쭉날쭉해진다.
 * 그래서 **항목 수로 자르고 범위는 결과에서 읽는다.** 청크 크기가 보장되고
 * 경계가 데이터를 따라간다.
 *
 * ── 왜 넓게 봐도 전부 받아오지 않는가
 * 뷰포트가 138억 년이면 모든 청크와 겹치므로, 시간 겹침만으로 로딩을
 * 판정하면 첫 화면에 전부 내려받는다. 지연 로딩이 아니라 지연된 일괄
 * 로딩일 뿐이다. 청크마다 **중요도 상한**을 같이 실어 두면 로더가
 * "이 줌에서는 이 청크가 통째로 안 보인다" 를 네트워크 이전에 판정한다.
 */

import type { ChunkManifest, TimelineItem } from "@/engine/types/timeline";

export interface ChunkPlan {
  /** 번들에 들어가 첫 페인트에 즉시 쓰이는 항목. */
  overview: TimelineItem[];
  chunks: { manifest: ChunkManifest; items: TimelineItem[] }[];
  /** overview 에 들어간 primary 항목의 최저 중요도. 로더의 판정 기준. */
  overviewFloor: number;
}

export interface ChunkOptions {
  overviewTarget: number;
  chunkMaxItems: number;
  /**
   * 이보다 긴 구간의 primary 항목은 overview 로 올린다.
   *
   * 청크는 **시작 시각** 순으로 자르므로 시작 범위는 깔끔하게 나뉘는데,
   * 구간이 긴 항목 하나가 끼면 그 청크의 `range.end` 가 통째로 늘어난다.
   * 실측: 13.6 Ga 에서 시작하는 청크의 끝이 2026 이 되어, 1900년대를 좁게
   * 봐도 심원한 시간 청크가 딸려왔다. 전체의 1% 남짓이라 올려도 싸다.
   */
  longSpanYears: number;
  /** 청크 파일이 놓일 public 기준 경로. */
  basePath: string;
  /** 청크 id 접두어. */
  idPrefix: string;
}

/** 중요도 내림차순. 동점은 id 로 갈라 ETL 재실행 시 결과가 흔들리지 않게 한다. */
function bySignificanceDesc(a: TimelineItem, b: TimelineItem): number {
  if (b.significance !== a.significance) return b.significance - a.significance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byStartAsc(a: TimelineItem, b: TimelineItem): number {
  if (a.span.start !== b.span.start) return a.span.start - b.span.start;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function planChunks(
  items: readonly TimelineItem[],
  options: ChunkOptions,
): ChunkPlan {
  /**
   * context 항목은 무조건 overview 다.
   *
   * 지질시대 리본 하나가 6600만 년을 덮는다. 이런 항목이 detail 청크에 들어가면
   * 그 청크의 범위가 통째로 늘어나 아무 뷰포트에서나 겹치게 되고, 범위 기반
   * 로딩이 무의미해진다. 개수도 적고 전부 중요하므로 번들이 옳다.
   */
  const alwaysBundled = items.filter(
    (item) =>
      item.layer === "context" ||
      item.span.end - item.span.start > options.longSpanYears,
  );
  const bundledIds = new Set(alwaysBundled.map((item) => item.id));
  const primary = items.filter((item) => !bundledIds.has(item.id));

  const ranked = [...primary].sort(bySignificanceDesc);
  const promoted = ranked.slice(0, options.overviewTarget);
  const remaining = ranked.slice(options.overviewTarget);

  const overviewFloor =
    promoted.length > 0 ? promoted[promoted.length - 1].significance : 0;

  const overview = [...alwaysBundled, ...promoted].sort(byStartAsc);

  const rest = [...remaining].sort(byStartAsc);
  const chunks: ChunkPlan["chunks"] = [];

  for (let i = 0; i < rest.length; i += options.chunkMaxItems) {
    const slice = rest.slice(i, i + options.chunkMaxItems);
    const index = chunks.length;
    const id = `${options.idPrefix}-${String(index).padStart(3, "0")}`;

    chunks.push({
      manifest: {
        id,
        range: {
          start: Math.min(...slice.map((item) => item.span.start)),
          end: Math.max(...slice.map((item) => item.span.end)),
        },
        path: `${options.basePath}/${id}.json`,
        itemCount: slice.length,
        significanceRange: {
          min: Math.min(...slice.map((item) => item.significance)),
          max: Math.max(...slice.map((item) => item.significance)),
        },
      },
      items: slice,
    });
  }

  return { overview, chunks, overviewFloor };
}
