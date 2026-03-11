// Frame dimensions
export const FRAME_WIDTH = 7452;
export const FRAME_HEIGHT = 3780;
export const HALF_PAGE_WIDTH = FRAME_WIDTH / 2; // 3726

// Title area
export const TITLE_HEIGHT = 500;

// Cell dimensions (fixed)
export const GRID_COLS = 8;
export const GRID_ROWS = 8;
export const CELL_GAP = 40;
export const CELL_WIDTH = 380;
export const CELL_HEIGHT = 363;
export const DEFAULT_COL_SPAN = 2;
export const DEFAULT_ROW_SPAN = 2;
export const TALL_ROW_SPAN = 4; // rowSpan for 3+ line cards
export const MAX_EXPANSION = 2; // max cells a card can grow during row expansion
export const MULTILINE_THRESHOLD = 3; // lines >= this triggers tall card

// Grid centering: center the grid on the page
const TOTAL_GRID_WIDTH = GRID_COLS * CELL_WIDTH + (GRID_COLS - 1) * CELL_GAP;
const TOTAL_GRID_HEIGHT = GRID_ROWS * CELL_HEIGHT + (GRID_ROWS - 1) * CELL_GAP;
export const GRID_MARGIN_LEFT = Math.round((HALF_PAGE_WIDTH - TOTAL_GRID_WIDTH) / 2);
export const GRID_START_Y = Math.round((FRAME_HEIGHT - TOTAL_GRID_HEIGHT) / 2);

// Card styling
export const CARD_IMAGE_RATIO = 0.67; // top 67% for image
export const SIZING_TEXT_RATIO = 0.5; // 50% of card height as text budget for sizing decisions
export const CARD_KO_TEXT_RATIO = 0.57; // Korean text takes 57% of text area
export const CARD_EN_TEXT_RATIO = 0.43; // English text takes 43% of text area

// Card stroke & corner radius (fixed values)
export const CARD_STROKE_WEIGHT = 13;
export const CARD_CORNER_RADIUS = 54;
export const CARD_IMG_CORNER_RADIUS = 38;

// Colors
export const DEFAULT_BG_COLOR = '#FFCF66';
export const CARD_BG_COLOR = '#FFFFFF';
export const CARD_STROKE_COLOR = '#FFB74A';
export const CARD_EN_TEXT_COLOR = '#6A6A6A';
export const GUIDELINE_COLOR = '#CCCCCC';
export const TITLE_HIGHLIGHT_COLOR = '#FFE082';

// Image storage
export const STORAGE_GAP = 500; // gap between main frame and storage
export const STORAGE_IMAGE_SIZE = 200;

// Default font
export const DEFAULT_FONT_FAMILY = 'NanumSquareRound';
export const DEFAULT_FONT_SIZE = 100;
export const CARD_EN_FONT_SIZE = 66;
export const CARD_EN_PLACEHOLDER = '영어 번역';
export const TITLE_FONT_FAMILY = 'Inter';
export const TITLE_FONT_SIZE = 72;
