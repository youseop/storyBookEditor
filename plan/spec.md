# Key Expressions Generator — Figma Plugin 기획서 (v2)

## 개요

PronounceKorean 한국어 학습 동화책의 "Key Expressions" 페이지를 자동 생성하는 Figma 플러그인.
텍스트 입력 → 레이아웃 자동 배치 → AI 이미지 생성 → 영어 번역을 원스톱으로 처리.

---

## 1. 확정 스펙

| 항목 | 값 |
|------|-----|
| 프레임 크기 | 7452 × 3780 px (양면 펼침) |
| 반페이지 너비 | 3726 px |
| 배경색 | `#FFCF66` (기본, 변경 가능) |
| 그리드 | 8×8 셀 / 반페이지 (양면 최대 약 32카드) |
| 셀 크기 | 380 × 363 px (고정) |
| 셀 간격 | 40 px |
| 그리드 중앙 정렬 | 그리드 중심 = 반페이지 중심 (마진 자동 계산) |
| 기본 카드 | 2×2 셀 (800 × 766 px) |
| AI 모델 (이미지) | `gemini-2.5-flash-image` |
| AI 모델 (번역) | `gemini-2.5-flash` |
| API 호출 | UI iframe에서 직접 (클라이언트 사이드) |
| 이미지 | 표현당 2벌 벌크 생성, 첫 번째 자동 배정 |
| 폰트 | `NanumSquareRound Bold` (기본), 유저 커스텀 가능 |
| 영어 폰트 크기 | 66 px (고정) |
| 텍스트 규칙 | 싱글엔터=카드내 줄바꿈, 더블엔터=새 카드, 트리플엔터=새 행 |
| Rate Limit | 10 RPM, 동시 2개, 최대 5회 재시도 |

---

## 2. 아키텍처

### 2.1 Figma 플러그인 2레이어

```
┌─────────────────────────────────────────────┐
│  UI Layer (React iframe)                    │
│  - 네트워크 가능 (Gemini API 직접 호출)      │
│  - Figma API 접근 불가                       │
│  - postMessage로 Plugin에 요청              │
├─────────────────────────────────────────────┤
│  Plugin Sandbox (code.ts)                   │
│  - Figma API 전체 접근                      │
│  - 네트워크 불가                             │
│  - 노드 생성/수정/삭제, pluginData 관리      │
└─────────────────────────────────────────────┘
```

### 2.2 디렉토리 구조

```
src/
├── shared/                         # 양쪽 공유
│   ├── constants.ts                # 레이아웃/스타일 상수
│   └── messageTypes.ts             # 메시지 타입 + 데이터 인터페이스
│
├── plugin/                         # Figma sandbox 런타임
│   ├── code.ts                     # 메인 메시지 핸들러 + selection 감지
│   ├── frameBuilder.ts             # 메인 프레임/제목/가이드라인 생성
│   ├── cardGridBuilder.ts          # 그리드 레이아웃 엔진 (측정→배치→생성/업데이트)
│   ├── imageManager.ts             # 이미지 저장/할당/교체
│   └── exportHelper.ts             # 레퍼런스 프레임 PNG 내보내기
│
└── ui/                             # React UI (브라우저 iframe)
    ├── main.tsx                    # React 엔트리포인트
    ├── App.tsx                     # 루트 컴포넌트 (상태 관리 + 메시지 처리)
    ├── components/
    │   ├── ExpressionInput.tsx     # 텍스트 입력 + 파싱 결과 표시
    │   ├── SettingsPanel.tsx       # API 키, 배경색, 폰트, 레퍼런스 프레임
    │   ├── ImageGallery.tsx        # 표현별 이미지 썸네일 + Swap/Regen
    │   ├── ImageSwapModal.tsx      # 이미지 교체 모달
    │   ├── GenerationProgress.tsx  # 진행률 바 + 취소 버튼
    │   └── CardPreview.tsx         # 카드 미리보기
    ├── hooks/
    │   ├── useExpressionParser.ts  # 텍스트 → ExpressionCard[] 파싱
    │   ├── useFigmaMessages.ts     # postMessage 송수신 래퍼
    │   └── useGeminiApi.ts         # 이미지 생성/번역 API 훅
    └── services/
        ├── geminiService.ts        # Gemini API 호출 (이미지+번역)
        └── rateLimiter.ts          # 토큰 버킷 rate limiter
```

---

## 3. 데이터 모델

### 3.1 핵심 인터페이스

