# Storybook Pipeline 구현 계획

## 현재 상태

현재 플러그인은 **Key Expressions Generator** — Phase 4의 Step 15-16에 해당하는 기능만 구현되어 있음.
- Expression 텍스트 입력 → 카드 파싱 → Figma 레이아웃 생성
- Gemini API를 통한 번역 & 이미지 생성
- 이미지 저장/교체, 카드 선택, 멀티카드 액션

## 전체 파이프라인 구조

```
Phase 1: 세팅 (스타일/컬러/인물)     → Step 1-4
Phase 2: Part 1 Korean              → Step 5-10
Phase 3: Part 2 Korean+English      → Step 11-13
Phase 4: Part 3 Korean+Key Expr     → Step 14-17  (기존 기능 확장)
Phase 5: 마무리 (표지/내지)          → Step 18-20
```

---

## Milestone 0: 아키텍처 리팩터링 (Foundation)

> 전체 파이프라인을 지원하기 위한 기반 구조 변경

### 0-1. 플러그인 상태 머신 (Step Navigation)

**목표**: 플러그인이 20개 Step을 순차적으로 안내하는 Wizard 형태로 동작

```typescript
// src/shared/pipeline.ts

export enum Phase {
  SETUP = 'SETUP',           // Phase 1
  PART1_KOREAN = 'PART1',    // Phase 2
  PART2_KO_EN = 'PART2',     // Phase 3
  PART3_KEY_EXPR = 'PART3',  // Phase 4
  FINISHING = 'FINISHING',    // Phase 5
}

export enum Step {
  // Phase 1
  STYLE_SETUP = 1,
  KEY_COLOR = 2,
  CHARACTERS = 3,
  CHARACTER_IMAGES = 4,
  // Phase 2
  PAGE_SPLIT = 5,
  SCENE_STRUCTURE = 6,
  IMAGE_BULK_GEN = 7,
  IMAGE_PLACEMENT = 8,
  DIALOGUE_PLACEMENT = 9,
  PART1_CONFIRM = 10,
  // Phase 3
  BULK_TRANSLATE = 11,
  PART2_PAGES = 12,
  PART2_CONFIRM = 13,
  // Phase 4
  PART3_LAYOUT = 14,
  KEY_EXPR_INPUT = 15,
  KEY_EXPR_TRANSLATE_IMG = 16,
  PART3_CONFIRM = 17,
  // Phase 5
  COVER = 18,
  INNER_PAGES = 19,
  FINAL_OUTPUT = 20,
}

export interface PipelineState {
  currentStep: Step;
  completedSteps: Step[];
  projectData: ProjectData;
}

export interface ProjectData {
  storyText: string;
  styleGuide: {
    referenceImageBase64?: string;
    styleDescription?: string;
  };
  keyColors: {
    colorA: string;  // default: #FFCF66
    colorB: string;  // default: #FFF69B
  };
  characters: Character[];
  pages: StoryPage[];
  translations: Record<number, string>; // pageIndex → English text
  keyExpressions: Record<number, ExpressionCard[]>; // pageIndex → cards
}
```

### 0-2. UI 리팩터링: Step-based Navigation

**현재**: Tab 기반 (expressions | settings | images)
**변경**: Step Wizard + 각 Step별 전용 UI Panel

