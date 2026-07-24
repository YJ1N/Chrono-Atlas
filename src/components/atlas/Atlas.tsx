"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ColdOpen } from "./ColdOpen";
import { CursorReadout } from "./CursorReadout";
import { DetailPanel } from "./DetailPanel";
import { EraLayer } from "./EraLayer";
import { Horizon } from "./Horizon";
import { EraBackdrop, PresentMarker, ScaleNote } from "./Overlays";
import { PeakLayer } from "./PeakLayer";
import { TerrainLayer } from "./TerrainLayer";
import { useAtlasInput } from "./useAtlasInput";
import { createItemIndex, IntervalIndex } from "@/engine/index/IntervalIndex";
import { estimateLabelWidth } from "@/engine/index/collision";
import { selectVisible } from "@/engine/index/lod";
import { blendedRecipe, tierAt } from "@/engine/render/tiers";
import { PRESENT_EPOCH, UNIVERSE_START, formatTimePoint } from "@/engine/time/TimePoint";
import { createTimeScale, viewportForRange } from "@/engine/time/TimeScale";
import {
  significanceToY,
  visibleSignificanceRange,
} from "@/engine/time/significance";
import { ViewportController } from "@/engine/viewport/ViewportController";
import type { Domain, TimelineItem, Viewport } from "@/engine/types/timeline";

/** 봉우리 최소 간격 — 화면 내 DOM 노드 수의 상한을 만든다. */
const PEAK_SPACING_PX = 26;
const OVERSCAN_PX = 500;
/** 라벨 상자의 세로 높이 — 이 안에 들어오면 겹친 것으로 본다. */
const LABEL_ROW_PX = 22;
/** 수평선 띠가 차지하는 높이. */
const HORIZON_PX = 52;

/** LOD 재계산 임계 — 매 프레임 재계산하면 React 렌더가 60fps 로 돌아 의미가 없다. */
const LOD_SPAN_RATIO = 1.12;
const LOD_CENTER_DRIFT = 0.12;

interface LodResult {
  peaks: TimelineItem[];
  eras: TimelineItem[];
  labeledIds: ReadonlySet<string>;
}

const EMPTY_LOD: LodResult = { peaks: [], eras: [], labeledIds: new Set() };

/**
 * 지금 이 뷰포트에서 무엇을 그릴지 고른다 — 순수 함수.
 *
 * 컴포넌트 밖에 두는 이유는 두 가지다. 이 계산이 상태를 만들지 않는다는 것을
 * 코드 모양으로 못 박고, 입력이 같으면 결과가 같다는 것을 눈으로 확인할 수
 * 있게 하기 위해서다.
 */
function computeLod(
  index: IntervalIndex<TimelineItem>,
  viewport: Viewport | null,
  width: number,
  height: number,
): LodResult {
  if (!viewport || width <= 1) return EMPTY_LOD;

  const recipe = blendedRecipe(viewport.span);
  const range = visibleSignificanceRange(viewport.span);
  const scale = createTimeScale(viewport, width);

  /**
   * 중요도 하한 아래는 애초에 뽑지 않는다.
   * 이것이 "확대하면 사소한 것이 떠오른다" 는 동작의 실체다.
   */
  const peaks = selectVisible(index, viewport, width, {
    layer: "primary",
    minSpacingPx: PEAK_SPACING_PX,
    overscanPx: OVERSCAN_PX,
    maxItems: 300,
  })
    .map((p) => p.item)
    .filter((item) => item.significance >= range.floor);

  const eras = selectVisible(index, viewport, width, {
    layer: "context",
    minSpacingPx: 2,
    overscanPx: OVERSCAN_PX,
    maxItems: 24,
  }).map((p) => p.item);

  /**
   * 라벨 선별 — 중요도 순으로 훑으며 실제로 겹치지 않는 것만 채택한다.
   * 봉우리는 Y(중요도)가 서로 다르므로 x·y 두 축의 상자 겹침으로 판정한다.
   */
  const ranked = [...peaks].sort((a, b) =>
    b.significance !== a.significance
      ? b.significance - a.significance
      : a.id < b.id
        ? -1
        : 1,
  );

  const placedLabels: { x: number; y: number; width: number }[] = [];
  const labeledIds = new Set<string>();
  const plotHeight = Math.max(1, height - HORIZON_PX);

  for (const item of ranked) {
    if (labeledIds.size >= recipe.maxLabels) break;
    const x = scale.toPixel(item.span.start);
    if (x < -40 || x > width + 40) continue;
    const y = significanceToY(item.significance, range, plotHeight);
    /**
     * 여유를 둔다. LOD 는 폭이 12% 바뀔 때만 다시 도는데, 그사이 줌으로
     * 마크 간 상대 간격이 최대 그만큼 좁아진다. (팬은 전체가 함께 움직이므로 무관.)
     */
    const labelWidth = (estimateLabelWidth(item.title, 12) + 26) * 1.2;

    const collides = placedLabels.some(
      (other) =>
        Math.abs(other.y - y) < LABEL_ROW_PX &&
        x < other.x + other.width &&
        other.x < x + labelWidth,
    );
    if (collides) continue;

    placedLabels.push({ x, y, width: labelWidth });
    labeledIds.add(item.id);
  }

  return { peaks, eras, labeledIds };
}

