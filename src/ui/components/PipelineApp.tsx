import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Step, Phase, PipelineState, createInitialPipelineState, getPhaseForStep, STEP_INFO } from '../../shared/pipeline';
import type { SandboxToUIMessage, ContentIdMap, CardPlacement } from '../../shared/messageTypes';
import { postToPlugin, usePluginMessage } from '../hooks/useFigmaMessages';
import type { Character } from '../../shared/pipeline';
import StepNavigation from './StepNavigation';
import StyleSetupPanel from './StyleSetupPanel';
import KeyColorPanel from './KeyColorPanel';
import CharacterPanel from './CharacterPanel';
import CharacterImagePanel from './CharacterImagePanel';
import PageSplitPanel from './PageSplitPanel';
import type { ParsedPage } from './PageSplitPanel';
import SceneStructurePanel from './SceneStructurePanel';
import ImageBulkGenPanel from './ImageBulkGenPanel';
import ImagePlacementPanel from './ImagePlacementPanel';
import DialoguePlacementPanel from './DialoguePlacementPanel';
import ConfirmPanel from './ConfirmPanel';
import BulkTranslatePanel from './BulkTranslatePanel';
import Part2PagesPanel from './Part2PagesPanel';
import Part3LayoutPanel from './Part3LayoutPanel';
import KeyExprInputPanel from './KeyExprInputPanel';
import KeyExprTransImgPanel from './KeyExprTransImgPanel';
import CoverPanel from './CoverPanel';
import InnerPagesPanel from './InnerPagesPanel';
import FinalOutputPanel from './FinalOutputPanel';
import SettingsDrawer from './SettingsDrawer';
import LogViewer from './LogViewer';

