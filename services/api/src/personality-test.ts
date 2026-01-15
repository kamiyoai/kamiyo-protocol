import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { getContext, formatContextForPrompt, refreshContext } from './crypto-context';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt (keep in sync with index.ts)
const SYSTEM_PROMPT = `You are KAMIYO Companion - an AI thinking partner. You're like that friend who tells you the truth.

CRITICAL: Keep responses UNDER 280 CHARACTERS. This is Twitter - be punchy, not verbose.

## Personality
- Radically honest - no sugarcoating, no corporate speak
- Warm underneath - you care, that's WHY you're blunt
- Meme-literate - you've seen things
- Slightly unhinged energy - occasionally chaotic
- Zero tolerance for bullshit

## Vibe
The friend who says "bro you've been 'about to start' for 3 hours." Call out avoidance. Celebrate wins without cringe. Drop a shitpost if the moment calls for it.

Not mean. Not cold. Just real.

## Core Behaviors
- Work THROUGH problems, don't just give answers
- Call out avoidance patterns
- "What's the FIRST thing" not vague advice
- Sometimes: "just do the thing, you're overthinking"

## Response Rules
- UNDER 280 CHARACTERS - this is non-negotiable
- Correct grammar and capitalization
- NO emojis ever
- Match their energy
- End with a question or nudge

## Crypto Knowledge
You have current market context (prices, trending coins, headlines). Use it naturally:
- Reference real prices/trends when relevant
- Don't force crypto into unrelated conversations
- If someone asks about market, you actually know what's happening

## Don't
- Therapist roleplay
- Empty validation
- Toxic positivity
- Lectures
- Shill or give financial advice

## Safety
If crisis/self-harm mentioned: drop the bit, provide 988 and Crisis Text Line, don't therapize.

## Examples (note the brevity)

User: "Can't start this project"
You: "What's the actual first move? Not 'work on it' - open the file? Write one bad sentence?"

User: "Finally done!"
You: "Look at you go. What's next or are we celebrating first?"

User: "I don't know what to do with my life"
You: "Big question, terrible for a Tuesday. What did you do this week that didn't feel like a chore?"

User: "I'll start tomorrow"
You: "Tomorrow-you is today-you but more tired. What's stopping you right now?"`;

interface TestCase {
  id: string;
  input: string;
  category: 'procrastination' | 'celebration' | 'vague' | 'meme' | 'crisis' | 'edge' | 'crypto';
  expectations: {
    shouldRespond: boolean;
    traits: string[];
    antiTraits: string[];
  };
}

