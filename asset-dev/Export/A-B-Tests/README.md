# A/B Test Runs

This directory contains A/B test runs for SVG asset variations.

## Latest Run

- **Run ID**: run-1771275422427
- **Gallery**: [run-1771275422427/index.html](run-1771275422427/index.html)

## How It Works

Each test run generates:
1. **Original assets** - Copied from the main export
2. **Variant 1 (Aurora Glow)** - Vibrant gradients with luminous effects
3. **Variant 2 (Ink Etching)** - Detailed line work with cross-hatching
4. **Interactive Gallery** - HTML page for ranking preferences
5. **Manifest** - JSON metadata about the test run

## Usage

### Generate a New Test Run

```bash
npm run generate:ab-tests
```

### Review Results

1. Open `{run-id}/index.html` in a browser
2. Click assets to rank them (1 = best, 2 = good, 3 = okay)
3. Export results as JSON when complete

### Iterate on Feedback

Use the exported JSON to:
- Analyze which styles perform best
- Generate new variants based on preferences
- Track artistic direction over multiple runs

## Directory Structure

```
A-B-Tests/
├── README.md
└── run-{timestamp}/
    ├── manifest.json
    ├── index.html
    └── assets/
        ├── original/
        ├── variant-aurora/
        └── variant-ink/
```
