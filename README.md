# ChronoAtlas

**역사 웹사이트가 아니라 Time Engine 입니다.**

Google Maps 에서 장소를 탐색하듯 시간을 탐색합니다. 138억 년부터 하루까지 연속으로 줌하며, 줌 레벨에 따라 보이는 사건의 밀도가 달라집니다 — 세계 줌에서 국가만, 거리 줌에서 카페까지 보여주는 지도와 같은 원리입니다.

역사는 첫 데이터셋일 뿐입니다. 엔진은 아키텍처 변경 없이 다른 도메인(기술, AI, 기업, 과학, 스포츠, 음악, 문화)을 받도록 설계했습니다.

---

## 이 프로젝트에서 실제로 어려운 것

렌더링이 아닙니다. 세 곳입니다.

**1. 숫자 표현** — JavaScript `Date` 는 ±271,821년까지만 표현합니다. 목표는 138억 년입니다. `Date` 를 코어 타입으로 잡으면 첫날부터 전제가 깨집니다.
→ `TimePoint = number` (천문학적 연도 float64). 실측 해상도는 서기 2026년에서 14μs, 138억 년 전에서 96초 — 정밀도가 필요한 구간에서 남고 무의미한 구간에서만 성깁니다. [ADR-001](DECISIONS.md)

**2. 뷰포트 수치 안정성** — 138억 년 → 하루는 약 5e12배 줌입니다. `d3-zoom` 처럼 배율 스칼라를 누적하면 float 정밀도가 무너져 패닝이 떨립니다.
→ 뷰포트를 `{center, span}` 으로 직접 소유합니다. 거대한 누적 스칼라가 없어 전 구간 안정적입니다. [ADR-002](DECISIONS.md)

**3. Y축이 무엇인가** — 시간은 1D 입니다. Maps 가 Maps 인 이유는 2D 공간 + *줌별 의미 수준 변화* 때문입니다. 그냥 1D 로 만들면 지도가 아니라 슬라이더입니다.
→ 두 번째 축은 범주형 레인, 의미 수준 변화에 대응하는 것은 **LOD**(중요도 기반 선별)입니다. [ADR-010](DECISIONS.md)

---

## 현재 상태

**Phase 2 (뷰포트 & 렌더) 완료** — 단위 테스트 137개 + 브라우저 실측 통과

138억 년부터 하루까지 연속으로 줌·팬하며 탐색할 수 있습니다.
시드 데이터 195건(빅뱅~2022)으로 검증했습니다.

| 모듈 | 내용 |
|---|---|
| `engine/time/TimePoint.ts` | 연도 ↔ 달력 ↔ 표시 변환, proleptic Gregorian |
| `engine/time/TimeScale.ts` | time ↔ pixel 매핑, 줌/팬 대수, 정밀도 하한 |
| `engine/time/ticks.ts` | 17자릿수 대응 적응형 눈금 |
| `engine/index/IntervalIndex.ts` | 범위 질의 O(log n + k) |
| `engine/index/lod.ts` | 중요도 기반 선별 — 이 제품의 심장 |
| `engine/index/collision.ts` | 구간 분할 — 겹치는 항목을 여러 줄로 |
| `engine/viewport/ViewportController.ts` | 뷰포트의 유일한 소유자 (React state 아님) |

**브라우저 실측** (1440×900, 연속 팬·줌 부하):
p50 프레임 간격 **16.7ms = 60fps**, 드롭 프레임 **0%**, 최악 17.7ms.

> 성능은 주장하지 않고 측정합니다. `npm run verify:browser` 가 Playwright 로
> 렌더·입력·프레임을 실제로 잽니다. 이 검증이 단위 테스트로는 잡히지 않는
> 버그를 잡았습니다 — `pointerdown` 에서 즉시 포인터 캡처를 걸면 이후 `click`
> 이 캡처한 요소로 전달되어 **마크를 클릭해도 선택되지 않습니다.**

다음은 Phase 3 (Wikidata ETL). [ROADMAP.md](ROADMAP.md)

---

## 아키텍처 불변식

의존은 한 방향으로만 흐릅니다.

```
components/ ─▶ engine/
domains/    ─▶ engine/
engine/     ─▶ (아무것도 참조하지 않는다)
```

`engine/` 이 `domains/` 를 참조하는 순간 "Time Engine" 이라는 주장은 무너집니다. 그래서 이 규칙은 문서가 아니라 **ESLint 로 강제**되며, 위반 시 `npm run lint` 가 실패합니다. `engine/` 안의 `Date` 사용도 같은 방식으로 차단됩니다.

**진짜 시험:** `domains/history` 를 지우고 `domains/ai` 를 넣었을 때 `engine/` 이 0줄 변경인가. Phase 6 의 목표입니다.

---

## 실행

```bash
npm install
npm run dev             # 개발 서버
npm run verify          # lint + typecheck + test
npm run test:watch      # 시간 커널 개발 중

# 브라우저 실측 (dev 서버가 떠 있어야 합니다)
npm run verify:browser
```

Node 26 / npm 11 · Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5 strict · Tailwind CSS 4 · Zustand 5 · motion 12 · Vitest 4 · Playwright

**의도적으로 넣지 않은 것**

- **D3** — 시간축 스케일·눈금을 직접 소유하는 편이 짧고 정확했습니다. 특히 `d3-array` 의 `ticks()` 는 1-2-5 사다리만 알아서 시간축에 쓸 수 없습니다 — 그 아래에 달력이 있어 `1/12`·`1/365` 같은 비-10진 단위로 내려가야 하고, 라벨도 `"1969.4521"` 이 아니라 `"Jul 1969"` 여야 합니다. [ADR-008](DECISIONS.md)
- **TanStack Query** — 런타임 API 가 0개면 서버 상태 라이브러리는 해결할 문제가 없습니다. [ADR-007](DECISIONS.md)
- **기성 타임라인 라이브러리** — 138억 년 동적 범위도 중요도 기반 LOD 도 지원하지 않습니다.

---

## 문서

| 파일 | 내용 |
|---|---|
| [PROJECT.md](PROJECT.md) | 개요, 현재 상태, 스택 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 계층, 폴더 구조, 상태·렌더링 전략 |
| [DATA_MODEL.md](DATA_MODEL.md) | 타입 정의, significance, 출처·라이선스 |
| [DECISIONS.md](DECISIONS.md) | ADR — 되돌리기 비용이 큰 결정만 |
| [ROADMAP.md](ROADMAP.md) | Phase 계획, MVP 범위, 리스크 |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | 토큰, 타이포그래피, 모션 정책 |

## 데이터 출처

Wikidata (CC0) 를 주 데이터로 사용하며, 중요도 점수는 sitelink 수의 로그 정규화로 산출합니다. 이 지표는 **영어권·서구 중심으로 기웁니다** — 데이터의 성질이며 [DATA_MODEL.md](DATA_MODEL.md) 에 명시했습니다.