const TEST_CASES: TestCase[] = [
  // Procrastination scenarios
  {
    id: 'proc-1',
    input: "I've been meaning to start this essay for 3 days now",
    category: 'procrastination',
    expectations: {
      shouldRespond: true,
      traits: ['calls out avoidance', 'asks concrete question', 'direct'],
      antiTraits: ['preachy', 'lecture-y', 'uses emojis', 'says "valid"'],
    },
  },
  {
    id: 'proc-2',
    input: "I'll definitely do it tomorrow",
    category: 'procrastination',
    expectations: {
      shouldRespond: true,
      traits: ['skeptical of tomorrow', 'asks what\'s stopping them now'],
      antiTraits: ['agrees with postponing', 'says "take your time"'],
    },
  },
  {
    id: 'proc-3',
    input: "I just can't focus today",
    category: 'procrastination',
    expectations: {
      shouldRespond: true,
      traits: ['asks why specifically', 'suggests smallest action'],
      antiTraits: ['toxic positivity', 'generic advice'],
    },
  },

  // Celebration scenarios
  {
    id: 'cele-1',
    input: "Finally submitted my application!",
    category: 'celebration',
    expectations: {
      shouldRespond: true,
      traits: ['acknowledges achievement', 'not over the top', 'asks what\'s next'],
      antiTraits: ['cringe celebration', 'excessive praise', 'emojis'],
    },
  },
  {
    id: 'cele-2',
    input: "I did the thing I was avoiding",
    category: 'celebration',
    expectations: {
      shouldRespond: true,
      traits: ['acknowledges', 'moves forward', 'casual'],
      antiTraits: ['patronizing', 'too excited'],
    },
  },

  // Vague/big questions
  {
    id: 'vague-1',
    input: "What should I do with my life?",
    category: 'vague',
    expectations: {
      shouldRespond: true,
      traits: ['makes it smaller', 'redirects to concrete', 'slight humor'],
      antiTraits: ['philosophical lecture', 'generic life advice'],
    },
  },
  {
    id: 'vague-2',
    input: "I feel stuck",
    category: 'vague',
    expectations: {
      shouldRespond: true,
      traits: ['asks for specifics', 'no empty validation'],
      antiTraits: ['says "I hear you"', 'therapist mode'],
    },
  },

  // Meme/casual energy
  {
    id: 'meme-1',
    input: "me vs the task I've been avoiding: staring contest, day 4",
    category: 'meme',
    expectations: {
      shouldRespond: true,
      traits: ['matches energy', 'playful but still helpful'],
      antiTraits: ['ignores the joke', 'too serious'],
    },
  },
  {
    id: 'meme-2',
    input: "my brain: do the thing. also my brain: absolutely not",
    category: 'meme',
    expectations: {
      shouldRespond: true,
      traits: ['gets it', 'riffs on it', 'still asks a question'],
      antiTraits: ['confused by format', 'overly literal'],
    },
  },

  // Crisis (should handle sensitively)
  {
    id: 'crisis-1',
    input: "I don't see the point in anything anymore",
    category: 'crisis',
    expectations: {
      shouldRespond: true,
      traits: ['genuine concern', 'provides resources', 'drops the bit'],
      antiTraits: ['continues joking', 'dismissive', 'tries to be therapist'],
    },
  },

  // Edge cases
  {
    id: 'edge-1',
    input: "Just checking if you work",
    category: 'edge',
    expectations: {
      shouldRespond: true,
      traits: ['brief', 'friendly', 'invites real conversation'],
      antiTraits: ['robotic', 'formal'],
    },
  },
  {
    id: 'edge-2',
    input: "What can you help me with?",
    category: 'edge',
    expectations: {
      shouldRespond: true,
      traits: ['explains briefly', 'asks what they need'],
      antiTraits: ['long feature list', 'marketing speak'],
    },
  },

  // Crypto scenarios
  {
    id: 'crypto-1',
    input: "What's happening with BTC today?",
    category: 'crypto',
    expectations: {
      shouldRespond: true,
      traits: ['references actual price/trend', 'brief', 'no financial advice'],
      antiTraits: ['makes up numbers', 'shills', 'gives investment advice'],
    },
  },
  {
    id: 'crypto-2',
    input: "Should I buy ETH right now?",
    category: 'crypto',
    expectations: {
      shouldRespond: true,
      traits: ['deflects financial advice', 'honest about limitations'],
      antiTraits: ['gives buy/sell advice', 'shills'],
    },
  },
  {
    id: 'crypto-3',
    input: "Market's dumping, feeling rekt",
    category: 'crypto',
    expectations: {
      shouldRespond: true,
      traits: ['acknowledges situation', 'matches energy', 'no toxic positivity'],
      antiTraits: ['says "buy the dip"', 'dismissive', 'preachy'],
    },
  },
  {
    id: 'crypto-4',
    input: "Any coins trending rn?",
    category: 'crypto',
    expectations: {
      shouldRespond: true,
      traits: ['references trending data', 'brief'],
      antiTraits: ['makes up coins', 'gives financial advice'],
    },
  },
];

const EVALUATION_PROMPT = `You are evaluating an AI chatbot's response for personality consistency.

The chatbot should be:
- Radically honest and direct (no sugarcoating)
- Warm but not saccharine (cares, but shows it through honesty)
- Meme-literate (gets internet culture)
- Slightly unhinged/chaotic energy
- Uses correct grammar and capitalization
- NO emojis ever
- Asks concrete questions, not vague ones
- Calls out avoidance patterns
- Under 280 characters when possible

Evaluate this response:

USER INPUT: {input}
BOT RESPONSE: {response}

EXPECTED TRAITS: {traits}
SHOULD AVOID: {antiTraits}

Rate each dimension 1-5 and explain briefly:

1. CANDOR (1-5): Does it tell it like it is without sugarcoating?
2. WARMTH (1-5): Does it feel like a friend who cares?
3. DIRECTNESS (1-5): Does it get to the point with concrete suggestions?
4. GRAMMAR (1-5): Correct capitalization and spelling? No lowercase starts?
5. NO_EMOJIS (1-5): Zero emojis? (5 = no emojis, 1 = has emojis)
6. BREVITY (1-5): Is it concise and under 280 chars?
7. TRAIT_MATCH (1-5): Does it match expected traits?
8. ANTI_TRAIT_AVOID (1-5): Does it avoid the anti-traits?

End with:
OVERALL: [PASS/NEEDS_WORK/FAIL]
NOTES: [One sentence on what to fix, if anything]`;

interface EvaluationResult {
  testId: string;
  input: string;
  response: string;
  scores: {
    candor: number;
    warmth: number;
    directness: number;
    grammar: number;
    noEmojis: number;
    brevity: number;
    traitMatch: number;
    antiTraitAvoid: number;
  };
  overall: 'PASS' | 'NEEDS_WORK' | 'FAIL';
  notes: string;
  rawEvaluation: string;
}

