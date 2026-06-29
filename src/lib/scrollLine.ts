// Centre an active lyric line WITHIN its own scroll container, without ever
// scrolling the page/window.
//
// element.scrollIntoView() walks up and scrolls *every* scrollable ancestor —
// including the document — so a lyric line changing (e.g. from a seek) yanks the
// whole viewport to the lyrics, pulling the user away from wherever they were
// (the progress bar). Instead we find the nearest scrollable ancestor and adjust
// only its scrollTop, leaving the page where the user left it.
export function scrollLineIntoView(el: HTMLElement) {
  let container: HTMLElement | null = el.parentElement;
  while (container) {
    const { overflowY } = getComputedStyle(container);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      container.scrollHeight > container.clientHeight
    ) {
      break;
    }
    container = container.parentElement;
  }
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  // Distance to move so the line sits at the container's vertical centre.
  const delta =
    elRect.top - containerRect.top - container.clientHeight / 2 + elRect.height / 2;

  container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
}