```typescript
// 파싱된 표현 카드
interface ExpressionCard {
  id: string;              // 안정적 카드 ID (contentIdMap 기반)
  lines: string[];         // 한국어 텍스트 라인들
  enLines?: string[];      // 영어 번역 라인들
  colSpan: number;         // 차지하는 그리드 열 수 (기본 2)
  rowSpan: number;         // 차지하는 그리드 행 수 (기본 2)
  rowBreakBefore?: boolean; // 트리플 엔터 → 강제 줄바꿈
}

// 카드 배치 결과 (Plugin → UI)
interface CardPlacement {
  id: string;              // 카드 ID
  nodeId: string;          // Figma 노드 ID
  col: number;             // 그리드 열 위치
  row: number;             // 그리드 행 위치
  colSpan: number;         // 최종 열 span (확장 포함)
  rowSpan: number;         // 최종 행 span
  page: number;            // 0=왼쪽, 1=오른쪽
  lines: string[];         // 한국어 텍스트
}

// 이미지 메타데이터
interface ImageMeta {
  expressionId: string;    // 카드 ID
  imageHash: string;       // Figma 이미지 해시
  prompt: string;          // 생성 프롬프트
  isActive: boolean;       // 현재 카드에 할당된 이미지인지
  index: number;           // 변형 번호 (0, 1, ...)
  imageBase64?: string;    // 썸네일 데이터
}
```

### 3.2 Figma pluginData 키

| 노드 | 키 | 값 | 설명 |
|------|-----|-----|------|
| 메인 프레임 | `keyExprId` | `"a1b2c3"` | 프레임 고유 ID (6자 랜덤) |
| 카드 프레임 | `expressionId` | `"0"` | 카드 식별자 (숫자 인덱스) |
| 이미지 렉트 (카드 내) | `expressionId` | `"0"` | 소속 카드 |
| 이미지 렉트 (카드 내) | `imageHash` | `"abc..."` | Figma 이미지 해시 |
| 이미지 렉트 (저장소) | `expressionId` | `"0"` | 소속 표현 |
| 이미지 렉트 (저장소) | `imageHash` | `"abc..."` | Figma 이미지 해시 |
| 이미지 렉트 (저장소) | `imageIndex` | `"0"` | 변형 번호 |
| 이미지 렉트 (저장소) | `prompt` | `"흰 바탕 위에..."` | 생성 프롬프트 |
| 저장소 그룹 | `expressionId` | `"0"` | 소속 표현 |
| 저장소 프레임 | `keyExprId` | `"a1b2c3"` | 매칭 메인 프레임 |
| 저장소 프레임 | `contentIdMap` | `'{"사과":{"expressionId":0},...}'` | 텍스트→ID+번역+이미지 매핑 |

---

## 4. 카드 ID 시스템

### 4.1 문제

순차 번호(`card_1, card_2, ...`)만 사용하면 텍스트를 삭제 후 다시 입력할 때 새 ID가 부여되어 기존 이미지와 연결이 끊김.

### 4.2 해결: 숫자 ID + contentIdMap

`useExpressionParser` 훅에서 파싱 시 다음 우선순위로 ID 할당:

```
Phase 1: 파싱 — 모든 세그먼트를 { lines, rowBreakBefore }로 파싱 (ID 없음)

Phase 2: contentIdMap 매칭 (persistent content-match)
  - Image Storage 프레임의 pluginData에 저장된 텍스트→entry 매핑
  - ContentIdMapEntry = { expressionId: number, en?: string, imageIndex?: number }
  - 삭제 후 재입력해도 같은 숫자 ID 복원 → 이미지 자동 연결

Phase 3: figmaCardIds 매칭 (canvas content-match)
  - 캔버스에 있는 카드의 한국어 텍스트와 정확 매칭
  - Figma에서 선택한 프레임의 카드 ID를 유지

Phase 4: 새 ID 생성
  - nextId++ (0부터 시작하는 숫자)
  - 위 단계에서 매칭 안 된 경우에만
```

### 4.3 contentIdMap 흐름

```
ContentIdMapEntry = {
  expressionId: number,  // 숫자 ID (0, 1, 2, ...)
  en?: string,           // 영어 번역 (공유)
  imageIndex?: number,   // 선택된 이미지 변형 (공유)
}

레이아웃 생성/업데이트 완료
  → Plugin이 placements에서 normalizeText(lines) → ContentIdMapEntry 매핑 생성
  → Image Storage 프레임의 pluginData('contentIdMap')에 JSON 저장
  → LAYOUT_CREATED 메시지에 contentIdMap 포함하여 UI로 전송

UI에서 번역/이미지 변경 시
  → UPDATE_CONTENT_ID_MAP 메시지로 변경된 항목만 전송
  → Plugin이 Storage의 contentIdMap 부분 업데이트

프레임 선택 시
  → Plugin이 Storage에서 contentIdMap 읽어서 FRAME_SELECTED에 포함
  → UI가 받아서 파서에 전달

텍스트 정규화
  normalizeText(lines) = lines.map(trim).filter(nonEmpty).join('\n')
```