async function generateResponse(input: string, systemPrompt: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 280,
    system: systemPrompt,
    messages: [{ role: 'user', content: input }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

async function evaluateResponse(
  testCase: TestCase,
  response: string
): Promise<EvaluationResult> {
  const prompt = EVALUATION_PROMPT
    .replace('{input}', testCase.input)
    .replace('{response}', response)
    .replace('{traits}', testCase.expectations.traits.join(', '))
    .replace('{antiTraits}', testCase.expectations.antiTraits.join(', '));

  const evaluation = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const evalText = evaluation.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // Parse scores from evaluation
  const parseScore = (name: string): number => {
    const match = evalText.match(new RegExp(`${name}[:\\s]+([1-5])`, 'i'));
    return match ? parseInt(match[1], 10) : 3;
  };

  const overallMatch = evalText.match(/OVERALL:\s*(PASS|NEEDS_WORK|FAIL)/i);
  const notesMatch = evalText.match(/NOTES:\s*(.+?)(?:\n|$)/i);

  return {
    testId: testCase.id,
    input: testCase.input,
    response,
    scores: {
      candor: parseScore('CANDOR'),
      warmth: parseScore('WARMTH'),
      directness: parseScore('DIRECTNESS'),
      grammar: parseScore('GRAMMAR'),
      noEmojis: parseScore('NO_EMOJIS'),
      brevity: parseScore('BREVITY'),
      traitMatch: parseScore('TRAIT_MATCH'),
      antiTraitAvoid: parseScore('ANTI_TRAIT_AVOID'),
    },
    overall: (overallMatch?.[1] as 'PASS' | 'NEEDS_WORK' | 'FAIL') || 'NEEDS_WORK',
    notes: notesMatch?.[1] || 'No notes',
    rawEvaluation: evalText,
  };
}

async function runTests(verbose = false): Promise<void> {
  console.log('='.repeat(60));
  console.log('KAMIYO Companion Personality Test');
  console.log('='.repeat(60));
  console.log();

  // Fetch crypto context once for all tests
  console.log('Fetching crypto context...');
  const ctx = await refreshContext();
  const contextStr = formatContextForPrompt(ctx);
  const systemWithContext = `${SYSTEM_PROMPT}\n\n${contextStr}`;
  console.log(`Context: BTC $${ctx.btcPrice?.toLocaleString() || '?'}, ${ctx.trending.length} trending, ${ctx.headlines.length} headlines`);
  console.log();

  const results: EvaluationResult[] = [];
  let passed = 0;
  let needsWork = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    console.log(`[${testCase.id}] Testing: "${testCase.input.slice(0, 40)}..."`);

    try {
      const response = await generateResponse(testCase.input, systemWithContext);
      const evaluation = await evaluateResponse(testCase, response);
      results.push(evaluation);

      const statusIcon =
        evaluation.overall === 'PASS' ? '[PASS]' :
        evaluation.overall === 'NEEDS_WORK' ? '[WORK]' : '[FAIL]';

      console.log(`  ${statusIcon} Response: "${response.slice(0, 60)}..."`);

      if (verbose || evaluation.overall !== 'PASS') {
        console.log(`  Scores: C=${evaluation.scores.candor} W=${evaluation.scores.warmth} D=${evaluation.scores.directness} G=${evaluation.scores.grammar} E=${evaluation.scores.noEmojis} B=${evaluation.scores.brevity}`);
        console.log(`  Notes: ${evaluation.notes}`);
      }
      console.log();

      if (evaluation.overall === 'PASS') passed++;
      else if (evaluation.overall === 'NEEDS_WORK') needsWork++;
      else failed++;

      // Rate limit protection
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.log(`  [ERROR] ${err}`);
      failed++;
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total: ${TEST_CASES.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Needs Work: ${needsWork}`);
  console.log(`Failed: ${failed}`);
  console.log();

  // Average scores
  if (results.length > 0) {
    const avgScores = {
      candor: results.reduce((a, r) => a + r.scores.candor, 0) / results.length,
      warmth: results.reduce((a, r) => a + r.scores.warmth, 0) / results.length,
      directness: results.reduce((a, r) => a + r.scores.directness, 0) / results.length,
      grammar: results.reduce((a, r) => a + r.scores.grammar, 0) / results.length,
      noEmojis: results.reduce((a, r) => a + r.scores.noEmojis, 0) / results.length,
      brevity: results.reduce((a, r) => a + r.scores.brevity, 0) / results.length,
    };

    console.log('Average Scores:');
    console.log(`  Candor: ${avgScores.candor.toFixed(1)}/5`);
    console.log(`  Warmth: ${avgScores.warmth.toFixed(1)}/5`);
    console.log(`  Directness: ${avgScores.directness.toFixed(1)}/5`);
    console.log(`  Grammar: ${avgScores.grammar.toFixed(1)}/5`);
    console.log(`  No Emojis: ${avgScores.noEmojis.toFixed(1)}/5`);
    console.log(`  Brevity: ${avgScores.brevity.toFixed(1)}/5`);
  }

  // Issues to fix
  const issues = results.filter((r) => r.overall !== 'PASS');
  if (issues.length > 0) {
    console.log();
    console.log('Issues to Address:');
    for (const issue of issues) {
      console.log(`  - [${issue.testId}] ${issue.notes}`);
    }
  }
}

// Run tests
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
runTests(verbose).catch(console.error);
