import { describe, it, expect } from 'vitest';
import { extractJson, getPageTextPreview } from '../ui/utils/geminiApi';

// ===== extractJson =====

describe('extractJson', () => {
  it('returns plain JSON as-is', () => {
    const input = '{"name": "test"}';
    expect(extractJson(input)).toBe('{"name": "test"}');
  });

  it('strips ```json code fences', () => {
    const input = '```json\n{"name": "test"}\n```';
    expect(extractJson(input)).toBe('{"name": "test"}');
  });

  it('strips ``` code fences without json tag', () => {
    const input = '```\n[1, 2, 3]\n```';
    expect(extractJson(input)).toBe('[1, 2, 3]');
  });

  it('handles whitespace around code fences', () => {
    const input = '  \n```json\n  {"key": "value"}  \n```\n  ';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it('handles text before and after code fences', () => {
    const input = 'Here is the result:\n```json\n{"data": true}\n```\nDone.';
    expect(extractJson(input)).toBe('{"data": true}');
  });

  it('returns trimmed string when no code fences', () => {
    const input = '  hello world  ';
    expect(extractJson(input)).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(extractJson('')).toBe('');
  });

  it('handles multiline JSON in code fences', () => {
    const input = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
  });
});

// ===== getPageTextPreview =====

describe('getPageTextPreview', () => {
  it('returns empty page marker', () => {
    expect(getPageTextPreview({ textBlocks: [], isEmpty: true })).toBe('[빈 페이지]');
  });

  it('joins text blocks into preview', () => {
    const page = {
      textBlocks: [['안녕하세요'], ['반갑습니다']],
      isEmpty: false,
    };
    expect(getPageTextPreview(page)).toBe('안녕하세요 반갑습니다');
  });

  it('truncates long text with ellipsis', () => {
    const page = {
      textBlocks: [['이것은 매우 긴 텍스트입니다 정말로 아주 길어서 잘려야 합니다']],
      isEmpty: false,
    };
    const result = getPageTextPreview(page, 20);
    expect(result.length).toBe(23); // 20 chars + "..."
    expect(result.endsWith('...')).toBe(true);
  });

  it('respects custom maxLen', () => {
    const page = {
      textBlocks: [['짧은 텍스트']],
      isEmpty: false,
    };
    expect(getPageTextPreview(page, 10)).toBe('짧은 텍스트');
  });

  it('handles multiline blocks', () => {
    const page = {
      textBlocks: [['첫째 줄', '둘째 줄'], ['셋째 줄']],
      isEmpty: false,
    };
    expect(getPageTextPreview(page, 50)).toBe('첫째 줄 둘째 줄 셋째 줄');
  });
});

// ===== parseTextToPages (imported from component - test the logic) =====

// Re-implement parseTextToPages here since it's not exported from the component
interface ParsedPage {
  pageIndex: number;
  textBlocks: string[][];
  isEmpty: boolean;
}

function parseTextToPages(text: string): ParsedPage[] {
  const rawPages = text.split(/\n{3,}/);
  return rawPages.map((rawPage, idx) => {
    const trimmed = rawPage.trim();
    if (trimmed === '>>') {
      return { pageIndex: idx, textBlocks: [], isEmpty: true };
    }
    const rawBlocks = trimmed.split(/\n\n/);
    const textBlocks = rawBlocks
      .map((block) => block.split('\n').map((l) => l.trim()))
      .filter((block) => block.some((line) => line.length > 0));
    return { pageIndex: idx, textBlocks, isEmpty: textBlocks.length === 0 };
  });
}

describe('parseTextToPages', () => {
  it('splits pages on triple newline', () => {
    const input = '첫 번째 페이지\n\n\n두 번째 페이지';
    const pages = parseTextToPages(input);
    expect(pages).toHaveLength(2);
    expect(pages[0].textBlocks).toEqual([['첫 번째 페이지']]);
    expect(pages[1].textBlocks).toEqual([['두 번째 페이지']]);
  });

  it('splits text blocks on double newline', () => {
    const input = '첫 번째 블록\n\n두 번째 블록';
    const pages = parseTextToPages(input);
    expect(pages).toHaveLength(1);
    expect(pages[0].textBlocks).toEqual([['첫 번째 블록'], ['두 번째 블록']]);
  });

  it('keeps line breaks within blocks', () => {
    const input = '첫 줄\n둘째 줄\n셋째 줄';
    const pages = parseTextToPages(input);
    expect(pages).toHaveLength(1);
    expect(pages[0].textBlocks).toEqual([['첫 줄', '둘째 줄', '셋째 줄']]);
  });

  it('handles >> empty page marker', () => {
    const input = '일반 페이지\n\n\n>>\n\n\n다음 페이지';
    const pages = parseTextToPages(input);
    expect(pages).toHaveLength(3);
    expect(pages[0].isEmpty).toBe(false);
    expect(pages[1].isEmpty).toBe(true);
    expect(pages[1].textBlocks).toEqual([]);
    expect(pages[2].isEmpty).toBe(false);
  });

  it('handles complex mixed input', () => {
    const input = '문장1\n문장2\n\n문장3\n\n\n문장4\n\n\n>>';
    const pages = parseTextToPages(input);
    expect(pages).toHaveLength(3);
    // Page 0: 2 blocks (문장1+문장2, 문장3)
    expect(pages[0].textBlocks).toEqual([['문장1', '문장2'], ['문장3']]);
    // Page 1: 1 block (문장4)
    expect(pages[1].textBlocks).toEqual([['문장4']]);
    // Page 2: empty
    expect(pages[2].isEmpty).toBe(true);
  });

  it('handles empty input', () => {
    const pages = parseTextToPages('');
    expect(pages).toHaveLength(1);
    expect(pages[0].isEmpty).toBe(true);
  });

  it('handles 4+ newlines as page boundary', () => {
    const input = '페이지1\n\n\n\n\n페이지2';
    const pages = parseTextToPages(input);
    expect(pages).toHaveLength(2);
  });

  it('trims whitespace from lines', () => {
    const input = '  공백 앞뒤  \n  줄2  ';
    const pages = parseTextToPages(input);
    expect(pages[0].textBlocks).toEqual([['공백 앞뒤', '줄2']]);
  });
});

// ===== Pipeline types =====

describe('pipeline types', () => {
  it('createInitialPipelineState has correct defaults', async () => {
    const { createInitialPipelineState } = await import('../shared/pipeline');
    const state = createInitialPipelineState();
    expect(state.currentStep).toBe(1);
    expect(state.completedSteps).toEqual([]);
    expect(state.keyColors.colorA).toBe('#FFCF66');
    expect(state.keyColors.colorB).toBe('#FFF69B');
    expect(state.characters).toEqual([]);
    expect(state.pages).toEqual([]);
    expect(state.storyText).toBe('');
  });

  it('STEP_INFO covers all 20 steps', async () => {
    const { STEP_INFO, getAllSteps } = await import('../shared/pipeline');
    const steps = getAllSteps();
    expect(steps).toHaveLength(20);
    for (const step of steps) {
      expect(STEP_INFO[step]).toBeDefined();
      expect(STEP_INFO[step].titleKo).toBeTruthy();
    }
  });

  it('PHASE_INFO covers all steps', async () => {
    const { PHASE_INFO, Phase } = await import('../shared/pipeline');
    const allPhaseSteps = Object.values(Phase).flatMap(p => PHASE_INFO[p].steps);
    expect(allPhaseSteps).toHaveLength(20);
  });
});
