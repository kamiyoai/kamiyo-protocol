# Git Subtree Quick Reference

## Current Setup

```
kamiyo (main repo)
├── packages/kagami → kamiyo-ai/kagami
└── packages/payai → mizuki-tamaki/kamiyo-payai
```

## Daily Workflow

### Work on Kagami in Main Repo

```bash
cd /Users/dennisgoslar/Projekter/kamiyo
cd packages/kagami
# Make changes to kagami
git add packages/kagami
git commit -m "Update kagami: description"
git push origin main

# Push to open source repo
git subtree push --prefix=packages/kagami kagami-remote main
```

### Work on PayAI in Main Repo

```bash
cd packages/payai
# Make changes
git add packages/payai
git commit -m "Update payai: description"
git push origin main

# Push to open source
git subtree push --prefix=packages/payai payai-remote main
```

### Pull Updates from Open Source

If someone contributes to kagami on GitHub:

```bash
git subtree pull --prefix=packages/kagami kagami-remote main --squash
git push origin main
```

If someone contributes to payai:

```bash
git subtree pull --prefix=packages/payai payai-remote main --squash
git push origin main
```

## One-Time Setup (Already Done)

```bash
# Add remotes
git remote add kagami-remote https://github.com/kamiyo-ai/kagami.git
git remote add payai-remote https://github.com/mizuki-tamaki/kamiyo-payai.git

# Add subtrees
git subtree add --prefix=packages/kagami kagami-remote main --squash
git subtree add --prefix=packages/payai payai-remote main --squash
```

## Common Operations

### Push All Changes to Open Source

```bash
# After committing to main repo
git subtree push --prefix=packages/kagami kagami-remote main
git subtree push --prefix=packages/payai payai-remote main
```

### Pull All Updates from Open Source

```bash
git subtree pull --prefix=packages/kagami kagami-remote main --squash
git subtree pull --prefix=packages/payai payai-remote main --squash
```

### Check Remote Status

```bash
git remote -v | grep -E "(kagami|payai)-remote"
```

## Important Notes

1. **Always use --squash**: Keeps main repo history clean
2. **Commit to main first**: Work in packages/, commit to main, then push to open source
3. **No .gitmodules**: Subtrees don't create submodule files
4. **Full integration**: packages/ directories are fully part of main repo

## External Contributors

External contributors can still clone and work on open source repos independently:

```bash
# Contributor workflow
git clone https://github.com/kamiyo-ai/kagami.git
cd kagami
# Make changes, create PR to kamiyo-ai/kagami
```

You then pull their changes:

```bash
git subtree pull --prefix=packages/kagami kagami-remote main --squash
```

## Troubleshooting

### If subtree push fails:

```bash
# Force push (use carefully)
git push kagami-remote `git subtree split --prefix=packages/kagami main`:main --force
```

### If you accidentally worked in separate repo:

```bash
cd /Users/dennisgoslar/Projekter/kagami
# Copy changes manually to kamiyo/packages/kagami
rsync -av --exclude='.git' ./ ../kamiyo/packages/kagami/
cd ../kamiyo
git add packages/kagami
git commit -m "Sync kagami changes"
git subtree push --prefix=packages/kagami kagami-remote main
```

---

**Recommendation**: Always work in `/Users/dennisgoslar/Projekter/kamiyo/packages/` and use subtree push to sync to open source repos.
