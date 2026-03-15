/**
 * Inner page creation (Step 19) — intro, index, QR, characters, part titles, class info, etc.
 */

import { getPartRightX } from './canvasHelpers';
import { hexToFigmaColor } from '../frameBuilder';
import {
  STORY_PAGE_WIDTH,
  STORY_PAGE_HEIGHT,
  PAGES_PER_ROW,
  PAGE_GAP_H,
  PAGE_GAP_V,
  KEY_COLOR_A,
} from '../../shared/constants';
import { PLUGIN_DATA_KEYS } from '../../shared/naming';

export const INNER_PAGE_TEMPLATES: Record<string, { title: string; hasImage: boolean }> = {
  'intro': { title: 'Pronounce Korean', hasImage: false },
  'index': { title: 'Index', hasImage: false },
  'qr-title': { title: 'QR Resources', hasImage: false },
  'qr-guide': { title: 'QR Resources Guide', hasImage: true },
  'characters': { title: 'Characters', hasImage: true },
  'part1-title': { title: 'Part 1 - Korean', hasImage: false },
  'part2-title': { title: 'Part 2 - Korean + English', hasImage: false },
  'part3-title': { title: 'Part 3 - Korean + Key Expressions', hasImage: false },
  'blank-back': { title: '', hasImage: false },
  'class-info': { title: '1:1 Class', hasImage: false },
};

/**
 * Create inner page frames for each selected page type.
 * Positions all inner pages below the last part section with a separator gap.
 */
