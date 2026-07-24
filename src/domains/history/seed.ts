/**
 * Phase 2 검증용 시드 데이터.
 *
 * Phase 3 의 Wikidata ETL 이 이 파일을 대체한다. 위치(`domains/history/`)는
 * 그대로이고 **출처만** 바뀐다 — 그래서 지금 스키마를 맞춰두는 것이 중요하다.
 *
 * 렌더링 엔진을 실데이터 없이 검증하기 위한 것이므로, 규모보다 **분포**를
 * 노렸다. 138억 년에 걸쳐 밀도가 극단적으로 불균등해야 LOD 가 시험된다:
 * 심원한 시간은 수억 년에 하나, 20세기는 한 해에 여러 개.
 *
 * `significance` 는 수작업 추정치다. Phase 3 에서 Wikidata sitelink 수의
 * 로그 정규화로 대체된다 (ADR-009).
 */

import { fromCalendarDate } from "@/engine/time/TimePoint";
import type { ItemLayer, TimelineItem } from "@/engine/types/timeline";

type LaneId = "cosmos" | "life" | "civilization" | "science" | "culture";
type CategoryId =
  | "cosmic"
  | "geology"
  | "biology"
  | "civilization"
  | "conflict"
  | "science"
  | "culture";

interface SeedSpec {
  id: string;
  title: string;
  start: number;
  /** 생략하면 점 사건. */
  end?: number;
  significance: number;
  lane: LaneId;
  category: CategoryId;
  layer?: ItemLayer;
  summary?: string;
}

const GA = 1e9;
const MA = 1e6;

function build({
  id,
  title,
  start,
  end,
  significance,
  lane,
  category,
  layer = "primary",
  summary,
}: SeedSpec): TimelineItem {
  const magnitude = Math.abs(start);
  return {
    id,
    span: {
      start,
      end: end ?? start,
      // 심원한 시간은 본질적으로 근사값이다. 정밀도를 정직하게 표기한다.
      precision:
        magnitude > 1e8
          ? "era"
          : magnitude > 1e5
            ? "millennium"
            : magnitude > 3000
              ? "century"
              : "year",
      approximate: magnitude > 3000 || undefined,
    },
    title,
    summary,
    significance,
    categoryId: category,
    laneId: lane,
    layer,
  };
}

