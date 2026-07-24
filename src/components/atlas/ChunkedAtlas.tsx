"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Atlas } from "./Atlas";
import type { SearchRecord } from "@/engine/index/search";
import type { ChunkManifest, Domain, TimelineItem, Viewport } from "@/engine/types/timeline";

/**
 * 청크를 뷰포트에 따라 지연 로드하는 Atlas 껍데기.
 *
 * ── 왜 Atlas 안에 넣지 않았는가
 * Atlas 는 "항목 배열을 받아 그리는" 것 하나만 안다. 로딩 전략을 그 안에
 * 넣으면 렌더러가 저장소를 알게 되고, 도메인을 갈아끼울 때 렌더러를 고쳐야
 * 한다. 이 파일도 도메인을 모른다 — `chunksFor` 와 `loadChunk` 를 밖에서
 * 받으므로 어떤 도메인이든 그대로 쓴다 (ADR-003).
 */
export function ChunkedAtlas({
  domain,
  overview,
  chunksFor,
  loadChunk,
  loadSearchIndex,
}: {
  domain: Domain;
  /** 번들에 들어 있어 첫 페인트에 이미 존재하는 항목. */
  overview: TimelineItem[];
  /** 이 뷰포트에서 필요한 청크. 시간과 중요도 양쪽으로 걸러진다. */
  chunksFor: (viewport: Viewport) => ChunkManifest[];
  loadChunk: (manifest: ChunkManifest) => Promise<TimelineItem[]>;
  /** ⌘K 검색 색인. 도메인이 주고 Atlas 까지 그대로 전달된다. */
  loadSearchIndex?: () => Promise<readonly SearchRecord[]>;
}) {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, TimelineItem[]>>(
    () => new Map(),
  );
  /** 이미 요청한 청크. 같은 청크를 두 번 받지 않는다. */
  const requested = useRef(new Set<string>());

  const items = useMemo(() => {
    if (loaded.size === 0) return overview;
    return [...overview, ...[...loaded.values()].flat()];
  }, [overview, loaded]);

  const handleViewportChange = useCallback(
    (viewport: Viewport) => {
      for (const manifest of chunksFor(viewport)) {
        if (requested.current.has(manifest.id)) continue;
        requested.current.add(manifest.id);

        void loadChunk(manifest)
          .then((chunkItems) => {
            setLoaded((previous) => {
              const next = new Map(previous);
              next.set(manifest.id, chunkItems);
              return next;
            });
          })
          .catch(() => {
            /**
             * 실패해도 화면은 살아 있어야 한다 — overview 가 이미 있으므로
             * 지형은 그대로다. 다음에 다시 시도할 수 있게 표시만 지운다.
             */
            requested.current.delete(manifest.id);
          });
      }
    },
    [chunksFor, loadChunk],
  );

  return (
    <Atlas
      domain={domain}
      items={items}
      onViewportChange={handleViewportChange}
      loadSearchIndex={loadSearchIndex}
    />
  );
}
