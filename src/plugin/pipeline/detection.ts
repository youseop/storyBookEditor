/**
 * Step status detection — scan canvas for PK-* frames to infer completed pipeline steps.
 */

import { findPipelineDataNode } from './statePersistence';
import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../../shared/naming';

/**
 * Detect which pipeline steps have been completed by scanning the Figma canvas
 * for PK-* frames and plugin data. Posts STEP_STATUS_DETECTED message to UI.
 */
export async function handleDetectStepStatus(): Promise<void> {
  try {
    const detectedSteps: number[] = [];
    const details: Record<number, string> = {};
    const allNodes = figma.currentPage.children;
    const dataNode = findPipelineDataNode();

    // Step 1: Style Guide
    const styleGuide = allNodes.find(n => n.name === FRAME_NAMES.metaStyleGuide);
    if (styleGuide) {
      detectedSteps.push(1);
      details[1] = '스타일 가이드 프레임 있음';
    }

    // Step 2: Key Colors
    if (dataNode) {
      const colorA = dataNode.getPluginData('pk-key-color-a');
      if (colorA) {
        detectedSteps.push(2);
        details[2] = `키컬러: ${colorA}`;
      }
    }

    // Step 3: Characters
    const charFrame = allNodes.find(n => n.name === FRAME_NAMES.metaCharacters);
    if (charFrame) {
      detectedSteps.push(3);
      try {
        const charData = dataNode?.getPluginData(PLUGIN_DATA_KEYS.characterData);
        const charCount = charData ? JSON.parse(charData).length : 0;
        details[3] = `${charCount}명 등록됨`;
      } catch {
        details[3] = '인물 프레임 있음';
      }
    }

    // Step 4: Character Images
    if (dataNode) {
      try {
        const charImages = dataNode.getPluginData('pk-character-images');
        if (charImages && charImages !== '{}') {
          const imgMap = JSON.parse(charImages);
          const imgCount = Object.keys(imgMap).length;
          if (imgCount > 0) {
            detectedSteps.push(4);
            details[4] = `${imgCount}명 이미지 선택됨`;
          }
        }
      } catch {
        // Corrupted data, skip
      }
    }

    // Step 5: Page Split (Part 1 pages exist)
    const part1Pages = allNodes.filter(n => n.name.startsWith('PK-Part1-Page'));
    if (part1Pages.length > 0) {
      detectedSteps.push(5);
      details[5] = `${part1Pages.length}개 페이지 생성됨`;
    }

    // Step 6: Scene Analysis
    const sceneAnalysis = allNodes.find(n => n.name === 'PK-Meta-SceneAnalysis');
    if (sceneAnalysis) {
      detectedSteps.push(6);
      details[6] = '장면 분석 프레임 있음';
    }

    // Step 7: Scene Images
    const sceneImageFrames = allNodes.filter(n => n.name.startsWith('PK-Meta-Page') && n.name.endsWith('-Images'));
    if (sceneImageFrames.length > 0) {
      detectedSteps.push(7);
      details[7] = `${sceneImageFrames.length}개 페이지 이미지 생성됨`;
    }

    // Step 8-9: Image/Dialogue placement (check if scene-image exists in Part1 pages)
    const pagesWithImages = part1Pages.filter(n => {
      if (n.type !== 'FRAME') return false;
      return (n as FrameNode).findOne(c => c.name === 'scene-image') !== null;
    });
    if (pagesWithImages.length > 0) {
      detectedSteps.push(8);
      details[8] = `${pagesWithImages.length}개 페이지에 이미지 배치됨`;
    }
    const pagesWithDialogue = part1Pages.filter(n => {
      if (n.type !== 'FRAME') return false;
      return (n as FrameNode).findOne(c => c.name.startsWith('dialogue-')) !== null;
    });
    if (pagesWithDialogue.length > 0) {
      detectedSteps.push(9);
      details[9] = `${pagesWithDialogue.length}개 페이지에 대사 배치됨`;
    }

    // Step 10: Part 1 confirm (snapshot exists)
    const snapshots = allNodes.filter(n => n.name.startsWith('PK-Snapshot-Slot'));
    if (snapshots.length > 0) {
      detectedSteps.push(10);
      details[10] = `스냅샷 ${snapshots.length}개`;
    }

    // Step 11: Translations
    const translationFrame = allNodes.find(n => n.name === 'PK-Meta-Translations');
    if (translationFrame) {
      detectedSteps.push(11);
      details[11] = '번역 프레임 있음';
    }

    // Step 12: Part 2 pages
    const part2Pages = allNodes.filter(n => n.name.startsWith('PK-Part2-Page'));
    if (part2Pages.length > 0) {
      detectedSteps.push(12);
      details[12] = `Part 2: ${part2Pages.length}페이지`;
    }

    // Step 14: Part 3 layout
    const part3Pages = allNodes.filter(n => n.name.startsWith('PK-Part3-Page'));
    if (part3Pages.length > 0) {
      detectedSteps.push(14);
      details[14] = `Part 3: ${part3Pages.length}페이지`;
    }

    // Step 18: Cover
    const coverFrame = allNodes.find(n => n.name === 'PK-Cover');
    if (coverFrame) {
      detectedSteps.push(18);
      details[18] = '표지 프레임 있음';
    }

    // Step 19: Inner pages
    const innerPages = allNodes.filter(n => n.name.startsWith('PK-Inner-'));
    if (innerPages.length > 0) {
      detectedSteps.push(19);
      details[19] = `${innerPages.length}개 내지 생성됨`;
    }

    // Step 20: Final output (check for output pages in Figma document)
    const outputPages = figma.root.children.filter(p =>
      p.name.startsWith('PK-Output-') || p.name.includes('Spread') || p.name.includes('Individual')
    );
    if (outputPages.length > 0) {
      detectedSteps.push(20);
      details[20] = '최종 산출물 생성됨';
    }

    // Get snapshot info
    const snapshotInfo: Array<{ slot: number; label: string; timestamp: string; hasState?: boolean }> = [];
    for (let slot = 1; slot <= 2; slot++) {
      const snapFrame = figma.currentPage.findOne(
        n => n.name === FRAME_NAMES.snapshotSlot(slot)
      ) as FrameNode | null;
      if (snapFrame) {
        const hasState = !!snapFrame.getPluginData('pk-snapshot-state');
        snapshotInfo.push({
          slot,
          label: snapFrame.getPluginData(PLUGIN_DATA_KEYS.snapshotLabel) || `Slot ${slot}`,
          timestamp: snapFrame.getPluginData(PLUGIN_DATA_KEYS.snapshotTimestamp) || '',
          hasState,
        });
      }
    }

    figma.ui.postMessage({
      type: 'STEP_STATUS_DETECTED',
      detectedSteps,
      details,
      snapshotInfo,
    });
  } catch (err: any) {
    figma.ui.postMessage({
      type: 'ERROR',
      message: 'Failed to detect step status',
      detail: err?.message ?? String(err),
    });
  }
}
