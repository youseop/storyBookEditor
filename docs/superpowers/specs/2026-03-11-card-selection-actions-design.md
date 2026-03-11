# Card Selection Actions Design

## Overview
Figma 캔버스에서 카드 선택 시 재번역/이미지 재생성 기능 추가.
단일 카드 선택과 다중 카드 선택 모두 지원.

## 단일 카드 선택

기존 카드 상세 뷰에 두 가지 기능 추가:

### 재번역
- "재번역" 버튼 → 확인 다이얼로그 → Gemini translate() 호출
- 결과를 캔버스에 반영 (UPDATE_CARD_TRANSLATION 메시지)
- contentIdMap도 업데이트

### 이미지 재생성
- 프롬프트 인풋 (기본값: 한국어 표현)
- "이미지 재생성" 버튼 → generateSingle() 호출
- 내부적으로 buildImagePrompt()로 감싸서 처리 (유저에게는 한국어 표현만 보임)

## 다중 카드 선택

### Sandbox 처리
- `figma.currentPage.selection` 배열에서 `[card:*]` 패턴 노드만 필터링
- 카드 2개 이상 → `CARDS_SELECTED` 메시지 전송
- 카드 1개 → 기존 `CARD_SELECTED`
- 카드 0개 + KeyExpr 프레임 → 기존 `FRAME_SELECTED`

### 새 메시지 타입

**Sandbox → UI:**
- `CARDS_SELECTED`: `{ type, cards: Array<{ expressionId, korean, english }>, frameId }`
- 이후 비동기로 이미지 썸네일 전달

**UI → Sandbox:**
- `UPDATE_CARD_TRANSLATION`: `{ type, cards: Array<{ expressionId, english }> }`

### MultiCardPanel UI 레이아웃 (위→아래)

1. **선택 카드 태그바** — 한국어 텍스트를 작은 태그/칩으로 가로 나열 (wrap)
2. **번역 섹션** — 카드별 `한국어 → 영어` 쌍 리스트 + "일괄 재번역" 버튼 (확인 후 실행)
3. **이미지 섹션** — 카드별로:
   - 카드 라벨 (한국어 텍스트)
   - 후보 이미지 썸네일 가로 행 (overflow-x: auto, 가로 스크롤)
   - 새 이미지 생성 시 해당 행에 실시간 추가
4. **"일괄 이미지 재생성" 버튼** → 카드별 프롬프트 인풋란 펼침 (기본값: 한국어 표현) → "생성 시작" → 순차 생성, 결과가 이미지 행에 추가

### App.tsx 상태
- `selectedCards: Array<{ expressionId, korean, english }> | null`
- `selectedCard`(단일)와 공존, 둘 중 하나만 활성

### 렌더링 분기
- `selectedCard != null` → 단일 카드 상세 뷰
- `selectedCards != null` → MultiCardPanel
- 둘 다 null → 기존 탭 UI
