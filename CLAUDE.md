# Development Guidelines

## Code Quality Standards

Write like a human senior engineer:
- No emojis
- No marketing language
- No verbose explanations
- No AI-sounding phrases
- Technical details only
- Concise and to the point


### Documentation 

- Technical specifications, not marketing
- Code examples with actual implementation
- No phrases like "revolutionary", "game-changing", "cutting-edge"
- No self-references or meta-commentary

### Git Identity

All commits must use the KAMIYO identity. Before committing, ensure git config is set:

```bash
git config user.name "KAMIYO"
git config user.email "dev@kamiyo.ai"
```

This sets BOTH author and committer. Do NOT use `--author` flag alone as it leaves personal info in the committer field.

### Commit Messages

- Imperative mood: "Add feature" not "Added feature"
- Describe what and why, not how
- No emojis or decorative elements
- No "Generated with Claude Code" attribution
- No "Co-Authored-By" lines
- No AI tool references

### Code Comments
- Explain why, not what
- Technical rationale only
- No obvious comments or verbose language