export async function createInnerPages(
  pageTypes: string[],
  keyColorA: string,
  keyColorB: string,
  bookTitle?: string,
  bookTitleEn?: string
): Promise<number> {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  const colorA = hexToFigmaColor(keyColorA || KEY_COLOR_A);
  const colorB = hexToFigmaColor(keyColorB || '#FFF69B');
  const WHITE: RGB = { r: 1, g: 1, b: 1 };
  const DARK_TEXT: RGB = { r: 0.13, g: 0.13, b: 0.13 };
  const GRAY_TEXT: RGB = { r: 0.5, g: 0.5, b: 0.5 };
  const LIGHT_GRAY: RGB = { r: 0.85, g: 0.85, b: 0.85 };

  // Remove existing inner page frames
  const existingInner = figma.currentPage.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('PK-Inner-')
  ) as FrameNode[];
  for (const f of existingInner) f.remove();

  // Find the right-most X position of the last part to position inner pages to the right
  const part3Right = getPartRightX('PK-Part3-Page');
  const part2Right = getPartRightX('PK-Part2-Page');
  const part1Right = getPartRightX('PK-Part1-Page');
  const referenceRight = Math.max(part3Right, part2Right, part1Right);
  const innerPartGap = STORY_PAGE_WIDTH + PAGE_GAP_H;
  const innerStartX = referenceRight > 0 ? referenceRight + innerPartGap : 0;

  const displayBookTitle = bookTitle || '';
  const displayBookTitleEn = bookTitleEn || 'Pronounce Korean';

  let createdCount = 0;

  for (let i = 0; i < pageTypes.length; i++) {
    const pageType = pageTypes[i];
    const template = INNER_PAGE_TEMPLATES[pageType];
    if (!template) continue;

    // Calculate position (2 per row, to the right of the last part)
    const col = i % PAGES_PER_ROW;
    const row = Math.floor(i / PAGES_PER_ROW);
    const x = innerStartX + col * (STORY_PAGE_WIDTH + PAGE_GAP_H);
    const y = row * (STORY_PAGE_HEIGHT + PAGE_GAP_V);

    // Create the frame
    const frame = figma.createFrame();
    frame.name = `PK-Inner-${pageType}`;
    frame.resize(STORY_PAGE_WIDTH, STORY_PAGE_HEIGHT);
    frame.x = x;
    frame.y = y;
    frame.setPluginData(PLUGIN_DATA_KEYS.nodeType, 'story-page');

    // Build content based on page type
    switch (pageType) {
      case 'part1-title':
      case 'part2-title':
      case 'part3-title': {
        // Title pages: Key color A background, large centered title, book title at top
        frame.fills = [{ type: 'SOLID', color: colorA }];

        // Book title at top
        if (displayBookTitleEn) {
          const topTitle = figma.createText();
          topTitle.fontName = { family: 'Inter', style: 'Regular' };
          topTitle.characters = displayBookTitleEn;
          topTitle.fontSize = 120;
          topTitle.fills = [{ type: 'SOLID', color: WHITE }];
          topTitle.textAlignHorizontal = 'CENTER';
          topTitle.resize(STORY_PAGE_WIDTH - 400, 200);
          topTitle.x = 200;
          topTitle.y = 400;
          frame.appendChild(topTitle);
        }

        if (displayBookTitle) {
          const topTitleKo = figma.createText();
          topTitleKo.fontName = { family: 'Inter', style: 'Regular' };
          topTitleKo.characters = displayBookTitle;
          topTitleKo.fontSize = 80;
          topTitleKo.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
          topTitleKo.textAlignHorizontal = 'CENTER';
          topTitleKo.resize(STORY_PAGE_WIDTH - 400, 150);
          topTitleKo.x = 200;
          topTitleKo.y = 620;
          frame.appendChild(topTitleKo);
        }

        // Large centered part title
        const partTitle = figma.createText();
        partTitle.fontName = { family: 'Inter', style: 'Bold' };
        partTitle.characters = template.title;
        partTitle.fontSize = 200;
        partTitle.fills = [{ type: 'SOLID', color: WHITE }];
        partTitle.textAlignHorizontal = 'CENTER';
        partTitle.resize(STORY_PAGE_WIDTH - 200, 400);
        partTitle.textAutoResize = 'HEIGHT';
        partTitle.x = 100;
        partTitle.y = STORY_PAGE_HEIGHT / 2 - 200;
        frame.appendChild(partTitle);

        // Decorative line
        const line = figma.createRectangle();
        line.resize(800, 8);
        line.x = (STORY_PAGE_WIDTH - 800) / 2;
        line.y = STORY_PAGE_HEIGHT / 2 + 250;
        line.fills = [{ type: 'SOLID', color: WHITE }];
        line.opacity = 0.6;
        frame.appendChild(line);
        break;
      }

      case 'index': {
        // Index page: White background, "Index / 목차" title, placeholder lines
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const indexTitle = figma.createText();
        indexTitle.fontName = { family: 'Inter', style: 'Bold' };
        indexTitle.characters = 'Index / 목차';
        indexTitle.fontSize = 160;
        indexTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        indexTitle.textAlignHorizontal = 'CENTER';
        indexTitle.resize(STORY_PAGE_WIDTH - 400, 250);
        indexTitle.x = 200;
        indexTitle.y = 300;
        frame.appendChild(indexTitle);

        // Divider line below title
        const divider = figma.createRectangle();
        divider.resize(STORY_PAGE_WIDTH - 600, 4);
        divider.x = 300;
        divider.y = 620;
        divider.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        frame.appendChild(divider);

        // Placeholder lines for page entries
        const lineStartY = 750;
        const lineSpacing = 140;
        const placeholderEntries = [
          'Part 1 — Korean ........................ 00',
          'Part 2 — Korean + English .............. 00',
          'Part 3 — Korean + Key Expressions ...... 00',
          'QR Resources ........................... 00',
          'Characters ............................. 00',
        ];

        for (let lineIdx = 0; lineIdx < placeholderEntries.length; lineIdx++) {
          const entryText = figma.createText();
          entryText.fontName = { family: 'Inter', style: 'Regular' };
          entryText.characters = placeholderEntries[lineIdx];
          entryText.fontSize = 80;
          entryText.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
          entryText.textAlignHorizontal = 'LEFT';
          entryText.resize(STORY_PAGE_WIDTH - 600, 120);
          entryText.x = 300;
          entryText.y = lineStartY + lineIdx * lineSpacing;
          frame.appendChild(entryText);
        }
        break;
      }

      case 'intro': {
        // Intro page: Key color B background, title, description placeholder
        frame.fills = [{ type: 'SOLID', color: colorB }];

        const introTitle = figma.createText();
        introTitle.fontName = { family: 'Inter', style: 'Bold' };
        introTitle.characters = 'Pronounce Korean';
        introTitle.fontSize = 180;
        introTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        introTitle.textAlignHorizontal = 'CENTER';
        introTitle.resize(STORY_PAGE_WIDTH - 300, 300);
        introTitle.x = 150;
        introTitle.y = 600;
        frame.appendChild(introTitle);

        // Subtitle
        const subtitle = figma.createText();
        subtitle.fontName = { family: 'Inter', style: 'Regular' };
        subtitle.characters = '한국어 발음 학습 시리즈';
        subtitle.fontSize = 100;
        subtitle.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        subtitle.textAlignHorizontal = 'CENTER';
        subtitle.resize(STORY_PAGE_WIDTH - 300, 160);
        subtitle.x = 150;
        subtitle.y = 950;
        frame.appendChild(subtitle);

        // Description placeholder
        const descPlaceholder = figma.createText();
        descPlaceholder.fontName = { family: 'Inter', style: 'Regular' };
        descPlaceholder.characters = '[ 소개 내용을 여기에 작성하세요 ]\n\nThis book will help you learn Korean pronunciation\nthrough dialogues and key expressions.\n\n이 책은 대화와 핵심 표현을 통해\n한국어 발음을 배울 수 있도록 도와줍니다.';
        descPlaceholder.fontSize = 72;
        descPlaceholder.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        descPlaceholder.textAlignHorizontal = 'CENTER';
        descPlaceholder.resize(STORY_PAGE_WIDTH - 600, 1200);
        descPlaceholder.textAutoResize = 'HEIGHT';
        descPlaceholder.x = 300;
        descPlaceholder.y = 1400;
        frame.appendChild(descPlaceholder);
        break;
      }

      case 'qr-title': {
        // QR Title page: White background, title, QR placeholder
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const qrTitle = figma.createText();
        qrTitle.fontName = { family: 'Inter', style: 'Bold' };
        qrTitle.characters = 'QR Resources';
        qrTitle.fontSize = 160;
        qrTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        qrTitle.textAlignHorizontal = 'CENTER';
        qrTitle.resize(STORY_PAGE_WIDTH - 400, 250);
        qrTitle.x = 200;
        qrTitle.y = 400;
        frame.appendChild(qrTitle);

        const qrSubtitle = figma.createText();
        qrSubtitle.fontName = { family: 'Inter', style: 'Regular' };
        qrSubtitle.characters = 'QR 코드로 학습 자료에 접근하세요';
        qrSubtitle.fontSize = 80;
        qrSubtitle.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        qrSubtitle.textAlignHorizontal = 'CENTER';
        qrSubtitle.resize(STORY_PAGE_WIDTH - 400, 130);
        qrSubtitle.x = 200;
        qrSubtitle.y = 700;
        frame.appendChild(qrSubtitle);

        // QR placeholder square
        const qrSize = 800;
        const qrPlaceholder = figma.createRectangle();
        qrPlaceholder.resize(qrSize, qrSize);
        qrPlaceholder.x = (STORY_PAGE_WIDTH - qrSize) / 2;
        qrPlaceholder.y = 1200;
        qrPlaceholder.fills = [{ type: 'SOLID', color: LIGHT_GRAY }];
        qrPlaceholder.cornerRadius = 40;
        qrPlaceholder.strokes = [{ type: 'SOLID', color: GRAY_TEXT }];
        qrPlaceholder.strokeWeight = 4;
        frame.appendChild(qrPlaceholder);

        // QR label inside placeholder
        const qrLabel = figma.createText();
        qrLabel.fontName = { family: 'Inter', style: 'Regular' };
        qrLabel.characters = '[ QR Code ]';
        qrLabel.fontSize = 80;
        qrLabel.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        qrLabel.textAlignHorizontal = 'CENTER';
        qrLabel.resize(qrSize, 120);
        qrLabel.x = (STORY_PAGE_WIDTH - qrSize) / 2;
        qrLabel.y = 1200 + (qrSize - 120) / 2;
        frame.appendChild(qrLabel);
        break;
      }

      case 'qr-guide': {
        // QR Guide page: White background, instructions, QR placeholder
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const guideTitle = figma.createText();
        guideTitle.fontName = { family: 'Inter', style: 'Bold' };
        guideTitle.characters = 'QR Resources Guide';
        guideTitle.fontSize = 140;
        guideTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        guideTitle.textAlignHorizontal = 'CENTER';
        guideTitle.resize(STORY_PAGE_WIDTH - 400, 220);
        guideTitle.x = 200;
        guideTitle.y = 300;
        frame.appendChild(guideTitle);

        // Guide steps placeholder
        const guideSteps = figma.createText();
        guideSteps.fontName = { family: 'Inter', style: 'Regular' };
        guideSteps.characters = '1. 스마트폰 카메라로 QR 코드를 스캔하세요\n\n2. 링크를 클릭하여 학습 자료에 접근하세요\n\n3. 음성 파일과 추가 학습 자료를 확인하세요';
        guideSteps.fontSize = 72;
        guideSteps.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        guideSteps.textAlignHorizontal = 'LEFT';
        guideSteps.resize(STORY_PAGE_WIDTH - 600, 1000);
        guideSteps.textAutoResize = 'HEIGHT';
        guideSteps.x = 300;
        guideSteps.y = 700;
        frame.appendChild(guideSteps);

        // Image placeholder for guide illustration
        const imgPlaceholder = figma.createRectangle();
        imgPlaceholder.resize(STORY_PAGE_WIDTH - 600, 1200);
        imgPlaceholder.x = 300;
        imgPlaceholder.y = 1800;
        imgPlaceholder.fills = [{ type: 'SOLID', color: LIGHT_GRAY }];
        imgPlaceholder.cornerRadius = 30;
        frame.appendChild(imgPlaceholder);

        const imgLabel = figma.createText();
        imgLabel.fontName = { family: 'Inter', style: 'Regular' };
        imgLabel.characters = '[ 안내 이미지 ]';
        imgLabel.fontSize = 80;
        imgLabel.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        imgLabel.textAlignHorizontal = 'CENTER';
        imgLabel.resize(STORY_PAGE_WIDTH - 600, 120);
        imgLabel.x = 300;
        imgLabel.y = 1800 + (1200 - 120) / 2;
        frame.appendChild(imgLabel);
        break;
      }

      case 'characters': {
        // Characters page: White background, title, placeholder grid
        frame.fills = [{ type: 'SOLID', color: WHITE }];

        const charTitle = figma.createText();
        charTitle.fontName = { family: 'Inter', style: 'Bold' };
        charTitle.characters = 'Characters';
        charTitle.fontSize = 160;
        charTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
        charTitle.textAlignHorizontal = 'CENTER';
        charTitle.resize(STORY_PAGE_WIDTH - 400, 250);
        charTitle.x = 200;
        charTitle.y = 300;
        frame.appendChild(charTitle);

        const charSubtitle = figma.createText();
        charSubtitle.fontName = { family: 'Inter', style: 'Regular' };
        charSubtitle.characters = '등장인물 소개';
        charSubtitle.fontSize = 80;
        charSubtitle.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        charSubtitle.textAlignHorizontal = 'CENTER';
        charSubtitle.resize(STORY_PAGE_WIDTH - 400, 130);
        charSubtitle.x = 200;
        charSubtitle.y = 580;
        frame.appendChild(charSubtitle);

        // Character placeholder grid (2x3 grid)
        const charGridCols = 2;
        const charGridRows = 3;
        const charCardW = 1200;
        const charCardH = 800;
        const charGap = 100;
        const charGridStartX = (STORY_PAGE_WIDTH - (charGridCols * charCardW + (charGridCols - 1) * charGap)) / 2;
        const charGridStartY = 850;

        for (let r = 0; r < charGridRows; r++) {
          for (let c = 0; c < charGridCols; c++) {
            const charCard = figma.createFrame();
            charCard.name = `character-slot-${r * charGridCols + c}`;
            charCard.resize(charCardW, charCardH);
            charCard.x = charGridStartX + c * (charCardW + charGap);
            charCard.y = charGridStartY + r * (charCardH + charGap);
            charCard.fills = [{ type: 'SOLID', color: LIGHT_GRAY }];
            charCard.cornerRadius = 30;

            // Character image placeholder (circle)
            const circleSize = 300;
            const circle = figma.createEllipse();
            circle.resize(circleSize, circleSize);
            circle.x = (charCardW - circleSize) / 2;
            circle.y = 80;
            circle.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
            charCard.appendChild(circle);

            // Name placeholder
            const charName = figma.createText();
            charName.fontName = { family: 'Inter', style: 'Bold' };
            charName.characters = `캐릭터 ${r * charGridCols + c + 1}`;
            charName.fontSize = 60;
            charName.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
            charName.textAlignHorizontal = 'CENTER';
            charName.resize(charCardW - 100, 90);
            charName.x = 50;
            charName.y = 430;
            charCard.appendChild(charName);

            // Description placeholder
            const charDesc = figma.createText();
            charDesc.fontName = { family: 'Inter', style: 'Regular' };
            charDesc.characters = '[ 설명 ]';
            charDesc.fontSize = 44;
            charDesc.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
            charDesc.textAlignHorizontal = 'CENTER';
            charDesc.resize(charCardW - 100, 70);
            charDesc.x = 50;
            charDesc.y = 550;
            charCard.appendChild(charDesc);

            frame.appendChild(charCard);
          }
        }
        break;
      }

      case 'blank-back': {
        // Blank page: Plain white, empty
        frame.fills = [{ type: 'SOLID', color: WHITE }];
        // Intentionally left empty
        break;
      }

      case 'class-info': {
        // Class info: Key color A background, centered text
        frame.fills = [{ type: 'SOLID', color: colorA }];

        const classTitle = figma.createText();
        classTitle.fontName = { family: 'Inter', style: 'Bold' };
        classTitle.characters = '1:1 한국어 대화 수업';
        classTitle.fontSize = 180;
        classTitle.fills = [{ type: 'SOLID', color: WHITE }];
        classTitle.textAlignHorizontal = 'CENTER';
        classTitle.resize(STORY_PAGE_WIDTH - 300, 280);
        classTitle.x = 150;
        classTitle.y = 800;
        frame.appendChild(classTitle);

        const classSubtitle = figma.createText();
        classSubtitle.fontName = { family: 'Inter', style: 'Regular' };
        classSubtitle.characters = '1:1 Korean Conversation Class';
        classSubtitle.fontSize = 100;
        classSubtitle.fills = [{ type: 'SOLID', color: WHITE }];
        classSubtitle.textAlignHorizontal = 'CENTER';
        classSubtitle.resize(STORY_PAGE_WIDTH - 300, 160);
        classSubtitle.x = 150;
        classSubtitle.y = 1150;
        frame.appendChild(classSubtitle);

        // Decorative line
        const classLine = figma.createRectangle();
        classLine.resize(600, 6);
        classLine.x = (STORY_PAGE_WIDTH - 600) / 2;
        classLine.y = 1450;
        classLine.fills = [{ type: 'SOLID', color: WHITE }];
        classLine.opacity = 0.7;
        frame.appendChild(classLine);

        // Description
        const classDesc = figma.createText();
        classDesc.fontName = { family: 'Inter', style: 'Regular' };
        classDesc.characters = '[ 수업 안내 내용을 여기에 작성하세요 ]\n\nQR 코드를 스캔하여 수업을 신청하세요';
        classDesc.fontSize = 72;
        classDesc.fills = [{ type: 'SOLID', color: WHITE }];
        classDesc.textAlignHorizontal = 'CENTER';
        classDesc.resize(STORY_PAGE_WIDTH - 600, 600);
        classDesc.textAutoResize = 'HEIGHT';
        classDesc.x = 300;
        classDesc.y = 1600;
        frame.appendChild(classDesc);

        // QR placeholder for class registration
        const classQrSize = 600;
        const classQr = figma.createRectangle();
        classQr.resize(classQrSize, classQrSize);
        classQr.x = (STORY_PAGE_WIDTH - classQrSize) / 2;
        classQr.y = 2300;
        classQr.fills = [{ type: 'SOLID', color: WHITE }];
        classQr.cornerRadius = 30;
        frame.appendChild(classQr);

        const classQrLabel = figma.createText();
        classQrLabel.fontName = { family: 'Inter', style: 'Regular' };
        classQrLabel.characters = '[ QR Code ]';
        classQrLabel.fontSize = 60;
        classQrLabel.fills = [{ type: 'SOLID', color: GRAY_TEXT }];
        classQrLabel.textAlignHorizontal = 'CENTER';
        classQrLabel.resize(classQrSize, 90);
        classQrLabel.x = (STORY_PAGE_WIDTH - classQrSize) / 2;
        classQrLabel.y = 2300 + (classQrSize - 90) / 2;
        frame.appendChild(classQrLabel);
        break;
      }

      default: {
        // Fallback: white page with title
        frame.fills = [{ type: 'SOLID', color: WHITE }];
        if (template.title) {
          const fallbackTitle = figma.createText();
          fallbackTitle.fontName = { family: 'Inter', style: 'Bold' };
          fallbackTitle.characters = template.title;
          fallbackTitle.fontSize = 160;
          fallbackTitle.fills = [{ type: 'SOLID', color: DARK_TEXT }];
          fallbackTitle.textAlignHorizontal = 'CENTER';
          fallbackTitle.resize(STORY_PAGE_WIDTH - 400, 250);
          fallbackTitle.x = 200;
          fallbackTitle.y = STORY_PAGE_HEIGHT / 2 - 125;
          frame.appendChild(fallbackTitle);
        }
        break;
      }
    }

    createdCount++;
  }

  // Zoom to show all inner pages
  const innerFrames = figma.currentPage.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('PK-Inner-')
  ) as SceneNode[];
  if (innerFrames.length > 0) {
    figma.viewport.scrollAndZoomIntoView(innerFrames);
  }

  return createdCount;
}
