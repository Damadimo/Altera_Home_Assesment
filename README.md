# Mini DevTools Recorder

Chrome extension for recording user interactions with deterministic replay capabilities. Provides both in-browser and Playwright-based replay engines.

## Features

**Robust Element Targeting**
- Multi-layered selector strategy: `data-testid` → ARIA attributes → role+name → structural fallbacks
- Menu scoping prevents false matches on hidden duplicates
- ContentEditable typing support with proper event synthesis
- Pointer/click deduplication and debounced scroll capture

**Privacy & Security**
- Automatic sensitive field detection (passwords, credit cards, `[data-private]`)
- Local-only storage, no external transmission
- Minimal permissions (activeTab, scripting, downloads, storage, tabs)

**Smart Assertions**
- Automatic `waitVisible` steps after menu selections
- Validates UI state changes for deterministic replay
- Timeout-based element waiting with graceful degradation

**Developer Experience**
- Visual element highlighting during replay
- `--respect-timing` for realistic playback speed
- Failure screenshots and error artifacts
- Video recording support (`--video` flag)

## Quick Start

**Extension Setup:**
1. Load unpacked extension from `extension/` folder in Chrome
2. Use popup UI to start/stop recording
3. Download traces as JSON or replay in new tab

**Playwright Replayer:**
```bash
cd replayer && npm install
node replay.js ../traces/your-trace.json --headful --respect-timing
```

**Options:**
- `--headful` - Visual browser mode
- `--respect-timing` - Use recorded timestamps
- `--speed=2.0` - Playback speed multiplier  
- `--video` - Record MP4 for debugging
- `--timeout=5000` - Element wait timeout (ms)

## Design Decisions

**HTML Selectors + ARIA over Vision**
- **Speed**: DOM queries vs. image processing overhead
- **Determinism**: Semantic targeting vs. visual brittleness  
- **Resource efficiency**: No GPU/ML dependencies required
- **Maintainability**: Readable selectors for debugging

**Multiple Fallback Strategy**
- Primary: Semantic attributes (`data-testid`, `aria-label`)
- Secondary: Stable IDs and ARIA combinations
- Tertiary: Structural paths with stable classes
- Scope-aware: Menu contexts prevent hidden element conflicts

## Limitations & Future Work

**Current Scope:**
- Single-tab interactions only
- No cross-site authentication flows
- DOM-based targeting (no canvas/video elements)

**Planned Enhancements:**
- Drag-and-drop gesture support
- File upload interaction recording  
- Clipboard operation capture
- Optional vision fallback for non-DOM targets
- StorageState integration for auth persistence

## Architecture

```
extension/                  # Chrome Extension (MV3)
├── manifest.json          # Extension configuration
├── background.js          # Service worker & state coordination
├── content.js             # Event capture engine
├── replayer.content.js    # In-browser replay engine
├── popup.html             # Recording UI
├── popup.js               # UI logic
└── utils/
    ├── selector.js        # Robust selector generation
    └── trace-validator.js # Schema validation

replayer/                  # Standalone CLI
├── package.json           # Playwright dependencies
├── replay.js              # CLI replay with video support
└── artifacts/             # Generated screenshots/videos

traces/                    # Example traces
├── example.json           # Sample trace file
└── ChatGPT_Convo_Trace.json

trace.schema.json          # JSON Schema v1
LICENSE
```

## Trace Format

```json
{
  "version": 1,
  "meta": { "userAgent": "...", "viewport": {"width": 1280, "height": 720} },
  "steps": [
    {"type": "navigate", "url": "https://app.com", "ts": 0},
    {"type": "click", "selector": "[data-testid='btn']", "offset": {"x": 10, "y": 8}, "ts": 0.5},
    {"type": "type", "selector": "#input", "text": "hello", "ts": 1.2},
    {"type": "waitVisible", "selector": "[aria-checked='true']", "timeout": 3000, "ts": 1.8}
  ]
}
```

MIT License