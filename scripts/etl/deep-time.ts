/**
 * 심원한 시간 큐레이션 — Wikidata 가 답하지 못하는 138억~수백만 년 구간.
 *
 * ── 왜 이 파일이 존재하는가
 * Wikidata 는 지질시대(기·세·대)는 기계가독 날짜로 잘 주지만, 빅뱅·최초의 별·
 * 생명의 기원 같은 **우주론·진화사 사건**에는 시점 속성이 거의 없다. 실측으로
 * 확인한 사실이다. 그 구간을 비워 두면 cosmic 티어의 지형이 평평해지고,
 * 그것은 곧 "138억 년을 탐험한다" 는 주장이 빈 화면이 된다는 뜻이다.
 *
 * ── 손으로 적는 것을 최소화했다
 * 여기 있는 것은 **시간값과 Q-id 뿐**이다. 제목·요약·significance 는 전부
 * Wikidata 에서 가져온다. 그래서 이 항목들은 다른 수천 건과 **똑같은 자로**
 * 점수가 매겨진다. 중요도를 손으로 정하는 순간 Y축의 일관성이 깨진다.
 *
 * ── Q-id 는 전부 조회로 확인했다
 * 검색 1순위가 실제로 틀린 경우가 있었다: 'Rodinia' 1순위는 곤충 속(Q3438197),
 * 'Pangaea' 1순위는 마일스 데이비스의 1976년 라이브 앨범(Q1808138)이었다.
 * 확인 없이 넣었으면 우주의 지형에 재즈 앨범이 놓였을 것이다.
 */

import { PRESENT_EPOCH } from "@/engine/time/TimePoint";
import type { Candidate } from "./normalize";
import type { Binding } from "./sparql";
import type { ItemLayer, TimePoint, TimePrecision } from "@/engine/types/timeline";

/** "몇 년 전" → TimePoint. 심원한 시간의 출처는 전부 '현재로부터 몇 년 전' 이다. */
const ago = (years: number): TimePoint => PRESENT_EPOCH - years;

const GA = 1e9;
const MA = 1e6;
const KA = 1e3;

export interface DeepTimeEntry {
  qid: string;
  start: TimePoint;
  /** 생략하면 점 사건. */
  end?: TimePoint;
  laneId: string;
  categoryId: string;
  layer?: ItemLayer;
  precision: TimePrecision;
  /** 이 시간값의 근거. 손으로 넣은 숫자에는 출처가 있어야 한다. */
  basis: string;
}

