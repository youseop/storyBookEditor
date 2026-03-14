// Phase and Step enums
export enum Phase {
  SETUP = 'SETUP',
  PART1_KOREAN = 'PART1',
  PART2_KO_EN = 'PART2',
  PART3_KEY_EXPR = 'PART3',
  FINISHING = 'FINISHING',
}

export enum Step {
  // Phase 1: Setup
  STYLE_SETUP = 1,
  KEY_COLOR = 2,
  CHARACTERS = 3,
  CHARACTER_IMAGES = 4,
  // Phase 2: Part 1 Korean
  PAGE_SPLIT = 5,
  SCENE_STRUCTURE = 6,
  IMAGE_BULK_GEN = 7,
  IMAGE_PLACEMENT = 8,
  DIALOGUE_PLACEMENT = 9,
  PART1_CONFIRM = 10,
  // Phase 3: Part 2 Korean+English
  BULK_TRANSLATE = 11,
  PART2_PAGES = 12,
  PART2_CONFIRM = 13,
  // Phase 4: Part 3 Key Expressions
  PART3_LAYOUT = 14,
  KEY_EXPR_INPUT = 15,
  KEY_EXPR_TRANSLATE_IMG = 16,
  PART3_CONFIRM = 17,
  // Phase 5: Finishing
  COVER = 18,
  INNER_PAGES = 19,
  FINAL_OUTPUT = 20,
}

// Step metadata for UI display
export interface StepInfo {
  step: Step;
  phase: Phase;
  title: string;
  titleKo: string;
  description: string;
}

export const STEP_INFO: Record<Step, StepInfo> = {
  [Step.STYLE_SETUP]: { step: Step.STYLE_SETUP, phase: Phase.SETUP, title: 'Image Style', titleKo: '이미지 스타일 확정', description: 'Set the visual style for all illustrations' },
  [Step.KEY_COLOR]: { step: Step.KEY_COLOR, phase: Phase.SETUP, title: 'Key Colors', titleKo: '키컬러 확정', description: 'Choose primary and secondary accent colors' },
  [Step.CHARACTERS]: { step: Step.CHARACTERS, phase: Phase.SETUP, title: 'Characters', titleKo: '등장인물 설정', description: 'Define characters from the story' },
  [Step.CHARACTER_IMAGES]: { step: Step.CHARACTER_IMAGES, phase: Phase.SETUP, title: 'Character Images', titleKo: '등장인물 이미지', description: 'Generate and select character illustrations' },
  [Step.PAGE_SPLIT]: { step: Step.PAGE_SPLIT, phase: Phase.PART1_KOREAN, title: 'Page Split', titleKo: '페이지 나눔', description: 'Split story text into pages' },
  [Step.SCENE_STRUCTURE]: { step: Step.SCENE_STRUCTURE, phase: Phase.PART1_KOREAN, title: 'Scene Analysis', titleKo: '장면 구조화', description: 'AI analyzes each page scene' },
  [Step.IMAGE_BULK_GEN]: { step: Step.IMAGE_BULK_GEN, phase: Phase.PART1_KOREAN, title: 'Scene Images', titleKo: '이미지 벌크 생성', description: 'Generate scene illustrations in bulk' },
  [Step.IMAGE_PLACEMENT]: { step: Step.IMAGE_PLACEMENT, phase: Phase.PART1_KOREAN, title: 'Image Layout', titleKo: '이미지 배치', description: 'Place and adjust images on pages' },
  [Step.DIALOGUE_PLACEMENT]: { step: Step.DIALOGUE_PLACEMENT, phase: Phase.PART1_KOREAN, title: 'Dialogue', titleKo: '대사 배치', description: 'Place dialogue text on pages' },
  [Step.PART1_CONFIRM]: { step: Step.PART1_CONFIRM, phase: Phase.PART1_KOREAN, title: 'Confirm Part 1', titleKo: 'Part 1 확정', description: 'Review and confirm Part 1' },
  [Step.BULK_TRANSLATE]: { step: Step.BULK_TRANSLATE, phase: Phase.PART2_KO_EN, title: 'Translation', titleKo: '벌크 번역', description: 'Translate all dialogues to English' },
  [Step.PART2_PAGES]: { step: Step.PART2_PAGES, phase: Phase.PART2_KO_EN, title: 'Part 2 Pages', titleKo: 'Part 2 페이지 생성', description: 'Generate Part 2 with translations' },
  [Step.PART2_CONFIRM]: { step: Step.PART2_CONFIRM, phase: Phase.PART2_KO_EN, title: 'Confirm Part 2', titleKo: 'Part 2 확정', description: 'Review and confirm Part 2' },
  [Step.PART3_LAYOUT]: { step: Step.PART3_LAYOUT, phase: Phase.PART3_KEY_EXPR, title: 'Part 3 Layout', titleKo: 'Part 3 레이아웃', description: 'Create Part 3 layout with key color pages' },
  [Step.KEY_EXPR_INPUT]: { step: Step.KEY_EXPR_INPUT, phase: Phase.PART3_KEY_EXPR, title: 'Key Expressions', titleKo: 'Key Expression 입력', description: 'Input key expressions per page' },
  [Step.KEY_EXPR_TRANSLATE_IMG]: { step: Step.KEY_EXPR_TRANSLATE_IMG, phase: Phase.PART3_KEY_EXPR, title: 'Translate & Images', titleKo: '번역 & 이미지 생성', description: 'Translate expressions and generate images' },
  [Step.PART3_CONFIRM]: { step: Step.PART3_CONFIRM, phase: Phase.PART3_KEY_EXPR, title: 'Confirm Part 3', titleKo: 'Part 3 확정', description: 'Review and confirm Part 3' },
  [Step.COVER]: { step: Step.COVER, phase: Phase.FINISHING, title: 'Cover', titleKo: '표지 제작', description: 'Create book cover design' },
  [Step.INNER_PAGES]: { step: Step.INNER_PAGES, phase: Phase.FINISHING, title: 'Inner Pages', titleKo: '내지 제작', description: 'Generate supplementary pages' },
  [Step.FINAL_OUTPUT]: { step: Step.FINAL_OUTPUT, phase: Phase.FINISHING, title: 'Final Output', titleKo: '최종 산출물', description: 'Assemble and export final book' },
};

