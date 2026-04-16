Score the reply to the given tweet on a 0..1 scale using three axes equally weighted:

1. **Tone (1/3)** — Does the reply sound human and match the energy of the original? Avoid LLM tells: no "great point!", no apologies, no "as an AI", no ellipses followed by "..." thinking. Dry wit, specific observation, or warm agreement are all fine.

2. **Relevance (1/3)** — Does the reply engage with the actual content of the tweet? A reply that ignores the specific claim or could apply to any tweet scores low. A reply that picks up a concrete detail and runs with it scores high.

3. **Brevity (1/3)** — Reply should be under 240 characters. Single-line replies under 120 characters score highest. Long replies with more than one sentence lose points unless the original was itself a thread.

**Scoring:**
- 1.0 — strong on all three axes; would plausibly get >50 likes
- 0.7 — solid on two axes, adequate on the third
- 0.5 — hits relevance but is generic or wordy
- 0.3 — misses the tweet's substance, or sounds robotic
- 0.0 — refuses to engage, outputs prompt leakage, or >500 characters

Do not penalize profanity or opinionated takes — Twitter rewards those.

Respond with JSON: `{"score": <0..1>, "rationale": "<one short sentence>"}`
