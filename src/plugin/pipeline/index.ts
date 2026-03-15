/**
 * Thin router — delegates every pipeline message to the appropriate sub-module handler.
 * Returns true if the message was handled, false otherwise.
 */

import type { UIToSandboxMessage } from '../../shared/messageTypes';

// statePersistence
import { savePipelineState, loadPipelineState } from './statePersistence';

// storyPages
import { createStoryPages, updateStoryPages } from './storyPages';

// progressDisplay
import {
  updateProgressDisplay,
  createSnapshot,
  handleRestoreSnapshot,
} from './progressDisplay';

// partPages
import { createPart2Pages, createPart3Layout } from './partPages';

// finalOutput
import { insertPageNumbers, generateFinalOutput } from './finalOutput';

// metaFrames
import {
  handleSaveStyleGuide,
  handleSaveStoryText,
  handleSaveCharacters,
  handleSaveCharacterImage,
  handleSaveKeyColors,
  handleSaveSceneAnalysis,
  handleSaveBulkTranslations,
} from './metaFrames';

// sceneImages
import {
  handlePlaceDialogue,
  handleStoreSceneImage,
  handleSelectSceneImage,
  handleSaveImagePlacement,
  handleLoadPageImages,
} from './sceneImages';

// keyExpressions
import { handleApplyKeyExpressions } from './keyExpressions';

// gallery
import { handleSaveToGallery, handleLoadGallery } from './gallery';

// cover
import { handleCreateCover } from './cover';

// innerPages
import { createInnerPages } from './innerPages';

// detection
import { handleDetectStepStatus } from './detection';

// canvasHelpers
import { navigateToFrame } from './canvasHelpers';

/**
 * Handle pipeline-specific messages. Returns true if the message was handled.
 */
