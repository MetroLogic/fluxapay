/**
 * Copy text to the clipboard, falling back to a hidden `<textarea>` +
 * `document.execCommand("copy")` where the async Clipboard API is missing or
 * blocked (older browsers, non-secure origins, some embedded webviews).
 *
 * Resolves `true` when the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context — try the legacy path below.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  const previousFocus = document.activeElement as HTMLElement | null;
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
    previousFocus?.focus?.();
  }
  return copied;
}
