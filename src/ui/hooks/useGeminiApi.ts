import { useState, useRef, useCallback } from 'react';
import { generateImage, buildImagePrompt, getImageAspectRatio, base64ToUint8Array, RateLimitError } from '../services/geminiService';
import { RateLimiter } from '../services/rateLimiter';
import { postToPlugin } from './useFigmaMessages';
import type { ExpressionCard } from '../../shared/messageTypes';

interface GenerationState {
  isGenerating: boolean;
  current: number;
  total: number;
  errors: string[];
}

export function useGeminiApi() {
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    current: 0,
    total: 0,
    errors: [],
  });

  const limiterRef = useRef(new RateLimiter({ rpm: 10, maxConcurrent: 2, maxRetries: 5 }));
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Generate images for all expressions in bulk.
   * For each expression, generates 2 variants.
   */
  const generateAll = useCallback(async (
    apiKey: string,
    expressions: ExpressionCard[],
    referenceImageBase64?: string,
  ) => {
    const total = expressions.length * 2; // 2 variants each
    setState({ isGenerating: true, current: 0, total, errors: [] });

    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const limiter = limiterRef.current;

    let completed = 0;
    const errors: string[] = [];

    const tasks = expressions.flatMap((expr, exprIdx) =>
      [0, 1].map(variantIdx =>
        limiter.schedule(async () => {
          if (signal.aborted) throw new Error('Cancelled');

          const aspectRatio = getImageAspectRatio(expr.colSpan, expr.rowSpan);
          const prompt = buildImagePrompt(expr.lines, expr.colSpan, expr.rowSpan);

          try {
            const result = await generateImage(
              apiKey,
              prompt,
              referenceImageBase64,
              signal,
              aspectRatio,
            );

            // Convert base64 to bytes and send to sandbox for storage
            const bytes = base64ToUint8Array(result.imageBase64);
            postToPlugin({
              type: 'STORE_IMAGE',
              expressionId: expr.id,
              expressionText: expr.lines.join(' '),
              imageBytes: Array.from(bytes),
              prompt,
              index: variantIdx,
            });

            completed++;
            setState(prev => ({ ...prev, current: completed }));

            // Auto-assign first variant
            if (variantIdx === 0) {
              // Will be handled after IMAGE_STORED response
            }
          } catch (err: any) {
            if (err instanceof RateLimitError) {
              // Re-throw so the rate limiter handles retry with backoff
              throw err;
            }
            errors.push(`${expr.lines.join(' ')}: ${err.message}`);
            completed++;
            setState(prev => ({ ...prev, current: completed, errors: [...prev.errors, err.message] }));
          }
        })
      )
    );

    try {
      await Promise.allSettled(tasks);
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    limiterRef.current.cancelAll();
    setState(prev => ({ ...prev, isGenerating: false }));
  }, []);

  /**
   * Generate a single image for one expression (for re-generation).
   * nextIndex should be the count of existing variants for this expression.
   */
  const generateSingle = useCallback(async (
    apiKey: string,
    expression: ExpressionCard,
    customPrompt: string | undefined,
    referenceImageBase64?: string,
    existingVariantCount: number = 2,
  ) => {
    const aspectRatio = getImageAspectRatio(expression.colSpan, expression.rowSpan);
    const prompt = customPrompt || buildImagePrompt(expression.lines, expression.colSpan, expression.rowSpan);

    const result = await generateImage(apiKey, prompt, referenceImageBase64, undefined, aspectRatio);
    const bytes = base64ToUint8Array(result.imageBase64);

    postToPlugin({
      type: 'STORE_IMAGE',
      expressionId: expression.id,
      expressionText: expression.lines.join(' '),
      imageBytes: Array.from(bytes),
      prompt,
      index: existingVariantCount,
    });

    return result;
  }, []);

  return {
    ...state,
    generateAll,
    generateSingle,
    cancel,
  };
}
