export async function copyPngToClipboard(blob: Blob): Promise<void> {
  if (!('clipboard' in navigator) || !('ClipboardItem' in window)) throw new Error('当前浏览器不支持图片剪贴板');
  const clipboardItem = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([clipboardItem]);
}
