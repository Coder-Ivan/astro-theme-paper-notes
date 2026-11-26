// Kept independent of the grammars so a language menu needs no highlighting engine.
const definitions = [
  ['plaintext', '纯文本', ['plain', 'text', 'txt', 'none', 'nohighlight', 'no-highlight']],
  ['bash', 'Bash / Shell', ['sh', 'shell', 'shellscript', 'shell-session', 'console', 'terminal', 'zsh', 'ksh']],
  ['c', 'C', ['h']],
  ['cpp', 'C++', ['c++', 'cc', 'cxx', 'h++', 'hh', 'hpp', 'hxx']],
  ['csharp', 'C#', ['c#', 'cs', 'dotnet']],
  ['cmake', 'CMake'],
  ['css', 'CSS'],
  ['dart', 'Dart'],
  ['diff', 'Diff', ['patch']],
  ['dockerfile', 'Dockerfile', ['docker']],
  ['go', 'Go', ['golang']],
  ['html', 'HTML', ['htm', 'xhtml']],
  ['ini', 'INI / TOML', ['toml']],
  ['java', 'Java'],
  ['javascript', 'JavaScript', ['js', 'jsx', 'mjs', 'cjs']],
  ['json', 'JSON', ['jsonc']],
  ['kotlin', 'Kotlin', ['kt', 'kts']],
  ['lua', 'Lua'],
  ['markdown', 'Markdown', ['md', 'mkd']],
  ['objectivec', 'Objective-C', ['objc', 'obj-c', 'objective-c', 'objcpp', 'objective-c++']],
  ['php', 'PHP'],
  ['powershell', 'PowerShell', ['ps', 'ps1', 'pwsh']],
  ['python', 'Python', ['py', 'python3', 'py3']],
  ['ruby', 'Ruby', ['rb']],
  ['rust', 'Rust', ['rs']],
  ['sql', 'SQL', ['pgsql', 'postgresql', 'mysql', 'sqlite']],
  ['swift', 'Swift'],
  ['typescript', 'TypeScript', ['ts', 'tsx', 'mts', 'cts']],
  ['xml', 'XML', ['svg', 'plist', 'rss', 'xsl', 'xsd']],
  ['yaml', 'YAML', ['yml']],
];

export const codeLanguages = definitions.map(([id,label]) => ({id,label}));
const names = new Map();
for (const [id, , aliases = []] of definitions) {
  for (const name of [id, ...aliases]) names.set(name,id);
}

export function codeLanguageId(info) {
  const name = String(info ?? '').trim().split(/\s+/,1)[0].toLowerCase()
    .replace(/^\{?\./,'').replace(/\}$/,'').replace(/^language-/,'');
  return names.get(name) ?? null;
}
