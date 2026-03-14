const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export function getPageTextPreview(page: { textBlocks: string[][]; isEmpty: boolean }, maxLen: number = 30): string {
  if (page.isEmpty) return '[빈 페이지]';
  const allText = page.textBlocks.flat().join(' ');
  return allText.length > maxLen ? allText.slice(0, maxLen) + '...' : allText;
}
