/**
 * Converts a Uint8Array to a base64 string.
 * In the Figma plugin sandbox there is no `window`, `btoa`, or `Buffer`.
 * Manual base64 encoding is required.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? chars[((b1 & 0xf) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b2 & 0x3f] : '=';
  }
  return result;
}

/**
 * Finds a frame by name on the current page and exports it as a
 * base64-encoded PNG at 0.5x scale.
 */
export async function exportRefFrame(frameName: string): Promise<string> {
  // Search the current page for a matching frame
  const node = figma.currentPage.findOne(
    (n) => n.name === frameName && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE')
  );

  if (!node) {
    throw new Error(`Frame "${frameName}" not found on the current page.`);
  }

  // Export as PNG at half scale
  const pngBytes = await node.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: 0.5 },
  });

  // Convert to base64 for transmission to the UI layer
  const base64 = uint8ArrayToBase64(pngBytes);
  return base64;
}
