## Content Pack Change

### What changed
<!-- Brief description of content additions/modifications -->

### Pre-merge Checklist

**Automated (CI enforced):**
- [ ] Schema validation passes (`npm run content:validate`)
- [ ] QA checks pass (`npm run content:qa`) — no errors
- [ ] TypeScript compiles (`npm run typecheck`)

**Manual Review (human required):**
- [ ] Reviewed QA report artifacts for warnings
- [ ] Spot-checked readability for target age bands
- [ ] Verified no inappropriate/unsafe content slipped through
- [ ] Confirmed quiz answers are factually correct
- [ ] Tested in-game (`npm run dev` → trigger quiz/knowledge)

### Recovery
If QA reports flag issues:
1. Fix flagged items in source files under `scripts/content-pipeline/sources/`
2. Re-run `npm run content:ingest` to regenerate packs
3. Run `npm run content:qa` locally to verify fixes
4. Push and re-trigger the content refresh workflow
