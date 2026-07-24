"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { blendedRecipe } from "@/engine/render/tiers";
import { formatTimePoint } from "@/engine/time/TimePoint";
import { createTimeScale } from "@/engine/time/TimeScale";
import {
  fadeInOpacity,
  significanceToY,
  visibleSignificanceRange,
} from "@/engine/time/significance";
import type { ViewportController } from "@/engine/viewport/ViewportController";
import type { TimelineItem } from "@/engine/types/timeline";

interface PeakNode {
  el: SVGGElement;
  start: number;
  significance: number;
}

/**
 * 봉우리 — 지형을 뚫고 솟은 개별 사건.
 *
 * ── X 는 시간, Y 는 중요도
 * 레인이 아니다. 중요한 사건일수록 위에 있고, 줌을 좁히면 중요도 하한이
 * 내려가면서 아래쪽에 새로운 봉우리들이 **떠오른다.**
 * 이것이 "확대하면 카페가 나타나는" 동작의 시간축 대응물이다.
 *
 * ── 위치 갱신은 React 를 거치지 않는다
 * 뷰포트가 바뀌면 X 뿐 아니라 Y 도 바뀐다(중요도 범위가 변하므로).
 * 그래도 DOM 구조는 그대로이므로 `transform` 만 직접 쓴다.
 * React 는 LOD 선별 결과가 바뀔 때만 관여한다.
 */
export function PeakLayer({
  controller,
  items,
  labeledIds,
  width,
  height,
  onSelect,
  selectedId,
}: {
  controller: ViewportController;
  items: TimelineItem[];
  labeledIds: ReadonlySet<string>;
  width: number;
  height: number;
  onSelect: (item: TimelineItem) => void;
  selectedId: string | null;
}) {
  const rootRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<PeakNode[]>([]);

  const position = useCallback(() => {
    const w = controller.pixelWidth;
    if (w <= 1 || height <= 0) return;

    const viewport = controller.getSnapshot();
    const scale = createTimeScale(viewport, w);
    const range = visibleSignificanceRange(viewport.span);
    const recipe = blendedRecipe(viewport.span);

    for (const node of nodesRef.current) {
      const x = scale.toPixel(node.start);
      const y = significanceToY(node.significance, range, height);
      node.el.style.transform = `translate(${x}px, ${y}px)`;
      // 하한 근처에서 서서히 떠오르게 한다 — 딱 잘라 나타나면 깜빡인다.
      node.el.style.opacity = String(
        fadeInOpacity(node.significance, range) * recipe.markOpacity,
      );
    }
  }, [controller, height]);

  /** 선별 결과가 바뀌면 노드 목록을 다시 수집한다. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    nodesRef.current = Array.from(
      root.querySelectorAll<SVGGElement>("[data-start]"),
    ).map((el) => ({
      el,
      start: Number(el.dataset.start),
      significance: Number(el.dataset.sig),
    }));
    position();
  }, [items, position]);

  useEffect(() => {
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        position();
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller, position]);

  const recipe = blendedRecipe(controller.getSnapshot().span);

  return (
    <svg
      width={width}
      height={height}
      className="absolute inset-0 block overflow-hidden"
      role="group"
      aria-label="주요 사건"
    >
      <g ref={rootRef}>
        {items.map((item) => {
          const selected = item.id === selectedId;
          const labeled = labeledIds.has(item.id);
          const r = recipe.markRadius * (0.55 + item.significance * 0.7);

          return (
            <g
              key={item.id}
              data-start={item.span.start}
              data-sig={item.significance}
              className="cursor-pointer outline-none [&:focus-visible_.peak-ring]:opacity-100"
              onClick={() => onSelect(item)}
              /**
               * ── 라벨이 붙은 봉우리만 탭 정지가 된다
               * 화면에는 최대 300개가 있지만 이름이 보이는 것은 티어당
               * 6~24개다. 300개를 전부 탭 정지로 만들면 스크린리더 사용자가
               * 이름 없는 점 사이를 수백 번 지나야 하고, 키보드 사용자는
               * 이 영역을 빠져나가지 못한다. 읽을 수 있는 것만 노출한다.
               */
              {...(labeled
                ? {
                    tabIndex: 0,
                    role: "button",
                    "aria-label": `${item.title}, ${formatTimePoint(item.span.start)}`,
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelect(item);
                    },
                  }
                : { "aria-hidden": true })}
            >
              {/* 발광 — 필터 대신 큰 반투명 원. 필터는 프레임을 잡아먹는다 */}
              <circle
                r={r * 3.2}
                fill={`var(--${categoryToken(item.categoryId)})`}
                fillOpacity={selected ? 0.28 : 0.12}
              />
              <circle
                r={r}
                fill={selected ? "var(--accent)" : "var(--peak)"}
                fillOpacity={selected ? 1 : 0.92}
              />
              {selected && (
                <circle
                  r={r + 7}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.25}
                  strokeOpacity={0.9}
                />
              )}
              {/* 키보드 포커스 표시 — 마우스 클릭에는 나타나지 않는다 */}
              <circle
                className="peak-ring pointer-events-none opacity-0"
                r={r + 11}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
              {labeled && (
                <text
                  x={r + 9}
                  y={4}
                  className="pointer-events-none select-none text-[12px]"
                  fill="var(--foreground)"
                  fillOpacity={selected ? 1 : 0.88}
                >
                  {item.title}
                </text>
              )}
              {labeled && recipe.showSummary && item.summary && (
                <text
                  x={r + 9}
                  y={20}
                  className="pointer-events-none select-none text-[11px]"
                  fill="var(--muted)"
                >
                  {truncate(item.summary, 46)}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function categoryToken(categoryId: string): string {
  return `category-${categoryId}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