```
App.tsx
├── StepNavigation (상단 Phase/Step 표시)
├── StepPanel (현재 Step에 따라 다른 UI 렌더링)
│   ├── Phase1/
│   │   ├── StyleSetupPanel.tsx      (Step 1)
│   │   ├── KeyColorPanel.tsx        (Step 2)
│   │   ├── CharacterPanel.tsx       (Step 3)
│   │   └── CharacterImagePanel.tsx  (Step 4)
│   ├── Phase2/
│   │   ├── PageSplitPanel.tsx       (Step 5)
│   │   ├── SceneStructurePanel.tsx  (Step 6)
│   │   ├── ImageBulkGenPanel.tsx    (Step 7)
│   │   ├── ImagePlacementPanel.tsx  (Step 8)
│   │   ├── DialoguePlacementPanel.tsx (Step 9)
│   │   └── Part1ConfirmPanel.tsx    (Step 10)
│   ├── Phase3/
│   │   ├── BulkTranslatePanel.tsx   (Step 11)
│   │   ├── Part2PagesPanel.tsx      (Step 12)
│   │   └── Part2ConfirmPanel.tsx    (Step 13)
│   ├── Phase4/
│   │   ├── Part3LayoutPanel.tsx     (Step 14)
│   │   ├── KeyExprInputPanel.tsx    (Step 15) ← 기존 기능
│   │   ├── KeyExprTransImgPanel.tsx (Step 16) ← 기존 기능
│   │   └── Part3ConfirmPanel.tsx    (Step 17)
│   └── Phase5/
│       ├── CoverPanel.tsx           (Step 18)
│       ├── InnerPagesPanel.tsx      (Step 19)
│       └── FinalOutputPanel.tsx     (Step 20)
└── SettingsDrawer (API Key 등 공통 설정)
```

### 0-3. Figma 캔버스 레이아웃 구조

```
Figma Canvas Layout:
                    ↑ (상단)
    ┌─────────────────────────────┐
    │   PK-Progress               │  진행 상태 표시 (Phase/Step 도형)
    └─────────────────────────────┘

← (왼쪽)                                    (오른쪽/중앙) →
┌──────────────┐    ┌────────────────────────────────────┐
│ PK-Meta      │    │  PK-Part1-Page01  PK-Part1-Page02  │
│ ├ ProjectInfo│    │  PK-Part1-Page03  PK-Part1-Page04  │
│ ├ StyleGuide │    │  ...                                │
│ ├ Characters │    │  (빈 줄 - Part 구분)                │
│ ├ Page1-Imgs │    │  PK-Part2-Page01  PK-Part2-Page02  │
│ ├ Page2-Imgs │    │  ...                                │
│ ├ ...        │    │  (빈 줄 - Part 구분)                │
│ ├ KeyExpr    │    │  PK-Part3-Page01  PK-Part3-Page02  │
│ └ Translations│   │  ...                                │
└──────────────┘    └────────────────────────────────────┘

                    ↓ (하단)
    ┌─────────────────────────────┐
    │  PK-Snapshot-Slot1          │  스냅샷 영역
    │  PK-Snapshot-Slot2          │
    └─────────────────────────────┘
```

### 0-4. 네이밍 컨벤션 & PluginData

```typescript
// 프레임 네이밍 컨벤션
const NAMING = {
  progress: 'PK-Progress',
  meta: 'PK-Meta',
  metaProjectInfo: 'PK-Meta-ProjectInfo',
  metaStyleGuide: 'PK-Meta-StyleGuide',
  metaCharacters: 'PK-Meta-Characters',
  metaPageImages: (pageIdx: number) => `PK-Meta-Page${String(pageIdx).padStart(2, '0')}-Images`,
  part1Page: (pageIdx: number) => `PK-Part1-Page${String(pageIdx).padStart(2, '0')}`,
  part2Page: (pageIdx: number) => `PK-Part2-Page${String(pageIdx).padStart(2, '0')}`,
  part3Page: (pageIdx: number) => `PK-Part3-Page${String(pageIdx).padStart(2, '0')}`,
  snapshotSlot: (slot: number) => `PK-Snapshot-Slot${slot}`,
  storage: '[KeyExpr] Storage',  // 기존 유지
};

// PluginData keys (setPluginData/getPluginData)
const PLUGIN_DATA_KEYS = {
  pipelineState: 'pk-pipeline-state',    // JSON: PipelineState
  pageData: 'pk-page-data',             // JSON: per-page metadata
  sceneAnalysis: 'pk-scene-analysis',    // JSON: AI scene analysis result
  characterData: 'pk-character-data',    // JSON: character info
  stepStatus: 'pk-step-status',          // JSON: step completion status
};
```

### 0-5. 새로운 상수 (기획서 기반)