const SPECS: SeedSpec[] = [
  // ── 우주 ────────────────────────────────────────────────────
  { id: "big-bang", title: "빅뱅", start: -13.787 * GA, significance: 1.0, lane: "cosmos", category: "cosmic", summary: "시공간과 물질의 시작. 우주 나이 추정치는 137.87억 년이다." },
  { id: "recombination", title: "우주 배경복사 분리", start: -13.787 * GA + 380_000, significance: 0.62, lane: "cosmos", category: "cosmic", summary: "우주가 투명해지며 빛이 자유롭게 이동하기 시작했다." },
  { id: "first-stars", title: "최초의 별", start: -13.6 * GA, significance: 0.78, lane: "cosmos", category: "cosmic" },
  { id: "first-galaxies", title: "최초의 은하", start: -13.4 * GA, significance: 0.7, lane: "cosmos", category: "cosmic" },
  { id: "milky-way", title: "우리 은하 형성", start: -13.2 * GA, significance: 0.74, lane: "cosmos", category: "cosmic" },
  { id: "solar-system", title: "태양계 형성", start: -4.6 * GA, significance: 0.92, lane: "cosmos", category: "cosmic" },
  { id: "earth-formed", title: "지구 형성", start: -4.54 * GA, significance: 0.95, lane: "cosmos", category: "geology", summary: "원시 태양계 원반의 먼지가 뭉쳐 지구가 만들어졌다." },
  { id: "theia-impact", title: "테이아 충돌 — 달 형성", start: -4.51 * GA, significance: 0.8, lane: "cosmos", category: "geology" },
  { id: "late-bombardment", title: "후기 대충돌기", start: -4.1 * GA, end: -3.8 * GA, significance: 0.55, lane: "cosmos", category: "geology" },
  { id: "oceans", title: "원시 바다 형성", start: -4.4 * GA, significance: 0.66, lane: "cosmos", category: "geology" },
  { id: "plate-tectonics", title: "판구조 운동 시작", start: -3.2 * GA, significance: 0.52, lane: "cosmos", category: "geology" },
  { id: "rodinia", title: "초대륙 로디니아", start: -1.1 * GA, end: -750 * MA, significance: 0.42, lane: "cosmos", category: "geology" },
  { id: "snowball-earth", title: "눈덩이 지구", start: -720 * MA, end: -635 * MA, significance: 0.5, lane: "cosmos", category: "geology" },
  { id: "pangaea", title: "초대륙 판게아", start: -335 * MA, end: -175 * MA, significance: 0.58, lane: "cosmos", category: "geology" },

  // ── 지질시대 리본 (context 레이어) ──────────────────────────
  { id: "era-hadean", title: "명왕누대", start: -4.54 * GA, end: -4.0 * GA, significance: 0.6, lane: "cosmos", category: "geology", layer: "context" },
  { id: "era-archean", title: "시생누대", start: -4.0 * GA, end: -2.5 * GA, significance: 0.6, lane: "cosmos", category: "geology", layer: "context" },
  { id: "era-proterozoic", title: "원생누대", start: -2.5 * GA, end: -538.8 * MA, significance: 0.6, lane: "cosmos", category: "geology", layer: "context" },
  { id: "era-paleozoic", title: "고생대", start: -538.8 * MA, end: -251.9 * MA, significance: 0.65, lane: "cosmos", category: "geology", layer: "context" },
  { id: "era-mesozoic", title: "중생대", start: -251.9 * MA, end: -66 * MA, significance: 0.68, lane: "cosmos", category: "geology", layer: "context" },
  { id: "era-cenozoic", title: "신생대", start: -66 * MA, end: 2026, significance: 0.65, lane: "cosmos", category: "geology", layer: "context" },

  // ── 생명 ────────────────────────────────────────────────────
  { id: "abiogenesis", title: "생명의 기원", start: -3.7 * GA, significance: 0.94, lane: "life", category: "biology", summary: "자기복제 화학계에서 최초의 생명이 등장했다." },
  { id: "photosynthesis", title: "광합성 등장", start: -3.4 * GA, significance: 0.82, lane: "life", category: "biology" },
  { id: "great-oxidation", title: "대산소화 사건", start: -2.4 * GA, end: -2.0 * GA, significance: 0.85, lane: "life", category: "biology", summary: "시아노박테리아가 대기를 산소로 채웠다. 당시 생물 대부분에게는 대멸종이었다." },
  { id: "eukaryotes", title: "진핵생물 등장", start: -1.8 * GA, significance: 0.8, lane: "life", category: "biology" },
  { id: "sexual-reproduction", title: "유성생식 등장", start: -1.2 * GA, significance: 0.6, lane: "life", category: "biology" },
  { id: "multicellular", title: "다세포 생물", start: -900 * MA, significance: 0.75, lane: "life", category: "biology" },
  { id: "ediacaran", title: "에디아카라 생물군", start: -575 * MA, end: -538 * MA, significance: 0.48, lane: "life", category: "biology" },
  { id: "cambrian", title: "캄브리아기 대폭발", start: -538.8 * MA, end: -485 * MA, significance: 0.88, lane: "life", category: "biology", summary: "현존 동물문 대부분이 지질학적으로 짧은 기간에 출현했다." },
  { id: "first-vertebrates", title: "최초의 척추동물", start: -525 * MA, significance: 0.62, lane: "life", category: "biology" },
  { id: "land-plants", title: "육상 식물", start: -470 * MA, significance: 0.7, lane: "life", category: "biology" },
  { id: "ordovician-extinction", title: "오르도비스기 대멸종", start: -443.8 * MA, significance: 0.55, lane: "life", category: "biology" },
  { id: "first-insects", title: "최초의 곤충", start: -400 * MA, significance: 0.55, lane: "life", category: "biology" },
  { id: "tetrapods", title: "네발동물 육상 진출", start: -390 * MA, significance: 0.72, lane: "life", category: "biology" },
  { id: "devonian-extinction", title: "데본기 대멸종", start: -372 * MA, significance: 0.5, lane: "life", category: "biology" },
  { id: "carboniferous-forests", title: "석탄기 대삼림", start: -359 * MA, end: -299 * MA, significance: 0.52, lane: "life", category: "biology" },
  { id: "amniotes", title: "양막류 등장", start: -312 * MA, significance: 0.5, lane: "life", category: "biology" },
  { id: "permian-extinction", title: "페름기 대멸종", start: -251.9 * MA, significance: 0.8, lane: "life", category: "biology", summary: "해양 종의 약 81%가 사라진 사상 최대의 멸종." },
  { id: "first-dinosaurs", title: "최초의 공룡", start: -233 * MA, significance: 0.74, lane: "life", category: "biology" },
  { id: "first-mammals", title: "최초의 포유류", start: -225 * MA, significance: 0.76, lane: "life", category: "biology" },
  { id: "first-birds", title: "시조새", start: -150 * MA, significance: 0.6, lane: "life", category: "biology" },
  { id: "flowering-plants", title: "속씨식물 등장", start: -130 * MA, significance: 0.58, lane: "life", category: "biology" },
  { id: "kpg-extinction", title: "백악기–고제3기 대멸종", start: -66 * MA, significance: 0.9, lane: "life", category: "biology", summary: "소행성 충돌로 비조류 공룡이 절멸하고 포유류의 시대가 열렸다." },
  { id: "primates", title: "영장류 등장", start: -55 * MA, significance: 0.68, lane: "life", category: "biology" },
  { id: "hominidae", title: "사람과 분화", start: -15 * MA, significance: 0.62, lane: "life", category: "biology" },
  { id: "chimp-split", title: "침팬지와의 분기", start: -6.5 * MA, significance: 0.7, lane: "life", category: "biology" },
  { id: "bipedalism", title: "직립보행", start: -4.2 * MA, significance: 0.72, lane: "life", category: "biology" },
  { id: "homo-habilis", title: "호모 하빌리스", start: -2.4 * MA, significance: 0.6, lane: "life", category: "biology" },
  { id: "homo-erectus", title: "호모 에렉투스", start: -1.9 * MA, significance: 0.68, lane: "life", category: "biology" },
  { id: "neanderthal", title: "네안데르탈인", start: -400_000, end: -40_000, significance: 0.66, lane: "life", category: "biology" },
  { id: "homo-sapiens", title: "호모 사피엔스 등장", start: -300_000, significance: 0.9, lane: "life", category: "biology" },
  { id: "out-of-africa", title: "아프리카 탈출", start: -70_000, significance: 0.76, lane: "life", category: "biology" },

  // ── 과학 · 기술 (선사) ──────────────────────────────────────
  { id: "stone-tools", title: "석기 사용", start: -3.3 * MA, significance: 0.72, lane: "science", category: "science" },
  { id: "fire-control", title: "불의 통제", start: -1 * MA, significance: 0.8, lane: "science", category: "science" },
  { id: "cooking", title: "조리의 시작", start: -500_000, significance: 0.55, lane: "science", category: "science" },
  { id: "clothing", title: "의복", start: -170_000, significance: 0.45, lane: "science", category: "science" },
  { id: "bow-arrow", title: "활과 화살", start: -64_000, significance: 0.48, lane: "science", category: "science" },
  { id: "agriculture", title: "농업 혁명", start: -10_000, significance: 0.92, lane: "science", category: "science", summary: "수렵채집에서 정주 농경으로. 이후 모든 문명의 전제 조건이 되었다." },
  { id: "pottery", title: "토기", start: -18_000, significance: 0.5, lane: "science", category: "science" },
  { id: "wheel", title: "바퀴", start: -3500, significance: 0.78, lane: "science", category: "science" },
  { id: "bronze", title: "청동기", start: -3300, significance: 0.66, lane: "science", category: "science" },
  { id: "iron", title: "철기", start: -1200, significance: 0.7, lane: "science", category: "science" },

  // ── 문화 (선사) ─────────────────────────────────────────────
  { id: "cave-art", title: "동굴 벽화", start: -45_000, significance: 0.62, lane: "culture", category: "culture" },
  { id: "burial-ritual", title: "매장 의례", start: -100_000, significance: 0.5, lane: "culture", category: "culture" },
  { id: "gobekli-tepe", title: "괴베클리 테페", start: -9500, significance: 0.55, lane: "culture", category: "culture" },
  { id: "writing", title: "문자의 발명", start: -3200, significance: 0.9, lane: "culture", category: "culture", summary: "수메르 쐐기문자. 기억이 개인의 수명을 넘어 축적되기 시작했다." },

  // ── 고대 문명 ───────────────────────────────────────────────
  { id: "sumer", title: "수메르 도시국가", start: -4500, end: -1900, significance: 0.72, lane: "civilization", category: "civilization" },
  { id: "egypt-old", title: "이집트 고왕국", start: -2686, end: -2181, significance: 0.78, lane: "civilization", category: "civilization" },
  { id: "great-pyramid", title: "기자 대피라미드", start: -2560, significance: 0.74, lane: "culture", category: "culture" },
  { id: "indus", title: "인더스 문명", start: -3300, end: -1300, significance: 0.7, lane: "civilization", category: "civilization" },
  { id: "gojoseon", title: "고조선", start: -2333, end: -108, significance: 0.6, lane: "civilization", category: "civilization", summary: "한국사 최초의 국가로 기록된 정치체." },
  { id: "hammurabi", title: "함무라비 법전", start: -1754, significance: 0.66, lane: "civilization", category: "civilization" },
  { id: "shang", title: "상나라", start: -1600, end: -1046, significance: 0.62, lane: "civilization", category: "civilization" },
  { id: "bronze-collapse", title: "청동기 시대 붕괴", start: -1177, significance: 0.55, lane: "civilization", category: "conflict" },
  { id: "homer", title: "호메로스 서사시", start: -750, significance: 0.6, lane: "culture", category: "culture" },
  { id: "buddha", title: "고타마 싯다르타", start: -563, end: -483, significance: 0.82, lane: "culture", category: "culture" },
  { id: "confucius", title: "공자", start: -551, end: -479, significance: 0.8, lane: "culture", category: "culture" },
  { id: "athens-democracy", title: "아테네 민주정", start: -508, significance: 0.78, lane: "civilization", category: "civilization" },
  { id: "greco-persian", title: "그리스–페르시아 전쟁", start: -499, end: -449, significance: 0.62, lane: "civilization", category: "conflict" },
  { id: "socrates", title: "소크라테스", start: -470, end: -399, significance: 0.74, lane: "culture", category: "culture" },
  { id: "euclid", title: "에우클레이데스 『원론』", start: -300, significance: 0.72, lane: "science", category: "science" },
  { id: "alexander", title: "알렉산드로스 원정", start: -334, end: -323, significance: 0.72, lane: "civilization", category: "conflict" },
  { id: "qin-unification", title: "진의 중국 통일", start: -221, significance: 0.76, lane: "civilization", category: "civilization" },
  { id: "archimedes", title: "아르키메데스", start: -287, end: -212, significance: 0.68, lane: "science", category: "science" },
  { id: "han", title: "한나라", start: -206, end: 220, significance: 0.72, lane: "civilization", category: "civilization" },
  { id: "silk-road", title: "실크로드 개통", start: -130, significance: 0.7, lane: "civilization", category: "civilization" },
  { id: "caesar", title: "카이사르 암살", start: -43, significance: 0.68, lane: "civilization", category: "conflict" },
  { id: "roman-empire", title: "로마 제국", start: -27, end: 476, significance: 0.86, lane: "civilization", category: "civilization" },
  { id: "jesus", title: "예수", start: -4, end: 30, significance: 0.88, lane: "culture", category: "culture" },
  { id: "three-kingdoms-korea", title: "삼국시대", start: -57, end: 668, significance: 0.6, lane: "civilization", category: "civilization" },
  { id: "paper", title: "제지술", start: 105, significance: 0.72, lane: "science", category: "science" },
  { id: "ptolemy", title: "프톨레마이오스 『알마게스트』", start: 150, significance: 0.6, lane: "science", category: "science" },

  // ── 중세 ────────────────────────────────────────────────────
  { id: "rome-fall", title: "서로마 제국 멸망", start: 476, significance: 0.78, lane: "civilization", category: "conflict" },
  { id: "islam", title: "이슬람교 성립", start: 610, significance: 0.84, lane: "culture", category: "culture" },
  { id: "silla-unification", title: "신라의 삼국 통일", start: 676, significance: 0.58, lane: "civilization", category: "civilization" },
  { id: "tang", title: "당나라", start: 618, end: 907, significance: 0.7, lane: "civilization", category: "civilization" },
  { id: "islamic-golden-age", title: "이슬람 황금기", start: 750, end: 1258, significance: 0.74, lane: "science", category: "science" },
  { id: "al-khwarizmi", title: "알콰리즈미 — 대수학", start: 820, significance: 0.68, lane: "science", category: "science" },
  { id: "goryeo", title: "고려", start: 918, end: 1392, significance: 0.58, lane: "civilization", category: "civilization" },
  { id: "printing-china", title: "목판 인쇄", start: 868, significance: 0.6, lane: "science", category: "science" },
  { id: "gunpowder", title: "화약", start: 904, significance: 0.7, lane: "science", category: "science" },
  { id: "crusades", title: "십자군 전쟁", start: 1096, end: 1291, significance: 0.66, lane: "civilization", category: "conflict" },
  { id: "jikji", title: "직지심체요절 — 금속활자", start: 1377, significance: 0.56, lane: "science", category: "science", summary: "현존 최고(最古)의 금속활자 인쇄본." },
  { id: "mongol-empire", title: "몽골 제국", start: 1206, end: 1368, significance: 0.78, lane: "civilization", category: "conflict" },
  { id: "magna-carta", title: "마그나 카르타", start: 1215, significance: 0.66, lane: "civilization", category: "civilization" },
  { id: "black-death", title: "흑사병", start: 1347, end: 1351, significance: 0.8, lane: "civilization", category: "conflict", summary: "유럽 인구의 30~60%가 사망했다." },
  { id: "joseon", title: "조선", start: 1392, end: 1897, significance: 0.62, lane: "civilization", category: "civilization" },

  // ── 근세 ────────────────────────────────────────────────────
  { id: "gutenberg", title: "구텐베르크 인쇄기", start: 1440, significance: 0.88, lane: "science", category: "science", summary: "지식 복제 비용이 급락하며 이후 500년의 전제가 바뀌었다." },
  { id: "hangul", title: "훈민정음 반포", start: 1446, significance: 0.64, lane: "culture", category: "culture", summary: "창제 원리가 문헌으로 남은 드문 문자 체계." },
  { id: "columbus", title: "콜럼버스 항해", start: 1492, significance: 0.82, lane: "civilization", category: "civilization" },
  { id: "renaissance", title: "르네상스", start: 1400, end: 1600, significance: 0.8, lane: "culture", category: "culture" },
  { id: "da-vinci", title: "레오나르도 다 빈치", start: 1452, end: 1519, significance: 0.78, lane: "culture", category: "culture" },
  { id: "reformation", title: "종교개혁", start: 1517, significance: 0.76, lane: "culture", category: "culture" },
  { id: "copernicus", title: "코페르니쿠스 지동설", start: 1543, significance: 0.82, lane: "science", category: "science" },
  { id: "imjin-war", title: "임진왜란", start: 1592, end: 1598, significance: 0.54, lane: "civilization", category: "conflict" },
  { id: "shakespeare", title: "셰익스피어", start: 1564, end: 1616, significance: 0.8, lane: "culture", category: "culture" },
  { id: "galileo", title: "갈릴레이 망원경 관측", start: 1609, significance: 0.8, lane: "science", category: "science" },
  { id: "thirty-years-war", title: "30년 전쟁", start: 1618, end: 1648, significance: 0.62, lane: "civilization", category: "conflict" },
  { id: "newton-principia", title: "뉴턴 『프린키피아』", start: 1687, significance: 0.9, lane: "science", category: "science", summary: "천상과 지상의 운동을 하나의 법칙으로 묶었다." },
  { id: "enlightenment", title: "계몽주의", start: 1685, end: 1815, significance: 0.76, lane: "culture", category: "culture" },
  { id: "bach", title: "요한 제바스티안 바흐", start: 1685, end: 1750, significance: 0.72, lane: "culture", category: "culture" },

  // ── 근대 ────────────────────────────────────────────────────
  { id: "steam-engine", title: "와트 증기기관", start: 1769, significance: 0.84, lane: "science", category: "science" },
  { id: "industrial-revolution", title: "산업혁명", start: 1760, end: 1840, significance: 0.92, lane: "science", category: "science", summary: "인류가 처음으로 근육과 물·바람이 아닌 동력을 대규모로 쓰기 시작했다." },
  { id: "us-independence", title: "미국 독립선언", start: 1776, significance: 0.78, lane: "civilization", category: "civilization" },
  { id: "french-revolution", title: "프랑스 혁명", start: 1789, end: 1799, significance: 0.84, lane: "civilization", category: "conflict" },
  { id: "mozart", title: "모차르트", start: 1756, end: 1791, significance: 0.76, lane: "culture", category: "culture" },
  { id: "beethoven", title: "베토벤", start: 1770, end: 1827, significance: 0.78, lane: "culture", category: "culture" },
  { id: "napoleonic-wars", title: "나폴레옹 전쟁", start: 1803, end: 1815, significance: 0.72, lane: "civilization", category: "conflict" },
  { id: "railway", title: "철도 개통", start: 1825, significance: 0.7, lane: "science", category: "science" },
  { id: "telegraph", title: "전신", start: 1844, significance: 0.68, lane: "science", category: "science" },
  { id: "darwin-origin", title: "다윈 『종의 기원』", start: 1859, significance: 0.9, lane: "science", category: "science", summary: "설계자 없이 복잡성이 생기는 메커니즘을 제시했다." },
  { id: "maxwell", title: "맥스웰 방정식", start: 1865, significance: 0.8, lane: "science", category: "science" },
  { id: "mendeleev", title: "멘델레예프 주기율표", start: 1869, significance: 0.72, lane: "science", category: "science" },
  { id: "telephone", title: "전화", start: 1876, significance: 0.68, lane: "science", category: "science" },
  { id: "electric-light", title: "백열전구 실용화", start: 1879, significance: 0.68, lane: "science", category: "science" },
  { id: "germ-theory", title: "세균 병인설", start: 1861, significance: 0.78, lane: "science", category: "science" },
  { id: "automobile", title: "내연기관 자동차", start: 1886, significance: 0.7, lane: "science", category: "science" },
  { id: "cinema", title: "영화의 탄생", start: 1895, significance: 0.62, lane: "culture", category: "culture" },
  { id: "xray", title: "X선 발견", start: 1895, significance: 0.62, lane: "science", category: "science" },

  // ── 20세기 ──────────────────────────────────────────────────
  { id: "quantum", title: "양자 가설", start: 1900, significance: 0.8, lane: "science", category: "science" },
  { id: "flight", title: "라이트 형제 동력 비행", start: 1903, significance: 0.76, lane: "science", category: "science" },
  { id: "relativity-special", title: "특수 상대성이론", start: 1905, significance: 0.86, lane: "science", category: "science" },
  { id: "relativity-general", title: "일반 상대성이론", start: 1915, significance: 0.86, lane: "science", category: "science" },
  { id: "ww1", title: "제1차 세계대전", start: 1914, end: 1918, significance: 0.88, lane: "civilization", category: "conflict" },
  { id: "russian-revolution", title: "러시아 혁명", start: 1917, significance: 0.78, lane: "civilization", category: "conflict" },
  { id: "spanish-flu", title: "스페인 독감", start: 1918, end: 1920, significance: 0.74, lane: "civilization", category: "conflict" },
  { id: "sam-il", title: "3·1 운동", start: 1919, significance: 0.5, lane: "civilization", category: "conflict" },
  { id: "penicillin", title: "페니실린 발견", start: 1928, significance: 0.8, lane: "science", category: "science" },
  { id: "hubble-expansion", title: "우주 팽창 발견", start: 1929, significance: 0.76, lane: "cosmos", category: "cosmic" },
  { id: "great-depression", title: "대공황", start: 1929, end: 1939, significance: 0.74, lane: "civilization", category: "civilization" },
  { id: "turing-machine", title: "튜링 기계", start: 1936, significance: 0.84, lane: "science", category: "science", summary: "계산이란 무엇인가에 대한 형식적 정의. 컴퓨터의 이론적 토대." },
  { id: "ww2", title: "제2차 세계대전", start: 1939, end: 1945, significance: 0.95, lane: "civilization", category: "conflict", summary: "약 7천만 명이 사망한 인류 최대의 전쟁." },
  { id: "eniac", title: "ENIAC", start: 1945, significance: 0.7, lane: "science", category: "science" },
  { id: "atomic-bomb", title: "히로시마·나가사키 원폭", start: 1945, significance: 0.88, lane: "civilization", category: "conflict" },
  { id: "un-founded", title: "국제연합 창설", start: 1945, significance: 0.72, lane: "civilization", category: "civilization" },
  { id: "transistor", title: "트랜지스터", start: 1947, significance: 0.86, lane: "science", category: "science", summary: "이후 모든 디지털 기술이 이 소자 위에 세워졌다." },
  { id: "shannon-information", title: "섀넌 정보이론", start: 1948, significance: 0.78, lane: "science", category: "science" },
  { id: "korean-war", title: "한국전쟁", start: 1950, end: 1953, significance: 0.68, lane: "civilization", category: "conflict" },
  { id: "dna-structure", title: "DNA 이중나선 구조", start: 1953, significance: 0.88, lane: "science", category: "science" },
  { id: "sputnik", title: "스푸트니크 1호", start: 1957, significance: 0.76, lane: "cosmos", category: "cosmic" },
  { id: "integrated-circuit", title: "집적회로", start: 1958, significance: 0.8, lane: "science", category: "science" },
  { id: "gagarin", title: "가가린 최초 유인 우주비행", start: 1961, significance: 0.78, lane: "cosmos", category: "cosmic" },
  { id: "cuban-missile", title: "쿠바 미사일 위기", start: 1962, significance: 0.7, lane: "civilization", category: "conflict" },
  { id: "moore-law", title: "무어의 법칙", start: 1965, significance: 0.66, lane: "science", category: "science" },
  { id: "arpanet", title: "ARPANET", start: 1969, significance: 0.82, lane: "science", category: "science" },
  {
    id: "moon-landing",
    title: "아폴로 11호 달 착륙",
    start: fromCalendarDate({ year: 1969, month: 7, day: 20 }),
    significance: 0.92,
    lane: "cosmos",
    category: "cosmic",
    summary: "인류가 다른 천체에 처음 발을 디뎠다.",
  },
  { id: "microprocessor", title: "마이크로프로세서 4004", start: 1971, significance: 0.76, lane: "science", category: "science" },
  { id: "personal-computer", title: "개인용 컴퓨터", start: 1977, significance: 0.74, lane: "science", category: "science" },
  { id: "smallpox-eradicated", title: "천연두 박멸 선언", start: 1980, significance: 0.72, lane: "science", category: "science", summary: "인류가 의도적으로 근절한 최초의 감염병." },
  { id: "gwangju", title: "5·18 민주화운동", start: 1980, significance: 0.48, lane: "civilization", category: "conflict" },
  { id: "chernobyl", title: "체르노빌 사고", start: 1986, significance: 0.66, lane: "science", category: "conflict" },
  { id: "june-struggle", title: "6월 민주항쟁", start: 1987, significance: 0.5, lane: "civilization", category: "civilization" },
  { id: "web", title: "월드 와이드 웹", start: 1989, significance: 0.9, lane: "science", category: "science", summary: "팀 버너스리가 CERN에서 제안했다." },
  { id: "berlin-wall", title: "베를린 장벽 붕괴", start: 1989, significance: 0.84, lane: "civilization", category: "civilization" },
  { id: "hubble-telescope", title: "허블 우주망원경", start: 1990, significance: 0.68, lane: "cosmos", category: "cosmic" },
  { id: "ussr-collapse", title: "소련 해체", start: 1991, significance: 0.82, lane: "civilization", category: "civilization" },
  { id: "exoplanet", title: "최초의 외계행성 발견", start: 1995, significance: 0.64, lane: "cosmos", category: "cosmic" },
  { id: "deep-blue", title: "딥 블루, 카스파로프 격파", start: 1997, significance: 0.6, lane: "science", category: "science" },
  { id: "google", title: "구글 창립", start: 1998, significance: 0.66, lane: "science", category: "science" },

  // ── 21세기 ──────────────────────────────────────────────────
  { id: "human-genome", title: "인간 게놈 프로젝트 완료", start: 2003, significance: 0.8, lane: "science", category: "science" },
  { id: "sept-11", title: "9·11 테러", start: 2001, significance: 0.78, lane: "civilization", category: "conflict" },
  { id: "facebook", title: "소셜 네트워크 대중화", start: 2004, significance: 0.6, lane: "culture", category: "culture" },
  { id: "youtube", title: "유튜브", start: 2005, significance: 0.6, lane: "culture", category: "culture" },
  { id: "iphone", title: "아이폰 발표", start: 2007, significance: 0.82, lane: "science", category: "science", summary: "컴퓨터가 주머니로 들어간 시점." },
  { id: "financial-crisis", title: "세계 금융위기", start: 2008, significance: 0.72, lane: "civilization", category: "civilization" },
  { id: "bitcoin", title: "비트코인", start: 2009, significance: 0.58, lane: "science", category: "science" },
  { id: "higgs", title: "힉스 보손 발견", start: 2012, significance: 0.7, lane: "science", category: "science" },
  { id: "crispr", title: "CRISPR 유전자 편집", start: 2012, significance: 0.78, lane: "science", category: "science" },
  { id: "gravitational-waves", title: "중력파 직접 검출", start: 2015, significance: 0.74, lane: "cosmos", category: "cosmic" },
  { id: "alphago", title: "알파고 대 이세돌", start: 2016, significance: 0.66, lane: "science", category: "science", summary: "직관의 영역으로 여겨지던 바둑에서 기계가 이겼다." },
  { id: "black-hole-image", title: "블랙홀 최초 촬영", start: 2019, significance: 0.68, lane: "cosmos", category: "cosmic" },
  { id: "covid", title: "COVID-19 팬데믹", start: 2020, end: 2023, significance: 0.86, lane: "civilization", category: "conflict" },
  { id: "mrna-vaccine", title: "mRNA 백신 실용화", start: 2020, significance: 0.76, lane: "science", category: "science" },
  { id: "jwst", title: "제임스 웹 우주망원경", start: 2021, significance: 0.7, lane: "cosmos", category: "cosmic" },
  { id: "chatgpt", title: "대규모 언어모델 대중화", start: 2022, significance: 0.8, lane: "science", category: "science" },
  { id: "alphafold-db", title: "AlphaFold 단백질 구조 공개", start: 2022, significance: 0.72, lane: "science", category: "science" },
];

export const HISTORY_SEED: TimelineItem[] = SPECS.map(build);