### 4.4 시나리오 검증

| 시나리오 | ID 동작 | 이미지 동작 |
|----------|---------|------------|
| 오타 수정 (같은 위치, 텍스트 변경) | position-match → 같은 ID | 보존 ✓ |
| 끝에 카드 추가 | 기존 ID 유지, 새 카드만 새 ID | 기존 보존 ✓ |
| 중간에 카드 삽입 | content-match가 기존 ID 보존 (2-pass) | 기존 보존 ✓ |
| 카드 삭제 | 나머지 content-match | 삭제된 것만 제거 ✓ |
| 카드 순서 변경 | content-match가 내용 따라감 | 이미지도 따라감 ✓ |
| 삭제 후 재입력 | contentIdMap에서 원래 숫자 ID 복원 | 이미지 자동 연결 ✓ |
| 완전히 다른 텍스트 | 새 숫자 ID 할당 | 이미지 없음 (정상) |
| 빠른 연속 타이핑 | 400ms 디바운스 + buildInProgress 큐 | 안전 ✓ |

---

## 5. Figma 노드 구조

### 5.1 메인 프레임

```
[KeyExpr] Key Expressions #a1b2c3          ← 메인 프레임 (7452×3780)
├── title-highlight                        ← 제목 배경 (노란색 라운드렉트)
├── Key Expressions                        ← 제목 텍스트 (Inter Bold 72px)
├── center-guide-temp                      ← 중앙 가이드라인 (40px 회색, opacity 0.3)
│
├── [card:0] 사과                          ← 카드 프레임 (숫자 expressionId)
│   ├── [img:0]                            ← 이미지 영역 프레임 (clipsContent)
│   │   └── [image:0]                      ← 이미지 렉트 (IMAGE fill, imageHash)
│   ├── card-text                          ← 한국어 텍스트 (Bold, CENTER)
│   └── card-text-en                       ← 영어 텍스트 (Bold, #6A6A6A)
│
├── [card:1] 바나나
│   ├── [img:1]
│   ├── card-text
│   └── card-text-en
│
└── ...
```

### 5.2 카드 내부 비율

```
┌─────────────────────────────┐
│         inset (≈21px)       │
│  ┌───────────────────────┐  │
│  │                       │  │  ← [img:] 영역
│  │     이미지 (67%)       │  │     imageZone = min(height×0.67, defaultCard×0.67)
│  │                       │  │     이미지 높이 상한 = 기본 2×2 카드 기준
│  │                       │  │
│  └───────────────────────┘  │
│                             │
│     한국어 텍스트 (57%)      │  ← card-text (textArea의 57%)
│                             │
│     영어 번역 (43%)          │  ← card-text-en (textArea의 43%)
│                             │
└─────────────────────────────┘
```

### 5.3 Image Storage 프레임

```
[KeyExpr] Image Storage #a1b2c3           ← 메인 프레임 오른쪽 500px에 위치
│  pluginData: keyExprId="a1b2c3"
│  pluginData: contentIdMap='{"사과":{"expressionId":0},"바나나":{"expressionId":1}}'
│
├── [store:0] 사과                         ← 표현별 그룹 프레임 (숫자 ID)
│   ├── [store:0:0] 사과                   ← 200×200 이미지 렉트 (변형 0)
│   └── [store:0:1] 사과                   ← 200×200 이미지 렉트 (변형 1)
│
├── [store:1] 바나나
│   ├── [store:1:0] 바나나
│   └── [store:1:1] 바나나
│
└── ...
```

---

## 6. 그리드 레이아웃 엔진

`cardGridBuilder.ts`에서 4단계로 처리:

### Phase A: 측정 및 사이징 (`measureAndSizeCards`)

```
각 카드에 대해:
1. Figma 텍스트 노드 생성 → 자연 너비 측정
2. colSpan 성장: 자연 너비 > (카드 너비 - 40px) 이면 colSpan++
   → 최대 GRID_COLS(8)까지
3. 최종 너비로 텍스트 래핑 → 래핑 높이 측정
4. rowSpan 성장: 래핑 높이 > (카드 높이 × 0.5) 이면 rowSpan++
   → 최대 GRID_ROWS(8)까지
```

