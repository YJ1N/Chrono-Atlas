"use client";

import { useEffect, useRef } from "react";

import { formatDuration, formatTimePoint } from "@/engine/time/TimePoint";
import type { TimelineItem } from "@/engine/types/timeline";

/**
 * 상세 패널 — 툴팁이 아니라 **목적지**.
 *
 * ── 이전 구현의 문제
 * 좌하단에 뜨는 작은 카드였다. 곁다리로 읽혔고, 선택이 "정보를 띄우는 일"
 * 이상이 되지 못했다.
 *
 * ── 목적지로 만드는 세 가지
 * 압도적인 연도 타이포, 관계 칩을 통한 **탐험의 연쇄**, 그리고 선택 시
 * 뷰포트가 대상 쪽으로 움직이는 전이(Atlas 가 담당). 도착했다는 감각이
 * 있어야 목적지다.
 *
 * ── 왜 motion 을 쓰지 않는가
 * 슬라이드 인은 CSS transition 으로 충분하다. 라이브러리를 부르는 만큼의
 * 값을 하지 않는다.
 */
export function DetailPanel({
  item,
  related,
  onClose,
  onNavigate,
  fallbackFocus,
}: {
  item: TimelineItem | null;
  related: TimelineItem[];
  onClose: () => void;
  onNavigate: (item: TimelineItem) => void;
  /**
   * 돌아갈 봉우리가 사라졌을 때 포커스를 받을 곳.
   *
   * 선택하면 뷰포트가 움직이고 LOD 가 다시 돌아 그 봉우리의 DOM 노드가
   * 교체된다. 즉 "원래 자리" 가 이미 없는 것이 예외가 아니라 **보통**이다.
   */
  fallbackFocus?: HTMLElement | null;
}) {
  const panelRef = useRef<HTMLElement>(null);
  /** 패널을 열기 직전에 포커스가 있던 곳 — 보통 그 봉우리다. */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  /**
   * 열리면 포커스를 패널로 옮긴다.
   *
   * 이것이 없으면 봉우리에서 Enter 를 눌러도 포커스는 봉우리에 남고,
   * 스크린리더 사용자에게는 **아무 일도 일어나지 않은 것과 같다.**
   * 실측으로 확인한 결함이다.
   */
  useEffect(() => {
    if (!item) {
      /**
       * 닫히면 원래 자리로 돌려준다.
       *
       * 이게 없으면 포커스가 **숨겨진 패널**에 남는다. 다음에 Tab 을 누르면
       * 문서 처음부터 다시 시작하고, 그 상태에서 모달을 열면 돌아갈 곳이
       * 이미 유효하지 않다. 실측으로 확인한 결함이다.
       */
      /**
       * 돌려줄 곳이 유효하지 않을 수 있다 — 선택하면 뷰포트가 움직이고
       * LOD 가 다시 돌아 그 봉우리의 DOM 노드가 교체되기 때문이다. 그래서
       * 복원 성공 여부에 기대지 않고, **닫히는 패널이 포커스를 쥐고 있지
       * 않다**는 것부터 무조건 보장한다. 조건부 복원에만 의존했을 때
       * 브라우저 검증이 이 구멍을 잡아냈다.
       */
      const panel = panelRef.current;
      const target = returnFocusTo.current;
      returnFocusTo.current = null;

      if (target?.isConnected) target.focus();
      else fallbackFocus?.focus();

      if (panel && panel.contains(document.activeElement)) {
        panel.blur();
        fallbackFocus?.focus();
      }
      return;
    }
    if (!panelRef.current?.contains(document.activeElement)) {
      returnFocusTo.current =
        document.activeElement instanceof HTMLElement ||
        document.activeElement instanceof SVGElement
          ? (document.activeElement as HTMLElement)
          : null;
    }
    panelRef.current?.focus();
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = item !== null;
  const duration = item ? item.span.end - item.span.start : 0;

  return (
    <aside
      ref={panelRef}
      aria-hidden={!open}
      tabIndex={-1}
      role="region"
      aria-label={item ? `${item.title} 상세` : "사건 상세"}
      data-testid="detail-panel"
      className={`absolute inset-y-0 right-0 z-20 flex w-[min(420px,92vw)] flex-col border-l border-border/70 bg-surface/92 backdrop-blur-xl transition-transform duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      {item && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-7 pb-24">
          {/* 카테고리는 색 점이 아니라 좌측 스트라이프로 */}
          <div
            className="absolute inset-y-0 left-0 w-[3px]"
            style={{ background: `var(--category-${item.categoryId})` }}
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-5 top-5 text-[13px] text-muted transition-colors hover:text-foreground"
          >
            ✕
          </button>

          <div className="tabular text-[58px] font-semibold leading-[0.95] tracking-tight">
            {formatTimePoint(item.span.start)}
          </div>
          <div className="tabular mt-2 text-[12px] tracking-wide text-muted">
            {duration > 0
              ? `${formatTimePoint(item.span.end)} 까지 · ${formatDuration(duration)}`
              : item.span.approximate
                ? "근사값"
                : "단일 시점"}
          </div>

          <h2 className="mt-7 font-serif text-[26px] leading-tight tracking-tight">
            {item.title}
          </h2>

          {item.summary && (
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              {item.summary}
            </p>
          )}

          {related.length > 0 && (
            <div className="mt-8">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted/60">
                가까운 시대
              </div>
              {/* 탐험의 연쇄 — 여기서 다른 사건으로 날아간다 */}
              <div className="mt-3 flex flex-wrap gap-2">
                {related.map((other) => (
                  <button
                    key={other.id}
                    type="button"
                    onClick={() => onNavigate(other)}
                    className="rounded-full border border-border/70 px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-accent/60 hover:text-foreground"
                  >
                    {other.title}
                    <span className="tabular ml-2 text-[10px] text-muted/60">
                      {formatTimePoint(other.span.start)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto pt-8 text-[11px] text-muted/50">
            {item.sourceRef?.url ? (
              <a
                href={item.sourceRef.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                출처 ↗
              </a>
            ) : (
              <span>중요도 {(item.significance * 100).toFixed(0)}</span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
