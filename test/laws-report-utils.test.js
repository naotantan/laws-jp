'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  filterCitations,
  linkifyCitations,
  sanitizeMermaid,
  bigramSimilarity,
  expandLawNames,
  kanjiToInt,
  parseArticleNumber,
} = require('../lib/laws-report-utils');

const { classifyQuery } = require('../lib/laws-report-prompt');

// ─── filterCitations ───────────────────────────────────────────────────────

describe('filterCitations', () => {
  test('1: 本文に[1][3]がある場合、[2]を除外する', () => {
    const body = '詳細は[1]を参照。また[3]も関連する。';
    const refs = [
      { n: 1, title: '民法 第1条', url: 'https://example.com/1', content: 'a' },
      { n: 2, title: '民法 第2条', url: 'https://example.com/2', content: 'b' },
      { n: 3, title: '民法 第3条', url: 'https://example.com/3', content: 'c' },
    ];
    const result = filterCitations(body, refs);
    assert.deepEqual(result.map(r => r.n), [1, 3]);
  });

  test('2: [1,3]形式（複数番号）で両方を残す', () => {
    const body = '詳細は[1,3]を参照。';
    const refs = [
      { n: 1, title: 'A', url: 'u1', content: 'a' },
      { n: 2, title: 'B', url: 'u2', content: 'b' },
      { n: 3, title: 'C', url: 'u3', content: 'c' },
    ];
    const result = filterCitations(body, refs);
    assert.deepEqual(result.map(r => r.n), [1, 3]);
  });

  test('3: mermaidブロック内の[N]は引用カウントしない', () => {
    const body = '本文[1]参照。\n```mermaid\nA[2] --> B[3]\n```';
    const refs = [
      { n: 1, title: 'A', url: 'u1', content: 'a' },
      { n: 2, title: 'B', url: 'u2', content: 'b' },
      { n: 3, title: 'C', url: 'u3', content: 'c' },
    ];
    const result = filterCitations(body, refs);
    assert.deepEqual(result.map(r => r.n), [1]);
  });

  test('4: 全refs未引用の場合は空配列を返す', () => {
    const body = '引用なし。';
    const refs = [
      { n: 1, title: 'A', url: 'u1', content: 'a' },
    ];
    const result = filterCitations(body, refs);
    assert.deepEqual(result, []);
  });
});

// ─── linkifyCitations ──────────────────────────────────────────────────────

describe('linkifyCitations', () => {
  test('5: [1] → [[1]](url) に変換する', () => {
    const body = '詳細は[1]を参照。';
    const refs = [{ n: 1, title: 'A', url: 'https://example.com/1', content: 'a' }];
    const result = linkifyCitations(body, refs);
    assert.equal(result, '詳細は[[1]](https://example.com/1)を参照。');
    assert.ok(!result.includes('[[['), 'no double-nested citation brackets');
  });

  test('6: [1,2] → [[1]](url1) [[2]](url2) に展開する', () => {
    const body = '詳細は[1,2]を参照。';
    const refs = [
      { n: 1, title: 'A', url: 'https://example.com/1', content: 'a' },
      { n: 2, title: 'B', url: 'https://example.com/2', content: 'b' },
    ];
    const result = linkifyCitations(body, refs);
    assert.equal(result, '詳細は[[1]](https://example.com/1) [[2]](https://example.com/2)を参照。');
    assert.ok(!result.includes('[[['), 'no double-nested citation brackets');
  });

  test('7: URLなし参照はリンク変換しない（プレーンテキストのまま）', () => {
    const body = '詳細は[1]を参照。';
    const refs = [{ n: 1, title: 'A', url: '', content: 'a' }];
    const result = linkifyCitations(body, refs);
    assert.ok(!result.includes('[[1]]'));
    assert.ok(result.includes('[1]'));
  });
});

// ─── sanitizeMermaid ───────────────────────────────────────────────────────

