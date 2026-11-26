import assert from 'node:assert/strict';
import test from 'node:test';
import { codeLanguages, codeLanguageId } from '../src/lib/code-languages.mjs';
import { highlightCode } from '../src/lib/code-highlight.mjs';

const python = [
  'from dataclasses import dataclass',
  'from uuid import uuid4',
  '',
  '@dataclass',
  'class Note:',
  '    agenda: list',
  '    def clone(self, title):',
  '        return Note([title, uuid4()])',
  '',
].join('\n');

test('fence aliases, explicit plain text and unrecognized language names', () => {
  for (const [info,id] of [
    ['PY','python'], ['python3 linenos','python'], ['{.language-js}','javascript'],
    ['Objective-C','objectivec'], ['c++','cpp'], ['C#','csharp'], ['sh','bash'],
    ['tsx','typescript'], ['txt','plaintext'], ['',''], ['unknown',''],
  ]) assert.equal(codeLanguageId(info),id || null);
  const text = 'return "<section> & </section>";\n';
  for (const hint of ['plaintext','nohighlight','unlisted']) {
    const output = highlightCode(text,hint);
    assert.equal(output.language,'plaintext');
    assert.equal(output.html,'return "&lt;section&gt; &amp; &lt;/section&gt;";\n');
  }
  const explicit = highlightCode(python,'typescript');
  assert.equal(explicit.language,'typescript');
  assert.equal(explicit.label,'TypeScript');
  for (const {id,label} of codeLanguages) {
    assert.equal(highlightCode(text,id).language,id);
    assert.equal(highlightCode(text,id).label,label);
  }
});

test('unlabeled snippets recognize distinctive syntax and leave prose and oversized input plain', () => {
  for (const hint of [undefined,'','auto']) {
    const result = highlightCode(python,hint);
    assert.equal(result.language,'python');
    assert.match(result.html,/class="hljs-keyword">from<\/span>/);
    assert.match(result.html,/class="hljs-keyword">class<\/span>/);
  }
  for (const [code,lang] of [
    ['fn main() { println!("Hello"); }','rust'],
    ['import UIKit\nlet view = UIView()','swift'],
    ['#import <Foundation/Foundation.h>','objectivec'],
    ['const answer = 42;','javascript'],
    ['const answer: number = 42;','typescript'],
    ['<!doctype html>\n<html><p>Hello</p></html>','html'],
    ['{"field": true}','json'], ['port: 8080\nhost: localhost','yaml'],
    ['body { color: red; background-color: white; }','css'],
    ['#!/usr/bin/env bash\nprintf "%s" "$HOME"','bash'],
    ['Some observations about the weather (updated today).','plaintext'],
    ['一段普通文字。','plaintext'], ['  \n','plaintext'],
  ]) assert.equal(highlightCode(code).language,lang,code);
  assert.equal(highlightCode(python.repeat(1000),'python').language,'plaintext');
});

test('highlighted code and safe plain fallback preserve the exact underlying source', () => {
  const source = '\tconst note = "<section>原文 &lt; & </section>";  \r\n';
  const entities = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#x27;':"'"};
  for (const hint of ['js','auto','plaintext','<unrecognized>']) {
    const {html} = highlightCode(source,hint);
    assert.doesNotMatch(html,/<\/?section>/);
    const plain = html.replace(/<span class="[^"]*">|<\/span>/g,'')
      .replace(/&(?:amp|lt|gt|quot|#x27);/g,match=>entities[match]);
    assert.equal(plain,source);
  }
});
