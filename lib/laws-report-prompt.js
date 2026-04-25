'use strict';

// 6-pattern query classification and report generation prompt constants.
// All values are pure constants — no runtime I/O.

const QUERY_PATTERNS = [
  { id: 'definition',   label: '定義確認型',   hint: '「…の定義」「…とは何か」「…とはどういう意味か」' },
  { id: 'procedure',    label: '手続き確認型',  hint: '「…の手続き」「…の流れ」「…はどうすればいいか」' },
  { id: 'comparison',   label: '比較検討型',    hint: '「…と…の違い」「…と…を比較」「どちらが…か」' },
  { id: 'interpretation', label: '解釈適用型', hint: '「…の場合はどうなるか」「…は適用されるか」「起算点は」' },
  { id: 'policy',       label: '政策研究型',    hint: '「…の政策」「…の課題」「…の根拠」' },
  { id: 'comprehensive', label: '包括分析型',   hint: '「包括的に」「全体像」「法制度全般」' },
];

// Mermaid node format constraint injected into REPORT_SYSTEM_PROMPT.
// This restricts Claude to safe A[...] rectangular nodes only.
const MERMAID_CONSTRAINTS = `
Mermaid 図を生成する場合の制約:
- ノード形状は必ず A[テキスト] の矩形形式のみ使用すること
- A(テキスト) / A((テキスト)) / A{テキスト} は使用禁止
- ノードラベル内に半角括弧 () は使用禁止（全角 （） は可）
- ノードラベル内に引用符 " は使用禁止（' に置換）
- 矢印 --> / --- / -.- は使用可能
`.trim();

// Source priority rule injected into REPORT_SYSTEM_PROMPT.
const SOURCE_PRIORITY = `
情報源の優先順位（高→低）:
1. e-Gov 公式条文（[N] 参照として提供される条文）
2. URL コンテキスト（クエリに含まれる URL の内容）
3. Web 検索結果
4. 自己知識（上記で補えない場合のみ、その旨を明記）
`.trim();

// System prompt template for report generation.
// Placeholders: {PATTERN_LABEL}, {REFS_FOR_PROMPT}, {WARNINGS}
const REPORT_SYSTEM_PROMPT = `あなたは日本の法令の専門家です。提供された条文参照に基づいて、正確で引用可能なレポートを生成してください。

${SOURCE_PRIORITY}

引用形式:
- 各参照条文には [N] 番号が付与されています
- 本文中で参照する際は必ず [N] 番号を使用してください（例: 「民法第166条[1]」）
- 複数参照: [1,3] 形式で記述可能
- レポート本文の最後に [SOURCES_PLACEHOLDER] を記述してください（出典セクションに自動変換されます）
- 実際に本文中で引用した [N] のみを [SOURCES_PLACEHOLDER] に含めてください

条文番号の検証:
レポート冒頭で以下を確認し、問題があれば訂正セクションを設けてください:
- タイトル不一致: 法令名は正しいが条文番号が異なる場合
- 条文不在: 指定された条文番号が法令に存在しない場合
- 法令名不在: 法令自体が見つからない場合

クエリタイプ: {PATTERN_LABEL}

${MERMAID_CONSTRAINTS}

レポート本文は3,000字以内（出典セクション除く）にまとめてください。`;

// Per-pattern section templates: defines the expected report structure for each pattern.
const PATTERN_SECTIONS = {
  definition: [
    '## 定義',
    '## 関連条文',
    '## 留意事項',
  ],
  procedure: [
    '## 手続きの概要',
    '## ステップ別解説',
    '## 期限・要件',
    '## 留意事項',
  ],
  comparison: [
    '## 比較対象の概要',
    '## 相違点',
    '## 共通点',
    '## 適用場面の違い',
  ],
  interpretation: [
    '## 条文の解釈',
    '## 適用の要件',
    '## 具体的な適用例',
    '## 留意事項',
  ],
  policy: [
    '## 政策の概要',
    '## 法的根拠',
    '## 課題と展望',
  ],
  comprehensive: [
    '## 法制度の全体像',
    '## 主要な法令と条文',
    '## 関係性と体系',
    '## 課題と論点',
  ],
};

// Classify a query into one of the 6 patterns. Returns pattern ID.
function classifyQuery(query) {
  const q = query;
  if (/とは|の定義|意味|概念|とはどういう/.test(q)) return 'definition';
  if (/手続き|流れ|どうすれば|申請|届出|手順/.test(q)) return 'procedure';
  if (/違い|比較|比べ|差異|どちら/.test(q)) return 'comparison';
  if (/場合|適用|起算|解釈|該当|なりますか/.test(q)) return 'interpretation';
  if (/包括的|全体像|全般|法体系|法制度全体/.test(q)) return 'comprehensive';
  if (/政策|課題|根拠|動向|背景/.test(q)) return 'policy';
  return 'comprehensive';
}

// Build a filled REPORT_SYSTEM_PROMPT for a given query and refs.
function buildSystemPrompt(query, refsForPrompt, warnings = '') {
  const patternId = classifyQuery(query);
  const pattern = QUERY_PATTERNS.find(p => p.id === patternId) || QUERY_PATTERNS[5];
  const sections = PATTERN_SECTIONS[patternId].map(s => s).join('\n');

  let prompt = REPORT_SYSTEM_PROMPT
    .replace('{PATTERN_LABEL}', pattern.label)
    .replace('{REFS_FOR_PROMPT}', refsForPrompt || '（参照条文なし）')
    .replace('{WARNINGS}', warnings || '');

  prompt += `\n\n## 推奨セクション構成\n${sections}`;

  if (warnings) {
    prompt += `\n\n## 注意事項（検索段階の警告）\n${warnings}`;
  }

  return prompt;
}

module.exports = {
  QUERY_PATTERNS,
  MERMAID_CONSTRAINTS,
  SOURCE_PRIORITY,
  REPORT_SYSTEM_PROMPT,
  PATTERN_SECTIONS,
  classifyQuery,
  buildSystemPrompt,
};
