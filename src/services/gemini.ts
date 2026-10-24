import { GoogleGenerativeAI, GenerativeModel, Part } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

// ─── API Keys in priority order (loaded from environment) ────────────────────
// All GEMINI_API_KEY_* vars are tried in order when the primary key is rate-limited/exhausted
const HARDCODED_KEYS: string[] = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY_6,
  process.env.REACT_APP_GEMINI_API_KEY,
].filter(Boolean) as string[];

// ─── Models in fallback order (primary → fallback) ───────────────────────────
const MODELS: string[] = [      // gemini 3.8 flash (primary / newest generation)
  'gemini-3.6-flash',      // gemini 3.7 flash (fallback with thinking levels)
  'gemini-3.7-flash',      // gemini 3.6 flash (legacy fallback)
  'gemini-2.5-flash',      // gemini 2.5 flash
  'gemini-2.0-flash',      // gemini 2.0 flash
  'gemini-1.5-flash',      // gemini 1.5 flash (standard stable fallback)
  'gemini-3.5-flash',      // gemini 3.5 flash (stable long-horizon fallback)
  'gemini-3.5-flash-lite', // gemini 3.5 flash-lite (highly efficient economy tier)
  'gemini-3.1-flash-lite', // gemini 3.1 flash-lite (legacy ultra-low latency fallback)
];

let language = process.env.APP_LANGUAGE || 'Python';
let customApiKey: string | null = null;

interface Config {
  apiKey: string;
  language: string;
}

function updateConfig(config: Config) {
  if (!config.apiKey) {
    throw new Error('Gemini API key is required');
  }
  customApiKey = config.apiKey.trim();
  language = config.language || 'Python';
}

/** Returns deduplicated key list: custom key first, then env key, then hardcoded keys */
function getKeyList(): string[] {
  const envKey = process.env.GEMINI_API_KEY;
  const candidates: string[] = [];
  if (customApiKey) candidates.push(customApiKey);
  if (envKey) candidates.push(envKey);
  candidates.push(...HARDCODED_KEYS);

  // Deduplicate while preserving order
  const seen = new Set<string>();
  return candidates.filter(k => k && !seen.has(k) && seen.add(k));
}

