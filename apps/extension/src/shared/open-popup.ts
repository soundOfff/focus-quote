/** Ask the service worker to open the browser-action popup (user gesture only). */
export function requestOpenExtensionPopup(): void {
  chrome.runtime.sendMessage(
    { type: "focusquote.ui.openPopup" } as const,
    () => {
      void chrome.runtime.lastError
    },
  )
}