### Phase B: 장애물 감지 + 행 패킹 (`groupIntoRows`)

```
1. buildObstacleOccupancy(frame, cardIds) → boolean[][] 점유 맵
   - 메인 프레임의 non-card 자식 노드를 장애물로 취급
   - 제목, 가이드라인 등이 차지하는 셀을 점유로 표시

2. 카드를 순서대로 행에 배치:
   - rowBreakBefore=true → 새 행 시작
   - 남은 열에 colSpan이 안 들어가면 → 새 행 시작
   - 장애물 셀은 건너뜀
   - 행의 maxRowSpan = 행 내 최대 rowSpan

3. expandRowEntries: 행 내 남은 빈 셀 분배
   - 가장 작은 colSpan 카드부터 1셀씩 확장
   - 카드당 최대 확장: MAX_EXPANSION (2셀)
```

### Phase C: 물리 배치 (`computeCardLayout`)

```
행을 순서대로 페이지에 배치:
- gridRow + maxRowSpan > GRID_ROWS → 다음 페이지로
- 페이지 0: x = GRID_MARGIN_LEFT (자동 계산)
- 페이지 1: x = HALF_PAGE_WIDTH + GRID_MARGIN_LEFT
- y = GRID_START_Y + gridRow * (CELL_HEIGHT + CELL_GAP)
- 최대 2페이지 (page 0, 1)

결과: ComputedPlacement[] (순수 좌표 데이터, Figma 노드 없음)
```

### 실행 분기

| 명령 | 함수 | 동작 |
|------|------|------|
| `GENERATE_LAYOUT` | `buildCardGrid()` | computeCardLayout → 모든 카드 새로 생성 (`createCardNode`) |
| `UPDATE_LAYOUT` | `applyCardLayout()` | computeCardLayout → 기존 카드 diff 비교 → 매칭된 카드는 `updateCardNode` (이미지 보존), 없는 카드는 `createCardNode`, 고아 카드는 삭제 |

### Diff-Based Update (`applyCardLayout`)

```typescript
// 1. 레이아웃 계산
const layout = await computeCardLayout(expressions, settings);

// 2. 기존 카드 맵 생성: expressionId → FrameNode
const existing = new Map();
for (child of frame.children)
  if (child.name.startsWith('[card:'))
    existing.set(child.getPluginData('expressionId'), child);

// 3. 레이아웃 순회
for (info of layout) {
  const match = existing.get(info.card.id);
  if (match) {
    updateCardNode(match, ...);   // 위치/크기/텍스트만 업데이트, 이미지 보존
    usedIds.add(info.card.id);
  } else {
    createCardNode(frame, ...);   // 새로 생성
  }
}

// 4. 사용되지 않은 기존 카드 제거
for ([id, node] of existing)
  if (!usedIds.has(id)) node.remove();
```

### `updateCardNode` — 이미지 보존 핵심

```
1. 카드 프레임 위치/크기 변경
2. [img:] 프레임 크기/위치 변경 (children 건드리지 않음)
3. [image:] 렉트 크기만 변경 (fills의 imageHash 보존!)
4. card-text 내용/크기 업데이트
5. card-text-en 내용/크기 업데이트
```

---

## 7. 메시지 프로토콜

### 7.1 UI → Plugin

| 타입 | 주요 필드 | 용도 |
|------|----------|------|
| `GENERATE_LAYOUT` | expressions, settings, frameId? | 전체 레이아웃 새로 생성 |
| `UPDATE_LAYOUT` | expressions, settings, frameId? | Diff 기반 레이아웃 업데이트 |
| `STORE_IMAGE` | expressionId, imageBytes, prompt, index, frameId? | 이미지 저장소에 저장 |
| `ASSIGN_IMAGE` | expressionId, imageHash, frameId? | 이미지를 카드에 할당 |
| `SWAP_IMAGE` | expressionId, newImageHash, frameId? | 카드 이미지 교체 |
| `EXPORT_REF_FRAME` | frameName | 레퍼런스 프레임 PNG 내보내기 |
| `MEASURE_TEXT` | texts[], fontFamily, fontSize | 텍스트 너비/높이 측정 |
| `CHECK_REF_FRAME` | frameName | 레퍼런스 프레임 존재 확인 |
| `SAVE_API_KEY` | apiKey | API 키 영구 저장 |
| `LOAD_API_KEY` | — | API 키 로드 요청 |
| `NEW_PAGE` | settings | 새 페이지 프레임 생성 |
| `CLEANUP_TEMP` | frameId? | 임시 노드 제거 |
| `CLEANUP_GUIDES` | — | 모든 가이드라인 제거 |
| `UPDATE_CONTENT_ID_MAP` | entries[], frameId? | contentIdMap 부분 업데이트 |
| `INIT_STORAGE` | — | Storage 프레임 초기화 |
| `CHECK_STORAGE` | — | Storage 상태 확인 |
| `ADD_GUIDES` | — | 가이드라인 추가 |
| `REMOVE_BG` | frameId? | 카드 이미지 배경 제거 |
| `UPDATE_CARD_EN` | expressionId, enText, frameId? | 단일 카드 영어 텍스트 직접 업데이트 |