```typescript
// src/shared/constants.ts에 추가

// Story page dimensions (Part 1, 2, 3 본문 페이지)
export const STORY_PAGE_WIDTH = 3726;
export const STORY_PAGE_HEIGHT = 3780;
export const PAGES_PER_ROW = 2;
export const PAGE_GAP_H = 10;       // 같은 줄 페이지 간 간격
export const PAGE_GAP_V = 300;      // 줄 간 간격

// 임시 텍스트 박스 (Step 5)
export const TEMP_TEXT_BOX_WIDTH = 3600;
export const TEMP_TEXT_BOX_HEIGHT = 500;
export const TEMP_TEXT_FONT_SIZE = 200;
export const TEMP_TEXT_BOX_GAP = 100;  // 텍스트 박스 간 간격

// Cover dimensions
export const COVER_WIDTH = STORY_PAGE_WIDTH * 2;  // 2:1 비율
export const COVER_HEIGHT = STORY_PAGE_HEIGHT;

// Key colors
export const KEY_COLOR_A = '#FFCF66';
export const KEY_COLOR_B = '#FFF69B';

// Page numbering
export const PAGE_NUMBER_FONT_SIZE = 48;
export const PAGE_NUMBER_MARGIN = 80;
```

---

## Milestone 1: Phase 1 구현 — 세팅

### 1-1. Step 1: 이미지 스타일 확정

**UI (StyleSetupPanel.tsx)**:
- 이야기 텍스트 입력 textarea (전체 동화 텍스트)
- "분위기 분석" 버튼 → Gemini에 이야기 보내서 스타일 제안 받기
- 스타일 설명 텍스트 편집 가능
- "배경 이미지 생성" 버튼 → 6개 베리에이션 생성
- 이미지 6개 그리드로 표시, 선택 UI
- 레퍼런스 이미지 업로드 옵션
- "프롬프트 수정 후 재생성" 버튼

**Sandbox**:
- 선택된 스타일 가이드 이미지를 PK-Meta-StyleGuide 프레임에 저장
- projectData.styleGuide 업데이트

**새 메시지 타입**:
```typescript
// UI → Sandbox
'SAVE_STYLE_GUIDE': { imageBytes: number[], description: string }
'SAVE_STORY_TEXT': { text: string }

// Sandbox → UI
'STYLE_GUIDE_SAVED': { success: boolean }
```

### 1-2. Step 2: 키컬러 확정

**UI (KeyColorPanel.tsx)**:
- 기본 키컬러 A/B 미리보기
- AI 제안 3가지 조합 표시 (스타일 가이드 이미지 색상 분석)
- 커스텀 컬러 피커
- 미리보기 (키컬러가 적용된 샘플 카드)

**Sandbox**:
- PK-Meta-ProjectInfo에 키컬러 스와치 저장

### 1-3. Step 3: 등장인물 설정

**UI (CharacterPanel.tsx)**:
- "AI 분석" 버튼 → 이야기에서 인물 자동 추출
- 인물 리스트: 이름, 성격, 외형 특징 편집 가능
- 추가/삭제 버튼
- AI가 제안하는 옵션 (외형 미확정 시)

**Sandbox**:
- PK-Meta-Characters에 인물 정보 저장

### 1-4. Step 4: 등장인물 이미지 생성

**UI (CharacterImagePanel.tsx)**:
- 인물별 4개 베리에이션 생성
- 이미지 선택 UI (갤러리)
- 프롬프트 수정 후 재생성

**Sandbox**:
- 확정 이미지를 PK-Meta-Characters에 배치

---

## Milestone 2: Phase 2 구현 — Part 1 Korean

### 2-1. Step 5: 페이지 나눔 ★ (핵심 기능)

**UI (PageSplitPanel.tsx)**:
- 단일 큰 textarea에 전체 이야기 텍스트 표시
- 파싱 규칙:
  - 엔터 1번: 같은 페이지, 같은 텍스트 박스 내 줄바꿈
  - 엔터 2번: 같은 페이지, 다른 텍스트 박스
  - 엔터 3번: 다음 페이지
  - `>>`: 빈 페이지 (이미지 전용)
