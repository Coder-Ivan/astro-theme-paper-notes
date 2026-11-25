const outline = document.querySelector<HTMLDetailsElement>('.outline-disclosure');
if (outline) setUp(outline);

function setUp(outline: HTMLDetailsElement) {
  const nav = outline.querySelector('nav')!;
  const sections = Array.from(nav.querySelectorAll('a')).flatMap(link => {
    const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    return heading?.closest('.prose') ? [{link, heading}] : [];
  });
  if (!sections.length) return;

  const wide = matchMedia('(min-width: 801px)');
  const adapt = () => { outline.open = wide.matches; };
  adapt();
  wide.addEventListener('change', adapt);
  let active = -1;
  let frame = 0;
  let anchorPosition: number | null = null;

  function revealLink() {
    if (active < 0 || !outline.open) return;
    const box = nav.getBoundingClientRect();
    const link = sections[active].link.getBoundingClientRect();
    if (link.top < box.top) nav.scrollTop += link.top - box.top;
    else if (link.bottom > box.bottom) nav.scrollTop += link.bottom - box.bottom;
  }

  function mark(index: number) {
    if (index === active) return;
    if (active >= 0) sections[active].link.removeAttribute('aria-current');
    active = index;
    sections[active].link.setAttribute('aria-current', 'location');
    revealLink();
  }

  function track() {
    frame = 0;
    if (anchorPosition !== null && Math.abs(scrollY - anchorPosition) < 2) return;
    anchorPosition = null;
    const threshold = Math.min(100, innerHeight * .16);
    let start = 0;
    let end = sections.length;
    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (sections[mid].heading.getBoundingClientRect().top <= threshold) start = mid + 1;
      else end = mid;
    }
    mark(Math.max(0, start - 1));
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(track); }

  function followFragment() {
    let id: string;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ''; }
    const index = sections.findIndex(({heading}) => heading.id === id);
    if (index < 0) { anchorPosition = null; schedule(); return; }
    anchorPosition = scrollY;
    mark(index);
  }

  nav.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('a') ||
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!wide.matches) outline.open = false;
  });
  outline.addEventListener('toggle', revealLink);
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', followFragment);
  window.addEventListener('pageshow', followFragment);
  const prose = document.querySelector('.prose');
  if (prose && 'ResizeObserver' in window) new ResizeObserver(schedule).observe(prose);
  followFragment();
}
