export interface CaptureRequestTab {
  id?: number;
  windowId?: number;
}

/** Continue Capture must target the tab that owns the overlay, not a newly active tab. */
export function resolveCaptureRequestTarget(senderTab: CaptureRequestTab | undefined, activeTab: CaptureRequestTab | undefined): CaptureRequestTab | undefined {
  return senderTab?.id !== undefined ? senderTab : activeTab;
}
