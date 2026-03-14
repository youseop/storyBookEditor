// Relative image position/size per card instance (frame-size-independent)
export interface ImageTransform {
  scaleX: number;   // imageWidth / frameWidth (horizontal zoom ratio, 1 = fit)
  scaleY: number;   // imageHeight / frameHeight (vertical zoom ratio, 1 = fit)
  offsetX: number;  // normalized horizontal offset from center (0 = centered)
  offsetY: number;  // normalized vertical offset from center (0 = centered)
}

// Expression-level data: maps normalized Korean text → expression ID + translation + selected image
export interface ContentIdMapEntry {
  expressionId: number;  // numeric expression index (0, 1, 2...)
  en?: string;           // English translation (shared across all cards with this text)
  imageIndex?: number;   // selected image variant index (shared)
}

// Expression map: normalized Korean text → entry
export type ContentIdMap = Record<string, ContentIdMapEntry>;

// Per-card image transform: cardId → transform (each card instance's own image position/size)
export type CardTransformMap = Record<string, ImageTransform>;

// Key Expression card template types
export type CardTemplate = 'standard' | 'horizontal' | 'note';

// Page layout for Part 3 (image:expression ratio)
export type Part3PageLayout = 'layout-a' | 'layout-b' | 'layout-c' | 'layout-d';

// Expression data after parsing
export interface ExpressionCard {
  id: string;
  lines: string[];       // text lines within the card (Korean)
  enLines?: string[];    // English translation lines
  colSpan: number;       // grid cells wide (default 2)
  rowSpan: number;       // grid cells tall (default 2)
  rowBreakBefore?: boolean; // force new row (triple newline)
  template?: CardTemplate;  // card template type (standard | horizontal | note)
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
  imageBase64?: string;
}

// ---- Messages: UI → Sandbox ----

export interface GenerateLayoutMessage {
  type: 'GENERATE_LAYOUT';
  expressions: ExpressionCard[];
  settings: PluginSettings;
  frameId?: string;
}

export interface UpdateLayoutMessage {
  type: 'UPDATE_LAYOUT';
  expressions: ExpressionCard[];
  settings: PluginSettings;
  frameId?: string;
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
  frameId?: string;       // target KeyExpr frame ID
}

export interface AssignImageMessage {
  type: 'ASSIGN_IMAGE';
  expressionId: string;
  imageHash: string;
  frameId?: string;       // target KeyExpr frame ID
}

export interface SwapImageMessage {
  type: 'SWAP_IMAGE';
  expressionId: string;
  newImageHash: string;
  frameId?: string;       // target KeyExpr frame ID
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
  frameId?: string;
}

export interface NewPageMessage {
  type: 'NEW_PAGE';
  settings: PluginSettings;
}

export interface CheckRefFrameMessage {
  type: 'CHECK_REF_FRAME';
  frameName: string;
}

export interface CleanupGuidesMessage {
  type: 'CLEANUP_GUIDES';
}

export interface UpdateContentIdMapMessage {
  type: 'UPDATE_CONTENT_ID_MAP';
  entries: { normalizedText: string; expressionId: number; en?: string; imageIndex?: number }[];
  frameId?: string;
}

export interface InitStorageMessage {
  type: 'INIT_STORAGE';
}

export interface CheckStorageMessage {
  type: 'CHECK_STORAGE';
}

export interface AddGuidesMessage {
  type: 'ADD_GUIDES';
}

export interface RemoveBgMessage {
  type: 'REMOVE_BG';
  frameId?: string;
}

export interface UpdateCardEnMessage {
  type: 'UPDATE_CARD_EN';
  expressionId: string;
  enText: string;
  frameId?: string;
}

export interface UpdateCardTranslationsMessage {
  type: 'UPDATE_CARD_TRANSLATIONS';
  cards: Array<{ expressionId: string; enText: string }>;
  frameId?: string;
}

