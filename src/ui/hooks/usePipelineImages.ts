import { useState, useCallback, useRef } from 'react';
import { generateImage, RateLimitError } from '../services/geminiService';
import { RateLimiter } from '../services/rateLimiter';

export interface GeneratedImage {
  id: string;
  base64: string;
  prompt: string;
  aspectRatio: string;
}

export interface UsePipelineImagesReturn {
  isGenerating: boolean;
  progress: { current: number; total: number };
  error: string | null;
  generateStyleImages: (
    apiKey: string,
    styleDesc: string,
    count?: number,
  ) => Promise<GeneratedImage[]>;
  generateCharacterImages: (
    apiKey: string,
    character: { name: string; appearance: string },
    styleDesc: string,
    count?: number,
  ) => Promise<GeneratedImage[]>;
  generateSceneImages: (
    apiKey: string,
    scenePrompt: string,
    styleDesc: string,
    bgType: 'white' | 'full',
    refImageBase64?: string,
    count?: number,
  ) => Promise<GeneratedImage[]>;
  generateKeyExprImages: (
    apiKey: string,
    expression: string,
    styleDesc: string,
    refImageBase64?: string,
    count?: number,
  ) => Promise<GeneratedImage[]>;
  cancel: () => void;
  clearError: () => void;
}

let imageIdCounter = 0;
function nextImageId(): string {
  imageIdCounter += 1;
  return `pimg_${imageIdCounter}_${Date.now()}`;
}

export function usePipelineImages(): UsePipelineImagesReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const limiterRef = useRef(new RateLimiter({ rpm: 10, maxConcurrent: 2, maxRetries: 3 }));
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    limiterRef.current.cancelAll();
    setIsGenerating(false);
    setProgress({ current: 0, total: 0 });
  }, []);

  /**
   * Internal helper: generate multiple images with rate limiting and progress tracking.
   * onImageReady callback fires as each image completes (real-time streaming).
   */
  const generateBatch = useCallback(
    async (
      apiKey: string,
      prompts: { prompt: string; refImage?: string; aspectRatio: string }[],
      onImageReady?: (img: GeneratedImage) => void,
    ): Promise<GeneratedImage[]> => {
      const total = prompts.length;
      setIsGenerating(true);
      setProgress({ current: 0, total });
      setError(null);

      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      const limiter = limiterRef.current;

      let completed = 0;
      const results: GeneratedImage[] = [];
      const errors: string[] = [];

      const tasks = prompts.map((item, idx) =>
        limiter.schedule(async () => {
          if (signal.aborted) throw new Error('Cancelled');

          try {
            const result = await generateImage(
              apiKey,
              item.prompt,
              item.refImage,
              signal,
              item.aspectRatio,
            );

            const img: GeneratedImage = {
              id: nextImageId(),
              base64: result.imageBase64,
              prompt: item.prompt,
              aspectRatio: item.aspectRatio,
            };
            results.push(img);
            // Fire callback immediately when this image completes
            onImageReady?.(img);
          } catch (err: any) {
            if (err instanceof RateLimitError) {
              throw err;
            }
            if (err.name === 'AbortError' || err.message === 'Cancelled') {
              throw err;
            }
            errors.push(`Image ${idx + 1}: ${err.message}`);
          } finally {
            completed++;
            setProgress({ current: completed, total });
          }
        }),
      );

      try {
        await Promise.allSettled(tasks);
      } catch {
        // swallow; individual errors already captured
      }

      setIsGenerating(false);
      abortRef.current = null;

      if (errors.length > 0 && results.length === 0) {
        setError(errors.join('\n'));
      } else if (errors.length > 0) {
        setError(`${results.length}/${total} images generated. Errors: ${errors.join('; ')}`);
      }

      return results;
    },
    [],
  );

  // --- Style reference images (Step 1) ---
  const generateStyleImages = useCallback(
    async (
      apiKey: string,
      styleDesc: string,
      count: number = 6,
      customPrompt?: string,
      onImageReady?: (img: GeneratedImage) => void,
    ): Promise<GeneratedImage[]> => {
      const prompts = Array.from({ length: count }, (_, i) => ({
        prompt: customPrompt
          ? `${customPrompt}. 스타일: ${styleDesc}. 텍스트 없이 배경 이미지만 생성해줘. 변형 ${i + 1}/${count}.`
          : `동화 일러스트 레퍼런스 이미지를 생성해줘. 스타일: ${styleDesc}. 텍스트 없이 배경 이미지만 생성해줘. 변형 ${i + 1}/${count}.`,
        aspectRatio: '3:2',
      }));
      return generateBatch(apiKey, prompts, onImageReady);
    },
    [generateBatch],
  );

  // --- Character images (Step 4) ---
  const generateCharacterImages = useCallback(
    async (
      apiKey: string,
      character: { name: string; appearance: string },
      styleDesc: string,
      count: number = 4,
      onImageReady?: (img: GeneratedImage) => void,
    ): Promise<GeneratedImage[]> => {
      const prompts = Array.from({ length: count }, (_, i) => ({
        prompt: `동화 캐릭터 일러스트를 생성해줘. 캐릭터: ${character.name}. 외형: ${character.appearance}. 스타일: ${styleDesc}. 캐릭터의 전신 모습을 정면에서 그려줘. 텍스트 없이 캐릭터만 그려줘. 변형 ${i + 1}/${count}.`,
        aspectRatio: '1:1',
      }));
      return generateBatch(apiKey, prompts, onImageReady);
    },
    [generateBatch],
  );

  // --- Scene images (Step 7) ---
  const generateSceneImages = useCallback(
    async (
      apiKey: string,
      scenePrompt: string,
      styleDesc: string,
      bgType: 'white' | 'full',
      refImageBase64?: string,
      count: number = 2,
      onImageReady?: (img: GeneratedImage) => void,
    ): Promise<GeneratedImage[]> => {
      const bgInstruction =
        bgType === 'white'
          ? '흰색 배경 위에 장면을 그려줘.'
          : '풍경/배경이 가득 차도록 그려줘.';

      const prompts = Array.from({ length: count }, (_, i) => ({
        prompt: `동화 장면 일러스트를 생성해줘. ${scenePrompt}. 스타일: ${styleDesc}. ${bgInstruction} 텍스트 없이 이미지만 생성해줘. 변형 ${i + 1}/${count}.`,
        refImage: refImageBase64,
        aspectRatio: '3:4',
      }));
      return generateBatch(apiKey, prompts, onImageReady);
    },
    [generateBatch],
  );

  // --- Key expression images (Step 16) ---
  const generateKeyExprImages = useCallback(
    async (
      apiKey: string,
      expression: string,
      styleDesc: string,
      refImageBase64?: string,
      count: number = 2,
      onImageReady?: (img: GeneratedImage) => void,
    ): Promise<GeneratedImage[]> => {
      const prompts = Array.from({ length: count }, (_, i) => ({
        prompt: `흰 바탕 위에 "${expression}"을(를) 직관적으로 잘 나타내는 이미지를 그려줘. 스타일: ${styleDesc}. 텍스트 없이 이미지만 생성해줘. 변형 ${i + 1}/${count}.`,
        refImage: refImageBase64,
        aspectRatio: '3:2',
      }));
      return generateBatch(apiKey, prompts, onImageReady);
    },
    [generateBatch],
  );

  return {
    isGenerating,
    progress,
    error,
    generateStyleImages,
    generateCharacterImages,
    generateSceneImages,
    generateKeyExprImages,
    cancel,
    clearError,
  };
}