export const DEEP_TIME: DeepTimeEntry[] = [
  // ── 우주 ────────────────────────────────────────────────────
  {
    qid: "Q323",
    start: ago(13.787 * GA),
    laneId: "cosmos",
    categoryId: "cosmic",
    precision: "era",
    basis: "Planck 2018 우주 나이 13.787 ± 0.020 Ga",
  },
  {
    qid: "Q15605",
    start: ago(13.787 * GA - 380 * KA),
    laneId: "cosmos",
    categoryId: "cosmic",
    precision: "era",
    basis: "재결합기 — 빅뱅 후 약 38만 년",
  },
  {
    qid: "Q10458671",
    start: ago(13.59 * GA),
    laneId: "cosmos",
    categoryId: "cosmic",
    precision: "era",
    basis: "종족 III 별 — 빅뱅 후 약 2억 년(시뮬레이션 추정)",
  },
  {
    qid: "Q1670901",
    start: ago(13.4 * GA),
    end: ago(12.8 * GA),
    laneId: "cosmos",
    categoryId: "cosmic",
    precision: "era",
    basis: "재이온화기 — 적색편이 z≈20~6",
  },
  {
    qid: "Q321",
    start: ago(13.6 * GA),
    laneId: "cosmos",
    categoryId: "cosmic",
    precision: "era",
    basis: "우리 은하 헤일로 최고령 별 나이",
  },
  {
    qid: "Q544",
    start: ago(4.568 * GA),
    laneId: "cosmos",
    categoryId: "cosmic",
    precision: "era",
    basis: "CAI 응축 연대 4.567~4.571 Ga",
  },

  // ── 지구 ────────────────────────────────────────────────────
  {
    qid: "Q2",
    start: ago(4.54 * GA),
    laneId: "cosmos",
    categoryId: "geology",
    precision: "era",
    basis: "지구 강착 완료 4.54 ± 0.05 Ga",
  },
  {
    qid: "Q405",
    start: ago(4.51 * GA),
    laneId: "cosmos",
    categoryId: "geology",
    precision: "era",
    basis: "테이아 충돌설 — 달 시료 연대",
  },
  {
    qid: "Q1610127",
    start: ago(4.4 * GA),
    laneId: "cosmos",
    categoryId: "geology",
    precision: "era",
    basis: "저어콘 산소동위원소가 시사하는 액체 물의 존재",
  },
  {
    qid: "Q591571",
    start: ago(4.1 * GA),
    end: ago(3.8 * GA),
    laneId: "cosmos",
    categoryId: "geology",
    precision: "era",
    basis: "후기 대충돌기 — 달 크레이터 연대 분포",
  },
  {
    qid: "Q7950",
    start: ago(3.2 * GA),
    laneId: "cosmos",
    categoryId: "geology",
    precision: "era",
    basis: "판구조 운동 개시 추정(논쟁 중, 3.2~3.0 Ga)",
  },
  {
    qid: "Q185161",
    start: ago(1.1 * GA),
    end: ago(750 * MA),
    laneId: "cosmos",
    categoryId: "geology",
    layer: "context",
    precision: "era",
    basis: "초대륙 로디니아 존속 기간",
  },
  {
    qid: "Q214689",
    start: ago(720 * MA),
    end: ago(635 * MA),
    laneId: "cosmos",
    categoryId: "geology",
    precision: "era",
    basis: "크라이오제니아기 전 지구 빙하기(스터트·마리노아)",
  },
  {
    qid: "Q4398",
    start: ago(335 * MA),
    end: ago(175 * MA),
    laneId: "cosmos",
    categoryId: "geology",
    layer: "context",
    precision: "era",
    basis: "초대륙 판게아 존속 기간",
  },

  // ── 생명 ────────────────────────────────────────────────────
  {
    qid: "Q231218",
    start: ago(3.7 * GA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "이수아 표석 탄소동위원소 — 최초 생명 흔적",
  },
  {
    qid: "Q11982",
    start: ago(3.4 * GA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "무산소 광합성 개시 추정",
  },
  {
    qid: "Q837561",
    start: ago(2.4 * GA),
    end: ago(2.0 * GA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "대산소화 사건 — 호상철광층 형성기",
  },
  {
    qid: "Q19088",
    start: ago(1.8 * GA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "진핵생물 화석 최초 출현",
  },
  {
    qid: "Q36458",
    start: ago(1.5 * GA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "다세포성 최초 증거",
  },
  {
    qid: "Q723846",
    start: ago(635 * MA),
    end: ago(538.8 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "에디아카라 생물군 — 에디아카라기 전 구간",
  },
  {
    qid: "Q32919",
    start: ago(538.8 * MA),
    end: ago(515 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "캄브리아 대폭발 — 캄브리아기 초 약 2천만 년",
  },
  {
    qid: "Q192154",
    start: ago(470 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "육상식물 최초 포자 기록(오르도비스기 중기)",
  },
  {
    qid: "Q19159",
    start: ago(390 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "사지동물 상륙(데본기 후기)",
  },
  {
    qid: "Q141118",
    start: ago(251.9 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "페름기 말 대멸종 251.902 ± 0.024 Ma",
  },
  {
    qid: "Q430",
    start: ago(230 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "공룡 최초 출현(트라이아스기 후기)",
  },
  {
    qid: "Q7377",
    start: ago(225 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "포유형류 최초 출현",
  },
  {
    qid: "Q55811",
    start: ago(66 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "백악기-고진기 대멸종 66.043 ± 0.043 Ma",
  },
  {
    qid: "Q7380",
    start: ago(55 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "영장류 최초 확실한 화석(에오세 초)",
  },

  // ── 인류 ────────────────────────────────────────────────────
  {
    qid: "Q372949",
    start: ago(4.4 * MA),
    laneId: "life",
    categoryId: "biology",
    precision: "era",
    basis: "아르디피테쿠스 라미두스 — 직립보행 증거",
  },
  {
    qid: "Q746287",
    start: ago(2.6 * MA),
    laneId: "civilization",
    categoryId: "civilization",
    precision: "millennium",
    basis: "올도완 석기 — 고나 유적 2.6 Ma",
  },
  {
    qid: "Q912205",
    start: ago(1.0 * MA),
    laneId: "civilization",
    categoryId: "civilization",
    precision: "millennium",
    basis: "원더워크 동굴 — 통제된 불 사용 증거",
  },
  {
    qid: "Q15978631",
    start: ago(300 * KA),
    laneId: "life",
    categoryId: "biology",
    precision: "millennium",
    basis: "제벨 이르후드 화석 — 약 30만 년 전",
  },
  {
    qid: "Q2706556",
    start: ago(70 * KA),
    laneId: "civilization",
    categoryId: "civilization",
    precision: "millennium",
    basis: "행동 현대성 — 블롬보스 동굴 등",
  },
  {
    qid: "Q7478419",
    start: ago(70 * KA),
    laneId: "civilization",
    categoryId: "civilization",
    precision: "millennium",
    basis: "아프리카 기원 확산 — 유전학적 병목 추정",
  },
  {
    qid: "Q180548",
    start: ago(12 * KA),
    end: ago(6 * KA),
    laneId: "civilization",
    categoryId: "civilization",
    layer: "context",
    precision: "millennium",
    basis: "신석기 혁명 — 비옥한 초승달 작물화 개시",
  },
  {
    qid: "Q1340267",
    start: ago(5.2 * KA),
    laneId: "civilization",
    categoryId: "civilization",
    precision: "century",
    basis: "우루크 설형문자 — 기원전 3200년경",
  },
];

/**
 * 큐레이션 항목의 라벨·설명·sitelink 를 Wikidata 에서 가져오는 쿼리.
 *
 * `VALUES` 로 대상을 한정하므로 1초 남짓에 끝난다. 같은 정보를 무제한
 * 집합에서 뽑으려 하면 90초 제한에 걸린다 — 실측으로 확인했다.
 */
export function deepTimeQuery(labelLanguages: string): string {
  const values = DEEP_TIME.map((e) => `wd:${e.qid}`).join(" ");
  return `SELECT ?item ?itemLabel ?itemDescription ?sitelinks WHERE {
  VALUES ?item { ${values} }
  ?item wikibase:sitelinks ?sitelinks .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${labelLanguages}". }
}`;
}

const QID_URI = /\/(Q\d+)$/;
const BARE_QID = /^Q\d+$/;

/**
 * 큐레이션한 시간값 + Wikidata 에서 온 라벨·설명·sitelink → 후보.
 *
 * 시간은 이쪽이, 나머지는 저쪽이 준다. 이 분업이 이 파일의 요점이다.
 */
export function buildDeepTimeCandidates(rows: Binding[]): {
  candidates: Candidate[];
  missing: string[];
} {
  const meta = new Map<string, { label: string; description?: string; sitelinks: number }>();

  for (const row of rows) {
    const qid = QID_URI.exec(row.item?.value ?? "")?.[1];
    if (!qid) continue;
    const label = row.itemLabel?.value?.trim();
    if (!label || BARE_QID.test(label)) continue;
    const description = row.itemDescription?.value?.trim();
    meta.set(qid, {
      label,
      ...(description && !BARE_QID.test(description) ? { description } : {}),
      sitelinks: Number(row.sitelinks?.value ?? 0),
    });
  }

  const candidates: Candidate[] = [];
  const missing: string[] = [];

  for (const entry of DEEP_TIME) {
    const info = meta.get(entry.qid);
    if (!info) {
      // 조용히 빠뜨리지 않는다. Q-id 가 삭제·병합되면 여기서 드러난다.
      missing.push(entry.qid);
      continue;
    }
    candidates.push({
      id: `wd-${entry.qid}`,
      qid: entry.qid,
      sitelinks: info.sitelinks,
      rawPrecision: 0,
      julian: false,
      span: {
        start: entry.start,
        end: entry.end ?? entry.start,
        precision: entry.precision,
        approximate: true,
      },
      title: info.label,
      ...(info.description ? { summary: info.description } : {}),
      categoryId: entry.categoryId,
      laneId: entry.laneId,
      layer: entry.layer ?? "primary",
      sourceRef: {
        externalId: entry.qid,
        provider: "wikidata",
        url: `https://www.wikidata.org/wiki/${entry.qid}`,
        attribution: `시간값 출처: ${entry.basis}`,
      },
    });
  }

  return { candidates, missing };
}
