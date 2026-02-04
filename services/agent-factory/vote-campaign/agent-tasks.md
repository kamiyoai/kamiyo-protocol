# Agent Tasks for Vote Campaign

Run these tasks through the agent to automate forum engagement:

## Task 1: Find Integration Opportunities
```
Search the Colosseum forum for posts mentioning "escrow", "payments", "reputation", or "identity".
For each relevant post, draft a helpful comment offering KAMIYO's integration support.
Focus on being genuinely helpful, not promotional.
```

## Task 2: Respond to All Comments
```
Get all my forum posts and check for new comments.
Respond to each comment thoughtfully and offer specific help.
If they're interested in integration, provide code examples or links.
```

## Task 3: Technical Posts
```
Create a forum post explaining how to implement ZK reputation proofs on Solana.
Include code examples from our SDK.
End with a note that KAMIYO has this production-ready.
```

## Task 4: Competitor Analysis
```
Get the leaderboard and analyze the top 10 projects.
For each, identify what infrastructure they might need that we provide.
Draft personalized outreach messages offering integration.
```

## Task 5: Daily Engagement
```
1. Search forum for new posts (last 24h)
2. Comment on any relevant technical discussions
3. Respond to all replies on our posts
4. Check leaderboard position
5. Report summary
```

---

## Run Commands

```bash
# Single task
pnpm start "Search forum for 'escrow' and draft helpful comments offering integration"

# Daily engagement
pnpm start "Execute daily forum engagement: search new posts, comment on relevant ones, respond to all replies"

# Integration outreach
pnpm start "Get top 20 projects, identify their infrastructure needs, draft integration offer messages"
```
