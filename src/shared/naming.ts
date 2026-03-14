// Frame naming conventions for human readability
export const FRAME_NAMES = {
  progress: 'PK-Progress',
  meta: 'PK-Meta',
  metaProjectInfo: 'PK-Meta-ProjectInfo',
  metaStyleGuide: 'PK-Meta-StyleGuide',
  metaCharacters: 'PK-Meta-Characters',
  metaPageImages: (pageIdx: number) => `PK-Meta-Page${String(pageIdx + 1).padStart(2, '0')}-Images`,
  part1Page: (pageIdx: number) => `PK-Part1-Page${String(pageIdx + 1).padStart(2, '0')}`,
  part2Page: (pageIdx: number) => `PK-Part2-Page${String(pageIdx + 1).padStart(2, '0')}`,
  part3Page: (pageIdx: number) => `PK-Part3-Page${String(pageIdx + 1).padStart(2, '0')}`,
  snapshotSlot: (slot: number) => `PK-Snapshot-Slot${slot}`,
  metaSceneAnalysis: 'PK-Meta-SceneAnalysis',
  metaTranslations: 'PK-Meta-Translations',
  imageGallery: 'PK-Image-Gallery',
  storage: '[KeyExpr] Storage',  // backward compatible
  keyExprFrame: '[KeyExpr]',     // backward compatible
} as const;

// PluginData keys for setPluginData/getPluginData
export const PLUGIN_DATA_KEYS = {
  pipelineState: 'pk-pipeline-state',
  nodeType: 'pk-node-type',        // identifies what kind of PK node this is
  pageIndex: 'pk-page-index',      // which story page this frame represents
  partType: 'pk-part-type',        // 'part1' | 'part2' | 'part3'
  sceneAnalysis: 'pk-scene-analysis',
  characterData: 'pk-character-data',
  textBlocks: 'pk-text-blocks',    // JSON string of text blocks for this page
  snapshotLabel: 'pk-snapshot-label',
  snapshotTimestamp: 'pk-snapshot-timestamp',
  imageGalleryData: 'pk-image-gallery-data',
} as const;

// Node type identifiers stored in pluginData
export type PKNodeType =
  | 'progress'
  | 'meta'
  | 'meta-project-info'
  | 'meta-style-guide'
  | 'meta-characters'
  | 'meta-page-images'
  | 'story-page'
  | 'snapshot'
  | 'storage'
  | 'key-expr-frame';
