import { useMemo, useRef } from 'react';
import type { ExpressionCard } from '../../shared/messageTypes';
import { DEFAULT_COL_SPAN, DEFAULT_ROW_SPAN } from '../../shared/constants';

interface ParseResult {
  cards: ExpressionCard[];
  cardCount: number;
}

let nextCardId = 1;

/**
 * Parses raw text into expression cards.
 *
 * - Double newline (1 blank line) = new card
 * - Triple+ newline (2+ blank lines) = new card with rowBreakBefore
 *
 * @param rawText - Text input with newline-separated cards
 * @param figmaCardIds - When a Figma frame is selected, these are the
 *   authoritative card IDs from Figma's pluginData. Content-based greedy
 *   matching ensures parser IDs stay in sync with what's on the canvas.
 */
export function useExpressionParser(
  rawText: string,
  figmaCardIds?: { cardId: string; korean: string }[],
): ParseResult {
  const prevCardsRef = useRef<ExpressionCard[]>([]);

  return useMemo(() => {
    if (!rawText.trim()) {
      prevCardsRef.current = [];
      return { cards: [], cardCount: 0 };
    }

    // Split by blank-line separators, preserving the separators to count newlines
    const segments = rawText.split(/(\n(?:[ \t]*\n)+)/);
    const prevCards = prevCardsRef.current;

    // Build content-based ID lookup from Figma card IDs (greedy matching)
    const figmaUsed = figmaCardIds ? new Array(figmaCardIds.length).fill(false) : [];

    const cards: ExpressionCard[] = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Odd indices are separators — skip them (we check them when processing the next content segment)
      if (i % 2 === 1) continue;

      // Parse lines from this content segment
      const lines = segment
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) continue;

      // Check the preceding separator (if any) for triple-newline detection
      let rowBreakBefore = false;
      if (i > 0) {
        const separator = segments[i - 1];
        // Count actual newline characters in the separator
        const newlineCount = (separator.match(/\n/g) || []).length;
        // 3+ newlines means 2+ blank lines → row break
        if (newlineCount >= 3) {
          rowBreakBefore = true;
        }
      }

      let id: string | undefined;

      // Priority 1: Match against Figma-sourced IDs by content
      if (figmaCardIds) {
        const korean = lines.join('\n');
        const idx = figmaCardIds.findIndex((f, i) => !figmaUsed[i] && f.korean === korean);
        if (idx !== -1) {
          figmaUsed[idx] = true;
          id = figmaCardIds[idx].cardId;
        }
      }

      // Priority 2: Reuse previous ID at same position
      if (!id) {
        const cardIndex = cards.length;
        if (cardIndex < prevCards.length) {
          id = prevCards[cardIndex].id;
        }
      }

      // Priority 3: Generate new ID
      if (!id) {
        id = `card_${nextCardId++}`;
      }

      const card: ExpressionCard = {
        id,
        lines,
        colSpan: DEFAULT_COL_SPAN,
        rowSpan: DEFAULT_ROW_SPAN,
      };

      if (rowBreakBefore) {
        card.rowBreakBefore = true;
      }

      cards.push(card);
    }

    prevCardsRef.current = cards;

    return {
      cards,
      cardCount: cards.length,
    };
  }, [rawText, figmaCardIds]);
}
