# DATA_MODEL.md

정의 위치: [`src/engine/types/timeline.ts`](src/engine/types/timeline.ts)

이 파일에는 "역사"라는 단어가 등장하지 않는다. 등장하는 순간 Time Engine 이 아니라 역사 웹사이트가 된다.

---

## 시간

### `TimePoint = number`

천문학적 연도 번호의 float64 소수.

```
  0  = 기원전 1년 (BCE 1)     ← 연도 0 문제를 표현 자체에서 흡수
 -1  = 기원전 2년 (BCE 2)
  1  = 서기 1년   (CE 1)
```

소수부는 해당 연도 안에서의 진행률이다 (`1969.55` ≈ 1969년 중반).

근거와 대안 검토는 ADR-001 참조. 실측 해상도:

| 지점 | 해상도 |
|---|---|
| 서기 2026년 | 약 14 마이크로초 |
| 100만 년 전 | 약 7 밀리초 |
| 68억 년 전 | 약 48초 |
| 138억 년 전 | 약 96초 |

(측정값. `|t| × Number.EPSILON` 을 초로 환산한 것이며, 이 값이 `TimeScale` 의 정밀도 하한 ADR-006 의 근거다.)

### `TimeSpan`

```ts
{ start: TimePoint; end: TimePoint; precision: TimePrecision; approximate?: boolean }
```

**점 사건은 `start === end`** 다. 별도의 Point 타입을 두지 않는다 — 나누면 스케일·LOD·충돌회피·인덱스 코드가 전부 두 벌이 된다.

`precision` 은 출처가 주장하는 정밀도(`exact` … `era`)이며, 오차 막대 렌더링과 LOD 양쪽에서 쓰인다. `approximate` 는 출처의 "circa" 표기에 대응한다.

**달력:** 전 구간 proleptic Gregorian. 율리우스력 변환은 구현하지 않는다 (ADR-005). 1582년 이전 날짜는 최대 13일의 계통 오차를 가질 수 있으며, 이는 세기 단위 이상 줌 아웃에서 1픽셀 미만이다. 학술적 정확성을 요구하는 용도에는 부적합하다.

---

## `TimelineItem` — 타임라인에 놓이는 단 하나의 엔티티

```ts
{
  id: string
  span: TimeSpan
  title: string
  summary?: string
  significance: number          // 0..1 — 가장 중요한 필드
  categoryId: string
  laneId: string
  layer: 'context' | 'primary'
  location?: GeoPoint           // MVP 에서는 저장만, 렌더링 안 함
  sourceRef?: SourceRef
  relations?: Relation[]
}
```

### `layer` — Event 와 Era 를 나누지 않는 이유

`CLAUDE.md` 는 `Era` 를 독립 엔티티로 제시하지만, 두 엔티티의 데이터 *모양*이 동일하다 — 시간 구간, 제목, 중요도, 카테고리. 다른 것은 "어떻게 그리는가" 뿐이므로 필드 하나로 충분하다 (ADR-004).

- `context` — 배경 리본 (시대, 왕조, 지질시대, 제품 세대 …)
- `primary` — 전경 마크 (개별 사건)

### `significance` — 이 모델의 심장이자 **Y축 그 자체**

LOD 가 이 값으로 "지금 이 줌 레벨에서 무엇을 보여줄지"를 결정하고, Phase 2R 부터는 **화면상의 세로 위치**이기도 하다 (ADR-013). Google Maps 가 세계 줌에서 국가만, 거리 줌에서 카페까지 보여주는 것과 같은 역할이다. **이 값이 없으면 ChronoAtlas 는 스크롤 막대다.**

산출: `normalize(log(sitelinkCount))` — sitelink 수는 해당 엔티티에 대한 문서가 존재하는 위키백과 언어판 개수 (ADR-009).

> **알려진 편향 — 감출 수 없는 한계**
>
> sitelink 수는 영어권·서구 중심으로 기운다. 서유럽 중세사가 동남아시아 동시대사보다 체계적으로 높은 점수를 받는다.
>
> **Phase 2R 에서 이 위험이 커졌다.** `significance` 가 Y축이 되면서 편향이 이제 제품의 *지형* 그 자체다 — 문서 각주로 적는 것과 차원이 다르다. Phase 3 ETL 은 이 분포를 반드시 리포트로 출력해야 하고, 축을 다른 지표로 재바인딩할 수 있게 설계를 열어 둔다.

---

## 도메인 구성

```ts
Lane      { id, label, order }                 // 분류용. 현재 UI 는 렌더링하지 않는다
Category  { id, label, colorToken }            // 색상값이 아니라 토큰 이름
Landmark  { id, label, time }                  // 수평선의 고정 참조점
Domain    { id, label, lanes, categories, defaultViewport, chunks, landmarks? }
```

**`Lane` 은 남아 있지만 화면에 그려지지 않는다.** Phase 2R 에서 Y축이 연속 중요도로 바뀌면서(ADR-013) 레인은 렌더링 역할을 잃었다. 필터·범례 같은 분류 용도로 남겨 둔 것이며, Phase 4 에서 쓰이지 않으면 제거를 검토한다.

**`Landmark` 는 시간의 해안선이다.** 어느 줌에서도 수평선에 보이는 고정 참조점(빅뱅·지구·생명·캄브리아·공룡 멸종·인류·농업·현재). Maps 를 Maps 로 만드는 것의 절반은 이탈리아 장화와 오대호다 — 형상이 있어야 "내가 어디 있는지" 를 안다. 도메인마다 다르므로 값은 도메인이 준다.

**새 도메인 추가 = `Domain` 객체 하나 추가.** `engine/` 은 이 타입만 알고 그 안의 값은 알지 못한다.

