/**
 * test-gemini.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Run with:  node test-gemini.js
 * Tests each API key × model combination and reports which ones work.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── All API keys to test (read from env) ──────────────────────────────────
const API_KEYS = [
  { label: 'Environment Key', key: process.env.GEMINI_API_KEY || '' },
].filter(k => k.key);

// ── Models to test ────────────────────────────────────────────────────────────
const MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
];

const TEST_PROMPT = `What is 2 + 2? Reply with ONLY a JSON object: {"answer": "4"}`;

// ── Colours for terminal output ───────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

async function testKeyAndModel(label, key, model) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: TEST_PROMPT }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 100 }
      })
    });

    const data = await res.json();
    if (res.ok && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return { ok: true, text: data.candidates[0].content.parts[0].text.trim() };
    }

    if (data.error) {
      return { ok: false, error: `[HTTP ${res.status}] ${data.error.message}` };
    }

    return { ok: false, error: `[HTTP ${res.status}] Unexpected response format` };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function main() {
  console.log(`\n${CYAN}╔══════════════════════════════════════════════════╗`);
  console.log(`║          CrackCoder — Gemini API Key Tester      ║`);
  console.log(`║      Models: gemini-3.6-flash & gemini-3.7-flash ║`);
  console.log(`╚══════════════════════════════════════════════════╝${RESET}\n`);

  const results = [];

  for (const { label, key } of API_KEYS) {
    console.log(`\n${YELLOW}▶ Testing ${label}${RESET}`);
    for (const model of MODELS) {
      process.stdout.write(`  ${model.padEnd(20)}: `);
      const { ok, text, error } = await testKeyAndModel(label, key, model);
      if (ok) {
        console.log(`${GREEN}✓ PASS${RESET}  → ${text.slice(0, 70)}`);
        results.push({ label, model, status: 'PASS' });
      } else {
        const shortErr = error.length > 90 ? error.slice(0, 90) + '…' : error;
        console.log(`${RED}✗ FAIL${RESET}  → ${shortErr}`);
        results.push({ label, model, status: 'FAIL', error });
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${CYAN}════════════════ SUMMARY ════════════════${RESET}`);
  const passed = results.filter(r => r.status === 'PASS');
  const failed  = results.filter(r => r.status === 'FAIL');
  console.log(`  ${GREEN}PASS: ${passed.length}${RESET}  |  ${RED}FAIL: ${failed.length}${RESET}\n`);

  if (passed.length > 0) {
    console.log(`${GREEN}Working key/model combinations:${RESET}`);
    passed.forEach(r => console.log(`  ✓  ${r.label}  →  ${r.model}`));
  } else {
    console.log(`${RED}⚠  No keys passed. Check network access or key validity.${RESET}`);
  }
  console.log('');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
