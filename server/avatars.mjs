const presets = new Map([
  ['mountain', {
    name: '青山', paper: '#e4eee4',
    art: `<circle cx="33" cy="14" r="4.1" fill="#e3a26e"/>
      <path d="M4.5 31 17 15.5 29.5 31Z" fill="#93b4a5"/>
      <path d="m7 34 16.5-18L41 34Z" fill="#527d6f"/>
      <path d="m14 34 9.5-18 8.5 8.7-6.8-4.2Z" fill="#385f56"/>
      <path d="M4 33c6-1.7 10.1-1.4 16.8.9 6.2 2.2 12.1-.4 22.4-3.7a22 22 0 0 1-39.2 2.8Z" fill="#b7cdbd"/>
      <path d="M10 37c6-.8 10 2.3 17.5 1.2" fill="none" stroke="#779989" stroke-width="1.2" stroke-linecap="round"/>`,
  }],
  ['pine', {
    name: '松风', paper: '#e1e9d9',
    art: `<circle cx="13.5" cy="15" r="4" fill="#ccab78"/>
      <path d="M28 10.5C25 16 22.7 18 18.7 20l4.1 1.1c-2.8 3.1-6.2 5.1-9.9 6.8 4.3 1.9 8.2 2 11.8 1.3-1.7 3.9-4.1 6.2-8 8.7 7.1-.7 11.1-4.2 13.9-7.2l6.2.4c-1.7-2.7-4.2-4.7-7.2-6.6l4.8.1c-3.1-4.1-5-8.9-6.4-14.1Z" fill="#507a63"/>
      <path d="M26.9 17c-.4 7.2 1.1 13.3-2.4 20.2m2.1-8.5-6.5 4.1m6.7-9.2 4.8 4.3" fill="none" stroke="#345442" stroke-width="1.65" stroke-linecap="round"/>
      <path d="M13 38.2c4.5-.8 10.1-.1 17.4-.8" stroke="#8a9e7b" stroke-width="1.4" stroke-linecap="round"/>`,
  }],
  ['moon', {
    name: '月影', paper: '#32465b',
    art: `<path d="M29.2 8.3a9.1 9.1 0 1 0 7.3 13.4A8.8 8.8 0 0 1 29.2 8.3Z" fill="#f2dfac"/>
      <circle cx="13" cy="15.5" r="1.05" fill="#e0ca9b"/>
      <circle cx="37" cy="12.5" r=".7" fill="#e0ca9b"/>
      <path d="M4.5 32q6.2-1.6 13.9.4t14.3 0 11.2-1.8a21 21 0 0 1-39.4 1.4Z" fill="#557182"/>
      <path d="M19 35.4q3.7-.7 8.4 0m-4.9 2.7h4" fill="none" stroke="#d8c999" stroke-width="1.4" stroke-linecap="round"/>`,
  }],
  ['sail', {
    name: '归帆', paper: '#deeaec',
    art: `<path d="M24.5 8.6c-4.1 7.2-8.6 13.2-14 18.6l14-1.1Z" fill="#f8f3e4"/>
      <path d="M25.8 13.5v12.8l9.2 1c-4-4.3-6.6-8.8-9.2-13.8Z" fill="#bd7b59"/>
      <path d="M24.9 9v20.2" stroke="#5a6d69" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M8.7 29.1q13.8 1.2 30-1.5l-6.3 5.1q-10.8 2.6-19.8.2Z" fill="#4d6c70"/>
      <path d="M9.8 36q3.2-1.5 7 0t7.2 0 7.1 0 6.5-.3" fill="none" stroke="#7f9d9f" stroke-width="1.4" stroke-linecap="round"/>`,
  }],
  ['ginkgo', {
    name: '银杏', paper: '#f4ead4',
    art: `<path d="M21.8 31.7C15 29.4 9.6 25.3 8.5 18.1c2.4.1 3.2-3.2 5.3-2.7.7-3.1 3-2 4.2-4.6 2.1.7 3.8-1.6 5.2-1.2l1.5 8.1c1.4-3.3 2.2-6.3 4.1-7.6 1.9 1.9 4 .6 5.5 3.8 3-.2 2.6 3.2 4.7 4.7-.1 5.3-8.7 11.5-17.2 13.1Z" fill="#c59b49"/>
      <path d="M23.5 38.2c-1.9-4.5-2.3-7.1-.8-12.6m-.6 5.2-8.9-11.5m9.1 10.1-2.4-13.9m3.5 14 8.8-13.3m-8.1 14 10.9-8.1" fill="none" stroke="#8e722f" stroke-width="1.2" stroke-linecap="round"/>`,
  }],
  ['plum', {
    name: '梅枝', paper: '#f1e3df',
    art: `<path d="M10.5 35.6c6.3-3.3 12.2-8.2 16.8-14.8l6.6-4m-13 11.8-.5-7m7.2-.8 1.8-6.7" fill="none" stroke="#79594f" stroke-width="2.05" stroke-linecap="round"/>
      <g fill="#ad696f"><circle cx="19.9" cy="17.4" r="3"/><circle cx="23" cy="19.6" r="2.8"/><circle cx="21.8" cy="22.7" r="2.7"/><circle cx="18.1" cy="22.7" r="2.7"/><circle cx="16.7" cy="19.6" r="2.8"/></g>
      <circle cx="20" cy="20.5" r="1.35" fill="#f5d69c"/>
      <g fill="#cf8f8b"><circle cx="31" cy="10.9" r="2.3"/><circle cx="33.3" cy="12.5" r="2.1"/><circle cx="32.4" cy="15.1" r="2.1"/><circle cx="29.7" cy="15.1" r="2.1"/><circle cx="28.7" cy="12.5" r="2.1"/></g>
      <circle cx="31" cy="13.2" r="1" fill="#f8e6ab"/><ellipse cx="34.5" cy="16.7" rx="2.7" ry="1.8" transform="rotate(-28 34.5 16.7)" fill="#aa6168"/>`,
  }],
]);

