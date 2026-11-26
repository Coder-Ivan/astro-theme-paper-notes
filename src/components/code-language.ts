import { codeLanguages } from '../lib/code-languages.mjs';

async function copyPlainText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Older browsers can receive plain text through a user-initiated copy event.
  let written = false;
  function write(event: ClipboardEvent) {
    event.preventDefault();
    if (event.clipboardData) {
      event.clipboardData.setData('text/plain',text);
      written = true;
    }
  }
  document.addEventListener('copy',write,true);
  try {
    if (!document.execCommand('copy') || !written) throw new Error('Clipboard unavailable');
  } finally {
    document.removeEventListener('copy',write,true);
  }
}

function addCopyButton(controls: HTMLElement, toolbar: HTMLElement, code: HTMLElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy';
  button.textContent = '复制代码';
  const status = document.createElement('span');
  status.className = 'code-copy-status';
  status.setAttribute('role','status');
  controls.append(button);
  toolbar.append(status);

  let latest = 0;
  let resetTimer: number;
  function reset() {
    button.textContent = '复制代码';
    status.textContent = '';
    status.classList.remove('is-error');
  }
  button.addEventListener('click', async () => {
    const request = ++latest;
    window.clearTimeout(resetTimer);
    reset();
    try {
      await copyPlainText(code.textContent ?? '');
    } catch {
      if (request === latest) {
        status.classList.add('is-error');
        status.textContent = '复制失败，请手动选中代码后复制。';
      }
      return;
    }
    if (request !== latest) return;
    button.textContent = '已复制';
    status.textContent = '已复制';
    resetTimer = window.setTimeout(reset,2000);
  });
}

function enableLanguagePicker(block: HTMLElement, code: HTMLElement, articleKey: string, index: number) {
  const initialLanguage = block.dataset.language || 'plaintext';
  const initialLabel = codeLanguages.find(language => language.id === initialLanguage)?.label || '纯文本';
  const annotated = block.dataset.source === 'explicit';
  const initialChoice = annotated ? 'authored' : 'auto';
  const storageKey = 'paper-notes:code-language:' + articleKey + ':' + block.dataset.codeBlock;

  const toolbar = document.createElement('div');
  toolbar.className = 'code-toolbar';
  const label = document.createElement('label');
  const select = document.createElement('select');
  select.id = 'code-choice-' + (index + 1);
  label.htmlFor = select.id;
  label.textContent = '代码语言';
  select.setAttribute('aria-label','第 ' + (index + 1) + ' 个代码块的语言');
  const auto = new Option(annotated ? '自动识别' : '自动识别 · ' + initialLabel, 'auto');
  if (annotated) select.add(new Option('文章指定 · ' + initialLabel, 'authored'));
  select.add(auto);
  for (const {id,label} of codeLanguages) select.add(new Option(label,id));
  const message = document.createElement('span');
  message.className = 'code-status';
  message.setAttribute('role','status');
  const controls = document.createElement('div');
  controls.className = 'code-controls';
  controls.append(select);
  toolbar.append(label,message,controls);
  addCopyButton(controls,toolbar,code);
  block.prepend(toolbar);

  let displayed = initialChoice;
  let initialMarkup: string | undefined;
  let revision = 0;
  async function apply(choice: string, remember: boolean) {
    const request = ++revision;
    message.textContent = '';
    try {
      let html: string;
      let language: string;
      if (choice === initialChoice) {
        html = initialMarkup ?? code.innerHTML;
        language = initialLanguage;
      } else {
        const { highlightCode } = await import('../lib/code-highlight.mjs');
        if (request !== revision) return;
        const result = highlightCode(code.textContent || '',choice);
        initialMarkup ??= code.innerHTML;
        html = result.html;
        language = result.language;
        if (choice === 'auto') auto.textContent = '自动识别 · ' + result.label;
        else if (choice !== 'plaintext' && result.language === 'plaintext') message.textContent = '此代码块按纯文本显示。';
      }
      // The engine escapes source text and emits only syntax-token spans.
      code.innerHTML = html;
      code.classList.remove('language-' + (block.dataset.language || 'plaintext'));
      code.classList.add('language-' + language);
      block.dataset.language = language;
      displayed = choice;
    } catch {
      if (request === revision) {
        select.value = displayed;
        message.textContent = '切换失败，请重试。';
      }
      return;
    }
    if (remember) {
      try {
        if (choice === initialChoice) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey,choice);
      } catch { /* The picker still works when storage is unavailable. */ }
    }
  }
  select.addEventListener('change', () => { void apply(select.value,true); });
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && saved !== initialChoice && Array.from(select.options).some(option => option.value === saved)) {
      select.value = saved;
      void apply(saved,false);
    }
  } catch { /* Storage is optional. */ }
}

const prose = document.querySelector<HTMLElement>('.prose[data-code-article]');
if (prose?.dataset.codeArticle) {
  const key = prose.dataset.codeArticle;
  prose.querySelectorAll<HTMLElement>('.code-block[data-code-block]').forEach((block,index) => {
    const code = block.querySelector<HTMLElement>(':scope > pre > code');
    if (code) enableLanguagePicker(block,code,key,index);
  });
}
