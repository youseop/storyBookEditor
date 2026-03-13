import React, { useState, useCallback, useEffect } from 'react';
import { Step, Phase, PipelineState, createInitialPipelineState, getPhaseForStep, STEP_INFO } from '../../shared/pipeline';
import type { SandboxToUIMessage } from '../../shared/messageTypes';
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
    }
  }, []));

  // Navigation
  const handleStepChange = useCallback((step: Step) => {
    setPipelineState(prev => {
      const next = { ...prev, currentStep: step };
      // Auto-save state
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: next });
      return next;
    });
  }, []);

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
      return next;
    });
  }, []);

  const handlePrevStep = useCallback(() => {
    setPipelineState(prev => {
      const prevStepNum = prev.currentStep - 1;
      if (prevStepNum < 1) return prev;
      const next = { ...prev, currentStep: prevStepNum as Step };
      postToPlugin({ type: 'SAVE_PIPELINE_STATE', state: next });
      return next;
    });
  }, []);

  // Step-specific data handlers
  const handleStoryTextChange = useCallback((text: string) => {
    setPipelineState(prev => {
      const next = { ...prev, storyText: text };
      return next;
    });
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

  // Get API key from pipeline state or localStorage
  const [apiKey, setApiKey] = useState('');
  useEffect(() => {
    postToPlugin({ type: 'LOAD_API_KEY' });
  }, []);
  usePluginMessage(useCallback((msg: SandboxToUIMessage) => {
    if (msg.type === 'API_KEY_LOADED') {
      setApiKey(msg.apiKey);
    }
  }, []));

  // Render the appropriate panel for current step
  const renderStepPanel = () => {
    const step = pipelineState.currentStep;

    switch (step) {
      case Step.STYLE_SETUP:
        return (
          <StyleSetupPanel
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
      <StepNavigation
        currentStep={pipelineState.currentStep}
        completedSteps={pipelineState.completedSteps}
        onStepChange={handleStepChange}
      />

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
    </div>
  );
};

// Placeholder for unimplemented steps
interface PlaceholderPanelProps {
  stepInfo: { title: string; titleKo: string; description: string };
  message?: string;
}

const PlaceholderPanel: React.FC<PlaceholderPanelProps> = ({ stepInfo, message }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
    color: '#999',
  }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 4 }}>
      {stepInfo.titleKo}
    </div>
    <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
      {stepInfo.description}
    </div>
    <div style={{
      padding: '12px 20px',
      backgroundColor: '#F5F5F5',
      borderRadius: 8,
      fontSize: 11,
      color: '#AAA',
    }}>
      {message || '구현 예정'}
    </div>
  </div>
);

export default PipelineApp;
