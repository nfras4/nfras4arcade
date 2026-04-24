/**
 * audit-hints.ts
 * Two-stage triage-rewrite pipeline for Impostor word-game hints.
 *
 * Usage:
 *   bun scripts/audit-hints.ts [flags]
 *
 * Flags:
 *   --category <name|all>              Category to audit (default: all)
 *   --stage <classify|rewrite|both>    Pipeline stage (default: both)
 *   --dry-run                          Skip Claude API calls, use stubbed data
 *   --max-cost <usd>                   Cost cap in USD (default: 10)
 *   --model <model-id>                 Claude model (default: claude-sonnet-4-6)
 *
 * API key: set ANTHROPIC_API_KEY in your environment, or add it to .dev.vars
 * at the project root as: ANTHROPIC_API_KEY=sk-ant-...
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { categories } from '../worker/impostor/words.ts';
import { validateHint } from './validate-hint.ts';
import type { RubricFailure } from './validate-hint.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedArgs {
  category: string;
  stage: 'classify' | 'rewrite' | 'both';
  dryRun: boolean;
  maxCost: number;
  model: string;
}

interface ClassifyResult {
  hint: string;
  validatorPass: boolean;
  validatorFailures: RubricFailure[];
  claudePass: boolean | null;  // null = not sent to Claude (validator failed or dry-run info)
  claudeReason: string;
  status: 'OK' | 'FAIL';
}

interface RewriteResult {
  hintIndex: number;
  original: string;
  failureReason: string;
  replacement: string | null;
  replacementValidatorPass: boolean | null;
  claudeReasoning: string;
  status: 'REWRITTEN' | 'MANUAL_REQUIRED';
}

interface CostTracker {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

// Sonnet pricing: $3/MTok input, $15/MTok output
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  const args: ParsedArgs = {
    category: 'all',
    stage: 'both',
    dryRun: false,
    maxCost: 10,
    model: 'claude-sonnet-4-6',
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--category':
        args.category = argv[++i] ?? 'all';
        break;
      case '--stage': {
        const s = argv[++i] ?? 'both';
        if (s !== 'classify' && s !== 'rewrite' && s !== 'both') {
          console.error(`Error: --stage must be one of: classify, rewrite, both`);
          process.exit(1);
        }
        args.stage = s;
        break;
      }
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--max-cost': {
        const c = parseFloat(argv[++i] ?? '10');
        if (isNaN(c) || c < 0) {
          console.error('Error: --max-cost must be a non-negative number');
          process.exit(1);
        }
        args.maxCost = c;
        break;
      }
      case '--model':
        args.model = argv[++i] ?? 'claude-sonnet-4-6';
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Error: Unknown flag: ${flag}`);
        printUsage();
        process.exit(1);
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`
Usage: bun scripts/audit-hints.ts [flags]

Flags:
  --category <name|all>              Category to audit (default: all)
  --stage <classify|rewrite|both>    Pipeline stage (default: both)
  --dry-run                          Skip Claude API calls, use stubbed data
  --max-cost <usd>                   Cost cap in USD (default: 10)
  --model <model-id>                 Claude model (default: claude-sonnet-4-6)
  --help                             Show this message

Examples:
  bun scripts/audit-hints.ts --category Animals --stage both --dry-run
  bun scripts/audit-hints.ts --category all --stage classify --max-cost 5
  bun scripts/audit-hints.ts --category "Clash Royale Cards" --stage both --max-cost 1.00
`);
}

// ---------------------------------------------------------------------------
// API key resolution
// ---------------------------------------------------------------------------

function resolveApiKey(): string | null {
  // 1. Environment variable
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  // 2. .dev.vars file at project root
  const devVarsPath = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))), '.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    const content = fs.readFileSync(devVarsPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/);
      if (match) return match[1].trim();
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cost tracking helpers
// ---------------------------------------------------------------------------

function addCost(tracker: CostTracker, inputTokens: number, outputTokens: number): void {
  tracker.totalInputTokens += inputTokens;
  tracker.totalOutputTokens += outputTokens;
  tracker.totalCostUsd += inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
}

function costLine(tracker: CostTracker, cap: number): string {
  const pct = cap > 0 ? Math.round((tracker.totalCostUsd / cap) * 100) : 0;
  return `[cost] $${tracker.totalCostUsd.toFixed(4)} / $${cap.toFixed(2)} cap (${pct}% used)`;
}

// ---------------------------------------------------------------------------
// Category slug
// ---------------------------------------------------------------------------

function categorySlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ---------------------------------------------------------------------------
// Claude tool schemas
// ---------------------------------------------------------------------------

const classifyTool: Anthropic.Tool = {
  name: 'classify_hints',
  description: 'Classify each hint for quality',
  input_schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            hint: { type: 'string' },
            pass: { type: 'boolean' },
            reason: { type: 'string', description: 'One-line judgment' },
          },
          required: ['hint', 'pass', 'reason'],
        },
      },
    },
    required: ['results'],
  },
};

const rewriteTool: Anthropic.Tool = {
  name: 'rewrite_hint',
  description: 'Generate a replacement hint',
  input_schema: {
    type: 'object',
    properties: {
      replacement: { type: 'string', description: 'The new hint text' },
      reasoning: { type: 'string', description: 'Why this hint is better' },
    },
    required: ['replacement', 'reasoning'],
  },
};

const CLASSIFY_SYSTEM = `You are evaluating word-game hints for the game "Impostor". Each hint should help \
a non-impostor player confirm they know the secret word WITHOUT giving away the \
word to the impostor. A good hint references a distinguishing attribute, cultural \
reference, or contextual clue specific to the word.

Classify each hint as pass or fail:
- PASS: The hint points at one distinguishing attribute of the word that someone \
who knows the word would recognize, without being so generic it could apply to \
many words.
- FAIL: The hint is too generic, too obscure, directly references the word, or \
would not help confirm shared knowledge.

Be conservative: when in doubt, pass. Only fail hints that are clearly problematic.`;

function rewriteSystem(maxWordCount: number): string {
  return `You are rewriting a word-game hint for the game "Impostor". The hint must help a \
player who knows the secret word confirm shared knowledge, WITHOUT revealing the \
word to the impostor.

Rules:
- The hint MUST NOT contain the word or any form of it (plural, past tense, etc.).
- This includes translations, cognates, and transliterations.
- The hint MUST be ${maxWordCount} words or fewer.
- The hint should reference a specific, distinguishing attribute -- not a generic description.
- The hint should be culturally accessible to young adults (18-25).
- Do NOT repeat themes already covered by the other hints for this word.`;
}

// ---------------------------------------------------------------------------
// Stage 1: Classify
// ---------------------------------------------------------------------------

async function classifyWordEntry(
  client: Anthropic,
  categoryName: string,
  word: string,
  hints: string[],
  args: ParsedArgs,
  tracker: CostTracker
): Promise<{ classifications: ClassifyResult[]; costCapReached: boolean }> {
  const classifications: ClassifyResult[] = [];

  // Step 1: Run validator on all hints
  const validatorResults = hints.map(hint => ({
    hint,
    result: validateHint(hint, word, hints),
  }));

  const passingHints = validatorResults.filter(r => r.result.pass).map(r => r.hint);

  // Step 2: Claude soft judgment on passing hints (unless dry-run)
  let claudeJudgments: Map<string, { pass: boolean; reason: string }> = new Map();

  if (passingHints.length > 0 && args.dryRun) {
    // Dry-run short-circuits cost-cap checks and Claude calls entirely.
    for (const h of passingHints) {
      claudeJudgments.set(h, { pass: true, reason: 'dry-run: skipped Claude judgment' });
    }
  } else if (passingHints.length > 0 && !args.dryRun) {
    // Check cost cap before API call
    if (tracker.totalCostUsd >= args.maxCost) {
      // Cost cap reached before we could classify: record partial results faithfully.
      // Validator-passing hints are UNCLASSIFIED (status 'OK' with explanatory note) — they
      // were never sent to Claude, so marking them FAIL would misrepresent the artifact.
      for (const { hint, result } of validatorResults) {
        classifications.push({
          hint,
          validatorPass: result.pass,
          validatorFailures: result.failures,
          claudePass: null,
          claudeReason: result.pass ? '[COST CAP REACHED before Claude call]' : '--',
          status: result.pass ? 'OK' : 'FAIL',
        });
      }
      return { classifications, costCapReached: true };
    }

    const userMsg = `Word: "${word}" | Category: "${categoryName}" | Hints to classify: ${JSON.stringify(passingHints)}`;

    try {
      const response = await client.messages.create({
        model: args.model,
        max_tokens: 1024,
        system: CLASSIFY_SYSTEM,
        tools: [classifyTool],
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: userMsg }],
      });

      addCost(tracker, response.usage.input_tokens, response.usage.output_tokens);

      // Extract tool use result
      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (toolBlock && toolBlock.type === 'tool_use') {
        const input = toolBlock.input as { results: Array<{ hint: string; pass: boolean; reason: string }> };
        for (const r of input.results) {
          claudeJudgments.set(r.hint, { pass: r.pass, reason: r.reason });
        }
      }
    } catch (err) {
      console.error(`  [warn] Claude classify failed for "${word}":`, err instanceof Error ? err.message : err);
      // Treat as pass to avoid losing data on transient errors
      for (const h of passingHints) {
        claudeJudgments.set(h, { pass: true, reason: 'API error: defaulting to pass' });
      }
    }
  }

  // Build final classification results
  for (const { hint, result } of validatorResults) {
    if (!result.pass) {
      // Validator failure = auto-fail
      classifications.push({
        hint,
        validatorPass: false,
        validatorFailures: result.failures,
        claudePass: null,
        claudeReason: '--',
        status: 'FAIL',
      });
    } else {
      const judgment = claudeJudgments.get(hint);
      const claudePass = judgment?.pass ?? true;
      classifications.push({
        hint,
        validatorPass: true,
        validatorFailures: [],
        claudePass,
        claudeReason: judgment?.reason ?? '--',
        status: claudePass ? 'OK' : 'FAIL',
      });
    }
  }

  return { classifications, costCapReached: false };
}

// ---------------------------------------------------------------------------
// Stage 2: Rewrite
// ---------------------------------------------------------------------------

async function rewriteHint(
  client: Anthropic,
  categoryName: string,
  word: string,
  failedHint: string,
  failureReasons: string,
  allCurrentHints: string[],
  hintIndex: number,
  args: ParsedArgs,
  tracker: CostTracker
): Promise<{ result: RewriteResult; costCapReached: boolean }> {
  const MAX_RETRIES = 3;
  const maxWordCount = 8;

  if (args.dryRun) {
    return {
      result: {
        hintIndex,
        original: failedHint,
        failureReason: failureReasons,
        replacement: `[DRY-RUN] replacement for: ${failedHint}`,
        replacementValidatorPass: true,
        claudeReasoning: 'dry-run: skipped Claude rewrite',
        status: 'REWRITTEN',
      },
      costCapReached: false,
    };
  }

  // Check cost cap
  if (tracker.totalCostUsd >= args.maxCost) {
    return {
      result: {
        hintIndex,
        original: failedHint,
        failureReason: failureReasons,
        replacement: null,
        replacementValidatorPass: null,
        claudeReasoning: '[COST CAP REACHED]',
        status: 'MANUAL_REQUIRED',
      },
      costCapReached: true,
    };
  }

  // Siblings for validation: exclude the failed hint itself (already filtered by validateHint internally,
  // but we want to include accepted replacements from earlier rewrites)
  const siblingHints = allCurrentHints.filter(h => h !== failedHint);

  let lastFailReasons = failureReasons;
  let acceptedReplacement: string | null = null;
  let acceptedReasoning = '';
  let replacementValidatorPass: boolean | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (tracker.totalCostUsd >= args.maxCost) {
      return {
        result: {
          hintIndex,
          original: failedHint,
          failureReason: failureReasons,
          replacement: null,
          replacementValidatorPass: null,
          claudeReasoning: '[COST CAP REACHED]',
          status: 'MANUAL_REQUIRED',
        },
        costCapReached: true,
      };
    }

    const userMsg =
      `Word: "${word}" | Category: "${categoryName}" | Failed hint: "${failedHint}" | ` +
      `Failure reasons: ${lastFailReasons} | ` +
      `Existing sibling hints (do not duplicate themes): ${JSON.stringify(siblingHints)}` +
      (attempt > 1 ? ` | Previous attempt failed validation: ${lastFailReasons}` : '');

    try {
      const response = await client.messages.create({
        model: args.model,
        max_tokens: 512,
        system: rewriteSystem(maxWordCount),
        tools: [rewriteTool],
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: userMsg }],
      });

      addCost(tracker, response.usage.input_tokens, response.usage.output_tokens);

      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (toolBlock && toolBlock.type === 'tool_use') {
        const input = toolBlock.input as { replacement: string; reasoning: string };
        const candidate = input.replacement.trim();
        const validationSiblings = [...siblingHints, candidate];
        const vResult = validateHint(candidate, word, validationSiblings);

        if (vResult.pass) {
          acceptedReplacement = candidate;
          acceptedReasoning = input.reasoning;
          replacementValidatorPass = true;
          // Add to siblings for future replacements in this word's set
          siblingHints.push(candidate);
          break;
        } else {
          // Build failure reasons for retry
          lastFailReasons = vResult.failures.map(f => `${f.rule}: ${f.detail}`).join('; ');
          replacementValidatorPass = false;
        }
      }
    } catch (err) {
      console.error(`  [warn] Claude rewrite failed for "${word}" hint "${failedHint}":`, err instanceof Error ? err.message : err);
      break;
    }
  }

  if (acceptedReplacement !== null) {
    return {
      result: {
        hintIndex,
        original: failedHint,
        failureReason: failureReasons,
        replacement: acceptedReplacement,
        replacementValidatorPass,
        claudeReasoning: acceptedReasoning,
        status: 'REWRITTEN',
      },
      costCapReached: false,
    };
  }

  return {
    result: {
      hintIndex,
      original: failedHint,
      failureReason: failureReasons,
      replacement: null,
      replacementValidatorPass,
      claudeReasoning: `MANUAL_REQUIRED (${MAX_RETRIES} retries failed)`,
      status: 'MANUAL_REQUIRED',
    },
    costCapReached: false,
  };
}

// ---------------------------------------------------------------------------
// Markdown artifact generation
// ---------------------------------------------------------------------------

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatValidatorCell(pass: boolean, failures: RubricFailure[]): string {
  if (pass) return 'PASS';
  return 'FAIL: ' + failures.map(f => `${f.rule} (${escapeCell(f.detail)})`).join('; ');
}

function formatClaudeCell(claudePass: boolean | null, reason: string): string {
  if (claudePass === null) return '--';
  return `${claudePass ? 'PASS' : 'FAIL'}: ${escapeCell(reason)}`;
}

function buildArtifact(
  categoryName: string,
  model: string,
  stage: string,
  classifyMap: Map<string, ClassifyResult[]> | null,
  rewriteMap: Map<string, RewriteResult[]> | null,
  categoryCost: number,
  timestamp: string,
  totalHints: number,
  costCapBanner: string | null
): string {
  const lines: string[] = [];

  if (costCapBanner) {
    lines.push(`> **[COST CAP REACHED]** ${costCapBanner}`);
    lines.push('');
  }

  lines.push(`# Hint Audit: ${categoryName}`);
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push(`**Model:** ${model}`);
  lines.push(`**Stage:** ${stage}`);

  // Compute counts
  let passed = 0;
  let failed = 0;
  let rewrites = 0;
  let manual = 0;

  if (classifyMap) {
    for (const results of classifyMap.values()) {
      for (const r of results) {
        if (r.status === 'OK') passed++;
        else failed++;
      }
    }
  }
  if (rewriteMap) {
    for (const results of rewriteMap.values()) {
      for (const r of results) {
        if (r.status === 'REWRITTEN') rewrites++;
        else manual++;
      }
    }
  }

  lines.push(`**Words:** ${classifyMap ? classifyMap.size : 0} | **Hints:** ${totalHints} | **Failures:** ${failed} | **Rewrites:** ${rewrites}`);
  lines.push('');

  // Classification section
  if (classifyMap && (stage === 'classify' || stage === 'both')) {
    lines.push('## Classification Results');
    lines.push('');

    for (const [word, results] of classifyMap) {
      lines.push(`### ${word} (${results.length} hints)`);
      lines.push('');
      lines.push('| # | Original Hint | Validator | Claude Judgment | Status |');
      lines.push('|---|---------------|-----------|-----------------|--------|');

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const validatorCell = formatValidatorCell(r.validatorPass, r.validatorFailures);
        const claudeCell = formatClaudeCell(r.claudePass, r.claudeReason);
        lines.push(`| ${i + 1} | ${escapeCell(r.hint)} | ${validatorCell} | ${claudeCell} | ${r.status} |`);
      }
      lines.push('');
    }
  }

  // Rewrites section
  if (rewriteMap && (stage === 'rewrite' || stage === 'both')) {
    lines.push('## Rewrites');
    lines.push('');

    let anyRewrites = false;
    for (const [word, results] of rewriteMap) {
      if (results.length === 0) continue;
      anyRewrites = true;
      lines.push(`### ${word}`);
      lines.push('');
      lines.push('| # | Original | Failure Reason | Replacement | Validator | Claude Reasoning |');
      lines.push('|---|----------|----------------|-------------|-----------|------------------|');

      for (const r of results) {
        const replacementCell = r.replacement ? escapeCell(r.replacement) : 'MANUAL_REQUIRED';
        const validatorCell = r.replacementValidatorPass === null ? '--' : (r.replacementValidatorPass ? 'PASS' : 'FAIL');
        lines.push(
          `| ${r.hintIndex + 1} | ${escapeCell(r.original)} | ${escapeCell(r.failureReason)} | ${replacementCell} | ${validatorCell} | ${escapeCell(r.claudeReasoning)} |`
        );
      }
      lines.push('');
    }

    if (!anyRewrites) {
      lines.push('_No rewrites needed._');
      lines.push('');
    }
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total hints: ${totalHints}`);
  lines.push(`- Passed (no changes): ${passed}`);
  lines.push(`- Failed & rewritten: ${rewrites}`);
  lines.push(`- Failed & needs manual: ${manual}`);
  lines.push(`- Cost for this category: $${categoryCost.toFixed(4)}`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  // Resolve API key
  const apiKey = resolveApiKey();
  if (!apiKey && !args.dryRun) {
    console.error('Error: ANTHROPIC_API_KEY not set. Set it in your environment or use --dry-run.');
    process.exit(1);
  }

  const client = args.dryRun
    ? null
    : new Anthropic({ apiKey: apiKey! });

  // Filter categories
  let targetCategories = categories;
  if (args.category !== 'all') {
    targetCategories = categories.filter(c => c.name.toLowerCase() === args.category.toLowerCase());
    if (targetCategories.length === 0) {
      console.error(`Error: Category "${args.category}" not found.`);
      console.error(`Available categories: ${categories.map(c => c.name).join(', ')}`);
      process.exit(1);
    }
  }

  // Ensure output directory exists
  const artifactDir = path.join(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
    '..',
    '.omc',
    'hint-audit'
  );
  fs.mkdirSync(artifactDir, { recursive: true });

  const tracker: CostTracker = { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0 };
  const timestamp = new Date().toISOString();

  let totalHintsAll = 0;
  let totalPassedAll = 0;
  let totalRewrittenAll = 0;
  let totalManualAll = 0;
  let categoriesProcessed = 0;

  let globalCostCapReached = false;

  for (const category of targetCategories) {
    if (globalCostCapReached) break;

    console.log(`\nProcessing: ${category.name}`);
    const costBefore = tracker.totalCostUsd;

    const classifyMap = new Map<string, ClassifyResult[]>();
    const rewriteMap = new Map<string, RewriteResult[]>();
    let categoryCostCapReached = false;
    let costCapBanner: string | null = null;
    let lastWord = '';

    // Stage 1: Classify
    if (args.stage === 'classify' || args.stage === 'both') {
      for (const entry of category.words) {
        lastWord = entry.word;
        const { classifications, costCapReached } = await classifyWordEntry(
          client!,
          category.name,
          entry.word,
          entry.hints,
          args,
          tracker
        );
        classifyMap.set(entry.word, classifications);

        if (!args.dryRun) {
          console.log(`  ${costLine(tracker, args.maxCost)}  [classify] ${entry.word}`);
        }

        if (costCapReached) {
          categoryCostCapReached = true;
          costCapBanner = `Last processed word: "${lastWord}" | Cumulative cost: $${tracker.totalCostUsd.toFixed(4)}`;
          break;
        }
      }
    }

    // Stage 2: Rewrite
    if (!categoryCostCapReached && (args.stage === 'rewrite' || args.stage === 'both')) {
      // Collect failures from classification results
      // If only doing rewrite stage (no classify ran), run validator first
      const failedEntries: Array<{
        word: string;
        failedHint: string;
        hintIndex: number;
        failureReason: string;
        allHints: string[];
      }> = [];

      if (args.stage === 'both') {
        // Use classify results
        for (const entry of category.words) {
          const results = classifyMap.get(entry.word) ?? [];
          const currentHints = [...entry.hints];
          for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'FAIL') {
              const reasons = results[i].validatorPass
                ? `claude: ${results[i].claudeReason}`
                : results[i].validatorFailures.map(f => `${f.rule}: ${f.detail}`).join('; ');
              failedEntries.push({
                word: entry.word,
                failedHint: results[i].hint,
                hintIndex: i,
                failureReason: reasons,
                allHints: currentHints,
              });
            }
          }
        }
      } else {
        // Rewrite-only mode: ONLY validator failures are caught. Hints that would be
        // flagged by Claude's soft judgment pass unnoticed. Use --stage both for full coverage.
        console.warn(
          `  [warn] --stage rewrite processes validator failures only; ` +
            `hints that would fail Claude's soft judgment are not regenerated. ` +
            `Use --stage both for full coverage.`
        );
        for (const entry of category.words) {
          for (let i = 0; i < entry.hints.length; i++) {
            const vResult = validateHint(entry.hints[i], entry.word, entry.hints);
            if (!vResult.pass) {
              failedEntries.push({
                word: entry.word,
                failedHint: entry.hints[i],
                hintIndex: i,
                failureReason: vResult.failures.map(f => `${f.rule}: ${f.detail}`).join('; '),
                allHints: [...entry.hints],
              });
            }
          }
        }
      }

      // Group failures by word for sibling tracking
      const failsByWord = new Map<string, typeof failedEntries>();
      for (const f of failedEntries) {
        const existing = failsByWord.get(f.word) ?? [];
        existing.push(f);
        failsByWord.set(f.word, existing);
      }

      for (const [word, fails] of failsByWord) {
        if (categoryCostCapReached) break;
        const wordRewrites: RewriteResult[] = [];
        // Track accepted replacements to include as siblings for subsequent rewrites
        const acceptedReplacements: string[] = [];
        const baseHints = fails[0].allHints;

        for (const fail of fails) {
          const currentSiblings = [
            ...baseHints.filter(h => h !== fail.failedHint),
            ...acceptedReplacements,
          ];

          const { result, costCapReached } = await rewriteHint(
            client!,
            category.name,
            word,
            fail.failedHint,
            fail.failureReason,
            currentSiblings,
            fail.hintIndex,
            args,
            tracker
          );

          wordRewrites.push(result);

          if (!args.dryRun) {
            console.log(`  ${costLine(tracker, args.maxCost)}  [rewrite] ${word} hint #${fail.hintIndex + 1}: ${result.status}`);
          }

          if (result.status === 'REWRITTEN' && result.replacement) {
            acceptedReplacements.push(result.replacement);
          }

          if (costCapReached) {
            categoryCostCapReached = true;
            costCapBanner = `Last processed word: "${word}" | Cumulative cost: $${tracker.totalCostUsd.toFixed(4)}`;
          }
        }

        rewriteMap.set(word, wordRewrites);
      }
    }

    // Compute per-category stats
    const categoryCost = tracker.totalCostUsd - costBefore;
    const totalHints = category.words.reduce((sum, e) => sum + e.hints.length, 0);

    let catPassed = 0;
    let catFailed = 0;
    let catRewritten = 0;
    let catManual = 0;
    for (const results of classifyMap.values()) {
      for (const r of results) {
        if (r.status === 'OK') catPassed++;
        else catFailed++;
      }
    }
    for (const results of rewriteMap.values()) {
      for (const r of results) {
        if (r.status === 'REWRITTEN') catRewritten++;
        else catManual++;
      }
    }

    totalHintsAll += totalHints;
    totalPassedAll += catPassed;
    totalRewrittenAll += catRewritten;
    totalManualAll += catManual;
    categoriesProcessed++;

    // Write artifact
    const slug = categorySlug(category.name);
    const artifactPath = path.join(artifactDir, `${slug}.md`);
    const artifactContent = buildArtifact(
      category.name,
      args.model,
      args.stage,
      args.stage !== 'rewrite' ? classifyMap : null,
      args.stage !== 'classify' ? rewriteMap : null,
      categoryCost,
      timestamp,
      totalHints,
      costCapBanner
    );
    fs.writeFileSync(artifactPath, artifactContent, 'utf-8');
    console.log(`  Artifact: ${artifactPath}`);

    if (categoryCostCapReached) {
      console.warn(`  [warn] Cost cap $${args.maxCost} reached mid-category. Partial artifact written.`);
      globalCostCapReached = true;
    }
  }

  // Pipeline summary
  const totalCategories = targetCategories.length;
  console.log(`
=== Hint Audit Complete ===
Categories: ${categoriesProcessed}/${totalCategories}
Total hints: ${totalHintsAll}
  Passed: ${totalPassedAll}
  Failed & rewritten: ${totalRewrittenAll}
  Manual required: ${totalManualAll}
Total cost: $${tracker.totalCostUsd.toFixed(4)} / $${args.maxCost} (${args.maxCost > 0 ? Math.round((tracker.totalCostUsd / args.maxCost) * 100) : 0}%)
Review artifacts: .omc/hint-audit/*.md
`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
