// Expression data after parsing
export interface ExpressionCard {
  id: string;
  lines: string[];       // text lines within the card
  colSpan: 1 | 2;       // 1=normal, 2=wide
  rowSpan: 1 | 2;       // 1=normal, 2=tall
}

// Settings from UI
export interface PluginSettings {
  bgColor: string;
  fontFamily: string;
  fontSize: number;
  apiKey: string;
  refFrameName: string;
}

// Card placement result from grid builder
export interface CardPlacement {
  id: string;
  nodeId: string;        // Figma node ID
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  page: number;          // 0=left, 1=right
  lines: string[];
}

// Image metadata
export interface ImageMeta {
  expressionId: string;
  imageHash: string;
  prompt: string;
  isActive: boolean;
  index: number;
}

// ---- Messages: UI → Sandbox ----

export interface GenerateLayoutMessage {
  type: 'GENERATE_LAYOUT';
  expressions: ExpressionCard[];
  settings: PluginSettings;
}

export interface UpdateLayoutMessage {
  type: 'UPDATE_LAYOUT';
  expressions: ExpressionCard[];
  settings: PluginSettings;
}

export interface ExportRefFrameMessage {
  type: 'EXPORT_REF_FRAME';
  frameName: string;
}

export interface StoreImageMessage {
  type: 'STORE_IMAGE';
  expressionId: string;
  expressionText: string; // Korean text for display naming
  imageBytes: number[];   // Uint8Array as number array
  prompt: string;
  index: number;
}

export interface AssignImageMessage {
  type: 'ASSIGN_IMAGE';
  expressionId: string;
  imageHash: string;
}

export interface SwapImageMessage {
  type: 'SWAP_IMAGE';
  expressionId: string;
  newImageHash: string;
}

export interface MeasureTextMessage {
  type: 'MEASURE_TEXT';
  texts: { id: string; lines: string[] }[];
  fontFamily: string;
  fontSize: number;
}

export interface SaveApiKeyMessage {
  type: 'SAVE_API_KEY';
  apiKey: string;
}

export interface LoadApiKeyMessage {
  type: 'LOAD_API_KEY';
}

export interface CleanupTempMessage {
  type: 'CLEANUP_TEMP';
}

export interface NewPageMessage {
  type: 'NEW_PAGE';
  settings: PluginSettings;
}

export interface CheckRefFrameMessage {
  type: 'CHECK_REF_FRAME';
  frameName: string;
}

// ---- Messages: Sandbox → UI ----

export interface LayoutCreatedMessage {
  type: 'LAYOUT_CREATED';
  placements: CardPlacement[];
}

export interface RefFrameExportedMessage {
  type: 'REF_FRAME_EXPORTED';
  imageBase64: string;
}

export interface ImageStoredMessage {
  type: 'IMAGE_STORED';
  expressionId: string;
  imageHash: string;
  index: number;
}

export interface ImageAssignedMessage {
  type: 'IMAGE_ASSIGNED';
  expressionId: string;
  success: boolean;
}

export interface TextMeasuredMessage {
  type: 'TEXT_MEASURED';
  results: { id: string; width: number; height: number }[];
}

export interface ApiKeyLoadedMessage {
  type: 'API_KEY_LOADED';
  apiKey: string;
}

export interface FrameSelectedMessage {
  type: 'FRAME_SELECTED';
  frameId: string;
  expressionText: string;  // reconstructed text for the input field
}

export interface RefFrameCheckedMessage {
  type: 'REF_FRAME_CHECKED';
  frameName: string;
  matchCount: number;
}

export interface NewPageCreatedMessage {
  type: 'NEW_PAGE_CREATED';
  frameId: string;
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
  detail?: string;
}

// Union types
export type UIToSandboxMessage =
  | GenerateLayoutMessage
  | UpdateLayoutMessage
  | ExportRefFrameMessage
  | StoreImageMessage
  | AssignImageMessage
  | SwapImageMessage
  | MeasureTextMessage
  | SaveApiKeyMessage
  | LoadApiKeyMessage
  | CleanupTempMessage
  | NewPageMessage
  | CheckRefFrameMessage;

export type SandboxToUIMessage =
  | LayoutCreatedMessage
  | RefFrameExportedMessage
  | ImageStoredMessage
  | ImageAssignedMessage
  | TextMeasuredMessage
  | ApiKeyLoadedMessage
  | FrameSelectedMessage
  | NewPageCreatedMessage
  | RefFrameCheckedMessage
  | ErrorMessage;
