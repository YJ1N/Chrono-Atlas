"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { searchItems } from "@/engine/index/search";
import { formatTimePoint } from "@/engine/time/TimePoint";
import type { SearchHit, SearchRecord } from "@/engine/index/search";

/**
 * ⌘K 검색.
 *
 * ── 왜 색인을 지연해서 받는가
 * 전 항목의 검색 레코드는 번들에 넣기엔 크고(수백 KB), 대부분의 방문자는
 * 검색을 쓰지 않는다. 검색창을 처음 여는 순간 한 번만 받는다. 두 번째부터는
 * 모듈 스코프 캐시가 답한다.
 *
 * ── 왜 결과가 "이동" 인가
 * 고른 항목이 아직 받지 않은 청크에 있을 수 있다. 그래서 이 컴포넌트는
 * 항목을 넘겨주지 않고 **어디로 갈지**만 알린다. 뷰포트가 그리로 움직이면
 * 필요한 청크가 따라 로드되고, 선택은 id 로 걸어 두었으므로 저절로 맺힌다.
 */
export function CommandPalette({
  onClose,
  loadIndex,
  onNavigate,
  fallbackFocus,
}: {
  onClose: () => void;
  /** 열기 전 위치가 더 이상 유효하지 않을 때 포커스를 받을 곳. */
  fallbackFocus?: HTMLElement | null;
  loadIndex: () => Promise<readonly SearchRecord[]>;
  onNavigate: (hit: SearchHit) => void;
}) {
  const [records, setRecords] = useState<readonly SearchRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  /** 열기 전에 포커스가 있던 곳. 닫으면 여기로 돌려준다. */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  /**
   * 마운트될 때 받는다. 실패해도 앱은 계속 돈다.
   *
   * 이 컴포넌트는 **열려 있을 때만 마운트된다** — 그래서 "열릴 때 상태를
   * 초기화하는" 이펙트가 필요 없다. 닫았다 열면 새 컴포넌트다.
   * 색인 자체는 로더의 모듈 캐시가 들고 있으므로 다시 받지 않는다.
   */
  useEffect(() => {
    let cancelled = false;
    loadIndex()
      .then((loaded) => {
        if (!cancelled) setRecords(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadIndex]);

  /**
   * 포커스를 다이얼로그 안에 가둔다.
   *
   * `aria-modal="true"` 는 스크린리더에게 "밖은 없다" 고 **말할** 뿐,
   * Tab 을 막지는 않는다. 가두지 않으면 결과 목록 끝에서 Tab 을 눌렀을 때
   * 뒤에 있는 지형의 봉우리 40개로 빠져나간다 — 열려 있는 모달 뒤로.
   *
   * 닫을 때는 열기 전 위치로 되돌린다. 그러지 않으면 포커스가 사라진
   * 결과 버튼에 남아 사실상 body 로 떨어진다 — 실측으로 확인한 결함이다.
   */
  useEffect(() => {
    const active = document.activeElement;
    // 숨겨진 요소로 돌려보내면 포커스가 사실상 사라진다.
    const usable =
      active instanceof HTMLElement && !active.closest('[aria-hidden="true"]')
        ? active
        : null;
    returnFocusTo.current = usable;

    return () => {
      const target = returnFocusTo.current;
      if (target?.isConnected) target.focus();
      else fallbackFocus?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Escape 는 문서 수준에서 듣는다.
   *
   * 처음에는 입력창의 `onKeyDown` 에만 달았는데, 결과 목록으로 Tab 한 뒤에는
   * Escape 가 아예 먹지 않았다 — 모달을 열고 아래로 내려가면 키보드로 나올
   * 길이 없어진다. 실측으로 확인한 결함이다.
   */
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [onClose]);

  useEffect(() => {
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!root.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab, true);
    return () => document.removeEventListener("keydown", onTab, true);
  }, []);

  const hits = useMemo(
    () => (records ? searchItems(records, query, 24) : []),
    [records, query],
  );

  // 결과가 바뀌면 선택 위치를 범위 안으로 되돌린다.
  const clampedActive = Math.min(active, Math.max(0, hits.length - 1));

  const choose = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      onNavigate(hit);
      onClose();
    },
    [onNavigate, onClose],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
          setActive((i) => Math.min(i + 1, hits.length - 1));
          break;
        case "ArrowUp":
          setActive((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          choose(hits[clampedActive]);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [hits, clampedActive, choose],
  );

  // 키보드로 내려갈 때 화면 밖으로 나가지 않게 한다.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [clampedActive, hits]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-center bg-background/70 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      data-testid="command-palette"
    >
      <div
        ref={dialogRef}
        className="w-[min(560px,92vw)] overflow-hidden rounded-xl border border-border/70 bg-surface/95 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="사건 검색"
      >
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="사건 검색 — 빅뱅, 워털루 전투, 아폴로…"
          aria-label="사건 검색"
          aria-controls="command-palette-results"
          className="w-full border-b border-border/60 bg-transparent px-4 py-3.5 text-[15px] text-foreground outline-none placeholder:text-muted/60"
        />

        <ul
          ref={listRef}
          id="command-palette-results"
          role="listbox"
          aria-label="검색 결과"
          className="max-h-[46vh] overflow-y-auto py-1"
        >
          {!records && !failed && (
            <li className="px-4 py-6 text-center text-[13px] text-muted">
              색인을 불러오는 중…
            </li>
          )}
          {failed && (
            <li className="px-4 py-6 text-center text-[13px] text-muted">
              검색 색인을 불러오지 못했다. 탐험은 계속할 수 있다.
            </li>
          )}
          {records && hits.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-muted">
              «{query}» 에 해당하는 사건이 없다.
            </li>
          )}
          {hits.map((hit, i) => (
            <li key={hit.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === clampedActive}
                data-active={i === clampedActive}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(hit)}
                className="flex w-full items-baseline gap-3 px-4 py-2 text-left transition-colors data-[active=true]:bg-foreground/8"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                  {hit.title}
                </span>
                <span className="tabular shrink-0 text-[11px] text-muted">
                  {formatTimePoint(hit.start)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2 text-[10.5px] text-muted/70">
          <span>↑↓ 이동</span>
          <span>↵ 이동하기</span>
          <span>esc 닫기</span>
          {records && <span className="ml-auto">{records.length}건 색인</span>}
        </div>
      </div>
    </div>
  );
}