const PipelineApp: React.FC = () => {
  const [pipelineState, setPipelineState] = useState<PipelineState>(createInitialPipelineState());
  const [isLoading, setIsLoading] = useState(true);

  // Load pipeline state from Figma on startup
  useEffect(() => {
    postToPlugin({ type: 'LOAD_PIPELINE_STATE' });
    // If no state is loaded within 1s, assume new project
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Handle messages from sandbox
  usePluginMessage(useCallback((msg: SandboxToUIMessage) => {
    switch (msg.type) {
      case 'PIPELINE_STATE_LOADED':
        if (msg.state) {
          setPipelineState(msg.state);
          // Sync progress display on canvas when state is restored
          postToPlugin({
            type: 'UPDATE_PROGRESS_DISPLAY',
            currentStep: msg.state.currentStep,
            completedSteps: msg.state.completedSteps,
          });
        }
        setIsLoading(false);
        break;
      case 'STORY_PAGES_CREATED':
        // Pages were created in Figma
        console.log(`Created ${msg.pageCount} story pages`);
        break;
      case 'SNAPSHOT_CREATED':
        console.log(`Snapshot created: ${msg.label} in slot ${msg.slot}`);
        break;
      case 'API_KEY_LOADED':
        setApiKey(msg.apiKey);
        break;
    }
  }, []));

  // Sync progress display on Figma canvas whenever step changes
  const updateProgressOnCanvas = useCallback((state: PipelineState) => {
    postToPlugin({
      type: 'UPDATE_PROGRESS_DISPLAY',
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
    });
  }, []);

  // Navigation
  const handleStepChange = useCallback((step: Step) => {
    setPipelineState(prev => {
      const next = { ...prev, currentStep: step };
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: next });
      updateProgressOnCanvas(next);
      return next;
    });
  }, [updateProgressOnCanvas]);

  const handleNextStep = useCallback(() => {
    setPipelineState(prev => {
      const nextStepNum = prev.currentStep + 1;
      if (nextStepNum > 20) return prev;
      const completedSteps = prev.completedSteps.includes(prev.currentStep)
        ? prev.completedSteps
        : [...prev.completedSteps, prev.currentStep];
      const next = {
        ...prev,
        currentStep: nextStepNum as Step,
        completedSteps,
      };
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: next });
      updateProgressOnCanvas(next);
      return next;
    });
  }, [updateProgressOnCanvas]);

  const handlePrevStep = useCallback(() => {
    setPipelineState(prev => {
      const prevStepNum = prev.currentStep - 1;
      if (prevStepNum < 1) return prev;
      const next = { ...prev, currentStep: prevStepNum as Step };
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: next });
      updateProgressOnCanvas(next);
      return next;
    });
  }, [updateProgressOnCanvas]);

  // Step-specific data handlers
  const handleStoryTitleChange = useCallback((title: string) => {
    setPipelineState(prev => ({ ...prev, storyTitle: title }));
  }, []);

  const handleStoryTextChange = useCallback((text: string) => {
    setPipelineState(prev => ({ ...prev, storyText: text }));
  }, []);

  const handlePagesChange = useCallback((pages: ParsedPage[]) => {
    setPipelineState(prev => ({
      ...prev,
      pages: pages.map((p, i) => ({
        pageIndex: i,
        textBlocks: p.textBlocks,
        isEmpty: p.isEmpty,
      })),
    }));
  }, []);

  // Phase 1 handlers
  const handleStyleDescriptionChange = useCallback((desc: string) => {
    setPipelineState(prev => ({
      ...prev,
      styleGuide: { ...prev.styleGuide, styleDescription: desc },
    }));
  }, []);

  const handleReferenceImageChange = useCallback((base64: string) => {
    setPipelineState(prev => ({
      ...prev,
      styleGuide: { ...prev.styleGuide, referenceImageBase64: base64 },
    }));
  }, []);

  const handleColorsChange = useCallback((colorA: string, colorB: string) => {
    setPipelineState(prev => ({
      ...prev,
      keyColors: { colorA, colorB },
    }));
  }, []);

  const handleCharactersChange = useCallback((characters: Character[]) => {
    setPipelineState(prev => ({ ...prev, characters }));
  }, []);

  const handleCharacterImageSelect = useCallback((characterId: string, imageBase64: string) => {
    setPipelineState(prev => ({
      ...prev,
      characters: prev.characters.map(c =>
        c.id === characterId ? { ...c, referenceImageBase64: imageBase64, confirmed: true } : c
      ),
    }));
  }, []);

  // Translations for Part 2 (pageIndex → translated text blocks)
  const [translations, setTranslations] = useState<Record<number, string[][]>>({});

  // Key expressions for Part 3 (pageIndex → expression cards)
  const [keyExpressions, setKeyExpressions] = useState<Record<number, import('../../shared/messageTypes').ExpressionCard[]>>({});

  // Key Expression engine state (per page)
  const [keyExprContentIdMaps, setKeyExprContentIdMaps] = useState<Record<number, ContentIdMap | undefined>>({});
  const [keyExprPlacements, setKeyExprPlacements] = useState<Record<number, CardPlacement[]>>({});
  const [keyExprFrameIds, setKeyExprFrameIds] = useState<Record<number, string | undefined>>({});
  const [keyExprEnLinesMaps, setKeyExprEnLinesMaps] = useState<Record<number, Map<string, string[]>>>({});

  // Key Expression engine handlers
  const handleKeyExprContentIdMapChange = useCallback((pageIndex: number, map: ContentIdMap) => {
    setKeyExprContentIdMaps(prev => ({ ...prev, [pageIndex]: map }));
  }, []);

  const handleKeyExprPlacementsChange = useCallback((pageIndex: number, newPlacements: CardPlacement[]) => {
    setKeyExprPlacements(prev => ({ ...prev, [pageIndex]: newPlacements }));
  }, []);

  const handleKeyExprFrameIdChange = useCallback((pageIndex: number, frameId: string) => {
    setKeyExprFrameIds(prev => ({ ...prev, [pageIndex]: frameId }));
  }, []);

  const handleKeyExprEnLinesMapChange = useCallback((pageIndex: number, map: Map<string, string[]>) => {
    setKeyExprEnLinesMaps(prev => ({ ...prev, [pageIndex]: map }));
  }, []);

  // Settings & Log UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);

  // Get API key from pipeline state or localStorage
  const [apiKey, setApiKey] = useState('');
  useEffect(() => {
    postToPlugin({ type: 'LOAD_API_KEY' });
  }, []);

  // Auto-save pipeline state when data changes (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: pipelineState });
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [pipelineState.storyTitle, pipelineState.storyText, pipelineState.characters, pipelineState.keyColors, pipelineState.styleGuide, pipelineState.pages, isLoading]);

  // Render the appropriate panel for current step
  const renderStepPanel = () => {
    const step = pipelineState.currentStep;

    switch (step) {
      case Step.STYLE_SETUP:
        return (
          <StyleSetupPanel
            storyTitle={pipelineState.storyTitle}
            onStoryTitleChange={handleStoryTitleChange}
            storyText={pipelineState.storyText}
            onStoryTextChange={handleStoryTextChange}
            styleDescription={pipelineState.styleGuide.styleDescription || ''}
            onStyleDescriptionChange={handleStyleDescriptionChange}
            referenceImageBase64={pipelineState.styleGuide.referenceImageBase64}
            onReferenceImageChange={handleReferenceImageChange}
            apiKey={apiKey}
          />
        );
      case Step.KEY_COLOR:
        return (
          <KeyColorPanel
            colorA={pipelineState.keyColors.colorA}
            colorB={pipelineState.keyColors.colorB}
            onColorsChange={handleColorsChange}
          />
        );
      case Step.CHARACTERS:
        return (
          <CharacterPanel
            storyText={pipelineState.storyText}
            characters={pipelineState.characters}
            onCharactersChange={handleCharactersChange}
            apiKey={apiKey}
          />
        );
      case Step.CHARACTER_IMAGES:
        return (
          <CharacterImagePanel
            characters={pipelineState.characters}
            onCharacterImageSelect={handleCharacterImageSelect}
            onCharactersChange={handleCharactersChange}
            styleDescription={pipelineState.styleGuide.styleDescription || ''}
            apiKey={apiKey}
          />
        );
      case Step.PAGE_SPLIT:
        return (
          <PageSplitPanel
            initialText={pipelineState.storyText}
            onTextChange={handleStoryTextChange}
            onPagesChange={handlePagesChange}
            apiKey={apiKey}
          />
        );
      case Step.SCENE_STRUCTURE:
        return (
          <SceneStructurePanel
            pages={pipelineState.pages}
            characters={pipelineState.characters}
            onPagesUpdate={(pages) => setPipelineState(prev => ({ ...prev, pages }))}
            apiKey={apiKey}
          />
        );
      case Step.IMAGE_BULK_GEN:
        return (
          <ImageBulkGenPanel
            pages={pipelineState.pages}
            characters={pipelineState.characters}
            styleDescription={pipelineState.styleGuide.styleDescription || ''}
            referenceImageBase64={pipelineState.styleGuide.referenceImageBase64}
            apiKey={apiKey}
            onImageSelect={(pageIndex, variant) => {
              setPipelineState(prev => ({
                ...prev,
                pages: prev.pages.map(p =>
                  p.pageIndex === pageIndex ? { ...p, selectedImageIndex: variant } : p
                ),
              }));
            }}
          />
        );
      case Step.IMAGE_PLACEMENT:
        return (
          <ImagePlacementPanel
            pages={pipelineState.pages}
            onImageRegenerate={(pageIndex, prompt, bgType) => {
              console.log(`Regenerate page ${pageIndex}: ${bgType}, prompt: ${prompt}`);
            }}
          />
        );
      case Step.DIALOGUE_PLACEMENT:
        return (
          <DialoguePlacementPanel
            pages={pipelineState.pages}
            keyColorA={pipelineState.keyColors.colorA}
            keyColorB={pipelineState.keyColors.colorB}
          />
        );
      case Step.PART1_CONFIRM:
        return (
          <ConfirmPanel
            partName="Part 1"
            partNameKo="Part 1 Korean"
            pageCount={pipelineState.pages.length}
            onConfirm={() => {
              postToPlugin({ type: 'CREATE_SNAPSHOT', label: 'Part 1 확정' });
              handleNextStep();
            }}
          />
        );
      case Step.BULK_TRANSLATE:
        return (
          <BulkTranslatePanel
            pages={pipelineState.pages}
            onTranslationsChange={setTranslations}
            apiKey={apiKey}
          />
        );
      case Step.PART2_PAGES:
        return (
          <Part2PagesPanel
            pages={pipelineState.pages}
            translations={translations}
            onPart2Created={() => console.log('Part 2 created')}
          />
        );
      case Step.PART2_CONFIRM:
        return (
          <ConfirmPanel
            partName="Part 2"
            partNameKo="Part 2 Korean + English"
            pageCount={pipelineState.pages.length}
            onConfirm={() => {
              postToPlugin({ type: 'CREATE_SNAPSHOT', label: 'Part 2 확정' });
              handleNextStep();
            }}
          />
        );
      case Step.PART3_LAYOUT:
        return (
          <Part3LayoutPanel
            pages={pipelineState.pages}
            keyColorA={pipelineState.keyColors.colorA}
            onPart3Created={() => console.log('Part 3 layout created')}
          />
        );
      case Step.KEY_EXPR_INPUT:
        return (
          <KeyExprInputPanel
            pages={pipelineState.pages}
            keyExpressions={keyExpressions}
            onExpressionsChange={(pageIndex, cards) => {
              setKeyExpressions(prev => ({ ...prev, [pageIndex]: cards }));
            }}
            apiKey={apiKey}
            contentIdMaps={keyExprContentIdMaps}
            onContentIdMapChange={handleKeyExprContentIdMapChange}
            placements={keyExprPlacements}
            onPlacementsChange={handleKeyExprPlacementsChange}
            frameIds={keyExprFrameIds}
            onFrameIdChange={handleKeyExprFrameIdChange}
            enLinesMaps={keyExprEnLinesMaps}
            onEnLinesMapChange={handleKeyExprEnLinesMapChange}
          />
        );
      case Step.KEY_EXPR_TRANSLATE_IMG:
        return (
          <KeyExprTransImgPanel
            pages={pipelineState.pages}
            keyExpressions={keyExpressions}
            onTranslationsUpdate={(pageIndex, cards) => {
              setKeyExpressions(prev => ({ ...prev, [pageIndex]: cards }));
            }}
            styleDescription={pipelineState.styleGuide.styleDescription || ''}
            apiKey={apiKey}
            enLinesMaps={keyExprEnLinesMaps}
            onEnLinesMapChange={handleKeyExprEnLinesMapChange}
            frameIds={keyExprFrameIds}
            contentIdMaps={keyExprContentIdMaps}
            onContentIdMapChange={handleKeyExprContentIdMapChange}
            referenceImageBase64={pipelineState.styleGuide.referenceImageBase64}
          />
        );
      case Step.PART3_CONFIRM:
        return (
          <ConfirmPanel
            partName="Part 3"
            partNameKo="Part 3 Korean + Key Expressions"
            pageCount={pipelineState.pages.length}
            onConfirm={() => {
              postToPlugin({ type: 'CREATE_SNAPSHOT', label: 'Part 3 확정' });
              handleNextStep();
            }}
          />
        );
      case Step.COVER:
        return (
          <CoverPanel
            apiKey={apiKey}
            styleDescription={pipelineState.styleGuide.styleDescription || ''}
            keyColorA={pipelineState.keyColors.colorA}
            keyColorB={pipelineState.keyColors.colorB}
          />
        );
      case Step.INNER_PAGES:
        return (
          <InnerPagesPanel
            keyColorA={pipelineState.keyColors.colorA}
            keyColorB={pipelineState.keyColors.colorB}
          />
        );
      case Step.FINAL_OUTPUT:
        return (
          <FinalOutputPanel
            pages={pipelineState.pages}
            onComplete={() => {
              postToPlugin({ type: 'CREATE_SNAPSHOT', label: '최종 완료' });
            }}
          />
        );
      default:
        return <div>Unknown step</div>;
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, sans-serif' }}>
      {/* Top bar with step navigation and settings gear */}
      <div style={{ position: 'relative' }}>
        <StepNavigation
          currentStep={pipelineState.currentStep}
          completedSteps={pipelineState.completedSteps}
          onStepChange={handleStepChange}
        />
        <button
          onClick={() => setIsSettingsOpen(true)}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1px solid #DDD',
            backgroundColor: '#FFF',
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
          }}
          title="설정"
        >
          &#9881;
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px' }}>
        {renderStepPanel()}
      </div>

      {/* Bottom navigation bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderTop: '1px solid #E5E5E5',
        backgroundColor: '#FAFAFA',
      }}>
        <button
          onClick={handlePrevStep}
          disabled={pipelineState.currentStep <= 1}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid #DDD',
            backgroundColor: pipelineState.currentStep <= 1 ? '#F5F5F5' : '#FFF',
            color: pipelineState.currentStep <= 1 ? '#CCC' : '#333',
            cursor: pipelineState.currentStep <= 1 ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          ← 이전
        </button>

        <span style={{ fontSize: 11, color: '#999' }}>
          {pipelineState.currentStep} / 20
        </span>

        <button
          onClick={handleNextStep}
          disabled={pipelineState.currentStep >= 20}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: pipelineState.currentStep >= 20 ? '#CCC' : '#18A0FB',
            color: '#FFF',
            cursor: pipelineState.currentStep >= 20 ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          다음 →
        </button>
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onApiKeyChange={(key) => {
          setApiKey(key);
          postToPlugin({ type: 'SAVE_API_KEY', apiKey: key });
        }}
        onOpenLog={() => {
          setIsSettingsOpen(false);
          setIsLogOpen(true);
        }}
      />

      {/* Log Viewer */}
      <LogViewer
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
      />

      {/* Resize handle - bottom right corner */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startY = e.clientY;
          const startW = window.innerWidth;
          const startH = window.innerHeight;
          const onMove = (ev: MouseEvent) => {
            const w = Math.max(360, startW + (ev.clientX - startX));
            const h = Math.max(400, startH + (ev.clientY - startY));
            parent.postMessage({ pluginMessage: { type: 'RESIZE_UI', width: w, height: h } }, '*');
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
        style={{
          position: 'fixed', bottom: 0, right: 0, width: 16, height: 16,
          cursor: 'nwse-resize', zIndex: 9998, opacity: 0.3,
          background: 'linear-gradient(135deg, transparent 50%, #999 50%)',
        }}
      />
    </div>
  );
};

export default PipelineApp;
