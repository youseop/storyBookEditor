import React from 'react';
import type { ExpressionCard } from '../../shared/messageTypes';
import { useExpressionParser } from '../hooks/useExpressionParser';

interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  onParsed: (cards: ExpressionCard[]) => void;
  onTriggerUpdate: () => void;
  figmaCardIds?: { cardId: string; korean: string }[];
}

const PLACEHOLDER = `Enter expressions separated by blank lines.

Single enter = line break within card
Double enter = new card
Triple enter = new row

Example:
고양이
도마뱀

동물

하얀색 = 흰색`;

const ExpressionInput: React.FC<ExpressionInputProps> = ({ value, onChange, onParsed, onTriggerUpdate, figmaCardIds }) => {
  const { cards, cardCount } = useExpressionParser(value, figmaCardIds);

  // Sync parsed cards to parent
  React.useEffect(() => {
    onParsed(cards);
  }, [cards, onParsed]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === ' ') {
      // Spacebar: trigger after the space is inserted
      setTimeout(() => onTriggerUpdate(), 0);
    }
    if (e.key === 'Enter') {
      // Check if previous char was also a newline (double enter)
      const textarea = e.currentTarget;
      const pos = textarea.selectionStart;
      const text = textarea.value;
      // If the character before cursor is a newline, this makes a double-enter
      if (pos > 0 && text[pos - 1] === '\n') {
        setTimeout(() => onTriggerUpdate(), 0);
      }
    }
  };

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER}
        rows={16}
        style={{ height: 300 }}
      />
      <div className="card-count">
        Parsed: {cardCount} card{cardCount !== 1 ? 's' : ''}
      </div>
      {cardCount > 32 && (
        <div className="error-banner" style={{ marginTop: 8 }}>
          Warning: More than 32 cards. Some cards may not fit in the spread layout (4 visual cols x 4 visual rows x 2 pages = 32 cards).
        </div>
      )}
    </div>
  );
};

export default ExpressionInput;
