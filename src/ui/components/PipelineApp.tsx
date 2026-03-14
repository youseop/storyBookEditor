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
  const stateLoadedRef = useRef(false);

  // Translations for Part 2 (pageIndex -> translated text blocks)
  const [translations, setTranslations] = useState<Record<number, string[][]>>({});

  // Key expressions for Part 3 (pageIndex -> expression cards)
  const [keyExpressions, setKeyExpressions] = useState<Record<number, import('../../shared/messageTypes').ExpressionCard[]>>({});

  // Key Expression engine state (per page)
  const [keyExprContentIdMaps, setKeyExprContentIdMaps] = useState<Record<number, ContentIdMap | undefined>>({});
  const [keyExprPlacements, setKeyExprPlacements] = useState<Record<number, CardPlacement[]>>({});
  const [keyExprFrameIds, setKeyExprFrameIds] = useState<Record<number, string | undefined>>({});
  const [keyExprEnLinesMaps, setKeyExprEnLinesMaps] = useState<Record<number, Map<string, string[]>>>({});

  // Settings & Log UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<Array<{ slot: number; label: string; timestamp: string; hasState?: boolean }>>([]);
  const [galleryEntries, setGalleryEntries] = useState<Array<{ category: string; imageId: string; label: string; metadata?: string }>>([]);

  // Get API key from pipeline state or localStorage
  const [apiKey, setApiKey] = useState('');
  useEffect(() => {
    postToPlugin({ type: 'LOAD_API_KEY' });
  }, []);

  // Load pipeline state from Figma on startup
  useEffect(() => {
    postToPlugin({ type: 'LOAD_PIPELINE_STATE' });
    postToPlugin({ type: 'LOAD_GALLERY' });
    // If no state is loaded within 1s, assume new project
    const timer = setTimeout(() => {
      setIsLoading(false);
      stateLoadedRef.current = true;
      postToPlugin({ type: 'DETECT_STEP_STATUS' });
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Handle messages from sandbox
  usePluginMessage(useCallback((msg: SandboxToUIMessage) => {
    switch (msg.type) {
      case 'PIPELINE_STATE_LOADED':
        if (msg.state) {
          setPipelineState(msg.state);
          // Restore separate state variables from persisted state
          if (msg.state.translations) setTranslations(msg.state.translations);
          if (msg.state.keyExpressions) setKeyExpressions(msg.state.keyExpressions);
          if (msg.state.keyExprContentIdMaps) setKeyExprContentIdMaps(msg.state.keyExprContentIdMaps);
          if (msg.state.keyExprPlacements) setKeyExprPlacements(msg.state.keyExprPlacements);
          if (msg.state.keyExprFrameIds) setKeyExprFrameIds(msg.state.keyExprFrameIds);
          if (msg.state.keyExprEnLinesMaps) {
            const restored: Record<number, Map<string, string[]>> = {};
            for (const [key, val] of Object.entries(msg.state.keyExprEnLinesMaps)) {
              restored[Number(key)] = new Map(Object.entries(val));
            }
            setKeyExprEnLinesMaps(restored);
          }
          // Sync progress display on canvas when state is restored
          postToPlugin({
            type: 'UPDATE_PROGRESS_DISPLAY',
            currentStep: msg.state.currentStep,
            completedSteps: msg.state.completedSteps,
          });
        }
        stateLoadedRef.current = true;
        setIsLoading(false);
        // Auto-detect canvas state
        postToPlugin({ type: 'DETECT_STEP_STATUS' });
        break;
      case 'STORY_PAGES_CREATED':
        // Pages were created in Figma
        console.log(`Created ${msg.pageCount} story pages`);
        break;
      case 'STEP_STATUS_DETECTED': {
        const detected = msg as any;
        // Merge detected steps into completedSteps (union, not replace)
        setPipelineState(prev => {
          const merged = new Set([...prev.completedSteps, ...detected.detectedSteps]);
          return { ...prev, completedSteps: Array.from(merged) as Step[] };
        });
        setSnapshotInfo(detected.snapshotInfo || []);
        break;
      }
      case 'SNAPSHOT_CREATED':
        console.log(`Snapshot created: ${msg.label} in slot ${msg.slot}`);
        // Refresh snapshot info
        postToPlugin({ type: 'DETECT_STEP_STATUS' });
        break;
      case 'SNAPSHOT_RESTORED':
        // PIPELINE_STATE_LOADED follows this message from sandbox,
        // which triggers full state restoration including translations,
        // keyExpressions, and all separate state variables
        if (!(msg as any).success) {
          console.error('Snapshot restore failed');
        }
        break;
      case 'API_KEY_LOADED':
        setApiKey(msg.apiKey);
        break;
      case 'GALLERY_LOADED':
        setGalleryEntries((msg as any).entries || []);
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

  // Build full state with all persisted data for immediate saves
  const buildFullState = useCallback((base: PipelineState): PipelineState => {
    const serializedEnLinesMaps: Record<number, Record<string, string[]>> = {};
    for (const [key, map] of Object.entries(keyExprEnLinesMaps)) {
      serializedEnLinesMaps[Number(key)] = Object.fromEntries(map);
    }
    // Filter out undefined values that JSON.stringify would silently drop
    const cleanContentIdMaps: Record<number, import('../../shared/messageTypes').ContentIdMap> = {};
    for (const [k, v] of Object.entries(keyExprContentIdMaps)) {
      if (v !== undefined) cleanContentIdMaps[Number(k)] = v;
    }
    const cleanFrameIds: Record<number, string> = {};
    for (const [k, v] of Object.entries(keyExprFrameIds)) {
      if (v !== undefined) cleanFrameIds[Number(k)] = v;
    }
    return {
      ...base,
      translations,
      keyExpressions,
      keyExprContentIdMaps: cleanContentIdMaps,
      keyExprPlacements,
      keyExprFrameIds: cleanFrameIds,
      keyExprEnLinesMaps: serializedEnLinesMaps,
    };
  }, [translations, keyExpressions, keyExprContentIdMaps, keyExprPlacements, keyExprFrameIds, keyExprEnLinesMaps]);

  const buildFullStateRef = useRef(buildFullState);
  buildFullStateRef.current = buildFullState;

  // Debounced auto-save timer ref (declared early for use in cancelPendingSave)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending debounced save to prevent double-save after immediate save
  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // Navigation
  const handleStepChange = useCallback((step: Step) => {
    setPipelineState(prev => {
      const next = { ...prev, currentStep: step };
      cancelPendingSave();
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: buildFullState(next) });
      updateProgressOnCanvas(next);
      return next;
    });
  }, [updateProgressOnCanvas, buildFullState, cancelPendingSave]);

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
      cancelPendingSave();
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: buildFullState(next) });
      updateProgressOnCanvas(next);
      return next;
    });
  }, [updateProgressOnCanvas, buildFullState, cancelPendingSave]);

  const handlePrevStep = useCallback(() => {
    setPipelineState(prev => {
      const prevStepNum = prev.currentStep - 1;
      if (prevStepNum < 1) return prev;
      const next = {
        ...prev,
        currentStep: prevStepNum as Step,
        completedSteps: prev.completedSteps.filter(s => s < prevStepNum),
      };
      cancelPendingSave();
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: buildFullState(next) });
      updateProgressOnCanvas(next);
      return next;
    });
  }, [updateProgressOnCanvas, buildFullState, cancelPendingSave]);

  const handleSaveSnapshot = useCallback(() => {
    const label = `수동 저장 (Step ${pipelineState.currentStep})`;
    postToPlugin({ type: 'CREATE_SNAPSHOT', label });
  }, [pipelineState.currentStep]);

  // Step-specific data handlers
  const handleStoryTitleChange = useCallback((title: string) => {
    setPipelineState(prev => ({ ...prev, storyTitle: title }));
  }, []);

  const handleStoryTextChange = useCallback((text: string) => {
    setPipelineState(prev => ({ ...prev, storyText: text }));
  }, []);

  const handlePagesChange = useCallback((newPages: ParsedPage[]) => {
    setPipelineState(prev => ({
      ...prev,
      pages: newPages.map((p, i) => {
        // Preserve ALL existing page data (sceneAnalysis, selectedImageIndex, etc.)
        const existing = prev.pages.find((ep) => ep.pageIndex === i);
        return {
          ...(existing || {}),  // Spread ALL existing fields first
          pageIndex: i,
          textBlocks: p.textBlocks,
          isEmpty: p.isEmpty,
        };
      }),
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
      keyColors: { ...prev.keyColors, colorA, colorB },
    }));
  }, []);

  const handleCharactersChange = useCallback((characters: Character[]) => {
    setPipelineState(prev => ({ ...prev, characters }));
  }, []);

  const handleCharacterImageSelect = useCallback((characterId: string, imageBase64: string) => {
    setPipelineState(prev => {
      const updatedCharacters = prev.characters.map(c =>
        c.id === characterId ? { ...c, referenceImageBase64: imageBase64, confirmed: true } : c
      );
      // Save character image to Figma
      const bytes = Uint8Array.from(atob(imageBase64), ch => ch.charCodeAt(0));
      postToPlugin({
        type: 'SAVE_CHARACTER_IMAGE',
        characterId,
        characterName: updatedCharacters.find(c => c.id === characterId)?.name || '',
        imageBytes: Array.from(bytes),
      });
      return { ...prev, characters: updatedCharacters };
    });
  }, []);

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

  // Auto-save pipeline state when data changes (debounced)
  useEffect(() => {
    if (isLoading || !stateLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const fullState = buildFullStateRef.current(pipelineState);
      const stateJson = JSON.stringify(fullState);
      if (stateJson.length > 900000) {
        console.warn(`[Pipeline] State size ${(stateJson.length / 1024).toFixed(0)}KB approaching 1MB limit`);
      }
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: fullState });
    }, 1000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [
    pipelineState.storyTitle, pipelineState.storyText, pipelineState.characters,
    pipelineState.keyColors, pipelineState.styleGuide, pipelineState.pages,
    pipelineState.currentStep, pipelineState.completedSteps,
    translations, keyExpressions, keyExprContentIdMaps, keyExprPlacements,
    keyExprFrameIds, keyExprEnLinesMaps,
    isLoading,
  ]);

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
            referenceImageBase64={pipelineState.styleGuide.referenceImageBase64}
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
            characters={pipelineState.characters}
            storyTitle={pipelineState.storyTitle}
          />
        );
      case Step.SCENE_STRUCTURE:
        return (
          <SceneStructurePanel
            pages={pipelineState.pages}
            characters={pipelineState.characters}
            storyText={pipelineState.storyText}
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
            referenceImageBase64={pipelineState.styleGuide.referenceImageBase64}
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
      {/* Top bar with snapshot save + step navigation + settings gear */}
      <div style={{ position: 'relative' }}>
        {/* Snapshot bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderBottom: '1px solid #F0F0F0',
          backgroundColor: '#FAFAFA',
          fontSize: 10,
        }}>
          <button
            onClick={handleSaveSnapshot}
            style={{
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 600,
              color: '#fff',
              background: '#F5A623',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            title="현재 상태를 스냅샷으로 저장"
          >
            현재 상태 저장
          </button>
          <div style={{ flex: 1, display: 'flex', gap: 8, overflow: 'hidden' }}>
            {snapshotInfo.length === 0 && (
              <span style={{ color: '#CCC', fontStyle: 'italic' }}>저장된 스냅샷 없음</span>
            )}
            {snapshotInfo.map((snap) => {
              const date = snap.timestamp ? new Date(snap.timestamp) : null;
              const timeStr = date
                ? `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                : '';
              return (
                <div
                  key={snap.slot}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    background: snap.slot === 1 ? '#E8F4FD' : '#F5F5F5',
                    borderRadius: 3,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    maxWidth: 160,
                  }}
                  title={`${snap.label}\n${snap.timestamp}`}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: snap.slot === 1 ? '#18A0FB' : '#CCC',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: '#666', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {timeStr}
                  </span>
                  {snap.hasState && (
                    <button
                      onClick={() => {
                        if (confirm('이 스냅샷으로 복원하시겠습니까? 현재 작업이 덮어씌워집니다.')) {
                          postToPlugin({ type: 'RESTORE_SNAPSHOT', slot: snap.slot });
                        }
                      }}
                      style={{
                        fontSize: 9,
                        padding: '1px 4px',
                        background: '#F5A623',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 2,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      복원
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <StepNavigation
          currentStep={pipelineState.currentStep}
          completedSteps={pipelineState.completedSteps}
          onStepChange={handleStepChange}
        />
        <button
          onClick={() => setIsSettingsOpen(true)}
          style={{
            position: 'absolute',
            top: 8 + 28,
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
