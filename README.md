# Mini DevTools Recorder

A Chrome DevTools-style "Recorder + Replayer" project for capturing and replaying user interactions.

## Project Overview

This project will become a comprehensive tool for:

1. **Recording user interactions** in web browsers (navigate, click, type, scroll) via a Chrome extension
2. **Replaying recorded traces** reliably using Playwright automation
3. **Generating traces** of complex workflows like multi-round ChatGPT conversations

## Phase 0 Status ⚠️

**This is currently a Phase 0 scaffold** - a clean, runnable foundation with valid stubs but **no heavy recording/replay logic yet**.

All files are functional stubs with:
- ✅ Valid syntax and structure
- ✅ Clear TODO comments for future implementation
- ✅ Proper error handling and logging
- ✅ No runtime errors when loaded

## Quick Start

### Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked" and select the `extension/` directory
4. The "Mini DevTools Recorder" extension should appear in your extensions list
5. Click the extension icon to open the popup interface

### Replayer Setup

```bash
cd replayer
npm install
npm run setup
```

### Test the Phase 0 Stub

```bash
npm run replay -- ../traces/example.json
```

This will print a stub message since no actual replay logic exists yet.

## Roadmap

- [ ] **Phase 1**: Minimal Recorder (events → JSON)
  - Implement event capture in content script
  - Build robust selector generation
  - Create downloadable JSON traces
  
- [ ] **Phase 2**: Minimal Replayer (Playwright)
  - Parse and validate trace JSON
  - Execute navigation, clicks, typing, scrolling
  - Handle basic error recovery
  
- [ ] **Phase 3**: Required ChatGPT trace & verification
  - Record a multi-round ChatGPT conversation
  - Include one Search-mode query
  - Verify replay accuracy
  
- [ ] **Phase 4**: Selector fallbacks, waits, artifacts
  - Advanced selector strategies
  - Smart waiting and retry logic
  - Screenshot/video artifacts
  
- [ ] **Phase 5**: Documentation & polish
  - Complete documentation
  - Performance optimizations
  - "What I built in 2 hours" summary

## Design Principles

- **Deterministic selectors first**: Prioritize stable, semantic selectors over fragile positional ones
- **Retries and waits later**: Build core functionality first, add resilience in Phase 4
- **Privacy masking later**: Focus on functionality before implementing data protection
- **Simple schema**: Keep trace format minimal and extensible
- **Debounced scrolls**: Prevent excessive scroll event capture
- **Reproducibility**: Ensure traces can be replayed reliably across environments

## Architecture

```
repo/
├── extension/          # Chrome Manifest V3 extension
│   ├── manifest.json   # Extension configuration
│   ├── popup.html      # Recording interface
│   ├── popup.js        # UI logic and messaging
│   ├── background.js   # Service worker for downloads
│   ├── content.js      # Interaction capture
│   └── utils/
│       └── selector.js # Robust selector generation
├── replayer/           # Node.js + Playwright replayer
│   ├── package.json    # Dependencies and scripts
│   ├── replay.js       # Main replay logic
│   └── .gitignore      # Replayer-specific ignores
├── traces/             # Saved interaction traces
│   └── .gitkeep        # Keep directory in git
├── .gitignore          # Global ignore rules
├── .editorconfig       # Code style consistency
├── LICENSE             # MIT license
└── README.md           # This file
```

## Acceptance Criteria (Phase 0)

- [x] Extension loads as unpacked MV3 extension with no errors
- [x] Popup works: buttons update UI state and log stub actions  
- [x] Background & content scripts attach without runtime errors
- [x] Replayer installs: `cd replayer && npm i && npm run setup` succeeds
- [x] Replayer stub runs: `npm run replay -- ../traces/example.json` prints stub message
- [x] Repository hygiene: proper .gitignore, .editorconfig, LICENSE, and clear README

## Development Notes

### Extension Permissions

- `activeTab`: Access to currently active browser tab for interaction capture
- `scripting`: Inject content scripts for event monitoring  
- `downloads`: Save recorded traces as JSON files

### Trace Format (Future)

```json
{
  "meta": {
    "userAgent": "Mozilla/5.0...",
    "viewport": {"width": 1920, "height": 1080},
    "startTime": 1640995200000,
    "duration": 45000
  },
  "steps": [
    {
      "type": "navigate",
      "timestamp": 0,
      "url": "https://example.com"
    },
    {
      "type": "click", 
      "timestamp": 1500,
      "selector": "#submit-button",
      "coordinates": {"x": 120, "y": 45}
    }
  ]
}
```

## Contributing

This is a Phase 0 scaffold. The next phase will implement actual recording functionality.

## License

MIT License - see [LICENSE](LICENSE) file for details.
