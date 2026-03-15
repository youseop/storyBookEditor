/**
 * Progress display, snapshots, and snapshot restoration.
 */

import { FRAME_NAMES, PLUGIN_DATA_KEYS } from '../../shared/naming';
import { Phase, PHASE_INFO, Step, STEP_INFO } from '../../shared/pipeline';
import {
  PROGRESS_AREA_Y,
  SNAPSHOT_AREA_GAP,
} from '../../shared/constants';
import {
  findPipelineDataNode,
  savePipelineState,
} from './statePersistence';

/**
 * Determine which Phase a step number belongs to and produce phase metadata.
 */
export function getPhaseInfoForDisplay(): { name: string; rangeStart: number; rangeEnd: number }[] {
  const phases = Object.values(Phase);
  return phases.map((phase) => {
    const info = PHASE_INFO[phase];
    const steps = info.steps;
    return {
      name: info.title,
      rangeStart: steps[0] as number,
      rangeEnd: steps[steps.length - 1] as number,
    };
  });
}

/**
 * Create/update a visual progress bar at the top of the Figma canvas.
 * Shows 5 phase dots connected by lines with current step indicator.
 */
export async function updateProgressDisplay(
  currentStep: number,
  completedSteps: number[]
): Promise<void> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // Remove old progress frame
  const old = figma.currentPage.findOne(
    (n) => n.name === FRAME_NAMES.progress
  ) as FrameNode | null;
  if (old) old.remove();

  // Create progress frame
  const frame = figma.createFrame();
  frame.name = FRAME_NAMES.progress;
  frame.resize(3000, 300);
  frame.x = 0;
  frame.y = PROGRESS_AREA_Y;
  frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];
  frame.cornerRadius = 20;
  frame.locked = true;

  // Phase info derived from pipeline.ts
  const phases = getPhaseInfoForDisplay();

  const dotSize = 40;
  const spacing = 550;
  const startX = 200;
  const dotY = 80;

  const COLOR_GREEN: RGB = { r: 0.106, g: 0.769, b: 0.49 };
  const COLOR_BLUE: RGB = { r: 0.094, g: 0.627, b: 0.984 };
  const COLOR_GRAY: RGB = { r: 0.9, g: 0.9, b: 0.9 };
  const COLOR_GRAY_TEXT: RGB = { r: 0.5, g: 0.5, b: 0.5 };

  for (let i = 0; i < phases.length; i++) {
    const x = startX + i * spacing;
    const { rangeStart, rangeEnd } = phases[i];

    // Determine phase status
    const isCompleted = completedSteps.includes(rangeEnd as number);
    const isCurrent = currentStep >= rangeStart && currentStep <= rangeEnd;

    // Draw connecting line (except after last phase)
    if (i < phases.length - 1) {
      const line = figma.createRectangle();
      line.resize(spacing - dotSize, 4);
      line.x = x + dotSize;
      line.y = dotY + dotSize / 2 - 2;
      line.fills = [
        { type: 'SOLID', color: isCompleted ? COLOR_GREEN : COLOR_GRAY },
      ];
      frame.appendChild(line);
    }

    // Draw dot
    const dot = figma.createEllipse();
    dot.resize(dotSize, dotSize);
    dot.x = x;
    dot.y = dotY;
    if (isCompleted) {
      dot.fills = [{ type: 'SOLID', color: COLOR_GREEN }];
    } else if (isCurrent) {
      dot.fills = [{ type: 'SOLID', color: COLOR_BLUE }];
    } else {
      dot.fills = [{ type: 'SOLID', color: COLOR_GRAY }];
    }
    frame.appendChild(dot);

    // Phase label
    const label = figma.createText();
    label.fontName = {
      family: 'Inter',
      style: isCurrent ? 'Bold' : 'Regular',
    };
    label.characters = phases[i].name;
    label.fontSize = 28;
    label.fills = [
      { type: 'SOLID', color: isCurrent ? COLOR_BLUE : COLOR_GRAY_TEXT },
    ];
    label.x = x - 20;
    label.y = dotY + dotSize + 15;
    frame.appendChild(label);
  }

  // Current step text
  const stepInfo = STEP_INFO[currentStep as Step];
  const stepLabel = stepInfo
    ? `Step ${currentStep} / 20 — ${stepInfo.title}`
    : `Step ${currentStep} / 20`;

  const stepText = figma.createText();
  stepText.fontName = { family: 'Inter', style: 'Bold' };
  stepText.characters = stepLabel;
  stepText.fontSize = 36;
  stepText.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  stepText.x = startX;
  stepText.y = 220;
  frame.appendChild(stepText);
}

/**
 * Create a snapshot of all PK-Part* frames with 2-slot rolling management.
 * Slot 2 is deleted, Slot 1 renamed to Slot 2, new snapshot becomes Slot 1.
 */