### 7.2 Plugin → UI

| 타입 | 주요 필드 | 용도 |
|------|----------|------|
| `LAYOUT_CREATED` | placements, frameId, contentIdMap? | 레이아웃 완료 |
| `FRAME_SELECTED` | frameId, expressionText, enTextPairs, storedImages, contentIdMap? | 프레임 선택됨 |
| `IMAGE_STORED` | expressionId, imageHash, index | 이미지 저장 완료 |
| `IMAGE_ASSIGNED` | expressionId, success | 이미지 할당 결과 |
| `IMAGE_THUMBNAIL` | expressionId, imageHash, imageBase64 | 비동기 썸네일 |
| `REF_FRAME_EXPORTED` | imageBase64 | 레퍼런스 이미지 |
| `REF_FRAME_CHECKED` | frameName, matchCount | 프레임 존재 여부 |
| `TEXT_MEASURED` | results[] | 텍스트 측정 결과 |
| `API_KEY_LOADED` | apiKey | 저장된 API 키 |
| `NEW_PAGE_CREATED` | frameId | 새 페이지 생성됨 |
| `STORAGE_STATUS` | ready, contentIdMap?, hasGuides? | Storage 준비 상태 |
| `GUIDES_STATUS` | hasGuides | 가이드라인 존재 여부 |
| `CARD_SELECTED` | frameId, expressionId, korean, en, storedImages, activeImageHash? | 개별 카드 선택됨 |
| `CARD_IMAGE_FOR_BG_REMOVAL` | expressionId, imageBase64 | 배경 제거용 이미지 |
| `REMOVE_BG_DONE` | total | 배경 제거 완료 |
| `ERROR` | message, detail? | 에러 |

---

## 8. 주요 데이터 흐름

### 8.1 레이아웃 생성

```
User: 텍스트 입력
  ↓
useExpressionParser: 파싱
  → Phase 2~4 ID 할당 (figmaCardIds → contentIdMap → prevCards → 새 ID)
  → ExpressionCard[] 반환
  ↓
User: "Generate Layout" 클릭
  ↓
App: mergeEnLines(parsedCards) → GENERATE_LAYOUT 전송
  ↓
Plugin:
  → createMainFrame(settings)
  → buildCardGrid() → computeCardLayout → createCardNode × N
  → createStorageFrame()
  → updateContentIdMap(placements)
  → LAYOUT_CREATED 응답 (placements + contentIdMap)
  ↓
App:
  → placements 저장
  → parsedCards에 실제 colSpan/rowSpan 반영
  → contentIdMap 갱신
```

### 8.2 라이브 업데이트 (텍스트 편집)

```
User: 텍스트 수정
  ↓
ExpressionInput: onKeyDown(스페이스바 또는 더블 엔터)
  → handleLiveUpdate() → 400ms 디바운스
  ↓
App: UPDATE_LAYOUT 전송
  ↓
Plugin:
  → applyCardLayout() (diff 기반)
    - 기존 카드 매칭 → updateCardNode (이미지 보존)
    - 새 카드 → createCardNode
    - 고아 카드 → 삭제
  → updateContentIdMap(placements)
  → LAYOUT_CREATED 응답
  ↓
App: 상태 갱신

※ buildInProgress 플래그로 동시 빌드 방지
   pendingBuildMsg로 최신 요청만 큐잉
```

### 8.3 이미지 생성