export const PHASE_INFO: Record<Phase, { title: string; titleKo: string; steps: Step[] }> = {
  [Phase.SETUP]: {
    title: 'Setup',
    titleKo: '세팅',
    steps: [Step.STYLE_SETUP, Step.KEY_COLOR, Step.CHARACTERS, Step.CHARACTER_IMAGES],
  },
  [Phase.PART1_KOREAN]: {
    title: 'Part 1 - Korean',
    titleKo: 'Part 1 제작',
    steps: [Step.PAGE_SPLIT, Step.SCENE_STRUCTURE, Step.IMAGE_BULK_GEN, Step.IMAGE_PLACEMENT, Step.DIALOGUE_PLACEMENT, Step.PART1_CONFIRM],
  },
  [Phase.PART2_KO_EN]: {
    title: 'Part 2 - Korean + English',
    titleKo: 'Part 2 제작',
    steps: [Step.BULK_TRANSLATE, Step.PART2_PAGES, Step.PART2_CONFIRM],
  },
  [Phase.PART3_KEY_EXPR]: {
    title: 'Part 3 - Key Expressions',
    titleKo: 'Part 3 제작',
    steps: [Step.PART3_LAYOUT, Step.KEY_EXPR_INPUT, Step.KEY_EXPR_TRANSLATE_IMG, Step.PART3_CONFIRM],
  },
  [Phase.FINISHING]: {
    title: 'Finishing',
    titleKo: '마무리',
    steps: [Step.COVER, Step.INNER_PAGES, Step.FINAL_OUTPUT],
  },
};

// Get phase for a given step
export function getPhaseForStep(step: Step): Phase {
  return STEP_INFO[step].phase;
}

// Get all steps in order
export function getAllSteps(): Step[] {
  return Object.values(Step).filter((v): v is Step => typeof v === 'number').sort((a, b) => a - b);
}

// Character definition
export interface Character {
  id: string;
  name: string;
  nameEn?: string;
  personality: string;
  appearance: string;
  referenceImageBase64?: string;
  confirmed: boolean;
}

// Story page data (from Step 5 page splitting)
export interface StoryPage {
  pageIndex: number;
  textBlocks: string[][];  // array of text blocks, each block is array of lines
  isEmpty: boolean;        // true for ">>" blank pages
  sceneAnalysis?: SceneAnalysis;
  selectedImageIndex?: number;  // which generated image variant is selected
}

// Scene analysis result from AI (Step 6)
export interface SceneAnalysis {
  characters: { characterId: string; action: string }[];
  sceneDescription: string;
  imagePrompt: string;
  backgroundType: 'white' | 'full';  // AI suggestion for bg type
}

// Pipeline state persisted in pluginData
export interface PipelineState {
  currentStep: Step;
  completedSteps: Step[];
  storyTitle: string;
  storyText: string;
  styleGuide: {
    referenceImageBase64?: string;
    styleDescription?: string;
  };
  keyColors: {
    colorA: string;
    colorB: string;
  };
  characters: Character[];
  pages: StoryPage[];
}

// Default initial state
export function createInitialPipelineState(): PipelineState {
  return {
    currentStep: Step.STYLE_SETUP,
    completedSteps: [],
    storyTitle: '',
    storyText: '',
    styleGuide: {},
    keyColors: {
      colorA: '#FFCF66',
      colorB: '#FFF69B',
    },
    characters: [],
    pages: [],
  };
}