export async function createSnapshot(
  label: string
): Promise<{ slot: number; label: string }> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  // Find the bottom-most content frame to position snapshot below
  let maxY = 0;
  figma.currentPage.children.forEach((n) => {
    if (
      n.name.startsWith('PK-') &&
      !n.name.startsWith('PK-Snapshot') &&
      !n.name.startsWith('PK-Pipeline')
    ) {
      const bottom = n.y + ('height' in n ? (n as SceneNode & { height: number }).height : 0);
      if (bottom > maxY) maxY = bottom;
    }
  });

  // Rolling slot management
  const slot2 = figma.currentPage.findOne(
    (n) => n.name === FRAME_NAMES.snapshotSlot(2)
  ) as FrameNode | null;
  if (slot2) slot2.remove();

  const slot1 = figma.currentPage.findOne(
    (n) => n.name === FRAME_NAMES.snapshotSlot(1)
  ) as FrameNode | null;
  if (slot1) {
    slot1.name = FRAME_NAMES.snapshotSlot(2);
  }

  // Create new snapshot frame
  const snapshotFrame = figma.createFrame();
  snapshotFrame.name = FRAME_NAMES.snapshotSlot(1);
  snapshotFrame.x = 0;
  snapshotFrame.y = maxY + SNAPSHOT_AREA_GAP;
  snapshotFrame.fills = [
    { type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } },
  ];
  snapshotFrame.locked = true;

  // Store metadata via pluginData
  const timestamp = new Date().toISOString();
  snapshotFrame.setPluginData(PLUGIN_DATA_KEYS.snapshotLabel, label);
  snapshotFrame.setPluginData(PLUGIN_DATA_KEYS.snapshotTimestamp, timestamp);
  snapshotFrame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'snapshot');

  // Save pipeline state JSON for potential restoration
  const pipelineDataNode = findPipelineDataNode();
  if (pipelineDataNode) {
    const stateJson = pipelineDataNode.getPluginData(PLUGIN_DATA_KEYS.pipelineState);
    if (stateJson) {
      snapshotFrame.setPluginData('pk-snapshot-state', stateJson);
    }
  }

  // Add label text
  const labelText = figma.createText();
  labelText.fontName = { family: 'Inter', style: 'Regular' };
  labelText.characters = `Snapshot: ${label} (${timestamp.slice(0, 16).replace('T', ' ')})`;
  labelText.fontSize = 48;
  labelText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
  labelText.x = 50;
  labelText.y = 50;
  snapshotFrame.appendChild(labelText);

  // Clone all PK-* frames into snapshot (excludes data nodes, snapshots, and gallery)
  const partFrames = figma.currentPage.children.filter(
    (n) =>
      n.name.startsWith('PK-') &&
      n.type === 'FRAME' &&
      !n.name.startsWith('PK-Snapshot') &&
      !n.name.startsWith('PK-Pipeline') &&
      !n.name.startsWith('PK-Image-Gallery')
  ) as FrameNode[];

  let cloneX = 50;
  let cloneY = 150;
  for (const partFrame of partFrames) {
    const clone = partFrame.clone();
    clone.x = cloneX;
    clone.y = cloneY;
    // Scale down to 10% for overview
    clone.rescale(0.1);
    snapshotFrame.appendChild(clone);
    cloneX += clone.width + 20;
    // Wrap to next row if too wide
    if (cloneX > 5000) {
      cloneX = 50;
      cloneY += clone.height + 20;
    }
  }

  // Resize snapshot frame to fit contents
  if (snapshotFrame.children.length > 0) {
    let maxRight = 3000;
    let maxBottom = 300;
    for (const child of snapshotFrame.children) {
      const childRight = child.x + ('width' in child ? (child as SceneNode & { width: number }).width : 0);
      const childBottom = child.y + ('height' in child ? (child as SceneNode & { height: number }).height : 0);
      if (childRight > maxRight) maxRight = childRight;
      if (childBottom > maxBottom) maxBottom = childBottom;
    }
    snapshotFrame.resize(maxRight + 100, maxBottom + 100);
  } else {
    snapshotFrame.resize(3000, 300);
  }

  return { slot: 1, label };
}

/**
 * Restore pipeline state from a snapshot slot.
 */
export async function handleRestoreSnapshot(msg: any): Promise<void> {
  const snapFrame = figma.currentPage.findOne(
    n => n.name === FRAME_NAMES.snapshotSlot(msg.slot)
  ) as FrameNode | null;

  if (!snapFrame) {
    throw new Error(`Snapshot slot ${msg.slot} not found`);
  }

  const stateJson = snapFrame.getPluginData('pk-snapshot-state');
  if (!stateJson) {
    throw new Error('Snapshot does not contain saved state');
  }

  const restoredState = JSON.parse(stateJson);
  savePipelineState(restoredState);

  figma.ui.postMessage({
    type: 'SNAPSHOT_RESTORED',
    success: true,
    slot: msg.slot,
  });

  // Send restored state to UI
  figma.ui.postMessage({
    type: 'PIPELINE_STATE_LOADED',
    state: restoredState,
  });
}
