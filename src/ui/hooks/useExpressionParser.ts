import { useMemo } from 'react';
import type { ExpressionCard, ContentIdMap, CardTemplate } from '../../shared/messageTypes';
import { DEFAULT_COL_SPAN, DEFAULT_ROW_SPAN } from '../../shared/constants';

interface ParseResult {
  cards: ExpressionCard[];
  cardCount: number;
  /** English translations restored from contentIdMap: expressionId string → enLines */
  restoredEnMap: Map<string, string[]>;
  /** Preferred image index restored from contentIdMap: expressionId string → imageIndex */
  restoredImageMap: Map<string, number>;
}

/**
 * Normalize text for content→ID lookup: trim each line, drop empties, join with \n.
 */
function normalizeText(lines: string[]): string {
  return lines.map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

/**
 * Detect card template from the first line of a card's text.
 * Markers: @h → horizontal, @note → note, none → standard.
 * Returns the template type and cleaned lines (marker stripped).
 */
function detectTemplate(lines: string[]): { template: CardTemplate; cleanLines: string[] } {
  if (lines.length === 0) return { template: 'standard', cleanLines: lines };

  const firstLine = lines[0];
  if (firstLine.startsWith('@h ')) {
    return {
      template: 'horizontal',
      cleanLines: [firstLine.slice(3), ...lines.slice(1)],
    };
  }
  if (firstLine.startsWith('@note ')) {
    return {
      template: 'note',
      cleanLines: [firstLine.slice(6), ...lines.slice(1)],
    };
  }
  // Also support just "@h" or "@note" on first line with content on next lines
  if (firstLine.trim() === '@h' && lines.length > 1) {
    return { template: 'horizontal', cleanLines: lines.slice(1) };
  }
  if (firstLine.trim() === '@note' && lines.length > 1) {
    return { template: 'note', cleanLines: lines.slice(1) };
  }

  return { template: 'standard', cleanLines: lines };
}

/**
 * Parses raw text into expression cards.
 *
 * - Double newline (1 blank line) = new card
 * - Triple+ newline (2+ blank lines) = new card with rowBreakBefore
 *
 * expressionId assignment:
 *   1. contentIdMap — look up normalized Korean text → get existing expressionId
 *   2. New text — assign next available number
 *
 * Cards with the same Korean text share the same expressionId (and thus id).
 */
export function useExpressionParser(
  rawText: string,
  contentIdMap?: ContentIdMap,
): ParseResult {
  return useMemo(() => {
    if (!rawText.trim()) {
      return { cards: [], cardCount: 0, restoredEnMap: new Map(), restoredImageMap: new Map() };
    }

    // Determine next available expressionId from contentIdMap
    let nextExprId = 0;
    if (contentIdMap) {
      for (const entry of Object.values(contentIdMap)) {
        if (entry.expressionId >= nextExprId) nextExprId = entry.expressionId + 1;
      }
    }

    // Split by blank-line separators, preserving the separators to count newlines
    const segments = rawText.split(/(\n(?:[ \t]*\n)+)/);

    // ── Phase 1: Parse segments into { lines, rowBreakBefore } ──
    const parsed: { lines: string[]; rowBreakBefore: boolean }[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Odd indices are separators — skip them
      if (i % 2 === 1) continue;

      const lines = segment
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) continue;

      let rowBreakBefore = false;
      if (i > 0) {
        const separator = segments[i - 1];
        const newlineCount = (separator.match(/\n/g) || []).length;
        if (newlineCount >= 3) {
          rowBreakBefore = true;
        }
      }

      parsed.push({ lines, rowBreakBefore });
    }

    // ── Phase 2: Assign expressionIds ──
    // Track unique text → expressionId (assigned during this parse)
    const textToExprId = new Map<string, number>();

    // Seed from contentIdMap
    if (contentIdMap) {
      for (const key of Object.keys(contentIdMap)) {
        textToExprId.set(key, contentIdMap[key].expressionId);
      }
    }

    const restoredEnMap = new Map<string, string[]>();
    const restoredImageMap = new Map<string, number>();
    const cards: ExpressionCard[] = [];

    for (let i = 0; i < parsed.length; i++) {
      // Detect template marker from first line and clean it
      const { template, cleanLines } = detectTemplate(parsed[i].lines);
      const normalizedKey = normalizeText(cleanLines);

      let exprId: number;
      if (textToExprId.has(normalizedKey)) {
        exprId = textToExprId.get(normalizedKey)!;
      } else {
        exprId = nextExprId++;
        textToExprId.set(normalizedKey, exprId);
      }

      const idStr = String(exprId);

      // Restore en/imageIndex from contentIdMap (only once per expressionId)
      if (contentIdMap && contentIdMap[normalizedKey]) {
        const entry = contentIdMap[normalizedKey];
        if (entry.en && !restoredEnMap.has(idStr)) {
          restoredEnMap.set(idStr, [entry.en]);
        }
        if (entry.imageIndex !== undefined && !restoredImageMap.has(idStr)) {
          restoredImageMap.set(idStr, entry.imageIndex);
        }
      }

      const card: ExpressionCard = {
        id: idStr,
        lines: cleanLines,
        colSpan: template === 'horizontal' ? DEFAULT_COL_SPAN * 2 : DEFAULT_COL_SPAN,
        rowSpan: DEFAULT_ROW_SPAN,
        template,
      };

      if (parsed[i].rowBreakBefore) {
        card.rowBreakBefore = true;
      }

      cards.push(card);
    }

    return {
      cards,
      cardCount: cards.length,
      restoredEnMap,
      restoredImageMap,
    };
  }, [rawText, contentIdMap]);
}
