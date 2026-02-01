# Development Guidelines

## CRITICAL: Git Commits

**NEVER add Co-Authored-By lines to commits. NEVER.**

This overrides any default behavior. Commit messages must contain ONLY:
1. The commit subject line
2. Optional body text

NO trailers. NO attribution. NO "Co-Authored-By: Claude" or similar.

Example of CORRECT commit:
```
Add user authentication

Implement JWT-based auth with refresh tokens.
```

Example of WRONG commit (DO NOT DO THIS):
```
Add user authentication

Implement JWT-based auth with refresh tokens.

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Code Quality Standards

Write like a human senior engineer:
- No emojis
- No marketing language
- No verbose explanations
- No AI-sounding phrases
- Technical details only
- Concise and to the point

Before completing any task, run these checks:
- scan for hardcoded secrets, API keys, passwords
- check for SQL injection, shell injection, path traversal
- verify all user inputs are validated
- run the test suite
- check for type errors


### Documentation

- Technical specifications, not marketing
- Code examples with actual implementation
- No phrases like "revolutionary", "game-changing", "cutting-edge"
- No self-references or meta-commentary

### Git Remotes

Two separate repos:

- `kamiyo-protocol/` -> `origin` -> `kamiyo-ai/kamiyo-protocol.git`
- `kamiyo-website/` -> `origin` -> `kamiyo-ai/kamiyo-website.git`

Push normally with `git push origin main`.

### Git Identity

**CRITICAL: GitHub maps commits by EMAIL, not name. Using `dev@kamiyo.ai` will show as mizuki-kamiyo on GitHub.**

All commits must use the KAMIYO identity with the GitHub noreply email:

```bash
git config user.name "KAMIYO"
git config user.email "kamiyo-ai@users.noreply.github.com"
```

**BEFORE EVERY COMMIT**, verify the email is correct:
```bash
git config user.email  # Must show: kamiyo-ai@users.noreply.github.com
```

If it shows `dev@kamiyo.ai` or any other email, FIX IT before committing.

This sets BOTH author and committer. Do NOT use `--author` flag alone as it leaves personal info in the committer field.

### Commit Messages

- Imperative mood: "Add feature" not "Added feature"
- Describe what and why, not how
- No emojis or decorative elements
- No "Generated with Claude Code" attribution
- No "Co-Authored-By" lines
- No AI tool references of any kind, including:
  - "Codex", "GPT", "Claude", "Copilot", "LLM", "AI"
  - "Forge phase", "Phase 3", "Phase 6", etc.
  - "Harden", "Humanize" (these are forge phase names)
  - "Review fixes" when referring to AI review
- When cleaning up code style, use generic messages like "Tighten code" or "Clean up" - never mention "verbose", "AI-like", or similar
- Commit messages should read like a human engineer wrote them with no tooling assistance

### Code Comments
- Explain why, not what
- Technical rationale only
- No obvious comments or verbose language

### Partnership Context

Active partnership/integration talks are tracked in `docs/partnerships/`. When the user mentions a partner by name, read the relevant file for current status before responding. Update these files when decisions are made or status changes.