```
User: "Generate Images" 클릭
  ↓
App: 이미지 없는 카드 필터링
  ↓
레퍼런스 프레임 확인:
  → CHECK_REF_FRAME 전송 → matchCount에 따라 경고/확인 다이얼로그
  → EXPORT_REF_FRAME → 0.5x PNG base64 수신
  ↓
gemini.generateAll():
  → 각 카드 × 2 변형 = 총 N×2 이미지
  → RateLimiter: 10 RPM, 동시 2개, 429시 지수 백오프 재시도
  → 각 이미지:
    1. getImageAspectRatio(colSpan, rowSpan) → Gemini 허용 비율
    2. buildImagePrompt(lines) → 한국어 프롬프트
    3. generateImage(apiKey, prompt, refImage, aspectRatio)
    4. base64 → STORE_IMAGE 전송
    5. Plugin: storeImage() → imageHash 반환
    6. 첫 번째 변형 → ASSIGN_IMAGE 자동 전송
```

### 8.4 프레임 선택

```
User: 캔버스에서 KeyExpr 프레임 선택
  ↓
Plugin: figma.on('selectionchange')
  → [card:*] 프레임에서 텍스트 추출
  → Image Storage에서 저장된 이미지 메타데이터 수집
  → contentIdMap 읽기
  → FRAME_SELECTED 전송 (메타데이터만, 즉시)
  → 비동기: 각 저장 이미지 → 160px 썸네일 → IMAGE_THUMBNAIL 전송
  ↓
App:
  → activeFrameId 설정
  → expressions 텍스트 복원
  → figmaCardIds 설정 (enTextPairs에서 추출)
  → contentIdMap 복원
  → generatedImages 복원 (저장소 메타데이터)
  ↓
ExpressionInput: 텍스트 변경 → 파서가 figmaCardIds로 ID 동기화
```

### 8.5 번역

```
User: "Translate" 클릭
  ↓
App: 번역 필요한 카드 필터링 (enLines 없거나 placeholder인 것)
  ↓
gemini.translate():
  → gemini-2.5-flash 모델, JSON 응답
  → 프롬프트: 한국어→영어 번역 요청
    - 주어 추측, 첫 글자 대문자
    - 단어/구 형태는 마침표 없이
    - 단일 단어에 a/an/the 관사 생략
  → 결과: Map<cardId, string[]>
  ↓
App:
  → enLinesMap 갱신
  → mergeEnLines(parsedCards) → UPDATE_LAYOUT 전송
  → Plugin이 card-text-en 업데이트
```

### 8.6 개별 카드 선택 + 카드 상세 뷰

```
User: 캔버스에서 개별 카드([card:*]) 클릭
  ↓
Plugin: figma.on('selectionchange')
  → 선택 노드가 카드 프레임이거나 카드 내부 노드인지 확인
  → 부모 체인을 올라가며 [card:*] 프레임 탐색
  → 카드의 expressionId, 한국어, 영어 텍스트 추출
  → Storage에서 해당 표현의 이미지 목록 수집
  → CARD_SELECTED 메시지 전송
  ↓
App:
  → selectedCard 상태 설정
  → 카드 상세 뷰 표시 (한국어, 영어, 이미지 목록)
  → Re-translate: Gemini 번역 → UPDATE_CARD_EN으로 직접 반영
  → Image Swap: SWAP_IMAGE로 이미지 교체
```

---

## 9. UI 컴포넌트

### 9.1 App.tsx (루트)

**상태**:
- `expressions: string` — 텍스트 입력 원문
- `parsedCards: ExpressionCard[]` — 파싱 결과
- `settings: PluginSettings` — API 키, 배경색, 폰트, 레퍼런스 프레임명
- `placements: CardPlacement[]` — 현재 레이아웃
- `generatedImages: Map<string, ImageMeta[]>` — 표현별 이미지
- `enLinesMap: Map<string, string[]>` — 카드별 영어 번역
- `figmaCardIds: {cardId, korean}[]` — 캔버스 카드 ID (프레임 선택 시)
- `contentIdMap: Record<string, string>` — 영구 텍스트→ID 매핑
- `activeFrameId: string | null` — 현재 선택된 프레임 ID
- `refImageBase64: string | undefined` — 레퍼런스 이미지

**탭**: Expressions | Settings | Images

**액션 바**:
- Generate Layout — 전체 레이아웃 새로 생성
- Translate — Gemini로 영어 번역
- Generate Images — AI 이미지 벌크 생성
- + New Page — 새 페이지 프레임 생성 (기존 프레임 아래 200px)
- Remove All Guides — 가이드라인 정리

### 9.2 ExpressionInput.tsx

- 16행 textarea (높이 300px)
- `useExpressionParser` 훅으로 실시간 파싱
- 스페이스바/더블엔터 시 라이브 업데이트 트리거
- 하단: 프레임 ID 표시 (왼쪽, 모노스페이스 10px) + "Parsed: N cards" (오른쪽)
- 32카드 초과 시 경고 배너