- "AI 자동 나눔" 버튼: 설정 (최소/최대/평균 문장 수)
- 텍스트 자체는 수정 불가, 엔터만 추가/삭제 가능
- 실시간으로 페이지 수 & 구조 미리보기

**Sandbox**:
- 파싱 결과에 따라 Figma에 페이지 프레임 실시간 생성
- 페이지 크기: 3726 x 3780
- 1줄 2페이지, 간격 10px, 줄간격 300px
- 임시 텍스트 박스: 3600 x 500, 중앙 배치, 좌상단 정렬, 200px 폰트

**새 메시지 타입**:
```typescript
// UI → Sandbox
'CREATE_STORY_PAGES': {
  pages: StoryPageData[];  // { texts: string[][], isEmpty: boolean }
  settings: { pageWidth, pageHeight, ... }
}
'UPDATE_STORY_PAGES': { pages: StoryPageData[] }

// Sandbox → UI
'STORY_PAGES_CREATED': { pageFrameIds: string[] }
```

### 2-2. Step 6: 장면 구조화

**UI (SceneStructurePanel.tsx)**:
- 페이지별 AI 분석 결과 표시 (등장인물, 동작, 장면 설명)
- 편집 가능
- "전체 분석" 버튼 → 한 번에 모든 페이지 분석

**Sandbox**:
- 분석 결과를 각 페이지 프레임에 배치:
  - 인물 이미지: 하단 좌측
  - 인물 이름: 이미지 위
  - 장면 설명: 대사 아래 별도 텍스트 박스

### 2-3. Step 7: 이미지 벌크 생성

**UI (ImageBulkGenPanel.tsx)**:
- 첫 4페이지 먼저 생성 (장면당 4개: 흰배경 2 + 풀배경 2)
- 결과 리뷰 → 문제 없으면 전체 벌크 생성
- 페이지별 이미지 갤러리 (선택/교체)
- 이미지 타입 라디오: 흰 배경 / 풀 배경

**Sandbox**:
- 생성된 이미지를 PK-Meta-PageNN-Images에 저장
- 선택된 이미지를 페이지에 풀사이즈 배치

### 2-4. Step 8-9: 이미지 & 대사 배치

**UI (ImagePlacementPanel.tsx / DialoguePlacementPanel.tsx)**:
- 페이지별 이미지 교체/재생성
- 대사 박스 템플릿 선택 (텍스트만 / 키컬러B 테두리 / 키컬러A 테두리)
- 커스텀 프롬프트로 재생성

### 2-5. Step 10: Part 1 확정

**UI (Part1ConfirmPanel.tsx)**:
- 전체 Part 1 페이지 썸네일 리스트
- "Part 1 확정" 버튼 → 자동 스냅샷

---

## Milestone 3: Phase 3 구현 — Part 2 Korean+English

### 3-1. Step 11: 벌크 번역

**UI (BulkTranslatePanel.tsx)**:
- 전체 대사 한국어/영어 병렬 표시
- "번역" 버튼 → Gemini 1회 요청
- 페이지별 검수 UI (이미지 + 한국어 + 영어 함께 표시)
- AI 검수 옵션

### 3-2. Step 12: Part 2 페이지 생성

**Sandbox**:
- Part 1 복사
- Part 1 아래 빈 페이지 2개(1줄) 삽입
- 그 아래 Part 2 배치
- 한국어 아래에 영어 텍스트 추가

### 3-3. Step 13: Part 2 확정
- 번역 최종 검수 → "Part 2 확정" → 스냅샷

---

## Milestone 4: Phase 4 구현 — Part 3 Key Expressions

> 기존 Key Expressions Generator 기능을 파이프라인에 통합

### 4-1. Step 14: Part 3 기본 레이아웃

**Sandbox**:
- Part 1 페이지 수만큼 키컬러 A fill 페이지 생성
- Part 1 이미지 높이 줄여서 배치
- 대사 재배치
- Key Expression 빈 공간 확보

