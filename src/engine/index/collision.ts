/**
 * 충돌 회피 — 겹치는 구간을 여러 줄로 나눠 담는다.
 *
 * ── 왜 필요한가
 * LOD 는 "무엇을 보여줄지" 를 정하지만 "어디에 놓을지" 는 정하지 않는다.
 * 로마 제국·한나라·인더스 문명처럼 시간이 겹치는 구간을 한 줄에 그리면
 * 막대와 라벨이 서로를 덮어 아무것도 읽을 수 없다.
 *
 * ── 알고리즘 — 구간 분할(interval partitioning)
 * 시작점 순으로 훑으며 "마지막 항목이 이미 끝난" 첫 줄에 배치한다.
 * 그런 줄이 없으면 새 줄을 연다. 필요한 줄 수의 최솟값을 보장하는
 * 고전적 그리디이며 O(n · rows) 다.
 */

export interface Packable {
  id: string;
  /** 왼쪽 끝(px). */
  x: number;
  /** 라벨을 포함한 실효 폭(px). */
  width: number;
}

export interface PackOptions {
  /** 항목 사이 최소 여백(px). */
  gapPx?: number;
  /** 이 줄 수를 넘으면 더 배치하지 않는다. 레인 높이가 유한하기 때문이다. */
  maxRows?: number;
}

export interface PackResult {
  /** id → 줄 번호(0부터). 배치되지 못한 항목은 없다. */
  rows: Map<string, number>;
  /** 실제로 사용된 줄 수. */
  rowCount: number;
  /** 줄 수 상한 때문에 버려진 항목 id. */
  dropped: string[];
}

export const DEFAULT_GAP_PX = 6;
export const DEFAULT_MAX_ROWS = 4;

/**
 * 텍스트 폭 추정.
 *
 * 엔진은 DOM 을 모르므로 실측할 수 없다. 한글은 폰트 크기에 가깝고
 * 라틴 문자는 그 절반 정도라는 경험칙으로 근사한다.
 * 과소추정하면 라벨이 겹치므로 넉넉한 쪽으로 잡는다.
 */
export function estimateLabelWidth(text: string, fontSizePx = 11): number {
  let units = 0;
  for (const char of text) {
    // CJK·한글 음절은 전각으로 센다.
    units += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(char)
      ? 1
      : 0.55;
  }
  return units * fontSizePx;
}

/**
 * 겹치지 않도록 줄을 배정한다.
 *
 * 입력 순서와 무관하게 결과가 같도록 내부에서 정렬한다.
 * 동일 시작점은 id 로 갈라 결정적으로 만든다 — 그래야 팬 중에 줄이 튀지 않는다.
 */
export function packRows(
  items: readonly Packable[],
  options: PackOptions = {},
): PackResult {
  const { gapPx = DEFAULT_GAP_PX, maxRows = DEFAULT_MAX_ROWS } = options;

  const sorted = [...items].sort((a, b) =>
    a.x !== b.x ? a.x - b.x : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  /** 각 줄에서 현재까지 점유된 오른쪽 끝. */
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  const dropped: string[] = [];

  for (const item of sorted) {
    const right = item.x + Math.max(0, item.width);

    let placed = false;
    for (let row = 0; row < rowEnds.length; row += 1) {
      if (rowEnds[row] + gapPx <= item.x) {
        rowEnds[row] = right;
        rows.set(item.id, row);
        placed = true;
        break;
      }
    }
    if (placed) continue;

    if (rowEnds.length < maxRows) {
      rowEnds.push(right);
      rows.set(item.id, rowEnds.length - 1);
    } else {
      dropped.push(item.id);
    }
  }

  return { rows, rowCount: rowEnds.length, dropped };
}
