// PHASE 0 STUB - Mini DevTools Recorder Background Service Worker
// This service worker will handle downloads and cross-tab communication in later phases

(function() {
  'use strict';

  // Service worker initialization
  console.log('Mini DevTools Recorder background service worker started');

  // PHASE 0 STUB: Listen for messages from popup/content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      console.log('Background received message:', message, 'from:', sender);
      
      // TODO Phase 1: Handle different message types
      switch (message.type) {
        case 'DOWNLOAD_TRACE':
          // TODO: Implement trace download using chrome.downloads.download
          // const blob = new Blob([JSON.stringify(message.trace, null, 2)], {type: 'application/json'});
          // const url = URL.createObjectURL(blob);
          // chrome.downloads.download({
          //   url: url,
          //   filename: `trace-${Date.now()}.json`,
          //   saveAs: true
          // });
          console.log('(Phase 0 stub) Would download trace:', message.trace);
          break;
        default:
          console.log('(Phase 0 stub) Unhandled message type:', message.type);
      }
      
      // Always send a response to prevent "message port closed" errors
      sendResponse({success: true, phase: 0});
    } catch (error) {
      console.error('Error handling message in background:', error);
      sendResponse({success: false, error: error.message});
    }
    
    // Return true to indicate we'll send a response asynchronously (good practice)
    return true;
  });

  // Handle service worker installation
  self.addEventListener('install', (event) => {
    console.log('Mini DevTools Recorder service worker installed');
    // Skip waiting to activate immediately
    self.skipWaiting();
  });

  // Handle service worker activation
  self.addEventListener('activate', (event) => {
    console.log('Mini DevTools Recorder service worker activated');
    // Claim all clients immediately
    event.waitUntil(self.clients.claim());
  });

})();