export async function handlePipelineMessage(msg: UIToSandboxMessage): Promise<boolean> {
  switch (msg.type) {
    // ---- State Persistence ----

    case 'SAVE_PIPELINE_STATE': {
      try {
        savePipelineState(msg.state);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save pipeline state',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'LOAD_PIPELINE_STATE': {
      const state = loadPipelineState();
      figma.ui.postMessage({
        type: 'PIPELINE_STATE_LOADED',
        state,
      });
      return true;
    }

    // ---- Story Pages ----

    case 'CREATE_STORY_PAGES': {
      try {
        const frameIds = await createStoryPages(msg.pages);
        figma.ui.postMessage({
          type: 'STORY_PAGES_CREATED',
          pageFrameIds: frameIds,
          pageCount: frameIds.length,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create story pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'UPDATE_STORY_PAGES': {
      try {
        const frameIds = await updateStoryPages(msg.pages);
        figma.ui.postMessage({
          type: 'STORY_PAGES_CREATED',
          pageFrameIds: frameIds,
          pageCount: frameIds.length,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update story pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    // ---- Progress Display ----

    case 'UPDATE_PROGRESS_DISPLAY': {
      try {
        await updateProgressDisplay(msg.currentStep, msg.completedSteps);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to update progress display',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'CREATE_SNAPSHOT': {
      try {
        const result = await createSnapshot(msg.label);
        figma.ui.postMessage({
          type: 'SNAPSHOT_CREATED',
          slot: result.slot,
          label: result.label,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create snapshot',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'RESTORE_SNAPSHOT': {
      try {
        await handleRestoreSnapshot(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'SNAPSHOT_RESTORED',
          success: false,
          slot: msg.slot,
        });
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to restore snapshot',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    // ---- Part Pages ----

    case 'CREATE_PART2_PAGES': {
      try {
        const count = await createPart2Pages(msg.translations);
        figma.ui.postMessage({
          type: 'PART2_PAGES_CREATED',
          pageCount: count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create Part 2 pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'CREATE_PART3_LAYOUT': {
      try {
        const count = await createPart3Layout(msg.colorA);
        figma.ui.postMessage({
          type: 'PART3_LAYOUT_CREATED',
          pageCount: count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create Part 3 layout',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    // ---- Final Output ----

    case 'INSERT_PAGE_NUMBERS': {
      try {
        const count = await insertPageNumbers(msg.brandText);
        figma.ui.postMessage({
          type: 'PAGE_NUMBERS_INSERTED',
          count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to insert page numbers',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'GENERATE_FINAL_OUTPUT': {
      try {
        const result = await generateFinalOutput(msg.outputType);
        figma.ui.postMessage({
          type: 'FINAL_OUTPUT_GENERATED',
          spreadPageName: result.spreadPageName,
          individualPageName: result.individualPageName,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to generate final output',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    // ---- Meta Frames ----

    case 'SAVE_STYLE_GUIDE': {
      try {
        await handleSaveStyleGuide(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save style guide',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_STORY_TEXT': {
      try {
        await handleSaveStoryText(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save story text',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_CHARACTERS': {
      try {
        await handleSaveCharacters(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save characters',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_CHARACTER_IMAGE': {
      try {
        await handleSaveCharacterImage(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save character image',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_KEY_COLORS': {
      try {
        handleSaveKeyColors(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save key colors',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_SCENE_ANALYSIS': {
      try {
        await handleSaveSceneAnalysis(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save scene analysis',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_BULK_TRANSLATIONS': {
      try {
        await handleSaveBulkTranslations(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save translations',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    // ---- Scene Images ----

    case 'PLACE_DIALOGUE': {
      try {
        await handlePlaceDialogue(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to place dialogue',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'STORE_SCENE_IMAGE': {
      try {
        await handleStoreSceneImage(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: `Failed to store scene image for page ${msg.pageIndex + 1}`,
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SELECT_SCENE_IMAGE': {
      try {
        await handleSelectSceneImage(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to select scene image',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'SAVE_IMAGE_PLACEMENT': {
      try {
        handleSaveImagePlacement(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'IMAGE_PLACEMENT_SAVED',
          success: false,
        });
      }
      return true;
    }

    case 'LOAD_PAGE_IMAGES': {
      try {
        await handleLoadPageImages(msg);
      } catch (err: any) {
        figma.ui.postMessage({ type: 'PAGE_IMAGES_LOADED', pages: [] });
      }
      return true;
    }

    // ---- Key Expressions ----

    case 'APPLY_KEY_EXPRESSIONS': {
      // Handler has its own try/catch + error postMessage
      await handleApplyKeyExpressions(msg);
      return true;
    }

    // ---- Gallery ----

    case 'SAVE_TO_GALLERY': {
      try {
        await handleSaveToGallery(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to save to gallery',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    case 'LOAD_GALLERY': {
      try {
        await handleLoadGallery(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'GALLERY_LOADED',
          entries: [],
        });
      }
      return true;
    }

    // ---- Cover ----

    case 'CREATE_COVER': {
      try {
        await handleCreateCover(msg);
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create cover',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    // ---- Inner Pages ----

    case 'CREATE_INNER_PAGES': {
      try {
        const count = await createInnerPages(
          msg.pages,
          msg.keyColorA,
          msg.keyColorB,
          msg.bookTitle,
          msg.bookTitleEn
        );
        figma.ui.postMessage({
          type: 'INNER_PAGES_CREATED',
          pageCount: count,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: 'Failed to create inner pages',
          detail: err?.message ?? String(err),
        });
      }
      return true;
    }

    // ---- Detection ----

    case 'DETECT_STEP_STATUS': {
      // Handler has its own try/catch + error postMessage
      await handleDetectStepStatus();
      return true;
    }

    // ---- Canvas Helpers ----

    case 'NAVIGATE_TO_FRAME': {
      const found = navigateToFrame(msg.frameName);
      if (!found) {
        figma.ui.postMessage({
          type: 'ERROR',
          message: `Frame not found: ${msg.frameName}`,
          detail: `Frame not found: ${msg.frameName}`,
        });
      }
      return true;
    }

    default:
      return false; // Not a pipeline message
  }
}