// Init from env if present
if (process.env.GEMINI_API_KEY) {
  try {
    updateConfig({
      apiKey: process.env.GEMINI_API_KEY,
      language: process.env.APP_LANGUAGE || 'Python',
    });
  } catch (err) {
    console.error('Error initializing Gemini from env:', err);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProcessedSolution {
  approach: string;
  code: string;
  timeComplexity: string;
  spaceComplexity: string;
}

// ─── Complexity type ───────────────────────────────────────────────────────────
export type SolutionComplexity = 'brute' | 'medium' | 'optimal';

// ─── Optimised System Prompt ──────────────────────────────────────────────────
function buildSystemPrompt(complexity: SolutionComplexity = 'optimal'): string {
  const complexityInstructions: Record<SolutionComplexity, string> = {
    brute: `COMPLEXITY LEVEL: BRUTE FORCE
- Provide the simplest, most straightforward solution that solves the problem correctly.
- Use nested loops, recursion without memoization, or naive approaches — prioritise CLARITY over efficiency.
- For DSA: Use O(n²) or O(n³) time if that's the natural brute-force; explain WHY it's brute-force.
- Explicitly state: "This is a brute-force approach. It may be slow for large inputs."`,

    medium: `COMPLEXITY LEVEL: MEDIUM / BETTER
- Provide a solution that is better than brute-force but not necessarily fully optimal.
- Use sorting, hash maps, two pointers, or simple DP where applicable.
- For DSA: Aim for O(n log n) or O(n) time, O(n) space is acceptable.
- Explicitly state the improvement over brute-force and mention what further optimisation would look like.`,

    optimal: `COMPLEXITY LEVEL: OPTIMAL
- Provide the most optimal solution possible — best time AND space complexity.
- Use advanced techniques: sliding window, binary search, monotonic stack, segment tree, DP with optimisation, etc.
- For DSA: Prioritise O(n) or O(n log n) time. Minimise auxiliary space. No redundant passes.
- Explicitly state this is the optimal solution with proven complexity.`,
  };

  return `You are CrackCoder — a world-class AI expert at competitive programming, Data Structures & Algorithms (DSA), SQL & Database queries, MCQ aptitude, and technical interviews.

TASK: Analyse the question(s) shown in the screenshot(s) and provide a perfect, interview-ready solution.

${complexityInstructions[complexity]}

DETECT QUESTION TYPE automatically:
• DSA / Coding Problem  → full working ${language} code + step-by-step approach + complexity analysis
• SQL Query Question     → clean, complete SQL query + query logic breakdown
• MCQ / Aptitude / Quiz  → identify the correct option (e.g. A, B, C, D) + clear justification
• Theoretical / Logical  → concise explanation + direct answer

RESPONSE FORMAT — return ONLY valid JSON (no markdown fences):
{
  "approach": "Clear, concise 3-5 sentence explanation an interviewee would speak aloud. For SQL explain JOINs/CTEs/filters used. For MCQ state 'Answer: X) ...' with rationale. For DSA explain pattern/algorithm.",
  "code": "For coding/DSA: complete ${language} code with comments. For SQL: clean, production-ready SQL query. For MCQ: correct option letter and answer. Empty string if not applicable.",
  "timeComplexity": "Big-O time complexity with brief reason (write N/A for SQL or non-coding questions)",
  "spaceComplexity": "Big-O space complexity with brief reason (write N/A for SQL or non-coding questions)"
}

RULES:
- Output ONLY the JSON object, nothing else, no markdown code blocks outside JSON.
- For DSA/Coding: Code must be complete, bug-free, and syntactically correct in ${language}.
- For SQL: Write standard ANSI SQL (or engine-specific if mentioned, e.g. MySQL / PostgreSQL / Oracle). Include necessary JOINs, WHERE, GROUP BY, HAVING, or Window Functions.
- For MCQs: Clearly begin approach with 'Answer: <Option Letter>) ...'.
- Follow the complexity level instructions above strictly.`;
}

// ─── Fallback logic: key × model ─────────────────────────────────────────────
async function callGeminiWithFallback(parts: Part[], complexity: SolutionComplexity = 'optimal'): Promise<string> {
  const keys = getKeyList();
  const errors: string[] = [];
  const totalStart = Date.now();

  for (const key of keys) {
    for (const model of MODELS) {
      const t0 = Date.now();
      try {
        console.log(`[Gemini] ⏳ Trying model=${model} key=...${key.slice(-8)} complexity=${complexity}`);
        const genAI = new GoogleGenerativeAI(key);
        const genModel: GenerativeModel = genAI.getGenerativeModel({ model });

        const result = await genModel.generateContent({
          contents: [{ role: 'user', parts }],
          systemInstruction: {
            role: 'system',
            parts: [{ text: buildSystemPrompt(complexity) }],
          },
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 3000,
            responseMimeType: 'application/json',
          },
        });

        const text = result.response.text();
        const elapsed = Date.now() - t0;
        const totalElapsed = Date.now() - totalStart;
        console.log(`[Gemini] ✅ SUCCESS model=${model} key=...${key.slice(-8)} — API: ${elapsed}ms | Total: ${totalElapsed}ms`);
        return text;
      } catch (err: any) {
        const elapsed = Date.now() - t0;
        const msg = `model=${model} key=...${key.slice(-8)}: ${err?.message || err}`;
        console.warn(`[Gemini] ❌ FAILED (${elapsed}ms) — ${msg}`);
        errors.push(msg);
      }
    }
  }

  throw new Error(`All Gemini API keys and models exhausted.\n${errors.join('\n')}`);
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function processScreenshots(
  screenshots: { path: string }[],
  complexity: SolutionComplexity = 'optimal'
): Promise<ProcessedSolution> {
  if (!screenshots || screenshots.length === 0) {
    throw new Error('No screenshots provided for processing');
  }

  const complexityLabel = { brute: '🔴 Brute Force', medium: '🟡 Medium', optimal: '🟢 Optimal' }[complexity];
  const parts: Part[] = [
    { text: `Analyse the question(s) in the following screenshot(s) and respond per the system instructions. Solution mode: ${complexityLabel}.` },
  ];

  for (const screenshot of screenshots) {
    try {
      const base64Image = await fs.readFile(screenshot.path, { encoding: 'base64' });
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Image,
        },
      });
    } catch (fileErr: any) {
      console.error(`[Gemini] Failed to read screenshot: ${screenshot.path}`, fileErr);
      throw new Error(`Could not read screenshot file: ${fileErr?.message || fileErr}`);
    }
  }

  const rawText = await callGeminiWithFallback(parts, complexity);

  // Strip any accidental markdown fences
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as ProcessedSolution;
    // Ensure required fields exist to prevent renderer crashes
    return {
      approach: parsed.approach || 'No approach provided',
      code: parsed.code || '',
      timeComplexity: parsed.timeComplexity || 'N/A',
      spaceComplexity: parsed.spaceComplexity || 'N/A',
    };
  } catch {
    // If JSON parse fails, return the raw text as approach
    return {
      approach: cleaned || 'Unable to parse response from AI',
      code: '',
      timeComplexity: 'N/A',
      spaceComplexity: 'N/A',
    };
  }
}

export async function processVoiceQuestion(
  textPrompt?: string,
  audioBase64?: string,
  mimeType: string = 'audio/webm',
  complexity: SolutionComplexity = 'optimal'
): Promise<ProcessedSolution & { userPrompt?: string }> {
  const parts: Part[] = [];

  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    });
  }

  const complexityLabel = { brute: '🔴 Brute Force', medium: '🟡 Medium', optimal: '🟢 Optimal' }[complexity];
  if (textPrompt && textPrompt.trim()) {
    parts.push({
      text: `User spoke the following question/prompt: "${textPrompt.trim()}". Solution mode: ${complexityLabel}. Solve or answer it following the system instructions.`,
    });
  } else {
    parts.push({
      text: `Listen to the voice audio provided above. Understand the question asked by the user. Solution mode: ${complexityLabel}. Provide the complete solution following the system instructions.`,
    });
  }

  const rawText = await callGeminiWithFallback(parts, complexity);

  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as ProcessedSolution;
    return {
      approach: parsed.approach || 'No approach provided',
      code: parsed.code || '',
      timeComplexity: parsed.timeComplexity || 'N/A',
      spaceComplexity: parsed.spaceComplexity || 'N/A',
      userPrompt: textPrompt || undefined,
    };
  } catch {
    return {
      approach: cleaned || 'Unable to parse response from AI',
      code: '',
      timeComplexity: 'N/A',
      spaceComplexity: 'N/A',
      userPrompt: textPrompt || undefined,
    };
  }
}

export default {
  processScreenshots,
  processVoiceQuestion,
  updateConfig,
};


