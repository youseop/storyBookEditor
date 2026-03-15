/**
 * Pipeline state persistence — save/load PipelineState to a hidden Figma frame.
 */

import { PLUGIN_DATA_KEYS } from '../../shared/naming';
import type { PipelineState } from '../../shared/pipeline';

export const PIPELINE_DATA_NODE_NAME = 'PK-PipelineData';

export function findPipelineDataNode(): FrameNode | null {
  return figma.currentPage.findOne(
    (n) => n.type === 'FRAME' && n.name === PIPELINE_DATA_NODE_NAME
  ) as FrameNode | null;
}

export function getOrCreatePipelineDataNode(): FrameNode {
  let node = findPipelineDataNode();
  if (!node) {
    node = figma.createFrame();
    node.name = PIPELINE_DATA_NODE_NAME;
    node.resize(1, 1);
    node.visible = false;
    node.locked = true;
    // Place it far off-screen
    node.x = -99999;
    node.y = -99999;
  }
  return node;
}

export function savePipelineState(state: PipelineState): void {
  const node = getOrCreatePipelineDataNode();
  node.setPluginData(PLUGIN_DATA_KEYS.pipelineState, JSON.stringify(state));
}

export function loadPipelineState(): PipelineState | null {
  const node = findPipelineDataNode();
  if (!node) return null;
  const raw = node.getPluginData(PLUGIN_DATA_KEYS.pipelineState);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PipelineState;
  } catch {
    return null;
  }
}
