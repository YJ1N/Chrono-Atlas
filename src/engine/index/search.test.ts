import { describe, expect, it } from "vitest";

import { searchItems } from "./search";
import type { SearchRecord } from "./search";

const RECORDS: SearchRecord[] = [
  ["a", "제2차 세계 대전", 1939, 0.98, null],
  ["b", "제1차 세계 대전", 1914, 0.95, null],
  ["c", "세계 인권 선언", 1948, 0.4, "history-003"],
  ["d", "워털루 전투", 1815, 0.72, "history-002"],
  ["e", "전투기 개발사", 1950, 0.05, "history-004"],
  ["f", "한산도 대첩", 1592, 0.3, "history-001"],
  ["g", "Apollo 11", 1969, 0.9, null],
  ["h", "apollo program", 1961, 0.55, "history-004"],
];

const ids = (query: string, limit?: number) =>
  searchItems(RECORDS, query, limit).map((h) => h.id);

describe("searchItems", () => {
  it("부분 문자열로 찾는다", () => {
    expect(ids("워털루")).toEqual(["d"]);
  });

  it("한국어 중간 일치도 잡는다", () => {
    expect(ids("대첩")).toEqual(["f"]);
  });

  it("대소문자를 가리지 않는다", () => {
    expect(ids("APOLLO")).toEqual(["g", "h"]);
  });

  it("일치가 없으면 빈 배열", () => {
    expect(ids("존재하지않는것")).toEqual([]);
  });

  it("청크 위치를 함께 돌려준다 — 선택 시 그 청크만 받으면 된다", () => {
    const [hit] = searchItems(RECORDS, "워털루");
    expect(hit.chunkId).toBe("history-002");
    expect(hit.start).toBe(1815);
  });

  it("번들에 있는 항목은 chunkId 가 null", () => {
    expect(searchItems(RECORDS, "Apollo 11")[0].chunkId).toBeNull();
  });

  /**
   * 랭킹 설계의 핵심 — 일치 강도가 주(主), 중요도가 부(副)다.
   */
  it("중요도가 같으면 앞머리 일치가 이긴다", () => {
    const same: SearchRecord[] = [
      ["mid", "위대한 항해", 1, 0.5, null],
      ["pre", "항해 일지", 2, 0.5, null],
    ];
    expect(searchItems(same, "항해").map((h) => h.id)).toEqual(["pre", "mid"]);
  });

  /**
   * 반대 방향도 의도된 것이다. "전투" 를 친 사람이 원하는 것은
   * 무명의 "전투기 개발사"(앞머리 일치)가 아니라 유명한 "워털루 전투" 다.
   * 중요도 격차가 충분히 크면 약한 일치를 뒤집을 수 있어야 한다.
   *
   * (처음에는 앞머리 일치가 무조건 이겨야 한다고 단언했다가 이 테스트에
   * 걸렸다. 걸린 쪽이 옳았다.)
   */
  it("중요도 격차가 크면 약한 일치를 뒤집는다", () => {
    // "전투기 개발사"(0.05, 앞머리) vs "워털루 전투"(0.72, 단어 경계)
    expect(ids("전투")[0]).toBe("d");
  });

  it("일치 강도가 같으면 중요도가 가른다", () => {
    // 둘 다 앞머리 일치가 아닌 중간 일치. 중요도 0.98 > 0.95
    expect(ids("세계 대전")).toEqual(["a", "b"]);
  });

  it("단어 경계 일치가 단순 포함을 이긴다", () => {
    const order = ids("11");
    expect(order[0]).toBe("g");
  });

  /** 검색창을 열자마자 빈 화면이면 무엇을 칠 수 있는지 알 수 없다. */
  it("빈 질의는 가장 중요한 것들을 돌려준다", () => {
    expect(ids("", 3)).toEqual(["a", "b", "g"]);
  });

  it("공백만 있는 질의도 마찬가지", () => {
    expect(ids("   ", 2)).toEqual(["a", "b"]);
  });

  it("개수를 제한한다", () => {
    expect(searchItems(RECORDS, "", 2)).toHaveLength(2);
    expect(searchItems(RECORDS, "세계", 1)).toHaveLength(1);
  });

  /** 같은 질의가 항상 같은 순서를 내야 결과가 깜빡이지 않는다. */
  it("동점이어도 순서가 재현 가능하다", () => {
    const tied: SearchRecord[] = [
      ["z", "같은 제목", 1, 0.5, null],
      ["y", "같은 제목", 2, 0.5, null],
    ];
    expect(searchItems(tied, "같은").map((h) => h.id)).toEqual(["y", "z"]);
    expect(searchItems([...tied].reverse(), "같은").map((h) => h.id)).toEqual([
      "y",
      "z",
    ]);
  });

  it("빈 색인에도 터지지 않는다", () => {
    expect(searchItems([], "무엇이든")).toEqual([]);
    expect(searchItems([], "")).toEqual([]);
  });
});