`Category.colorToken` 이 색상 리터럴이 아닌 토큰 이름인 이유: 다크/라이트 테마와 접근성 대비를 `DESIGN_SYSTEM.md` 한 곳에서 관리하기 위해서다.

---

## 데이터 파이프라인 (Phase 3 — 구현 완료)

```
                    ┌─ deep-time.ts (큐레이션한 시간값 + Q-id)
                    │
Wikidata SPARQL ────┴──▶ normalize ──▶ score ──▶ enrich ──▶ chunk ──┬─▶ src/domains/history/data/  (overview, 번들)
   (소스 16개)           dedup·달력     전역     언어·링크           └─▶ public/data/history/        (detail, fetch)
                         ·정밀도       로그정규화
```

`npm run etl` 로 로컬에서 수동 실행하고 산출물을 커밋한다. **런타임 API 는 0개다** (ADR-007, ADR-015).
`npm run etl:probe` 는 각 쿼리가 WDQS 60초 제한을 통과하는지만 빠르게 점검한다.

검증 리포트는 [`scripts/etl/REPORT.md`](scripts/etl/REPORT.md) 에 매 실행마다 생성된다: 소스별 수율, 날짜 파싱 실패율, 원시 정밀도 분포, `significance` 히스토그램, **언어별 편향**, 카테고리·시대별 밀도, 청크 목록. 실데이터 품질 문제를 조용히 통과시키지 않기 위해서다.

### 이 파이프라인이 실제로 부딪힌 것들

실측으로 확인했고, 전부 코드와 테스트에 고정되어 있다.

| 발견 | 대응 |
|---|---|
| Wikidata 연도는 **천문학적 연도 번호**다 (`-0479` = 기원전 480년, 우리 `TimePoint` 와 동일) | 오프셋 보정을 넣지 않는다. 넣으면 전 구간이 1년씩 어긋난다 — 테스트로 고정 |
| 같은 항목이 정밀도가 다른 여러 주장으로 중복 반환된다 | `wikibase:BestRank` + 정밀도 기준 dedup. 안 하면 밀도가 부풀려진다 |
| 1582년 이전 날짜는 **율리우스력**으로 온다 | 변환하지 않고 건수만 리포트에 센다 (ADR-005) |
| 거친 정밀도도 `01-01` 로 자리를 채워 돌려준다 | 연 이하 정밀도일 때만 월·일을 반영. 아니면 "17세기" 가 "1601년 1월 1일" 이 된다 |
| 우주비행은 `P585` 가 아니라 `P619`(발사일), 문학은 `P571` 이 아니라 `P577`(출판일) | 소스별로 시간 속성을 다르게 지정 |
| 넓은 클래스(`Q41176` 건물 등)는 스캔만으로 60초 제한을 넘는다 | 좁은 클래스로 대체. 구간 쿼리는 시점 쿼리보다 훨씬 비싸다 |
| 언어별 sitelink 를 본 쿼리에 `OPTIONAL` 로 붙이면 90초 초과 | 선별 후 `VALUES` 배치로 분리 — 90초 → 1초 |

### 심원한 시간은 왜 큐레이션인가

Wikidata 는 지질시대(기·세·대)는 기계가독 날짜로 잘 주지만, 빅뱅·최초의 별·생명의 기원 같은 **우주론·진화사 사건**에는 시점 속성이 거의 없다. 그 구간을 비우면 cosmic 티어의 지형이 평평해지고, "138억 년을 탐험한다" 는 주장이 빈 화면이 된다.

[`scripts/etl/deep-time.ts`](scripts/etl/deep-time.ts) 가 이 구간을 메운다. **손으로 적는 것은 시간값과 Q-id 뿐**이며, 제목·요약·`significance` 는 다른 수천 건과 똑같이 Wikidata 에서 온다. 중요도를 손으로 정하면 Y축의 일관성이 깨지기 때문이다. 각 항목은 시간값의 근거(`basis`)를 함께 기록한다.

### 출처와 라이선스

| 출처 | 라이선스 | 용도 | 주의 |
|---|---|---|---|
| Wikidata (라벨·설명·시점·sitelink) | **CC0** | 주 데이터 | 날짜 품질 불균일 |
| Wikipedia | CC BY-SA | **링크만** 건다 | 본문을 복제하지 않으므로 표기 의무가 발생하지 않는다 |
| Natural Earth | Public Domain | (Phase 6) 현대 경계 | — |
| aourednik/historical-basemaps | 저장소 조건 확인 필요 | (Phase 6) 시대별 경계 | 저자가 "work in progress, 학술 사용 전 검증 필요" 명시 |

요약문은 Wikipedia REST 가 아니라 **Wikidata description(CC0)** 을 쓴다. 항목당 REST 호출이 사라지고 CC BY-SA 표기 의무도 발생하지 않는다. 대가는 요약이 짧다는 것이며, 더 풍부한 본문이 필요해지면 그때 Wikipedia extracts 를 batch API 로 붙이고 `SourceRef.attribution` 을 채운다.

---

## 색인

`IntervalIndex` — 시작점 정렬 배열 + 종료점 최댓값 세그먼트 트리. 범위 질의 O(log n + k).

단순 이진탐색으로 부족한 이유: 시작점 정렬만으로는 "시작이 뷰포트 안"인 것만 잡히고, **뷰포트보다 먼저 시작해 뷰포트를 관통하는 긴 구간**(로마 제국, 백악기)이 통째로 누락된다. 이 누락은 줌 아웃할수록 심해진다 — 정확히 반대로 가야 하는데.

60fps 루프를 위해 `queryInto(start, end, buffer)` 가 배열을 재사용한다.