export const defaultAvatar = 'mountain';
export const isAvatar = id => presets.has(id);

function svg(id, decorative = false) {
  const { name, paper, art } = presets.get(id) || presets.get(defaultAvatar);
  const description = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${name}头像"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" class="preset-avatar" focusable="false" ${description}><circle cx="24" cy="24" r="24" fill="${paper}"/>${art}</svg>`;
}

// The same artwork works in the account UI and as a standalone navigation image.
export const avatarMarkup = id => svg(id);
export const avatarSvg = avatarMarkup;

export function avatarPicker(selected = defaultAvatar) {
  const current = isAvatar(selected) ? selected : defaultAvatar;
  const choices = Array.from(presets, ([id, {name}]) => `
    <label class="avatar-option">
      <input type="radio" name="avatar" value="${id}"${id === current ? ' checked' : ''}>
      <span class="avatar-tile">${svg(id, true)}<span>${name}</span><span class="avatar-check" aria-hidden="true"></span></span>
    </label>`);
  return `<fieldset class="avatar-picker"><legend>选择头像</legend><div class="avatar-grid">${choices.join('')}</div></fieldset>`;
}

export const avatarCss = `
.preset-avatar { display: block; width: 3rem; height: 3rem; flex: none; border-radius: 50%; }
.profile-avatar .preset-avatar { width: 3.5rem; height: 3.5rem; }
.list-avatar .preset-avatar { width: 2.5rem; height: 2.5rem; }
.avatar-picker { min-inline-size: 0; margin: 0 0 1.25rem; padding: 0; border: 0; }
.avatar-picker legend { margin-bottom: .45rem; padding: 0; font-weight: 570; }
.avatar-grid { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: .3rem; }
label.avatar-option { position: relative; display: block; min-width: 0; margin: 0; }
.avatar-option input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; opacity: 0; margin: 0; cursor: pointer; }
.avatar-tile { position: relative; display: grid; justify-items: center; gap: .22rem; padding: .45rem .08rem .32rem; border: 1px solid #d5e0dd; border-radius: .55rem; color: #465b57; font-size: .81rem; white-space: nowrap; }
.avatar-tile .preset-avatar { width: 2.45rem; height: 2.45rem; }
.avatar-option:hover .avatar-tile { border-color: #879f98; }
.avatar-option input:checked + .avatar-tile { background: #edf4f1; color: #244e43; border-color: #52796b; }
.avatar-check { display: none; }
.avatar-option input:checked + .avatar-tile .avatar-check { position: absolute; top: .14rem; right: .14rem; display: grid; place-items: center; width: .9rem; height: .9rem; background: #345f51; color: white; border-radius: 50%; font: bold .63rem/1 sans-serif; }
.avatar-check::after { content: "✓"; }
.avatar-option input:focus-visible + .avatar-tile { outline: 2px solid #295d55; outline-offset: 2px; }
@media (max-width: 28rem) { .avatar-grid { grid-template-columns: repeat(3,minmax(0,1fr)); gap: .4rem; } }
@media (forced-colors: active) {
  .avatar-option input:checked + .avatar-tile { border-color: Highlight; }
  .avatar-option input:checked + .avatar-tile .avatar-check { color: HighlightText; background: Highlight; forced-color-adjust: none; }
}
`;
