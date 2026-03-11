import {
  CELL_WIDTH,
  CELL_HEIGHT,
  CELL_GAP,
  CARD_IMAGE_RATIO,
  CARD_STROKE_WEIGHT,
  DEFAULT_ROW_SPAN,
} from '../../shared/constants';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.5-flash-image';

export interface GeminiImageResult {
  imageBase64: string;  // base64 encoded image
  mimeType: string;
}

/**
 * Generate an image using Gemini API.
 *
 * @param apiKey - Gemini API key
 * @param prompt - Text prompt for image generation
 * @param referenceImageBase64 - Optional reference image (base64) for style consistency
 * @param signal - AbortSignal for cancellation
 */
export async function generateImage(
  apiKey: string,
  prompt: string,
  referenceImageBase64?: string,
  signal?: AbortSignal,
  aspectRatio?: string,
): Promise<GeminiImageResult> {
  var url = GEMINI_API_BASE + '/' + MODEL + ':generateContent?key=' + apiKey;

  var parts: any[] = [];

  // Add text prompt
  parts.push({
    text: prompt,
  });

  // Add reference image if provided
  if (referenceImageBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: referenceImageBase64,
      },
    });
  }

  var genConfig: any = {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig: {
      aspectRatio: aspectRatio || '3:2',
    },
  };

  var requestBody = {
    contents: [
      {
        parts: parts,
      },
    ],
    generationConfig: genConfig,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 429) {
      throw new RateLimitError('Rate limit exceeded', errorBody);
    }
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  // Extract image from response
  // Gemini returns candidates[0].content.parts[] where parts can be text or inlineData
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('No candidates in Gemini response');
  }

  const imagePart = candidate.content?.parts?.find(
    (part: any) => part.inlineData?.mimeType?.startsWith('image/')
  );

  if (!imagePart) {
    throw new Error('No image in Gemini response. The model may have returned only text.');
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
  };
}

/**
 * Remove background from an image using Gemini API.
 */
export async function removeImageBackground(
  apiKey: string,
  imageBase64: string,
  signal?: AbortSignal,
): Promise<GeminiImageResult> {
  const prompt = 'Remove the background from this image. Replace it with a pure white background. Keep the main subject intact with all its details, colors, and proportions preserved. Do not add any text.';
  return generateImage(apiKey, prompt, imageBase64, signal);
}

export class RateLimitError extends Error {
  public responseBody: string;
  constructor(message: string, responseBody: string) {
    super(message);
    this.name = 'RateLimitError';
    this.responseBody = responseBody;
  }
}

// Allowed Gemini aspect ratios and their numeric values
var ALLOWED_RATIOS: [string, number][] = [
  ['1:1', 1],
  ['4:5', 0.8],
  ['3:4', 0.75],
  ['2:3', 0.667],
  ['9:16', 0.5625],
  ['1:4', 0.25],
  ['1:8', 0.125],
  ['5:4', 1.25],
  ['4:3', 1.333],
  ['3:2', 1.5],
  ['16:9', 1.778],
  ['4:1', 4],
  ['21:9', 2.333],
  ['8:1', 8],
];

/**
 * Compute the [img] frame aspect ratio for a card with given colSpan/rowSpan.
 * Returns the closest Gemini-allowed aspect ratio string.
 */
export function getImageAspectRatio(colSpan: number, rowSpan: number): string {
  var cardW = colSpan * CELL_WIDTH + (colSpan - 1) * CELL_GAP;
  var cardH = rowSpan * CELL_HEIGHT + (rowSpan - 1) * CELL_GAP;
  var sw = CARD_STROKE_WEIGHT;
  var inset = Math.round(sw * 1.6);
  // Cap image zone at default card's image height (matches createCardNode)
  var defaultCardH = DEFAULT_ROW_SPAN * CELL_HEIGHT + (DEFAULT_ROW_SPAN - 1) * CELL_GAP;
  var maxImageZone = Math.round(defaultCardH * CARD_IMAGE_RATIO);
  var imageZone = Math.min(Math.round(cardH * CARD_IMAGE_RATIO), maxImageZone);
  var textH = cardH - imageZone;
  var imgW = cardW - 2 * inset;
  var imgH = imageZone - 2 * inset;

  var targetRatio = imgW / imgH;

  // Find closest allowed ratio
  var bestMatch = '3:2';
  var bestDiff = 999;
  for (var i = 0; i < ALLOWED_RATIOS.length; i++) {
    var diff = Math.abs(ALLOWED_RATIOS[i][1] - targetRatio);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = ALLOWED_RATIOS[i][0];
    }
  }
  return bestMatch;
}

