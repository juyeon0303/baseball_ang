export function createDebouncedFlush(
  flush: () => void,
  delayMs = 250,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, delayMs);
  };
}
