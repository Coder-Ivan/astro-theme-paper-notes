import core from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import cmake from 'highlight.js/lib/languages/cmake';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import markdown from 'highlight.js/lib/languages/markdown';
import objectivec from 'highlight.js/lib/languages/objectivec';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { codeLanguages, codeLanguageId } from './code-languages.mjs';

const engine = core.newInstance();
const grammars = {bash,c,cpp,csharp,cmake,css,dart,diff,dockerfile,go,ini,java,javascript,
  json,kotlin,lua,markdown,objectivec,php,powershell,python,ruby,rust,sql,swift,typescript,xml,yaml};
for (const [id,grammar] of Object.entries(grammars)) engine.registerLanguage(id,grammar);
const labels = new Map(codeLanguages.map(({id,label}) => [id,label]));
const candidates = Object.keys(grammars);
const maxCodeLength = 100_000;
const sampleLength = 4_096;

function plain(code) {
  const html = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return {html,language:'plaintext',label:labels.get('plaintext')};
}

// Several grammars share keywords (e.g. class or import). Prefer distinctive
// syntax before comparing the grammar relevance scores for ambiguous excerpts.
const signatures = [
  ['python', /^(?:#![^\n]*\bpython[\d.]*\b|\s*(?:from\s+[\w.]+\s+import\s+\w|import\s+(?:os|sys|re|json|math|pathlib|typing|dataclasses)\b|(?:async\s+)?def\s+\w+\s*\([^\n]*\)\s*(?:->[^:\n]+)?\s*:|class\s+\w+(?:\([^\n]*\))?\s*:))/m],
  ['bash', /^(?:#![^\n]*\b(?:ba|da|z|k)?sh\b|\s*(?:\$\s+)?(?:git|npm|npx|pnpm|yarn|cargo|curl|kubectl|sudo|brew)\s+[\w@./-]+|\s*(?:echo|export)\s+(?:[\x22'\x24]|\w+=))/m],
  ['php', /<\?php\b/i],
  ['html', /<!doctype\s+html\b|<(?:html|head|body|div|span|section|p|a)\b[^>]*>/i],
  ['xml', /^\s*<\?xml\b/i],
  ['yaml', /^(?:[\w.-]+):(?:[ \t]+[^\n]*)?\r?\n[ \t]*[\w.-]+:[ \t]/m],
  ['objectivec', /^\s*(?:#import\s+[<"]|@(?:interface|implementation|autoreleasepool)\b)/m],
  ['rust', /(?:^\s*(?:pub\s+)?(?:async\s+)?fn\s+\w+\s*\(|^\s*use\s+\w+::|\b(?:println|vec|format)!\s*\()/m],
  ['go', /^\s*package\s+\w+\s*$[\s\S]*?^\s*(?:import|func|type)\b/m],
  ['swift', /^\s*import\s+(?:SwiftUI|UIKit|Foundation|AppKit|Swift)\b/m],
  ['dart', /(?:^\s*import\s+['"](?:dart:|package:)|\bextends\s+(?:StatelessWidget|StatefulWidget)\b|\bvoid\s+main\s*\([^)]*\)\s*\{\s*print\s*\()/m],
  ['csharp', /^\s*using\s+System(?:\.\w+)*\s*;|\bConsole\.WriteLine\s*\(/m],
  ['cpp', /(?:\bstd::\w+|^\s*#\s*include\s*<(?:iostream|vector|string|memory)>)/m],
  ['c', /^\s*#\s*include\s*<(?:stdio|stdlib|string|stdint)\.h>/m],
  ['java', /(?:^\s*(?:package|import)\s+(?:java\.|javax\.)|\bSystem\.out\.print(?:ln)?\s*\()/m],
  ['kotlin', /^\s*(?:suspend\s+)?fun\s+\w+\s*\(/m],
  ['dockerfile', /^\s*FROM\s+\S+\s*(?:AS\s+[\w-]+)?\s*$/im],
  ['sql', /^\s*(?:SELECT\s+[\s\S]+?\s+FROM\s+|(?:CREATE|ALTER)\s+TABLE\s+|INSERT\s+INTO\s+)/im],
  ['typescript', /(?:^\s*(?:export\s+)?(?:interface|type)\s+\w+\s*(?:[={]|extends\b)|:\s*(?:number|string|boolean|unknown)(?:\[\])?\s*[,)=;{])/m],
  ['javascript', /(?:^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=|^\s*import\s+[^\n]+\s+from\s+['"]|\bconsole\.(?:log|warn|error)\s*\()/m],
];

function detect(code) {
  const sample = code.slice(0,sampleLength);
  // JSON literals also match YAML and JavaScript. A complete JSON container
  // provides stronger evidence than those grammars' keyword scores.
  if (code.length <= sampleLength && /^\s*(?:\[|\{)/.test(code)) {
    try { JSON.parse(code); return 'json'; } catch { /* Try code grammars. */ }
  }
  for (const [id,pattern] of signatures) {
    if (pattern.test(sample)) return id;
  }
  if (/^[\p{L}\p{N}\s().,!?'’“”:;—-]*$/u.test(sample)) return null;
  const best = engine.highlightAuto(sample,candidates);
  return best.language && best.relevance >= 3 ? best.language : null;
}

// Return only escaped inline code markup. Neither snippet text nor fence info
// is interpolated into a tag, a class name or an attribute.
export function highlightCode(source, requested = 'auto') {
  const code = String(source ?? '');
  if (code.length > maxCodeLength || !code.trim()) return plain(code);
  const info = String(requested ?? '').trim();
  const language = !info || info.toLowerCase() === 'auto' ? detect(code) : codeLanguageId(info);
  if (!language || language === 'plaintext') return plain(code);
  const grammar = language === 'html' ? 'xml' : language;
  const {value} = engine.highlight(code,{language:grammar,ignoreIllegals:true});
  return {html:value,language,label:labels.get(language)};
}
