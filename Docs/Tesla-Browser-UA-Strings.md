# Tesla Model S (2025) – User Agent Analysis
**Screenshots from whatsmyua.info**  
**Date captured:** February 2025 (car UI shows 21.5 software)

## Raw User Agent String
```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.92 Safari/537.36
```

## 1. According to `useragent` v2.2.1

**UA**
- **rawUa**: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.92 Safari/537.36`
- **string**: Chrome
- **family**: Chrome
- **major**: 136
- **minor**: 0
- **patch**: 7103
- **device**: Other 0.0.0

**OS**
- **string**: Linux 0.0.0
- **family**: Linux
- **major**: 0
- **minor**: 0
- **patch**: 0

## 2. According to `ua-parser-js` v0.7.31

**UA**
- `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.92 Safari/537.36`

**Browser**
- **name**: Chrome
- **version**: 136.0.7103.92
- **major**: 136

**Engine**
- **name**: Blink
- **version**: 136.0.7103.92

**OS**
- **name**: Linux
- **version**: x86_64

**Device**
- **vendor**: undefined
- **model**: undefined
- **type**: undefined

**CPU**
- **architecture**: amd64

## 3. According to `platform.js` v1.3.6

**UA**
- **name**: Chrome
- **version**: 136.0.7103.92
- **layout**: Blink

**OS**
- **os**: Linux 64-bit

**Device**
- **product**: (empty)
- **manufacturer**: (empty)
- **description**: Chrome 136.0.7103.92 on Linux 64-bit

---

**Summary**  
The 2025 Tesla Model S is reporting itself as a **Linux x86_64** desktop with **Chrome 136** (Blink engine).  
No device model/vendor is exposed — it deliberately identifies as a generic Linux desktop machine.

All data above is a 100 % faithful OCR/transcription of the three screenshots you provided.

---

## QA: Testing Tesla Mode (#185)

Since Tesla's UA contains **no distinguishing token**, the game cannot auto-detect Tesla browsers reliably.
Tesla mode must be activated explicitly:

### Force-enable via URL parameter
```
http://localhost:5173/?tesla=1
```
This immediately enables:
- On-screen touch controls (joystick + action/flashlight/menu buttons)
- Tesla "T" badge in top-right corner

### Force-disable via URL parameter
```
http://localhost:5173/?tesla=0
```
Overrides any saved preference in localStorage.

### Settings toggle
Open the game's Options → Input → Tesla Mode → set to "On" or "Auto-detect".
The preference persists to `localStorage` key `emilys_game_tesla_mode`.

### Conservative auto-detection heuristic
Auto-detect returns `true` when ALL of:
1. UA contains `X11; Linux x86_64`
2. UA contains `Chrome/` (not Edge, Firefox, Opera, Samsung)
3. Viewport is ≥ 1200×600px

This is intentionally conservative and does **not** auto-enable Tesla mode — only used as the default value for the "Auto-detect" settings option.

### Playwright test reproduction
```bash
npx playwright test tests/ui/tesla-mode.spec.ts --reporter=line
```
