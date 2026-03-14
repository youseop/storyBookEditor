# 다음 스텝 계획

## 현재 상태 (2026-03-14)

### 완료된 것 (모든 placeholder 제거됨)
- 전체 20 Step UI 패널 + Step Navigation
- Pipeline 상태 머신 (저장/복원/자동저장)
- **모든** Sandbox 핸들러 구현 완료:
  - 페이지 생성, Part 2/3 레이아웃, 대사 배치
  - STORE_SCENE_IMAGE / SELECT_SCENE_IMAGE (장면 이미지 저장/선택)
  - APPLY_KEY_EXPRESSIONS (Key Expression 카드 배치)
  - 페이지 번호, 최종 출력, 스냅샷
  - CREATE_INNER_PAGES (10가지 내지 템플릿)
- 진행 상태 표시 (Figma 캔버스)
- Gemini API 텍스트 분석/번역 연동
- **Gemini Image API 연동 완료** (usePipelineImages 훅):
  - Step 1: 배경 이미지 6개 베리에이션
  - Step 4: 인물 이미지 4개 베리에이션
  - Step 7: 장면 이미지 벌크 생성 (4개/장면)
- **Key Expression 엔진 통합 완료** (Step 15-16):
  - useExpressionParser 훅, GENERATE_LAYOUT/UPDATE_LAYOUT
  - useGeminiApi 훅, 번역/이미지 생성, STORE_IMAGE/SWAP_IMAGE
- 내지 템플릿 시스템 (10가지)
- 설정 드로어 + 로그 뷰어
- 3차 코드 리뷰 통과 (이슈 없음)
- 24개 단위 테스트 통과

### Placeholder 남은 것: 없음

---

## 다음 스텝 (Figma 테스트 + 고도화)

### P0: Figma Desktop 실제 테스트
> 모든 코드가 구현되었으므로 이제 실제 테스트가 최우선.

- [ ] Figma Desktop에서 플러그인 로드
- [ ] Phase 1 테스트: 이야기 입력 → AI 스타일 분석 → 키컬러 → 인물 분석 → 인물 이미지
- [ ] Phase 2 테스트: 페이지 나눔 → 장면 분석 → 이미지 생성/선택/배치 → 대사 배치
- [ ] Phase 3 테스트: 번역 → Part 2 생성
- [ ] Phase 4 테스트: Part 3 레이아웃 → Key Expression 입력/번역/이미지
- [ ] Phase 5 테스트: 표지 → 내지 → 페이지 번호 → 최종 출력
- [ ] 스냅샷/롤백 테스트
- [ ] 플러그인 재시작 후 상태 복원 테스트
- [ ] 발견된 버그 수정

### P1: 디자이너 워크플로우 개선
> 첫 번째 실제 사용 후 피드백 반영

- [ ] 이미지/대사 1차 자동 배치 고도화 (Step 8-9)
- [ ] 페이지 프레임 클릭 시 해당 Step으로 자동 이동
- [ ] 대사 배치에 사용자 키컬러 반영 (PlaceDialogueMessage에 컬러 추가)
- [ ] CoverPanel 실제 이미지 생성 연동
- [ ] 레퍼런스 이미지 기반 스타일 일관성 강화

### P2: 최종 산출물 & 배포
- [ ] PDF 내보내기 워크플로우
- [ ] 아마존 KDP 규격 체크
- [ ] 유튜브 프레젠테이션 생성 자동화

---

## 기술 부채

| 항목 | 상태 |
|------|------|
| 인라인 스타일 중복 | 미해결 — 22개 컴포넌트에 반복 스타일 |
| Gemini 모델 버전 | 해결 — callGemini에서 중앙 관리 |
| 에러 핸들링 | 대부분 해결 — 일부 성공 응답 미전송 |
| 테스트 커버리지 | 부분 — 24개 유틸 테스트, UI 테스트 없음 |
| App.tsx 레거시 | 미해결 — Step 15-16 통합 완료 후 제거 가능 |