describe('sanitizeMermaid', () => {
  test('8: mermaidブロック内の全角括弧に変換する', () => {
    const input = '```mermaid\nA[x] --> B[(test)]\n```';
    const result = sanitizeMermaid(input);
    // （ and ） should replace ( ) inside mermaid that are not node shapes
    assert.ok(!result.includes('[(test)'));
  });

  test('9: mermaidブロック外の括弧は変換しない', () => {
    const input = '(注意) これは本文。\n```mermaid\nA[x] --> B\n```';
    const result = sanitizeMermaid(input);
    assert.ok(result.includes('(注意)'));
  });

  test('10: --> などのMermaid矢印は変換しない', () => {
    const input = '```mermaid\nA --> B\n```';
    const result = sanitizeMermaid(input);
    assert.ok(result.includes('-->'));
  });

  test('11: mermaidブロック内の角括弧[テスト]はそのまま保持する', () => {
    const input = '```mermaid\nA[テスト] --> B\n```';
    const result = sanitizeMermaid(input);
    assert.ok(result.includes('A[テスト]'));
  });

  test('12 Fix4: A(text) → A[text] に矯正する（角丸ノード）', () => {
    const input = '```mermaid\nA(手続き) --> B[決定]\n```';
    const result = sanitizeMermaid(input);
    assert.ok(result.includes('A[手続き]'));
    assert.ok(result.includes('B[決定]'));
  });

  test('13 Fix4: A((text)) → A[text] に矯正する（円形ノード）', () => {
    const input = '```mermaid\nA((開始)) --> B\n```';
    const result = sanitizeMermaid(input);
    assert.ok(result.includes('A[開始]'));
  });

  test('14 Fix4: A{text} → A[text] に矯正する（菱形ノード）', () => {
    const input = '```mermaid\nA{条件分岐} --> B\n```';
    const result = sanitizeMermaid(input);
    assert.ok(result.includes('A[条件分岐]'));
  });
});

// ─── bigramSimilarity ──────────────────────────────────────────────────────

describe('bigramSimilarity', () => {
  test('15: 同一文字列は 1.0 を返す', () => {
    assert.equal(bigramSimilarity('個人情報保護法', '個人情報保護法'), 1.0);
  });

  test('16: 全く異なる文字列は 0 に近い値を返す', () => {
    const score = bigramSimilarity('個人情報保護法', 'ZZZZZZZZZ');
    assert.ok(score < 0.2, `expected < 0.2 but got ${score}`);
  });
});

// ─── expandLawNames ────────────────────────────────────────────────────────

describe('expandLawNames', () => {
  test('17: 「個人情報保護法」→ 施行令・施行規則を追加する', () => {
    const result = expandLawNames(['個人情報保護法']);
    assert.ok(result.includes('個人情報保護法'));
    assert.ok(result.some(n => n.includes('施行令')));
    assert.ok(result.some(n => n.includes('施行規則')));
  });

  test('18: 重複を追加しない（既に施行令が入力にある場合）', () => {
    const input = ['民法', '民法施行令'];
    const result = expandLawNames(input);
    const count = result.filter(n => n === '民法施行令').length;
    assert.equal(count, 1);
  });
});

// ─── kanjiToInt ────────────────────────────────────────────────────────────

describe('kanjiToInt', () => {
  test('19 Fix5: 「百六十六」→ 166 を返す', () => {
    assert.equal(kanjiToInt('百六十六'), 166);
  });
});

// ─── parseArticleNumber ────────────────────────────────────────────────────

describe('parseArticleNumber', () => {
  test('20 Fix5: 「第五条の二」→ { num: 5, sub: 2 } を返す', () => {
    const result = parseArticleNumber('第五条の二');
    assert.deepEqual(result, { num: 5, sub: 2 });
  });
});

// ─── classifyQuery ─────────────────────────────────────────────────────────

describe('classifyQuery', () => {
  test('21: 定義確認型を正しく分類する', () => {
    assert.equal(classifyQuery('デジタル社会形成基本法における「デジタル社会」の定義を教えてください'), 'definition');
  });

  test('22: 手続き確認型を正しく分類する', () => {
    assert.equal(classifyQuery('相続放棄の申述に必要な手続きと期限を教えてください'), 'procedure');
  });

  test('23: 比較検討型を正しく分類する', () => {
    assert.equal(classifyQuery('個人情報保護法と行政機関個人情報保護法の適用範囲の違いを比較して'), 'comparison');
  });

  test('24: 解釈適用型を正しく分類する', () => {
    assert.equal(classifyQuery('民法166条の消滅時効の起算点はいつになりますか'), 'interpretation');
  });

  test('25: 政策研究型を正しく分類する', () => {
    assert.equal(classifyQuery('デジタル田園都市国家構想の法的根拠と課題を分析して'), 'policy');
  });

  test('26: 包括分析型を正しく分類する（政策語を含む場合でも包括キーワード優先）', () => {
    assert.equal(classifyQuery('日本のデジタル・ガバメント政策に関する法制度を包括的に分析して'), 'comprehensive');
  });
});
