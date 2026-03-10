import { useMemo } from 'react';
import type { ExpressionCard } from '../../shared/messageTypes';

interface ParseResult {
  cards: ExpressionCard[];
  cardCount: number;
}

export function useExpressionParser(rawText: string): ParseResult {
  return useMemo(() => {
    if (!rawText.trim()) {
      return { cards: [], cardCount: 0 };
    }

    // Split by double newline (blank line) to separate cards
    const chunks = rawText.split(/\n\s*\n/);

    const cards: ExpressionCard[] = [];

    chunks.forEach((chunk) => {
      // Split by single newline for lines within a card
      const lines = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Skip empty cards
      if (lines.length === 0) return;

      // Use content-based ID to stay stable across reordering
      const idBase = lines.join('_').replace(/\s+/g, '_').slice(0, 40);
      const card: ExpressionCard = {
        id: `expr_${idBase}`,
        lines,
        colSpan: 1, // actual sizing determined by sandbox via text measurement
        rowSpan: 1,
      };

      cards.push(card);
    });

    return {
      cards,
      cardCount: cards.length,
    };
  }, [rawText]);
}