/**
 * Build the Korean prompt for a given expression.
 */
export function buildImagePrompt(expressionLines: string[], colSpan?: number, rowSpan?: number, customNote?: string): string {
  var expression = expressionLines.map(function(l) { return l.split('=')[0].trim(); }).join(' ');
  var prompt = '흰 바탕 위에 "' + expression + '"을(를) 직관적으로 잘 나타내는 이미지를 그려줘. 첨부한 레퍼런스 이미지와 같은 스타일로 그려줘. 텍스트 없이 이미지만 생성해줘.';
  if (customNote) {
    prompt += ' 추가 요청: ' + customNote;
  }
  return prompt;
}

/**
 * Convert base64 string to Uint8Array (for passing to Figma sandbox)
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Capitalize the first letter of a string.
 */
function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Translate Korean expressions to English using Gemini API.
 * Returns an array of translated strings in the same order as input.
 */
export async function translateExpressions(
  apiKey: string,
  koreanTexts: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  const TRANSLATE_MODEL = 'gemini-2.5-flash';
  var url = GEMINI_API_BASE + '/' + TRANSLATE_MODEL + ':generateContent?key=' + apiKey;

  var prompt = `다음 한국어 표현들을 영어로 번역해줘. JSON 형식으로만 응답해줘.
각 번역의 첫 글자는 대문자로 해줘.
Use standard sentence capitalization — only capitalize the first word and proper nouns.
한국어 문장에 주어가 빠져 있으면 문맥에 맞는 적절한 주어를 추측해서 넣어줘.
단어나 구(phrase) 형태의 입력은 마침표를 붙이지 마. 문장 형태일 때만 마침표를 붙여.
단일 단어나 짧은 명사구에는 a, an, the 같은 관사를 붙이지 마. (예: "노트북" → "Laptop", "사과" → "Apple")
중요: 입력 배열의 각 항목은 하나의 표현이야. 한 항목 안에 여러 문장이 있어도 하나의 번역으로 합쳐서 반환해줘. 반드시 입력 배열과 같은 개수의 번역을 반환해야 해.

입력 (${koreanTexts.length}개):
${JSON.stringify({ expressions: koreanTexts })}

응답 형식 (정확히 ${koreanTexts.length}개의 번역):
{"translations": ["Translation 1", "Translation 2", ...]}`;

  var requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 429) {
      throw new RateLimitError('Rate limit exceeded', errorBody);
    }
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('No candidates in Gemini translation response');
  }

  const textPart = candidate.content?.parts?.find((part: any) => part.text);
  if (!textPart) {
    throw new Error('No text in Gemini translation response');
  }

  var parsed: { translations: string[] };
  try {
    parsed = JSON.parse(textPart.text);
  } catch {
    throw new Error('Failed to parse Gemini translation JSON: ' + textPart.text);
  }

  if (!parsed.translations || !Array.isArray(parsed.translations)) {
    throw new Error('Invalid translation response format');
  }

  // If Gemini returned more translations than inputs (split multi-sentence items),
  // merge extras back into the expected count
  var translations = parsed.translations;
  if (translations.length > koreanTexts.length) {
    var merged: string[] = [];
    // When there's only 1 expected, join all into one
    if (koreanTexts.length === 1) {
      merged.push(translations.join(' / '));
    } else {
      // Best-effort: distribute extras evenly, give surplus to last item
      var perItem = Math.floor(translations.length / koreanTexts.length);
      var remainder = translations.length % koreanTexts.length;
      var idx = 0;
      for (var i = 0; i < koreanTexts.length; i++) {
        var take = perItem + (i === koreanTexts.length - 1 ? remainder : 0);
        merged.push(translations.slice(idx, idx + take).join(' / '));
        idx += take;
      }
    }
    translations = merged;
  } else if (translations.length < koreanTexts.length) {
    // Pad with empty strings if fewer translations returned
    while (translations.length < koreanTexts.length) {
      translations.push('');
    }
  }

  // Ensure first letter is capitalized for each translation
  return translations.map(capitalizeFirst);
}
