# 다음 스텝 계획

## 현재 상태 (2026-03-14)

### 완료된 것
- 전체 20 Step UI 패널 + Step Navigation
- Pipeline 상태 머신 (저장/복원/자동저장)
- Sandbox 핸들러: 페이지 생성, Part 2/3 레이아웃, 대사 배치, 페이지 번호, 최종 출력, 스냅샷
- 진행 상태 표시 (Figma 캔버스)
- Gemini API 텍스트 분석/번역 연동
- 설정 드로어 + 로그 뷰어
- 2차 코드 리뷰 통과 (Critical/High 이슈 모두 해결)

### 아직 미구현 (placeholder 상태)
1. **Gemini Image API 연동** — 이미지 생성 UI는 있으나 실제 생성 미연동
2. **STORE_SCENE_IMAGE / SELECT_SCENE_IMAGE** — 장면 이미지 저장/선택 핸들러
3. **APPLY_KEY_EXPRESSIONS** — Key Expression Figma 적용 핸들러
4. **기존 App.tsx Key Expression 엔진 통합** — Step 15-16에 레이아웃/이미지 기능 완전 통합

---

## 우선순위별 다음 스텝

### P0: Figma 실제 테스트 & 기본 플로우 검증
> 현재 가장 중요. 실제 Figma에서 로드해서 기본 플로우가 동작하는지 확인.

- [ ] Figma Desktop에서 플러그인 로드 (Development > Import plugin from manifest)
- [ ] Step 1: 이야기 텍스트 입력 → AI 스타일 분석 동작 확인
- [ ] Step 2: 키컬러 선택 UI 확인
- [ ] Step 3: AI 등장인물 분석 동작 확인
- [ ] Step 5: 페이지 나눔 → Figma에 프레임 생성 확인
- [ ] Step 간 이동 + Progress 표시 확인
- [ ] 플러그인 재시작 후 상태 복원 확인
- [ ] 발견된 버그 수정

### P1: 기존 Key Expression 엔진 Step 15-16 통합
> 이미 동작하는 기능을 파이프라인에 연결하는 작업. 새로 만들 필요 없음.

- [ ] `App.tsx`의 ExpressionInput/useExpressionParser 로직을 `KeyExprInputPanel`에 통합
- [ ] `App.tsx`의 이미지 생성/번역/레이아웃 로직을 `KeyExprTransImgPanel`에 통합
- [ ] 기존 `[KeyExpr]` 프레임과 Part 3 프레임 연동
- [ ] APPLY_KEY_EXPRESSIONS 핸들러 구현 (기존 GENERATE_LAYOUT 핸들러 활용)

### P2: Gemini Image API 연동
> Phase 1의 스타일/인물 이미지 + Phase 2의 장면 이미지 생성

- [ ] `geminiService.ts`의 `generateImage()` 함수를 공유 유틸리티로 정리
- [ ] Step 1: 배경 이미지 6개 베리에이션 생성 기능
- [ ] Step 4: 인물 이미지 4개 베리에이션 생성 기능
- [ ] Step 7: 장면 이미지 벌크 생성 (4개/장면: 흰배경 2 + 풀배경 2)
- [ ] STORE_SCENE_IMAGE / SELECT_SCENE_IMAGE 핸들러 구현
- [ ] Step 16: Key Expression 이미지 생성 연동
- [ ] Rate limiting 적용 (기존 rateLimiter.ts 활용)

### P3: 디자이너 워크플로우 개선
> 디자이너가 실제 사용하며 필요해질 기능들

- [ ] Step 8-9: 이미지/대사 1차 자동 배치 고도화
- [ ] 페이지 프레임 클릭 시 해당 Step으로 자동 이동 (Figma selection 연동)
- [ ] 자동 포커스/네비게이션 (scrollAndZoomIntoView) 강화
- [ ] 대사 배치에 사용자 키컬러 반영 (현재 하드코딩)
- [ ] 내지 템플릿 시스템 (Step 19)

### P4: 최종 산출물 & 배포
> 동화책 완성 후 출력/배포 관련

- [ ] Step 20: 최종 결과물 생성 테스트 (스프레드/개별 뷰)
- [ ] 페이지 번호 삽입 테스트
- [ ] PDF 내보내기 워크플로우 (Figma → PDF)
- [ ] 아마존 KDP 규격 체크

---

## 기술 부채 (추후 개선)

| 항목 | 설명 |
|------|------|
| 인라인 스타일 | 15+ 컴포넌트에 중복된 스타일 상수 → 공통 스타일 파일 추출 |
| Gemini 모델 버전 | 컴포넌트마다 다른 모델 사용 → 설정 가능하도록 |
| 에러 핸들링 | 일부 sandbox 핸들러에 성공 응답 누락 |
| 테스트 코드 | 단위 테스트 없음 → parseTextToPages, extractJson 등 핵심 함수 테스트 추가 |
| App.tsx 정리 | 기존 1243줄 레거시 코드 → Step 15-16 통합 완료 후 제거 또는 보관 |

---

## 아키텍처 노트

```
현재 파일 구조:
src/
├── shared/
│   ├── pipeline.ts          ← 상태 머신 + 타입
│   ├── messageTypes.ts      ← 44개 메시지 타입
│   ├── naming.ts            ← 프레임 네이밍
│   └── constants.ts         ← 치수/색상 상수
├── plugin/
│   ├── code.ts              ← 원본 sandbox (Key Expr)
│   ├── pipelineHandler.ts   ← 파이프라인 sandbox
│   ├── frameBuilder.ts      ← 프레임 생성 유틸
│   ├── cardGridBuilder.ts   ← 카드 그리드 유틸
│   ├── imageManager.ts      ← 이미지 관리 유틸
│   └── exportHelper.ts      ← 내보내기 유틸
├── ui/
│   ├── main.tsx             ← 엔트리 (→ PipelineApp)
│   ├── App.tsx              ← 레거시 (Step 15-16 통합 대상)
│   ├── components/
│   │   ├── PipelineApp.tsx  ← 메인 래퍼
│   │   ├── StepNavigation   ← Step 네비게이션
│   │   ├── Phase 1 (4개)    ← 세팅 패널
│   │   ├── Phase 2 (6개)    ← Part 1 패널
│   │   ├── Phase 3 (2개)    ← Part 2 패널
│   │   ├── Phase 4 (3개)    ← Part 3 패널
│   │   ├── Phase 5 (3개)    ← 마무리 패널
│   │   ├── ConfirmPanel     ← 확정 (재사용)
│   │   ├── SettingsDrawer   ← 설정
│   │   └── LogViewer        ← 로그
│   ├── hooks/               ← useFigmaMessages 등
│   ├── services/            ← geminiService, rateLimiter
│   └── utils/
│       └── geminiApi.ts     ← 공유 API 유틸
```
