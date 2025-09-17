(function () {
  'use strict';

  const CONSTANTS = {
    TYPING_FLUSH_DELAY: 200,
    SCROLL_DEBOUNCE_DELAY: 120,
    CLICK_DEDUPE_WINDOW: 250,
    MAX_SELECTOR_DEPTH: 4,
    OVERLAY_Z_INDEX: 2147483647,
    MERGE_TYPE_GAP_SEC: 1.0
  };

  const SELECTORS = {
    RECORDER_UI: '[data-recorder-ui]',
    STOP_BUTTON: '#rec-stop',
    ACTIONABLE_ELEMENTS: 'textarea,input,button,[role="button"],a[href],select,[data-testid],[aria-label]',
    POPUP_CONTEXTS: '[role="menu"],[role="listbox"],[role="dialog"],[data-radix-portal],[data-portal]',
    MENU_ITEMS: '[role="menuitem"],[role="option"],button,[role="button"]',
    PLACEHOLDER_ELEMENTS: '[data-placeholder]',
    PROMPT_TEXTAREA: '#prompt-textarea',
    FORM_CONTAINERS: 'form,[role="form"],[data-testid],.composer'
  };

  const recorder = {
    recording: false,
    t0: 0,
    meta: { 
      userAgent: navigator.userAgent, 
      viewport: { width: 0, height: 0 } 
    },
    steps: []
  };

  let cleanupFunctions = [];
  const typingBuffers = new WeakMap();
  const bufferedElements = new Set();
  let scrollTimeout = null;
  let lastScrollPosition = { x: 0, y: 0 };
  let skipNextClickUntil = 0;
  let overlay = null;

  const getTimestamp = () => (performance.now() - recorder.t0) / 1000;

  const buildSelector = (element) => {
    return window.SelectorUtils?.buildRobustSelector?.(element) || 
           element.tagName?.toLowerCase() || '';
  };

  const isRecorderUIEvent = (event) => {
    if (overlay?.contains?.(event.target)) return true;
    if (event.composedPath?.().includes(overlay)) return true;
    return !!event.target?.closest?.(SELECTORS.RECORDER_UI);
  };

  const isInPopupContext = (node) => {
    return !!node.closest?.(SELECTORS.POPUP_CONTEXTS);
  };

  class RecorderUI {
    static create() {
      if (overlay) return overlay;

      const element = document.createElement('div');
      element.setAttribute('data-recorder-ui', 'true');
      element.style.cssText = `
        position: fixed; top: 12px; right: 12px; z-index: ${CONSTANTS.OVERLAY_Z_INDEX};
        background: rgba(254, 252, 248, 0.95); color: #2c2c2c; 
        font: 500 12px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        padding: 8px 12px; border-radius: 8px; display: flex; gap: 8px; align-items: center;
        box-shadow: 0 2px 8px rgba(44, 44, 44, 0.15);
        border: 1px solid rgba(212, 196, 168, 0.3);
        pointer-events: none;
        backdrop-filter: blur(8px);
      `;
      
      element.innerHTML = `
        <span style="color: #4a4a4a; font-size: 12px;">●</span>
        <span style="font-weight: 600; color: #2c2c2c;">REC</span>
        <button id="rec-stop" style="
          margin-left: 6px; background: #2c2c2c; color: #fefcf8; border: none; 
          border-radius: 4px; padding: 4px 8px; cursor: pointer; pointer-events: auto;
          font-size: 11px; font-weight: 500; transition: background 0.15s ease;
        " onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background='#2c2c2c'">Stop</button>
      `;

      document.documentElement.appendChild(element);

      const stopButton = element.querySelector(SELECTORS.STOP_BUTTON);
      stopButton.addEventListener('click', this.handleStopClick, { capture: true });

      overlay = element;
      return element;
    }

    static remove() {
    overlay?.remove();
    overlay = null;
  }

    static handleStopClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      RecorderController.stop();
      try {
        chrome.runtime.sendMessage({ type: 'REC_STOP_REQUEST' });
      } catch (_) {}
    };
  }

  class TypingManager {
    static flush(element) {
      const buffer = typingBuffers.get(element);
      if (!buffer || !buffer.text) return;

      recorder.steps.push({
        type: 'type',
        selector: buildSelector(element),
        text: buffer.text,
        ts: getTimestamp()
      });

      buffer.text = '';
      buffer.lastValue = element?.isContentEditable ? 
        element.innerText : 
        (element?.value ?? '');

      if (buffer.timer) {
        clearTimeout(buffer.timer);
        buffer.timer = null;
      }
    }

    static handleInput(element, event) {
      if (!typingBuffers.has(element)) {
        typingBuffers.set(element, { text: '', timer: null, lastValue: '' });
        bufferedElements.add(element);
      }

      const buffer = typingBuffers.get(element);
      const currentValue = element.isContentEditable ? 
        element.innerText : 
        (element.value ?? '');

      let delta = '';
      if (event.data != null) {
        delta = event.data;
      } else {
        const lastValue = buffer.lastValue || '';
        delta = currentValue.startsWith(lastValue) ? 
          currentValue.slice(lastValue.length) : 
          currentValue;
      }

      if (delta) buffer.text += delta;
      buffer.lastValue = currentValue;

      if (buffer.timer) clearTimeout(buffer.timer);
      buffer.timer = setTimeout(() => this.flush(element), CONSTANTS.TYPING_FLUSH_DELAY);
    }

    static flushAll() {
      for (const element of bufferedElements) {
        this.flush(element);
      }
      bufferedElements.clear();
    }
  }

  class EventHandlers {
    static recordClick(event) {
      if (!recorder.recording || isRecorderUIEvent(event)) return;

      let target = event.target;
      const clickData = {
          type: 'click',
        selector: '',
        offset: { x: 0, y: 0 },
        ts: getTimestamp()
      };

      if (isInPopupContext(target)) {
        target = this.handlePopupClick(target, event, clickData);
      } else {
        target = this.handlePageClick(target, event, clickData);
      }

      clickData.selector = buildSelector(target);
      this.calculateOffset(target, event, clickData);
      
      recorder.steps.push(clickData);

      // Add assertion for menu item selections
      if (clickData.role && (clickData.role.startsWith('menuitem') || clickData.role === 'option')) {
        const label = clickData.name?.trim();
        if (label) {
          recorder.steps.push({
            type: 'waitVisible',
            selector: `[role^="menuitem"][aria-label="${CSS.escape(label)}"][aria-checked="true"]`,
            timeout: 3000,
            ts: getTimestamp()
          });
        }
      }
    }

    static handlePopupClick(target, event, clickData) {
      const clickableItem = target.closest(SELECTORS.MENU_ITEMS) || target;
      const role = clickableItem.getAttribute('role') || 
        (clickableItem.closest('[role="menu"],[role="listbox"]') ? 'menuitem' : undefined);
      const name = (clickableItem.getAttribute('aria-label') || 
        clickableItem.textContent || '').trim();

      const fallbacks = [];
      const testId = clickableItem.getAttribute('data-testid');
      if (testId) fallbacks.push(`[data-testid="${CSS.escape(testId)}"]`);
      if (role && name) {
        fallbacks.push(`[role="${CSS.escape(role)}"][aria-label="${CSS.escape(name)}"]`);
      }

      if (fallbacks.length) clickData.fallbacks = fallbacks;
      if (role) clickData.role = role;
      if (name) clickData.name = name;

      return clickableItem;
    }

    static handlePageClick(target, event, clickData) {
      const actionableElement = target.closest?.(SELECTORS.ACTIONABLE_ELEMENTS);
      if (actionableElement) target = actionableElement;

      // Retarget placeholder elements to actual inputs
      if (target.matches?.(SELECTORS.PLACEHOLDER_ELEMENTS)) {
        const realTarget = document.querySelector(SELECTORS.PROMPT_TEXTAREA) ||
          target.closest(SELECTORS.FORM_CONTAINERS)?.querySelector('textarea, input') ||
          target;
        target = realTarget;
      }

      const fallbacks = [];
      const ariaLabel = target.getAttribute?.('aria-label');
      const role = target.getAttribute?.('role');
      const testId = target.getAttribute?.('data-testid');

      if (testId) fallbacks.push(`[data-testid="${CSS.escape(testId)}"]`);
      if (ariaLabel && role) {
        fallbacks.push(`${target.tagName?.toLowerCase?.() || ''}[role="${role}"][aria-label="${ariaLabel}"]`);
      } else if (ariaLabel) {
        fallbacks.push(`${target.tagName?.toLowerCase?.() || ''}[aria-label="${ariaLabel}"]`);
      }

      if (fallbacks.length) clickData.fallbacks = fallbacks;
      return target;
    }

    static calculateOffset(target, event, clickData) {
      const rect = target.getBoundingClientRect();
      clickData.offset = {
        x: Math.round(event.clientX - rect.left),
        y: Math.round(event.clientY - rect.top)
      };
    }

    static handlePointerDown = (event) => {
      EventHandlers.recordClick(event);
      skipNextClickUntil = performance.now() + CONSTANTS.CLICK_DEDUPE_WINDOW;
    };

    static handleClick = (event) => {
      if (performance.now() <= skipNextClickUntil) return;
      EventHandlers.recordClick(event);
    };

    static handleInput = (event) => {
      if (!recorder.recording || isRecorderUIEvent(event)) return;
      
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase?.() || '';
      const isEditable = tagName === 'input' || 
        tagName === 'textarea' || 
        target?.isContentEditable === true;

      if (!isEditable) return;

      // Privacy protection: skip sensitive fields
      const isPrivate = (
        target.type === 'password' ||
        target.autocomplete === 'current-password' ||
        target.autocomplete === 'cc-number' ||
        target.autocomplete === 'cc-csc' ||
        target.closest('[data-private],[data-sensitive]') ||
        target.getAttribute('aria-hidden') === 'true'
      );
      if (isPrivate) return;

      TypingManager.handleInput(target, event);
    };

    static handleBlur = (event) => {
      if (!recorder.recording) return;
      
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase?.() || '';
      const isEditable = tagName === 'input' || 
        tagName === 'textarea' || 
        target?.isContentEditable === true;

      if (isEditable) {
        TypingManager.flush(target);
      }
    };

    static handleKeyDown = (event) => {
      if (!recorder.recording || isRecorderUIEvent(event) || event.key !== 'Enter') return;
      
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase?.() || '';
      const isEditable = tagName === 'input' || 
        tagName === 'textarea' || 
        target?.isContentEditable === true;

      if (isEditable) {
        TypingManager.flush(target);
        recorder.steps.push({
          type: 'key',
          selector: buildSelector(target),
          key: 'Enter',
          ts: getTimestamp()
        });
      }
    };

    static handleScroll = () => {
      if (!recorder.recording) return;
      
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const x = window.scrollX;
        const y = window.scrollY;
        
        if (x === lastScrollPosition.x && y === lastScrollPosition.y) return;
        
        lastScrollPosition = { x, y };
        recorder.steps.push({
          type: 'scroll',
          target: 'window',
          x,
          y,
          ts: getTimestamp()
        });
      }, CONSTANTS.SCROLL_DEBOUNCE_DELAY);
    };
  }

  class RecorderController {
    static start() {
      if (recorder.recording) return;

      recorder.recording = true;
      recorder.t0 = performance.now();
      recorder.meta.viewport = { 
        width: window.innerWidth, 
        height: window.innerHeight 
      };
      recorder.steps = [{
        type: 'navigate',
        url: location.href,
        ts: 0
      }];

      lastScrollPosition = { x: window.scrollX, y: window.scrollY };
      RecorderUI.create();
      this.attachEventListeners();
    }

    static stop() {
      recorder.recording = false;
      RecorderUI.remove();
      TypingManager.flushAll();
      this.detachEventListeners();
      
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
        scrollTimeout = null;
      }
    }

    static attachEventListeners() {
      const listeners = [
        ['pointerdown', EventHandlers.handlePointerDown, true],
        ['click', EventHandlers.handleClick, true],
        ['input', EventHandlers.handleInput, true],
        ['blur', EventHandlers.handleBlur, true],
        ['keydown', EventHandlers.handleKeyDown, true]
      ];

      listeners.forEach(([event, handler, capture]) => {
        document.addEventListener(event, handler, capture);
      });

      window.addEventListener('scroll', EventHandlers.handleScroll, { 
        capture: true, 
        passive: true 
      });

      cleanupFunctions = [
        ...listeners.map(([event, handler, capture]) => 
          () => document.removeEventListener(event, handler, capture)
        ),
        () => window.removeEventListener('scroll', EventHandlers.handleScroll, { capture: true }),
        () => {
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
            scrollTimeout = null;
          }
        }
      ];
    }

    static detachEventListeners() {
      cleanupFunctions.forEach(cleanup => {
        try { cleanup(); } catch (e) { console.error('Cleanup error:', e); }
      });
      cleanupFunctions = [];
    }

    static generateTrace() {
      let steps = recorder.steps.filter(step => 
        !step?.selector?.match?.(/\[data-recorder-ui\]|#rec-stop/)
      );

      steps = this.mergeConsecutiveTypes(steps, CONSTANTS.MERGE_TYPE_GAP_SEC);

      return {
        ...recorder,
            version: 1,
            steps: steps.map(step => ({
              ...step,
              ts: typeof step.ts === 'number' ? +step.ts.toFixed(3) : step.ts,
          ...(step.offset && { 
            offset: { 
              x: Math.round(step.offset.x), 
              y: Math.round(step.offset.y) 
            } 
          }),
              ...(step.fallbacks && { fallbacks: step.fallbacks })
            }))
          };
    }

    static mergeConsecutiveTypes(steps, maxGapSec = 1.0) {
      const result = [];
      
      for (const step of steps) {
        const lastStep = result[result.length - 1];
        
        if (step.type === 'type' && 
            lastStep && 
            lastStep.type === 'type' &&
            lastStep.selector === step.selector && 
            (step.ts - lastStep.ts) <= maxGapSec) {
          
          lastStep.text = (lastStep.text || '') + (step.text || '');
          continue;
        }
        
        result.push(step);
      }
      
      return result;
    }
  }

  const messageHandlers = {
    PING: () => ({ ok: true }),
    REC_START: () => {
      RecorderController.start();
      return { success: true };
    },
    REC_STOP: () => {
      RecorderController.stop();
      return { success: true };
    },
    REC_DUMP: () => {
      const trace = RecorderController.generateTrace();
      try {
        chrome.runtime.sendMessage({ type: 'DOWNLOAD_TRACE', trace });
      } catch (_) {}
      return { ok: true };
    }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      const handler = messageHandlers[message?.type];
      if (handler) {
        const response = handler();
        sendResponse(response);
      } else {
        sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  });

  // Auto-start if already recording
  try {
    chrome.runtime.sendMessage({ type: 'REC_QUERY_STATE' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.state?.recording) {
        RecorderController.start();
      }
    });
  } catch (_) {}

  window.__recorder = recorder;
})();