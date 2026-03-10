// Frame dimensions
export const FRAME_WIDTH = 7452;
export const FRAME_HEIGHT = 3780;
export const HALF_PAGE_WIDTH = FRAME_WIDTH / 2; // 3726

// Title area
export const TITLE_HEIGHT = 500;

// Grid margins
export const GRID_MARGIN_TOP = 200;
export const GRID_MARGIN_BOTTOM = 150;
export const GRID_MARGIN_LEFT = 200;
export const GRID_MARGIN_RIGHT = 200;
export const GRID_CENTER_GAP = 200; // gap at center fold

// Cell dimensions
export const GRID_COLS = 4;
export const GRID_ROWS = 4;
export const CELL_GAP = 40;

// Calculated cell size
export const CELL_WIDTH = Math.floor(
  (HALF_PAGE_WIDTH - GRID_MARGIN_LEFT - GRID_MARGIN_RIGHT - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS
); // ≈ 801
export const CELL_HEIGHT = Math.floor(
  (FRAME_HEIGHT - TITLE_HEIGHT - GRID_MARGIN_TOP - GRID_MARGIN_BOTTOM - CELL_GAP * (GRID_ROWS - 1)) / GRID_ROWS
); // ≈ 702

// Card styling
export const CARD_IMAGE_RATIO = 0.75; // top 75% for image
export const CARD_TEXT_RATIO = 0.25;  // bottom 25% for text

// Card stroke & corner radius (proportional to min(width, height))
// Reference: 726×760 card → 11px stroke, 56px radius
export const CARD_STROKE_RATIO = 0.01515;  // 11 / 726
export const CARD_CORNER_RATIO = 0.077;    // 56 / 726

// Colors
export const DEFAULT_BG_COLOR = '#FFCF66';
export const CARD_BG_COLOR = '#FFFFFF';
export const CARD_STROKE_COLOR = '#FFB74A';
export const GUIDELINE_COLOR = '#CCCCCC';
export const TITLE_HIGHLIGHT_COLOR = '#FFE082';

// Image storage
export const STORAGE_GAP = 500; // gap between main frame and storage
export const STORAGE_IMAGE_SIZE = 200;

// Default font
export const DEFAULT_FONT_FAMILY = 'NanumSquareRound';
export const DEFAULT_FONT_SIZE = 120;
export const TITLE_FONT_FAMILY = 'Inter';
export const TITLE_FONT_SIZE = 72;
