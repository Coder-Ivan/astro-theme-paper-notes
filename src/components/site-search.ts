import { highlightSegments, searchDocuments, type SearchDocument } from '../lib/search.ts';

const dialog = document.querySelector<HTMLDialogElement>('#site-search-dialog');
if (dialog) setupSearch(dialog);

function setupSearch(dialog: HTMLDialogElement) {
  function get<T extends HTMLElement>(selector: string) { return dialog.querySelector<T>(selector)!; }
  const input = get<HTMLInputElement>('#site-search-query');
  const panel = get('.search-content');
  const results = get('#site-search-results');
  const message = get('.search-message');
  const status = get('.search-count');
  const retry = get<HTMLButtonElement>('#site-search-retry');
  const more = get<HTMLButtonElement>('#site-search-more');
  const pageSize = 30;
  let load: Promise<SearchDocument[]> | undefined;
  const services = dialog.dataset.services === 'true';
  let scope: 'unknown' | 'public' | 'diary' = services ? 'unknown' : 'public';
  let ready = false;
  let opener: HTMLElement | null = null;
  let selected = -1;
  let revision = 0;
  let limit = pageSize;
  let composing = false;

  function publicIndex() {
    if (!load) {
      load = fetch(dialog.dataset.indexUrl!, {cache:'no-cache', credentials:'same-origin'}).then(async response => {
        if (!response.ok) throw new Error('index unavailable');
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('invalid search index');
        ready = true;
        return data as SearchDocument[];
      }).catch(error => { load = undefined; throw error; });
    }
    return load;
  }

  const accountLabel = document.querySelector<HTMLElement>('[data-account-link] span');
  const avatar = document.querySelector<HTMLImageElement>('[data-account-avatar]');
  avatar?.addEventListener('load', () => { avatar.hidden = !avatar.hasAttribute('src'); });
  avatar?.addEventListener('error', () => { avatar.hidden = true; });
  async function session() {
    if (!services) return false;
    const response = await fetch('/account/session', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('session unavailable');
    const access = await response.json();
    if (accountLabel) accountLabel.textContent = access.authenticated ? '账户' : '登录 / 注册';
    if (avatar) {
      const id = access.authenticated && access.avatar;
      const src = typeof id === 'string' && /^[a-z]{1,24}$/.test(id) ? '/account/avatars/' + id + '.svg' : '';
      if ((avatar.getAttribute('src') || '') !== src) {
        avatar.hidden = true;
        if (src) avatar.src = src;
        else avatar.removeAttribute('src');
      }
    }
    input.placeholder = access.canReadDiary ? '搜索文章和日记' : '搜索文章';
    return access.canReadDiary === true;
  }

  function loadIndex() {
    if (scope === 'public') return publicIndex();
    const access = scope === 'diary' ? Promise.resolve(true) : session();
    const diary = access.then(async allowed => {
      if (!allowed) { scope = 'public'; return []; }
      const response = await fetch('/diary/search.json', {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      });
      if (response.status === 401 || response.status === 403) { scope = 'public'; return []; }
      if (!response.ok) throw new Error('diary index unavailable');
      const docs: unknown = await response.json();
      if (!Array.isArray(docs)) throw new Error('invalid diary index');
      scope = 'diary';
      return docs;
    }, () => []);
    return Promise.all([publicIndex(), diary]).then(([posts, entries]) => posts.concat(entries));
  }

  function select(index: number, scroll = true) {
    const options = results.children;
    if (index < 0 || index >= options.length) return;
    options.item(selected)?.setAttribute('aria-selected', 'false');
    selected = index;
    const option = options[index] as HTMLAnchorElement;
    option.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', option.id);
    if (scroll) option.scrollIntoView({block:'nearest'});
  }

  function clear() {
    selected = -1;
    results.replaceChildren();
    input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-expanded', 'false');
    more.hidden = true;
    retry.hidden = true;
    message.hidden = true;
    panel.hidden = true;
    status.textContent = '';
  }

  function notice(text: string, canRetry = false) {
    panel.hidden = false;
    message.hidden = false;
    retry.hidden = !canRetry;
    get('.search-message span').textContent = text;
  }

  function highlighted(value: string, query: string) {
    const fragment = document.createDocumentFragment();
    for (const part of highlightSegments(value, query)) {
      if (part.match) {
        const mark = document.createElement('mark');
        mark.textContent = part.text;
        fragment.append(mark);
      } else fragment.append(part.text);
    }
    return fragment;
  }

  function optionFor(doc: SearchDocument, snippet: string, query: string, index: number) {
    const option = document.createElement('a');
    option.className = 'search-result';
    option.id = 'site-result-' + index;
    option.href = doc.url;
    option.tabIndex = -1;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');

    const meta = document.createElement('span');
    meta.className = 'search-result-meta';
    const type = doc.kind === 'diary' ? '日记' : '文章';
    const detail = doc.kind === 'diary' ? doc.date.slice(0, 10) : doc.category;
    meta.textContent = detail ? type + ' · ' + detail : type;
    const title = document.createElement('span');
    title.className = 'search-result-title';
    title.append(highlighted(doc.title, query));
    option.append(meta, title);
    if (snippet) {
      const excerpt = document.createElement('span');
      excerpt.className = 'search-result-excerpt';
      excerpt.append(highlighted(snippet, query));
      option.append(excerpt);
    }
    return option;
  }

  async function render(firstNew = 0) {
    const request = ++revision;
    const query = input.value.trim();
    clear();
    if (!query || !dialog.open) return;
    if (!ready) notice('正在加载搜索索引…');
    try {
      if (scope !== 'public' && !firstNew) {
        await new Promise(resolve => window.setTimeout(resolve, 150));
        if (request !== revision || !dialog.open) return;
      }
      const docs = await loadIndex();
      if (request !== revision || !dialog.open) return;
      const found = searchDocuments(docs, query, limit);
      const rows = found.results.filter(hit => /^\/(?:diary\/)?posts\/[a-z0-9-]+\/$/.test(hit.document.url));
      retry.hidden = true;
      message.hidden = true;
      if (!rows.length) { notice('没有找到相关内容。'); return; }
      results.replaceChildren(...rows.map((hit, index) => optionFor(hit.document, hit.snippet, query, index)));
      panel.hidden = false;
      more.hidden = rows.length >= found.total;
      input.setAttribute('aria-expanded', 'true');
      status.textContent = '共 ' + found.total + ' 条结果';
      select(Math.min(firstNew, rows.length - 1), !!firstNew);
      if (!firstNew) panel.scrollTop = 0;
    } catch {
      if (request !== revision || !dialog.open) return;
      notice('搜索索引加载失败。', true);
    }
  }

  function open(from: HTMLElement | null) {
    if (!dialog.open) {
      opener = from;
      input.value = '';
      composing = false;
      scope = services ? 'unknown' : 'public';
      limit = pageSize;
      clear();
      dialog.showModal();
    }
    input.focus({preventScroll:true});
  }

  document.querySelectorAll<HTMLElement>('[data-open-search]').forEach(trigger => {
    trigger.addEventListener('click', () => open(trigger));
    trigger.hidden = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey) || event.altKey || event.isComposing) return;
    event.preventDefault();
    open(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  });
  get('#site-search-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !composing && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener('cancel', event => { if (composing) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    // A close event can arrive after the user has already reopened the dialog.
    if (dialog.open) return;
    revision++;
    composing = false;
    clear();
    if (opener?.isConnected) opener.focus({preventScroll:true});
    opener = null;
  });
  // Recheck permissions when returning from another tab or browser history.
  function forgetResults() {
    revision++;
    if (dialog.open) dialog.close();
    clear();
  }
  window.addEventListener('pagehide', forgetResults);
  window.addEventListener('pageshow', () => { void session().catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) forgetResults();
    else void session().catch(() => {});
  });
  let backdropPress = false;
  function outside(event: MouseEvent) {
    const bounds = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom);
  }
  dialog.addEventListener('pointerdown', event => { backdropPress = outside(event); });
  dialog.addEventListener('click', event => { if (backdropPress && outside(event)) dialog.close(); });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; limit = pageSize; void render(); });
  input.addEventListener('input', () => { if (!composing) { limit = pageSize; void render(); } });
  results.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const option = (event.target as Element).closest<HTMLAnchorElement>('a[role="option"]');
    if (option && option !== results.children.item(selected)) {
      select(Array.from(results.children).indexOf(option), false);
    }
  });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229) return;
    const count = results.childElementCount;
    if (!count || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      (results.children.item(selected) as HTMLAnchorElement | null)?.click();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      select((selected + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    }
  });
  retry.addEventListener('click', () => { input.focus(); void render(); });
  more.addEventListener('click', () => {
    const count = results.childElementCount;
    limit += pageSize;
    input.focus({preventScroll:true});
    void render(count);
  });
}