### 4-2. Step 15-16: Key Expression 입력 & 번역/이미지 생성

- 기존 기능 통합 (현재 ExpressionInput, 카드 파싱, 레이아웃, 번역, 이미지 생성)
- 프레임 클릭 → 해당 프레임의 Key Expression 입력 UI

### 4-3. Step 17: Part 3 확정

---

## Milestone 5: Phase 5 구현 — 마무리

### 5-1. Step 18: 표지 제작

- 기존 이미지 중 선택 → 2:1 비율 재생성
- 한국어/영어 제목 배치

### 5-2. Step 19: 내지 제작

- 템플릿 기반 페이지 생성 (소개, 목차, 타이틀 페이지 등)

### 5-3. Step 20: 최종 산출물

- 전체 순서 배치
- 페이지 번호 + "Pronounce Korean" 일괄 삽입
- 결과물 A (스프레드 뷰) & 결과물 B (개별 페이지 뷰) 생성

---

## Milestone 6: 크로스커팅 기능

### 6-1. 진행 상태 표시 (PK-Progress)

- Figma 캔버스 최상단에 Phase/Step 도형으로 표시
- 완료/진행중/미시작 상태 시각 구분
- 플러그인 액션에 따라 자동 업데이트

### 6-2. 자동 상태 파악

- 플러그인 실행 시 PK-* 프레임 구조 파싱 → 현재 Step 자동 판단
- pluginData에서 PipelineState 복원

### 6-3. 자동 포커스/네비게이션

- 작업 중 관련 프레임으로 scrollAndZoomIntoView

### 6-4. 스냅샷/롤백 (2슬롯 롤링)

- Phase 확정 시 자동 스냅샷
- 수동 스냅샷 버튼
- Slot 2 삭제 → Slot 1 → Slot 2 → 새 → Slot 1

### 6-5. 로그 시스템

- 세팅 메뉴 내 로그 뷰어
- 에러 발생 시 Step/작업/에러 상세 기록
- 복사 버튼

### 6-6. 데이터 정리 영역 (PK-Meta)

- 캔버스 왼쪽에 메타 데이터 구조화 배치

---

## 구현 우선순위 & 실행 순서

### 즉시 시작 (Milestone 0 → 2-1)

1. **Milestone 0**: 아키텍처 기반 — Pipeline 타입, 상수, UI Step Navigation
2. **Milestone 2-1 (Step 5)**: 페이지 나눔 — 가장 핵심적인 신규 기능

이유: Step 5(페이지 나눔)가 전체 파이프라인의 핵심이며,
이후 모든 Step이 여기서 생성된 페이지 구조에 의존함.

### 이후 순서

3. Step 6 (장면 구조화) + Step 7 (이미지 벌크 생성) — Part 1 핵심
4. Step 1-4 (Phase 1 세팅) — 순서상 앞이지만 기능 독립적, 나중 구현 가능
5. Step 8-10 (Part 1 완성)
6. Step 11-13 (Part 2)
7. Step 14-17 (Part 3 — 기존 기능 통합)
8. Step 18-20 (마무리)
9. 크로스커팅 기능 (진행 상태, 스냅샷 등)

---

## 기술적 주의사항

1. **Figma Plugin API 제한**:
   - sandbox에서 외부 API 호출 불가 → UI에서 Gemini 호출 후 결과를 sandbox로 전달
   - 대용량 이미지 전달 시 메시지 크기 주의

2. **실시간 업데이트 성능**:
   - Step 5의 실시간 페이지 생성 시 debounce 필수 (400ms+)
   - 대량 프레임 생성 시 batch 처리

3. **기존 코드와의 호환**:
   - 현재 Key Expressions 기능은 Step 15-16으로 통합
   - 기존 메시지 타입/핸들러 유지하면서 확장

4. **데이터 지속성**:
   - PipelineState는 pluginData에 저장
   - 플러그인 재실행 시 복원
