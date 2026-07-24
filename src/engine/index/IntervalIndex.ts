/**
 * IntervalIndex — 뷰포트와 겹치는 아이템을 O(log n + k) 로 찾는다.
 *
 * ── 왜 단순 이진탐색으로 부족한가
 * 시작점으로 정렬해 이진탐색하면 "시작이 뷰포트 안"인 것만 잡힌다.
 * 뷰포트보다 먼저 시작해서 뷰포트를 관통하는 긴 구간(로마 제국, 백악기)이
 * 통째로 누락된다. 이 누락은 줌 아웃할수록 심해진다 — 정확히 반대로 가야 하는데.
 *
 * ── 해법
 * 시작점 정렬 배열 + 종료점 최댓값 세그먼트 트리.
 * "시작 <= 질의끝" 을 이진탐색으로 자르고, 그 앞부분에서 "종료 >= 질의시작" 인
 * 것만 트리로 가지치기하며 내려간다. 길이 분포에 대한 가정이 없다.
 */

import type { TimelineItem, TimePoint } from "@/engine/types/timeline";

export interface IntervalAccessor<T> {
  (item: T): { start: TimePoint; end: TimePoint };
}

export class IntervalIndex<T> {
  /** 시작점 오름차순으로 정렬된 아이템. */
  private readonly sorted: T[];
  private readonly starts: Float64Array;
  private readonly ends: Float64Array;
  /** 각 세그먼트의 종료점 최댓값. */
  private readonly maxEnd: Float64Array;
  private readonly n: number;

  constructor(items: readonly T[], accessor: IntervalAccessor<T>) {
    this.sorted = [...items].sort(
      (a, b) => accessor(a).start - accessor(b).start,
    );
    this.n = this.sorted.length;
    this.starts = new Float64Array(this.n);
    this.ends = new Float64Array(this.n);

    for (let i = 0; i < this.n; i += 1) {
      const { start, end } = accessor(this.sorted[i]);
      this.starts[i] = start;
      // 잘못된 데이터가 질의를 조용히 망가뜨리지 않도록 여기서 정규화한다.
      this.ends[i] = Math.max(start, end);
    }

    this.maxEnd = new Float64Array(this.n > 0 ? 4 * this.n : 1);
    if (this.n > 0) this.build(1, 0, this.n - 1);
  }

  private build(node: number, lo: number, hi: number): void {
    if (lo === hi) {
      this.maxEnd[node] = this.ends[lo];
      return;
    }
    const mid = (lo + hi) >> 1;
    this.build(node * 2, lo, mid);
    this.build(node * 2 + 1, mid + 1, hi);
    this.maxEnd[node] = Math.max(
      this.maxEnd[node * 2],
      this.maxEnd[node * 2 + 1],
    );
  }

  /** `starts[i] > value` 인 첫 인덱스. */
  private upperBound(value: TimePoint): number {
    let lo = 0;
    let hi = this.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.starts[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private collect(
    node: number,
    lo: number,
    hi: number,
    limit: number,
    queryStart: TimePoint,
    out: T[],
  ): void {
    if (lo > limit) return;
    // 이 서브트리의 어떤 구간도 질의 시작에 닿지 못한다.
    if (this.maxEnd[node] < queryStart) return;
    if (lo === hi) {
      out.push(this.sorted[lo]);
      return;
    }
    const mid = (lo + hi) >> 1;
    this.collect(node * 2, lo, mid, limit, queryStart, out);
    this.collect(node * 2 + 1, mid + 1, hi, limit, queryStart, out);
  }

  /**
   * `[queryStart, queryEnd]` 와 겹치는 모든 아이템. 시작점 오름차순.
   * 경계는 포함(inclusive)이므로 점 사건이 구간 끝에 걸려도 잡힌다.
   */
  query(queryStart: TimePoint, queryEnd: TimePoint): T[] {
    const out: T[] = [];
    this.queryInto(queryStart, queryEnd, out);
    return out;
  }

  /**
   * 배열을 재사용하는 질의. 60fps 루프에서 프레임마다 새 배열을 만들지 않기 위해
   * 존재한다. 호출자가 소유한 배열을 넘긴다.
   */
  queryInto(queryStart: TimePoint, queryEnd: TimePoint, out: T[]): T[] {
    out.length = 0;
    if (this.n === 0 || queryEnd < queryStart) return out;

    const limit = this.upperBound(queryEnd) - 1;
    if (limit < 0) return out;

    this.collect(1, 0, this.n - 1, limit, queryStart, out);
    return out;
  }

  get size(): number {
    return this.n;
  }

  /** 시작점 정렬 순서의 전체 아이템. */
  get all(): readonly T[] {
    return this.sorted;
  }
}

/** TimelineItem 전용 편의 생성자. */
export function createItemIndex(
  items: readonly TimelineItem[],
): IntervalIndex<TimelineItem> {
  return new IntervalIndex(items, (item) => item.span);
}