### 9.3 SettingsPanel.tsx

- API Key (패스워드 + 표시/숨김 토글)
- Background Color (컬러 피커 + hex 입력)
- Font Family (텍스트 입력, 빈칸이면 NanumSquareRound)
- Font Size (8~200)
- Reference Frame Name (기본 "ref_img")

### 9.4 ImageGallery.tsx

- 표현별 이미지 썸네일 그리드
- 활성 이미지 하이라이트
- 클릭으로 Swap (카드 이미지 교체)
- "+ Regen" 버튼 → 커스텀 프롬프트 입력 → 재생성

### 9.5 GenerationProgress.tsx

- 진행률 바: current / total
- Cancel 버튼 (AbortController로 중단)

---

## 10. 이미지 관리 시스템

### 10.1 저장 (`storeImage`)

```
1. imageBytes → figma.createImage() → imageHash
2. 저장소에서 표현별 그룹 프레임 찾기/생성
3. 그룹 내 이미지 렉트 생성 (200×200, IMAGE fill)
4. pluginData: imageHash, expressionId, imageIndex, prompt
```

### 10.2 할당 (`assignImage`)

```
1. expressionId로 카드 프레임 찾기
2. [img:expressionId] 프레임 찾기
3. 기존 children 제거
4. 새 [image:expressionId] 렉트 생성 (IMAGE fill with hash)
5. 플레이스홀더 배경 제거
```

### 10.3 교체 (`swapImage`)

```
assignImage()와 동일 — 새 imageHash로 재할당
```

### 10.4 이미지 aspect ratio

```
카드의 colSpan/rowSpan → 실제 이미지 프레임 크기 계산
→ imgW / imgH 비율
→ Gemini 허용 비율 중 가장 가까운 것 선택

허용 비율: 1:1, 4:5, 3:4, 2:3, 9:16, 1:4, 1:8,
          5:4, 4:3, 3:2, 16:9, 4:1, 21:9, 8:1
```

### 10.5 프롬프트

```
흰 바탕 위에 "{표현}"을(를) 직관적으로 잘 나타내는 이미지를 그려줘.
첨부한 레퍼런스 이미지와 같은 스타일로 그려줘.
텍스트 없이 이미지만 생성해줘.

+ 커스텀 프롬프트가 있으면: " 추가 요청: {customNote}"
```

---

## 11. Rate Limiting

```typescript
RateLimiter({
  rpm: 10,            // 분당 10회
  maxConcurrent: 2,   // 동시 2개
  maxRetries: 5,      // 최대 5회 재시도
})
```

- 토큰 버킷 방식: `minInterval = 60000 / rpm = 6초`
- 429 응답 시 `RateLimitError` → rate limiter가 자동 재시도
- 지수 백오프: `2^retries` 초 대기 후 큐 앞에 재삽입
- `cancelAll()`: 모든 대기 작업 취소 (AbortController 연동)

---

## 12. 동시성 관리

### Plugin 측 (`code.ts`)

```
buildInProgress: boolean     — 빌드 중 플래그
pendingBuildMsg: Message     — 최신 대기 메시지 (하나만 유지)

UPDATE_LAYOUT 수신 시:
  - buildInProgress → pendingBuildMsg에 저장, 종료
  - !buildInProgress → 빌드 시작
  - 빌드 완료 후 → pendingBuildMsg 있으면 처리
```

### UI 측 (`App.tsx`)

```
liveUpdateTimerRef: 400ms 디바운스
  - 연속 타이핑 시 마지막 입력만 처리
  - 스페이스바/더블엔터에서만 트리거
```

### Selection 변경

```
selectionSeq: number — 시퀀스 카운터
  - 썸네일 내보내기 중 selection 변경 → seq 불일치 → 중단
  - 최신 선택만 처리
```

### Snap-to-Grid + 카드 구조 보호

```
Plugin: figma.on('documentchange')
  → 300ms 디바운스
  → 변경된 노드 중 [card:*] 프레임 필터링
  → figma.getNodeById()로 안전하게 노드 접근
  ↓
1. 카드 구출 (rescueNestedCard):
   - 부모가 다른 [card:*]인 경우 감지
   - 절대 좌표 계산 → 메인 KeyExpr 프레임으로 reparent

2. 그리드 스냅 (snapCardsToGrid):
   - 카드 중심점 → 가장 가까운 그리드 셀 계산
   - 셀 점유 충돌 방지 (이미 차지된 셀 건너뜀)
   - try-finally로 snapInProgress 안전 관리
```

