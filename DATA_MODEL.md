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

## 데이터 파이프라인 (Phase 3)

```
Wikidata SPARQL ──▶ fetch ──▶ normalize ──▶ score ──▶ chunk ──▶ public/data/history/
```

빌드타임 로컬 실행이며 산출물을 커밋한다. **런타임 API 는 0개다.**

`normalize` 단계는 검증 리포트를 출력한다: 날짜 파싱 실패율, `significance` 분포, 레인별 건수. 실데이터 품질 문제를 조용히 통과시키지 않기 위해서다.

### 출처와 라이선스

| 출처 | 라이선스 | 용도 | 주의 |
|---|---|---|---|
| Wikidata | CC0 | 주 데이터 (시점, 분류, sitelink) | 날짜 품질 불균일 |
| Wikipedia REST summary | **CC BY-SA** | 요약문 | 출처 표기 + 원문 링크 **필수** |
| Natural Earth | Public Domain | (Phase 6) 현대 경계 | — |
| aourednik/historical-basemaps | 저장소 조건 확인 필요 | (Phase 6) 시대별 경계 | 저자가 "work in progress, 학술 사용 전 검증 필요" 명시 |

`SourceRef.attribution` 필드가 CC BY-SA 출처의 표기 의무를 담기 위해 존재한다.

---

## 색인

`IntervalIndex` — 시작점 정렬 배열 + 종료점 최댓값 세그먼트 트리. 범위 질의 O(log n + k).

단순 이진탐색으로 부족한 이유: 시작점 정렬만으로는 "시작이 뷰포트 안"인 것만 잡히고, **뷰포트보다 먼저 시작해 뷰포트를 관통하는 긴 구간**(로마 제국, 백악기)이 통째로 누락된다. 이 누락은 줌 아웃할수록 심해진다 — 정확히 반대로 가야 하는데.

60fps 루프를 위해 `queryInto(start, end, buffer)` 가 배열을 재사용한다.
