// PHASE 0 STUB - Mini DevTools Recorder Content Script
// This script will capture user interactions and build trace data in later phases

(function() {
  'use strict';

  // PHASE 0 STUB: Initialize global recorder state
  // This object will hold all recording state and trace data
  window.__recorder = {
    recording: false,
    t0: 0, // Recording start timestamp
    meta: {
      userAgent: navigator.userAgent,
      viewport: {
        width: 0,
        height: 0
      }
    },
    steps: [] // Array of recorded interaction steps
  };

  console.log('Mini DevTools Recorder content script loaded on:', window.location.href);

  // PHASE 0 STUB: Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      console.log('Content script received message:', message.type);

      switch (message.type) {
        case 'REC_START':
          console.log('(Phase 0 stub) REC_START received - would start recording');
          // TODO Phase 1: Implement recording start logic
          // - Set window.__recorder.recording = true
          // - Set window.__recorder.t0 = Date.now()
          // - Update viewport dimensions
          // - Attach event listeners for click, input, scroll, navigation
          // - Clear previous steps array
          sendResponse({success: true, message: 'Recording start acknowledged'});
          break;

        case 'REC_STOP':
          console.log('(Phase 0 stub) REC_STOP received - would stop recording');
          // TODO Phase 1: Implement recording stop logic
          // - Set window.__recorder.recording = false
          // - Remove event listeners
          // - Finalize trace data
          sendResponse({success: true, message: 'Recording stop acknowledged'});
          break;

        case 'REC_DUMP':
          console.log('(Phase 0 stub) REC_DUMP received - would return trace data');
          // TODO Phase 1: Return actual trace data
          // - Package window.__recorder into proper trace format
          // - Include metadata, steps, and timing information
          const stubTrace = {
            meta: window.__recorder.meta,
            steps: window.__recorder.steps,
            duration: 0,
            phase: 0
          };
          sendResponse({success: true, trace: stubTrace});
          break;

        default:
          console.warn('Unknown message type:', message.type);
          sendResponse({success: false, error: 'Unknown message type'});
      }
    } catch (error) {
      console.error('Error handling message in content script:', error);
      sendResponse({success: false, error: error.message});
    }

    // Return true to indicate we'll send a response asynchronously
    return true;
  });

  // TODO Phase 1: Add event listeners for user interactions
  // These will be gated by window.__recorder.recording flag
  
  // TODO Phase 1: Implement event handlers for:
  // - click events (with target element and selector)
  // - input/change events (with target and value, potentially masked)
  // - scroll events (debounced, window and element scrolling)
  // - navigation events (page loads, hash changes)
  // - keyboard events (for accessibility and shortcuts)

  // TODO Phase 1: Implement helper functions:
  // - buildStep(type, target, data) - creates standardized step objects
  // - getViewportDimensions() - updates meta.viewport
  // - debounceScroll() - prevents excessive scroll events
  // - maskSensitiveData() - privacy protection for inputs

  console.log('Content script initialization complete (Phase 0)');

})();
