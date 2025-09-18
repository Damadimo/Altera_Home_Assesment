# Mini DevTools Recorder

A small Chrome extension that records browser actions and replays them either directly in a tab or via a Playwright script.
The extension currently supports clicking, typing and scrolling actions.

[Watch The Demo!](https://www.youtube.com/embed/TQIKGTnLeX4)

[<img src="https://img.youtube.com/vi/TQIKGTnLeX4/hqdefault.jpg" width="800" height="450"
/>](https://www.youtube.com/embed/TQIKGTnLeX4)

## Quick Start

**Setting up & Using Extension**

1. Load the extension

2. Open chrome://extensions, toggle Developer mode, click Load unpacked, choose /extension.

3. Navigate to website (ex: https://chatgpt.com)

4. Open the popup → Press Start Recording

5. Do the Action Flow (ex: A multi round conversation with ChatGPT)

6. After Completing the Action Flow, press the Stop Recording button on the top right of your screen

7. Open the Extension popup, where you can Download the Trace in JSON format

8. Run the recorded trace using CLI (more on that later) or using the "Replay in New Tab" button

Optional toggle: Respect timing (replay waits based on your recorded delays).

**Playwright Replay using CLI:**
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

On any failure, the script writes artifacts/step-XX-fail.png and appends to artifacts/errors.json.

## Design Decisions

**Why Not OCR/Vision**

- DOM-based selectors are deterministic, fast, and require no model runtime or GPU.
- OCR/vision would help on canvas-only UIs with no semantics, but adds latency, dependencies, and uncertainty.
- If I had more time, I’d add a pluggable locator that can fall back to vision for elements without a usable selector.


**How I  “find” things to click/type/**

- First try stable IDs or data-testid. If those aren’t there, use accessible labels (e.g., a button with aria-label="Search").
- For pop-up menus, the extension look inside the visible menu on screen, not hidden copies the app keeps around. This avoids clicking the wrong item.
- Only if none of the above exist do it falls back to a short CSS path. (Trying to avoid brittle stuff like long class chains).

**Clicking**

On replay we send the same sequence a user would: pointerdown → mousedown → mouseup → click, at the exact spot that was recorded. Many sites listen for these specifically.

**Typing**

Typing works in both kinds of editors
- Standard fields (input, textarea): we set .value and fire an input event so frameworks update.
- Rich editors (contenteditable): “insert text” character by character, which triggers the editor’s own handlers.

**Timing and waiting**

- Before acting, the extension wait for the page to finish loading and for the target element to exist.
- “Respect timing” (toggle) replays your original delays so interactions don’t run ahead of the UI.

## Limitations & Future Work

**Current Scope:**

- Single-tab interactions only
- No cross-site authentication flows
- DOM-based targeting (no canvas/video elements)
- Only records and replays clicks, typing and scrolls 

**Room for future Enhancements:**

- File upload interaction recording  
- Clipboard operation capture
- Optional vision fallback for non-DOM targets
- StorageState integration for auth persistence

## What I finished before the Two Hour Mark

- Set up the Chrome extension with a simple popup and background script.
- Built the recorder: it logs page visits, clicks, types, presses Enter, and basic scrolling.
- Added a Download Trace button that saves the actions as a JSON file.
- Wrote a command-line replayer (Playwright) that can open the site and play those actions back.

## What I did after the Two Hour Mark

- Replay in New Tab button from the extension UI, plus a toggle to respect the original timing.
- Made menu clicks reliable even if the app changes layout (it chooses items by visible name like “Web search,” not fragile CSS positions).
- More realistic clicks (the replay clicks at the same spot you did) and a quick highlight on the target so you can see what’s happening.
- Polished UI using your logo to come up with a nice theme


## Architecture

```
extension/                  # Chrome Extension (MV3)
├── manifest.json          # Extension configuration
├── background.js          # Service worker & state coordination
├── content.js             # Event capture engine
├── replayer.content.js    # In-browser replay engine
├── popup.html             # Recording UI
├── popup.js               # UI logic
├── icons/                 # Extension icons
│   ├── icon-16.png        # 16x16 icon
│   ├── icon-32.png        # 32x32 icon
│   └── icon-48.png        # 48x48 icon
└── utils/
    ├── selector.js        # Robust selector generation
    └── trace-validator.js # Schema validation

replayer/                  # Standalone CLI
├── package.json           # Playwright dependencies
├── package-lock.json      # Dependency lock file
├── replay.js              # CLI replay with video support
├── artifacts/             # Generated screenshots/videos
└── node_modules/          # Dependencies

traces/                    # Example traces
└── example.json           # Sample trace file

trace.schema.json          # JSON Schema v1
LICENSE
README.md
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
