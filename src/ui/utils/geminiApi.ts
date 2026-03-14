const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Strip markdown code fences from AI responses.
 * Gemini often wraps JSON in ```json ... ``` blocks.
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : trimmed;
}

export async function callGemini(
  apiKey: string,
  prompt: string,
  model: string = DEFAULT_MODEL
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini API returned empty response');
  return text;
}

export function getPageTextPreview(page: { textBlocks: string[][]; isEmpty: boolean }, maxLen: number = 30): string {
  if (page.isEmpty) return '[빈 페이지]';
  const allText = page.textBlocks.flat().join(' ');
  return allText.length > maxLen ? allText.slice(0, maxLen) + '...' : allText;
}
