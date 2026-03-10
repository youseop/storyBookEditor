import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  STORAGE_GAP,
  STORAGE_IMAGE_SIZE,
} from '../shared/constants';

/**
 * Creates an image storage frame placed to the right of the main frame.
 * Used to hold generated image variants before they are assigned to cards.
 */
export function createStorageFrame(mainFrame: FrameNode): FrameNode {
  const keyExprId = mainFrame.getPluginData('keyExprId') || '';
  const storageFrame = figma.createFrame();
  storageFrame.name = `[KeyExpr] Image Storage #${keyExprId}`;
  storageFrame.setPluginData('keyExprId', keyExprId);
  storageFrame.resize(STORAGE_IMAGE_SIZE * 12, FRAME_HEIGHT);
  storageFrame.x = mainFrame.x + FRAME_WIDTH + STORAGE_GAP;
  storageFrame.y = mainFrame.y;
  storageFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  storageFrame.clipsContent = false;

  figma.currentPage.appendChild(storageFrame);
  return storageFrame;
}

/**
 * Stores an image in the storage frame, grouped by expression ID.
 * Returns the image hash that can later be used to assign the image to a card.
 */
export function storeImage(
  storageFrame: FrameNode,
  expressionId: string,
  expressionText: string,
  imageBytes: Uint8Array,
  prompt: string,
  index: number,
): string {
  // Create the image in Figma and get its hash
  var image = figma.createImage(imageBytes);
  var imageHash = image.hash;

  // Display name: Korean text (fallback to expressionId)
  var displayName = expressionText || expressionId;

  // Find or create a group frame for this expression
  var groupFrame = storageFrame.findOne(
    function(n) { return n.type === 'FRAME' && n.getPluginData('expressionId') === expressionId; }
  ) as FrameNode | null;

  if (!groupFrame) {
    groupFrame = figma.createFrame();
    groupFrame.name = `[store:${expressionId}] ${displayName}`;
    groupFrame.fills = [];
    groupFrame.setPluginData('expressionId', expressionId);
    // Stack groups vertically — find the actual bottom of existing groups
    var maxBottom = 0;
    for (var i = 0; i < storageFrame.children.length; i++) {
      var child = storageFrame.children[i];
      var childBottom = child.y + child.height;
      if (childBottom > maxBottom) {
        maxBottom = childBottom;
      }
    }
    groupFrame.x = 10;
    groupFrame.y = maxBottom + 20;
    groupFrame.resize(STORAGE_IMAGE_SIZE * 6, STORAGE_IMAGE_SIZE + 20);
    groupFrame.clipsContent = false;
    storageFrame.appendChild(groupFrame);
  }

  // Count existing children to determine position (prevents overlap)
  var existingCount = groupFrame.children.length;

  // Create the image rectangle inside the group
  var imgRect = figma.createRectangle();
  imgRect.name = `[store:${expressionId}:${index}] ${displayName}`;
  imgRect.resize(STORAGE_IMAGE_SIZE, STORAGE_IMAGE_SIZE);
  imgRect.x = existingCount * (STORAGE_IMAGE_SIZE + 10);
  imgRect.y = 0;
  imgRect.fills = [
    {
      type: 'IMAGE',
      imageHash: imageHash,
      scaleMode: 'FIT',
    },
  ];
  // Store metadata as plugin data
  imgRect.setPluginData('prompt', prompt);
  imgRect.setPluginData('expressionId', expressionId);
  imgRect.setPluginData('imageHash', imageHash);
  imgRect.setPluginData('imageIndex', String(index));

  groupFrame.appendChild(imgRect);

  return imageHash;
}

/**
 * Assigns a stored image (by hash) to the [img:expressionId] frame inside a card.
 */
export function assignImage(
  mainFrame: FrameNode,
  expressionId: string,
  imageHash: string,
): boolean {
  // Find the card frame by expression ID
  var cardFrame = findCardByExpressionId(mainFrame, expressionId);
  if (!cardFrame) return false;

  // Find the [img:expressionId] frame
  var imgFrame = cardFrame.findOne(
    function(n) { return n.name === `[img:${expressionId}]` && n.type === 'FRAME'; }
  ) as FrameNode | null;

  // Fallback: match by legacy [img] name or any [img:*] pattern
  if (!imgFrame) {
    imgFrame = cardFrame.findOne(
      function(n) { return n.type === 'FRAME' && (n.name === '[img]' || n.name.startsWith('[img:')); }
    ) as FrameNode | null;
  }
  if (!imgFrame) return false;

  // Update img frame name to current ID
  imgFrame.name = `[img:${expressionId}]`;

  // Remove existing image children (for re-assignment)
  for (var i = imgFrame.children.length - 1; i >= 0; i--) {
    imgFrame.children[i].remove();
  }

  // Create image rectangle as child of the [img] frame
  var imgRect = figma.createRectangle();
  imgRect.name = `[image:${expressionId}]`;
  imgRect.resize(imgFrame.width, imgFrame.height);
  imgRect.x = 0;
  imgRect.y = 0;
  imgRect.fills = [
    {
      type: 'IMAGE',
      imageHash: imageHash,
      scaleMode: 'FIT',
    },
  ];
  imgRect.setPluginData('expressionId', expressionId);
  imgRect.setPluginData('imageHash', imageHash);

  // Clear the placeholder background
  imgFrame.fills = [];
  imgFrame.appendChild(imgRect);

  return true;
}

/**
 * Swaps the image on a card to a different stored variant.
 */
export function swapImage(
  mainFrame: FrameNode,
  expressionId: string,
  newImageHash: string,
): boolean {
  return assignImage(mainFrame, expressionId, newImageHash);
}

/**
 * Finds a card frame by expression ID within the main frame.
 * Cards are named "[card:expressionId] <text>" with expressionId in plugin data.
 */
function findCardByExpressionId(
  mainFrame: FrameNode,
  expressionId: string,
): FrameNode | null {
  // First, try to find by plugin data
  const byPluginData = mainFrame.findOne((n) => {
    if (n.type !== 'FRAME') return false;
    try {
      return n.getPluginData('expressionId') === expressionId;
    } catch {
      return false;
    }
  }) as FrameNode | null;

  if (byPluginData) return byPluginData;

  // Fallback: match by name pattern [card:expressionId]
  const byName = mainFrame.findOne(
    (n) => n.type === 'FRAME' && n.name.startsWith(`[card:${expressionId}]`)
  ) as FrameNode | null;

  if (byName) return byName;

  // Legacy fallback: scan [card] or [card:*] frames
  const cardFrames = mainFrame.findAll(
    (n) => n.type === 'FRAME' && n.name.startsWith('[card')
  ) as FrameNode[];

  for (const card of cardFrames) {
    const storedId = card.getPluginData('expressionId');
    if (storedId === expressionId) return card;
  }

  return null;
}