---

## 13. 레이아웃 상수 정리

```typescript
// 프레임
FRAME_WIDTH       = 7452
FRAME_HEIGHT      = 3780
HALF_PAGE_WIDTH   = 3726

// 그리드 (고정 셀 크기, 중앙 정렬)
GRID_COLS         = 8
GRID_ROWS         = 8
CELL_WIDTH        = 380   // 고정값
CELL_HEIGHT       = 363   // 고정값
CELL_GAP          = 40

// 마진 (자동 계산 — 그리드 중앙 정렬)
GRID_MARGIN_LEFT  = Math.round((HALF_PAGE_WIDTH - TOTAL_GRID_WIDTH) / 2)
GRID_START_Y      = Math.round((FRAME_HEIGHT - TOTAL_GRID_HEIGHT) / 2)
TITLE_HEIGHT      = 500

// 카드 기본
DEFAULT_COL_SPAN  = 2
DEFAULT_ROW_SPAN  = 2
MAX_EXPANSION     = 2     // 행 확장 시 카드당 최대 추가 셀

// 카드 비율
CARD_IMAGE_RATIO  = 0.67  // 이미지 영역 67%
SIZING_TEXT_RATIO = 0.5   // 사이징 시 텍스트 예산 50%
CARD_KO_TEXT_RATIO= 0.57  // 한국어 텍스트 57% (텍스트 영역 내)
CARD_EN_TEXT_RATIO= 0.43  // 영어 텍스트 43%

// 카드 스타일
CARD_STROKE_WEIGHT= 13
CARD_CORNER_RADIUS= 54
CARD_IMG_CORNER_RADIUS = 38
CARD_BG_COLOR     = '#FFFFFF'
CARD_STROKE_COLOR = '#FFB74A'
CARD_EN_TEXT_COLOR = '#6A6A6A'
CARD_EN_FONT_SIZE = 66
CARD_EN_PLACEHOLDER = '영어 번역'

// 폰트
DEFAULT_FONT_FAMILY = 'NanumSquareRound'
DEFAULT_FONT_SIZE   = 100
TITLE_FONT_FAMILY   = 'Inter'
TITLE_FONT_SIZE     = 72

// 이미지 저장소
STORAGE_GAP         = 500
STORAGE_IMAGE_SIZE  = 200

// 색상
DEFAULT_BG_COLOR          = '#FFCF66'
GUIDELINE_COLOR           = '#CCCCCC'
TITLE_HIGHLIGHT_COLOR     = '#FFE082'
```

---

## 14. 유저 워크플로우

### 1단계: 설정

- Settings 탭에서 Gemini API 키 입력 (영구 저장)
- 배경색, 폰트, 레퍼런스 프레임 이름 설정

### 2단계: 텍스트 입력

```
고양이
도마뱀

동물

하얀색 = 흰색
분홍색 = 핑크색


원피스를 입은
고양이
```

- 싱글 엔터 = 카드 내 줄바꿈
- 더블 엔터 (빈 줄 1개) = 새 카드
- 트리플 엔터 (빈 줄 2개+) = 새 행 (rowBreakBefore)

### 3단계: 레이아웃 생성

- "Generate Layout" 클릭 → 프레임 + 제목 + 가이드라인 + 카드 자동 생성
- 텍스트 편집 시 400ms 디바운스로 라이브 업데이트 (이미지 보존)

### 4단계: 번역

- "Translate" 클릭 → Gemini가 한국어→영어 번역
- 카드 하단에 영어 텍스트 자동 반영

### 5단계: AI 이미지 생성

- "Generate Images" 클릭
- 레퍼런스 프레임 스타일 참조
- 표현당 2벌 생성, 첫 번째 자동 배정
- 진행률 실시간 표시, 취소 가능

### 6단계: 이미지 관리

- Images 탭에서 표현별 썸네일 확인
- 다른 변형으로 Swap
- 커스텀 프롬프트로 Regen

### 7단계: 프레임 재선택

- 캔버스에서 기존 KeyExpr 프레임 선택 → 텍스트/이미지/번역 자동 복원
- 편집 후 라이브 업데이트 → 기존 이미지 보존

---

## 15. 빌드

```bash
npm run build
# vite.config.plugin.ts → dist/code.js (Figma sandbox)
# vite.config.ui.ts → dist/index.html (UI iframe, singlefile 인라인)
```
