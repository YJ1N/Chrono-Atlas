"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { tierWeights } from "@/engine/render/tiers";
import { createTimeScale } from "@/engine/time/TimeScale";
import type { ViewportController } from "@/engine/viewport/ViewportController";
import type { TimelineItem } from "@/engine/types/timeline";

interface EraNode {
  el: SVGGElement;
  label: SVGTextElement | null;
  rect: SVGRectElement | null;
  start: number;
  end: number;
}

const BAND_TOP = 60;
const BAND_HEIGHT = 26;

/**
 * 시대 밴드 — 넓은 스케일에서만 존재하는 표현.
 *
 * ── 표현의 변태를 완성하는 조각
 * cosmic/epochal 에서는 개별 사건이 의미를 잃는다. 46억 년 화면에서 점 하나는
 * 아무것도 말해주지 않는다. 대신 "지금 보고 있는 곳이 원생누대다" 가 필요하다.
 *
 * 좁혀 들어가면 이 밴드는 사라지고 개별 사건이 주인공이 된다.
 * 같은 데이터(`layer: "context"`)가 스케일에 따라 다른 역할을 한다.
 */
export function EraLayer({
  controller,
  items,
  width,
}: {
  controller: ViewportController;
  items: TimelineItem[];
  width: number;
}) {
  const rootRef = useRef<SVGGElement>(null);
  const nodesRef = useRef<EraNode[]>([]);

  const position = useCallback(() => {
    const w = controller.pixelWidth;
    if (w <= 1) return;

    const viewport = controller.getSnapshot();
    const scale = createTimeScale(viewport, w);
    const weights = tierWeights(viewport.span);
    // 시대 밴드는 넓은 두 티어에서만 존재한다.
    const opacity = weights.cosmic + weights.epochal;

    const root = rootRef.current;
    if (root) root.style.opacity = String(opacity);
    if (opacity <= 0.01) return;

    for (const node of nodesRef.current) {
      const x = scale.toPixel(node.start);
      const bandWidth = Math.max(2, scale.spanWidth(node.start, node.end));
      node.el.style.transform = `translateX(${x}px)`;
      node.rect?.setAttribute("width", String(bandWidth));

      /**
       * 화면을 통째로 덮는 시대(원생누대는 20억 년)는 시작점이 한참 왼쪽
       * 밖이다. 라벨을 시작점에 고정하면 **화면을 덮고 있는데 이름이 보이지
       * 않는** 상태가 된다. 왼쪽 가장자리에 붙잡되 구간 끝은 넘지 않는다.
       */
      if (node.label) {
        const sticky = Math.max(10, 10 - x);
        node.label.setAttribute(
          "x",
          String(Math.min(sticky, Math.max(10, bandWidth - 10))),
        );
        // 너무 좁아진 밴드의 라벨은 감춘다.
        node.label.style.opacity = bandWidth < 44 ? "0" : "1";
      }
    }
  }, [controller]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    nodesRef.current = Array.from(
      root.querySelectorAll<SVGGElement>("[data-start]"),
    ).map((el) => ({
      el,
      label: el.querySelector("text"),
      rect: el.querySelector("rect"),
      start: Number(el.dataset.start),
      end: Number(el.dataset.end),
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

  return (
    <svg
      width={width}
      height={BAND_TOP + BAND_HEIGHT + 8}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 block overflow-hidden"
    >
      <g ref={rootRef}>
        {items.map((item) => (
          <g key={item.id} data-start={item.span.start} data-end={item.span.end}>
            <rect
              y={BAND_TOP}
              height={BAND_HEIGHT}
              width={2}
              rx={4}
              fill={`var(--category-${item.categoryId})`}
              fillOpacity={0.16}
            />
            <text
              x={10}
              y={BAND_TOP + 17}
              className="text-[11px] tracking-wide"
              fill="var(--muted)"
            >
              {item.title}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