// ---- Messages: Sandbox → UI ----

export interface LayoutCreatedMessage {
  type: 'LAYOUT_CREATED';
  placements: CardPlacement[];
  frameId: string;
  contentIdMap?: ContentIdMap;
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

export interface StoredImageInfo {
  expressionId: string;
  imageHash: string;
  prompt: string;
  index: number;
  isActive: boolean; // true if currently assigned to the card
}

export interface FrameSelectedMessage {
  type: 'FRAME_SELECTED';
  frameId: string;
  expressionText: string;
  enTextPairs: { expressionId: string; korean: string; en: string }[];
  storedImages: StoredImageInfo[];
  contentIdMap?: ContentIdMap;
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

export interface ImageThumbnailMessage {
  type: 'IMAGE_THUMBNAIL';
  expressionId: string;
  imageHash: string;
  imageBase64: string;
}

export interface StorageStatusMessage {
  type: 'STORAGE_STATUS';
  ready: boolean;
  contentIdMap?: ContentIdMap;
  hasGuides?: boolean;
}

export interface GuidesStatusMessage {
  type: 'GUIDES_STATUS';
  hasGuides: boolean;
}

export interface CardImageForBgRemovalMessage {
  type: 'CARD_IMAGE_FOR_BG_REMOVAL';
  expressionId: string;
  imageBase64: string;
}

export interface RemoveBgDoneMessage {
  type: 'REMOVE_BG_DONE';
  total: number;
}

export interface CardSelectedMessage {
  type: 'CARD_SELECTED';
  frameId: string;         // parent KeyExpr frame ID
  expressionId: string;
  korean: string;
  en: string;
  storedImages: StoredImageInfo[];
  activeImageHash?: string;
}

export interface CardsSelectedMessage {
  type: 'CARDS_SELECTED';
  frameId: string;
  cards: Array<{
    expressionId: string;
    korean: string;
    en: string;
  }>;
  storedImages: StoredImageInfo[];
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
  detail?: string;
}

// ---- Pipeline Messages: UI → Sandbox ----

export interface SavePipelineStateMessage {
  type: 'SAVE_PIPELINE_STATE';
  state: import('./pipeline').PipelineState;
}

export interface LoadPipelineStateMessage {
  type: 'LOAD_PIPELINE_STATE';
}

export interface CreateStoryPagesMessage {
  type: 'CREATE_STORY_PAGES';
  pages: Array<{
    textBlocks: string[][];
    isEmpty: boolean;
  }>;
}

export interface UpdateStoryPagesMessage {
  type: 'UPDATE_STORY_PAGES';
  pages: Array<{
    textBlocks: string[][];
    isEmpty: boolean;
  }>;
}

export interface SaveStyleGuideMessage {
  type: 'SAVE_STYLE_GUIDE';
  imageBytes?: number[];
  description: string;
}

export interface SaveCharactersMessage {
  type: 'SAVE_CHARACTERS';
  characters: import('./pipeline').Character[];
}

export interface SaveKeyColorsMessage {
  type: 'SAVE_KEY_COLORS';
  colorA: string;
  colorB: string;
}

export interface NavigateToFrameMessage {
  type: 'NAVIGATE_TO_FRAME';
  frameName: string;
}

export interface CreateSnapshotMessage {
  type: 'CREATE_SNAPSHOT';
  label: string;
}

export interface RestoreSnapshotMessage {
  type: 'RESTORE_SNAPSHOT';
  slot: number;
}

export interface UpdateProgressDisplayMessage {
  type: 'UPDATE_PROGRESS_DISPLAY';
  currentStep: number;
  completedSteps: number[];
}

export interface CreatePart2PagesMessage {
  type: 'CREATE_PART2_PAGES';
  translations: Array<{
    pageIndex: number;
    englishTextBlocks: string[][];
  }>;
}

export interface CreatePart3LayoutMessage {
  type: 'CREATE_PART3_LAYOUT';
  colorA: string;
}

export interface StoreSceneImageMessage {
  type: 'STORE_SCENE_IMAGE';
  pageIndex: number;
  imageBytes: number[];
  variant: number;         // 0-3 (4 variants per scene)
  backgroundType: 'white' | 'full';
}

export interface SelectSceneImageMessage {
  type: 'SELECT_SCENE_IMAGE';
  pageIndex: number;
  variant: number;
}

export interface PlaceDialogueMessage {
  type: 'PLACE_DIALOGUE';
  pageIndex: number;
  template: 'plain' | 'border-a' | 'border-b';
}

export interface InsertPageNumbersMessage {
  type: 'INSERT_PAGE_NUMBERS';
  brandText: string;  // "Pronounce Korean"
}

export interface ApplyKeyExpressionsMessage {
  type: 'APPLY_KEY_EXPRESSIONS';
  expressions: Array<{
    pageIndex: number;
    pageLayout: Part3PageLayout;
    cards: Array<ExpressionCard & { selectedImageIndex: number }>;
  }>;
}

export interface GenerateFinalOutputMessage {
  type: 'GENERATE_FINAL_OUTPUT';
  outputType: 'spread' | 'individual' | 'both';
}

export interface CreateInnerPagesMessage {
  type: 'CREATE_INNER_PAGES';
  pages: string[];  // list of inner page type identifiers
  keyColorA: string;
  keyColorB: string;
  bookTitle?: string;
  bookTitleEn?: string;
}

export interface CreateCoverMessage {
  type: 'CREATE_COVER';
  imageBytes: number[];
  titleKo: string;
  titleEn: string;
  keyColorA: string;
  keyColorB: string;
}

export interface SaveSceneAnalysisMessage {
  type: 'SAVE_SCENE_ANALYSIS';
  pages: Array<{
    pageIndex: number;
    characters: Array<{ characterId: string; action: string }>;
    sceneDescription: string;
    imagePrompt: string;
    backgroundType: 'white' | 'full';
  }>;
  characterNames: Record<string, string>;
}

export interface SaveBulkTranslationsMessage {
  type: 'SAVE_BULK_TRANSLATIONS';
  pages: Array<{
    pageIndex: number;
    koreanBlocks: string[][];
    englishBlocks: string[][];
  }>;
}

export interface SaveStoryTextMessage {
  type: 'SAVE_STORY_TEXT';
  title: string;
  text: string;
}

export interface SaveCharacterImageMessage {
  type: 'SAVE_CHARACTER_IMAGE';
  characterId: string;
  characterName: string;
  imageBytes: number[];
}

export interface SaveToGalleryMessage {
  type: 'SAVE_TO_GALLERY';
  category: 'style' | 'character' | 'scene' | 'cover';
  imageId: string;
  imageBytes: number[];
  label: string;
  metadata?: string;
}

export interface LoadGalleryMessage {
  type: 'LOAD_GALLERY';
}

export interface DetectStepStatusMessage {
  type: 'DETECT_STEP_STATUS';
}

export interface StepStatusDetectedMessage {
  type: 'STEP_STATUS_DETECTED';
  detectedSteps: number[];
  details: Record<number, string>;
  snapshotInfo: Array<{ slot: number; label: string; timestamp: string; hasState?: boolean }>;
}

export interface GalleryLoadedMessage {
  type: 'GALLERY_LOADED';
  entries: Array<{
    category: string;
    imageId: string;
    label: string;
    metadata?: string;
  }>;
}

// ---- Pipeline Messages: Sandbox → UI ----

export interface PipelineStateLoadedMessage {
  type: 'PIPELINE_STATE_LOADED';
  state: import('./pipeline').PipelineState | null;
}

export interface StoryPagesCreatedMessage {
  type: 'STORY_PAGES_CREATED';
  pageFrameIds: string[];
  pageCount: number;
}

export interface StyleGuideSavedMessage {
  type: 'STYLE_GUIDE_SAVED';
  success: boolean;
}

export interface SceneImageStoredMessage {
  type: 'SCENE_IMAGE_STORED';
  pageIndex: number;
  variant: number;
  imageHash: string;
}

export interface SnapshotCreatedMessage {
  type: 'SNAPSHOT_CREATED';
  slot: number;
  label: string;
}

export interface SnapshotRestoredMessage {
  type: 'SNAPSHOT_RESTORED';
  success: boolean;
  slot: number;
}

export interface Part2PagesCreatedMessage {
  type: 'PART2_PAGES_CREATED';
  pageCount: number;
}

export interface Part3LayoutCreatedMessage {
  type: 'PART3_LAYOUT_CREATED';
  pageCount: number;
}

export interface FinalOutputGeneratedMessage {
  type: 'FINAL_OUTPUT_GENERATED';
  spreadPageName?: string;
  individualPageName?: string;
}

export interface PageNumbersInsertedMessage {
  type: 'PAGE_NUMBERS_INSERTED';
  count: number;
}

export interface InnerPagesCreatedMessage {
  type: 'INNER_PAGES_CREATED';
  pageCount: number;
}

export interface CoverCreatedMessage {
  type: 'COVER_CREATED';
  success: boolean;
}

export interface SceneAnalysisSavedMessage {
  type: 'SCENE_ANALYSIS_SAVED';
  success: boolean;
}

export interface BulkTranslationsSavedMessage {
  type: 'BULK_TRANSLATIONS_SAVED';
  success: boolean;
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
  | CheckRefFrameMessage
  | CleanupGuidesMessage
  | UpdateContentIdMapMessage
  | InitStorageMessage
  | CheckStorageMessage
  | AddGuidesMessage
  | RemoveBgMessage
  | UpdateCardEnMessage
  | UpdateCardTranslationsMessage
  | SavePipelineStateMessage
  | LoadPipelineStateMessage
  | CreateStoryPagesMessage
  | UpdateStoryPagesMessage
  | SaveStyleGuideMessage
  | SaveCharactersMessage
  | SaveKeyColorsMessage
  | NavigateToFrameMessage
  | CreateSnapshotMessage
  | UpdateProgressDisplayMessage
  | CreatePart2PagesMessage
  | CreatePart3LayoutMessage
  | ApplyKeyExpressionsMessage
  | StoreSceneImageMessage
  | SelectSceneImageMessage
  | PlaceDialogueMessage
  | InsertPageNumbersMessage
  | GenerateFinalOutputMessage
  | CreateInnerPagesMessage
  | CreateCoverMessage
  | SaveSceneAnalysisMessage
  | SaveBulkTranslationsMessage
  | SaveStoryTextMessage
  | SaveCharacterImageMessage
  | SaveToGalleryMessage
  | LoadGalleryMessage
  | DetectStepStatusMessage
  | RestoreSnapshotMessage;

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
  | ImageThumbnailMessage
  | StorageStatusMessage
  | GuidesStatusMessage
  | CardSelectedMessage
  | CardsSelectedMessage
  | CardImageForBgRemovalMessage
  | RemoveBgDoneMessage
  | ErrorMessage
  | PipelineStateLoadedMessage
  | StoryPagesCreatedMessage
  | StyleGuideSavedMessage
  | SceneImageStoredMessage
  | SnapshotCreatedMessage
  | Part2PagesCreatedMessage
  | Part3LayoutCreatedMessage
  | FinalOutputGeneratedMessage
  | PageNumbersInsertedMessage
  | InnerPagesCreatedMessage
  | CoverCreatedMessage
  | SceneAnalysisSavedMessage
  | BulkTranslationsSavedMessage
  | GalleryLoadedMessage
  | StepStatusDetectedMessage
  | SnapshotRestoredMessage;
