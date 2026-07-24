"use client";

import { ChunkedAtlas } from "@/components/atlas/ChunkedAtlas";
import {
  HISTORY_OVERVIEW,
  chunksForViewport,
  loadChunk,
  loadSearchIndex,
} from "@/domains/history/loader";
import { HISTORY_DOMAIN } from "@/domains/history/manifest";

/**
 * 합성 루트 — 여기만 엔진·렌더러·도메인을 동시에 안다.
 *
 * 클라이언트 컴포넌트인 이유: 청크 로딩 전략(`chunksForViewport`·`loadChunk`)을
 * 함수로 주입하는데, 함수는 서버 컴포넌트 경계를 넘지 못한다. 대신 이 배선을
 * 여기 두면 `ChunkedAtlas` 는 도메인을 모르는 채로 남는다 (ADR-003).
 */
export default function Home() {
  return (
    <main className="h-dvh">
      <ChunkedAtlas
        domain={HISTORY_DOMAIN}
        overview={HISTORY_OVERVIEW}
        chunksFor={chunksForViewport}
        loadChunk={loadChunk}
        loadSearchIndex={loadSearchIndex}
      />
    </main>
  );
}