/**
 * Atlas — 시간 지형의 최상위 조율자.
 *
 * 레인도 축 구분선도 범례도 없다. 화면은 하나의 풍경이고
 * X 는 시간, Y 는 중요도다.
 */
export function Atlas({
  domain,
  items,
  onViewportChange,
}: {
  domain: Domain;
  items: TimelineItem[];
  /**
   * 뷰포트가 **의미 있게** 바뀔 때만 불린다 (LOD 재계산과 같은 시점).
   *
   * 매 프레임 호출하지 않는 것이 요점이다. 청크 로딩이나 URL 딥링크처럼
   * 60fps 가 필요 없는 일에 쓰라고 있는 구멍이다.
   */
  onViewportChange?: (viewport: Viewport) => void;
}) {
  /**
   * 마지막으로 선별을 확정한 뷰포트.
   *
   * 60fps 로 흐르는 뷰포트를 그대로 state 에 넣으면 매 프레임 재조정이
   * 일어난다(ARCHITECTURE.md 상태 3계층). 여기 담기는 것은 "다시 선별할
   * 만큼 움직였다" 고 판정된 순간의 스냅샷뿐이다.
   */
  const [lodViewport, setLodViewport] = useState<Viewport | null>(null);
  const lodViewportRef = useRef<Viewport | null>(null);

  const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<TimelineItem | null>(null);

  const index = useMemo(() => createItemIndex(items), [items]);

  const controller = useMemo(
    () => new ViewportController({ initial: domain.defaultViewport, width: 1 }),
    [domain.defaultViewport],
  );
  useEffect(() => () => controller.destroy(), [controller]);

  /**
   * ── LOD 선별
   *
   * 상태가 아니라 **파생값**이다. 입력(항목 색인 · 확정된 뷰포트 · 크기)이
   * 바뀌면 자동으로 다시 계산된다. 특히 청크가 도착해 `index` 가 바뀌는
   * 순간이 중요하다 — 이것을 이펙트로 처리하면 다음 뷰포트 변화가 있어야만
   * 새 봉우리가 나타나고, 사용자에게는 그냥 데이터가 없는 것으로 보인다.
   */
  const lod = useMemo(
    () => computeLod(index, lodViewport, size.width, size.height),
    [index, lodViewport, size.width, size.height],
  );

  // ── 뷰포트 확정 ──────────────────────────────────────────────
  const commitViewport = useCallback(() => {
    const viewport = controller.getSnapshot();
    lodViewportRef.current = viewport;
    setLodViewport(viewport);
    onViewportChange?.(viewport);
  }, [controller, onViewportChange]);

  const maybeCommitViewport = useCallback(() => {
    const last = lodViewportRef.current;
    const current = controller.getSnapshot();
    if (!last) {
      commitViewport();
      return;
    }
    const ratio = current.span / last.span;
    const drift = Math.abs(current.center - last.center) / current.span;
    if (
      ratio > LOD_SPAN_RATIO ||
      ratio < 1 / LOD_SPAN_RATIO ||
      drift > LOD_CENTER_DRIFT
    ) {
      commitViewport();
    }
  }, [controller, commitViewport]);

  // ── 크기 측정 ────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!plotEl) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      setSize({ width, height });
      controller.setWidth(width);
      commitViewport();
    });
    observer.observe(plotEl);
    return () => observer.disconnect();
  }, [plotEl, controller, commitViewport]);

  useEffect(() => {
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        maybeCommitViewport();
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller, maybeCommitViewport]);

  useAtlasInput(plotEl, controller);

  /**
   * 선택은 **전이**다.
   *
   * 카드를 띄우는 것으로 끝나면 툴팁이다. 뷰포트가 대상 쪽으로 움직여야
   * "도착했다" 는 감각이 생기고, 그래야 목적지가 된다.
   * 이미 충분히 좁으면 폭은 건드리지 않는다 — 클릭할 때마다 확대되면 멀미난다.
   */
  const focusItem = useCallback(
    (item: TimelineItem) => {
      setSelected(item);
      const current = controller.getSnapshot();
      const itemSpan = Math.max(item.span.end - item.span.start, 0);
      const targetSpan =
        itemSpan > 0 && itemSpan * 4 < current.span
          ? Math.max(itemSpan * 4, current.span * 0.45)
          : current.span;
      controller.animateTo(
        {
          center: (item.span.start + item.span.end) / 2,
          span: targetSpan,
        },
        520,
      );
    },
    [controller],
  );

  /**
   * 패널의 "가까운 시대" — 탐험이 연쇄되는 지점.
   *
   * ── 중요도만으로 고르면 안 된다
   * 그러면 고조선을 눌러도 제2차 세계대전이 뜬다. 4,000년 떨어진 사건은
   * "가까운 시대" 가 아니다. 시간 근접성으로 나눠 가중해야, 누를 때마다
   * 그 시대 언저리를 배회하게 된다 — 그것이 탐험의 연쇄다.
   */
  const related = useMemo(() => {
    if (!selected) return [];
    const focus = (selected.span.start + selected.span.end) / 2;
    const duration = selected.span.end - selected.span.start;
    const reach = Math.max(duration * 5, Math.abs(focus) * 0.15, 300);

    return index
      .query(focus - reach, focus + reach)
      .filter((item) => item.id !== selected.id)
      .map((item) => {
        /**
         * 이 시점을 **포함하는** 구간은 거리 0 이다.
         *
         * 중점까지의 거리로 재면 신생대(6600만 년)처럼 긴 시대가 지금 이
         * 순간을 감싸고 있는데도 "멀다" 고 판정된다. 구간 밖일 때만
         * 가장 가까운 끝까지의 거리를 쓴다.
         */
        const distance =
          item.span.start <= focus && focus <= item.span.end
            ? 0
            : Math.min(
                Math.abs(item.span.start - focus),
                Math.abs(item.span.end - focus),
              );
        return { item, score: item.significance / (1 + distance / reach) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((entry) => entry.item);
  }, [selected, index]);

  const showAll = useCallback(() => {
    setSelected(null);
    controller.animateTo(viewportForRange(UNIVERSE_START, PRESENT_EPOCH, 0.02), 1100);
  }, [controller]);

  const resetView = useCallback(() => {
    setSelected(null);
    controller.animateTo(domain.defaultViewport, 700);
  }, [controller, domain.defaultViewport]);

  const plotHeight = Math.max(1, size.height - HORIZON_PX);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-foreground">
      <EraBackdrop controller={controller} />

      <div
        ref={setPlotEl}
        tabIndex={0}
        role="application"
        aria-label="시간 지형. 드래그로 이동, 휠로 확대·축소."
        className="absolute inset-0 cursor-grab outline-none data-[dragging]:cursor-grabbing"
        style={{ paddingBottom: HORIZON_PX }}
      >
        {size.width > 0 && (
          <>
            <TerrainLayer
              controller={controller}
              index={index}
              width={size.width}
              height={plotHeight}
              fadeAfter={PRESENT_EPOCH}
            />
            <PresentMarker controller={controller} height={plotHeight} />
            <ScaleNote controller={controller} />
            <CursorReadout controller={controller} target={plotEl} />
            <EraLayer
              controller={controller}
              items={lod.eras}
              width={size.width}
            />
            <PeakLayer
              controller={controller}
              items={lod.peaks}
              labeledIds={lod.labeledIds}
              width={size.width}
              height={plotHeight}
              selectedId={selected?.id ?? null}
              onSelect={focusItem}
            />
          </>
        )}
      </div>

      {/* 크롬은 최소한만. 화면의 주인공은 시간이다 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-5 py-4">
        <span className="text-[13px] font-medium tracking-tight text-foreground/70">
          ChronoAtlas
        </span>
        <span className="text-[11px] text-muted/70">{domain.label}</span>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <TierBadge controller={controller} />
          <button
            type="button"
            onClick={resetView}
            className="rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted transition-colors hover:border-border hover:text-foreground"
          >
            인류사
          </button>
          <button
            type="button"
            onClick={showAll}
            className="rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted transition-colors hover:border-border hover:text-foreground"
          >
            138억 년
          </button>
        </div>
      </header>

      {size.width > 0 && (
        <ColdOpen controller={controller} target={domain.defaultViewport} />
      )}

      <DetailPanel
        item={selected}
        related={related}
        onClose={() => setSelected(null)}
        onNavigate={focusItem}
      />

      {domain.landmarks && (
        <Horizon
          controller={controller}
          landmarks={domain.landmarks}
          oldest={UNIVERSE_START}
          newest={PRESENT_EPOCH}
        />
      )}
    </div>
  );
}

/** 현재 티어를 조용히 알려주는 배지 — 디버그이자 방향 감각. */
function TierBadge({ controller }: { controller: ViewportController }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const viewport = controller.getSnapshot();
      setLabel(`${tierAt(viewport.span)} · ${formatTimePoint(viewport.center)}`);
    };
    update();
    return controller.subscribe(update);
  }, [controller]);
  return (
    <span
      data-testid="tier-badge"
      className="tabular hidden text-[11px] text-muted/60 sm:inline"
    >
      {label}
    </span>
  );
}
