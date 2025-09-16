// PHASE 0 STUB - Mini DevTools Recorder Popup
// This file handles the popup UI interactions and will communicate with content scripts in Phase 1

(function() {
  'use strict';

  // Guard against missing Chrome extension APIs
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    console.error('Chrome extension APIs not available');
    return;
  }

  // DOM elements
  let startBtn, stopBtn, downloadBtn, statusDiv;

  // Initialize popup when DOM is ready
  document.addEventListener('DOMContentLoaded', initializePopup);

  function initializePopup() {
    try {
      // Get DOM references
      startBtn = document.getElementById('startBtn');
      stopBtn = document.getElementById('stopBtn');
      downloadBtn = document.getElementById('downloadBtn');
      statusDiv = document.getElementById('status');

      if (!startBtn || !stopBtn || !downloadBtn || !statusDiv) {
        throw new Error('Required DOM elements not found');
      }

      // Wire up event listeners
      startBtn.addEventListener('click', handleStartRecording);
      stopBtn.addEventListener('click', handleStopRecording);
      downloadBtn.addEventListener('click', handleDownloadTrace);

      // Set initial state
      updateUIState('ready');
      
      console.log('Popup initialized successfully');
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      updateStatus('Initialization error');
    }
  }

  function handleStartRecording() {
    try {
      console.log('REC_START - (Phase 0 stub) Start recording requested');
      
      // TODO Phase 1: Send message to active tab via chrome.tabs.sendMessage
      // chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      //   chrome.tabs.sendMessage(tabs[0].id, {type: 'REC_START'});
      // });
      
      updateUIState('recording');
      updateStatus('(stub) Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      updateStatus('Error starting recording');
    }
  }

  function handleStopRecording() {
    try {
      console.log('REC_STOP - (Phase 0 stub) Stop recording requested');
      
      // TODO Phase 1: Send message to active tab via chrome.tabs.sendMessage
      // chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      //   chrome.tabs.sendMessage(tabs[0].id, {type: 'REC_STOP'});
      // });
      
      updateUIState('stopped');
      updateStatus('(stub) Recording stopped');
    } catch (error) {
      console.error('Error stopping recording:', error);
      updateStatus('Error stopping recording');
    }
  }

  function handleDownloadTrace() {
    try {
      console.log('REC_DUMP - (Phase 0 stub) Download trace requested');
      
      // TODO Phase 1: Send message to active tab to get trace data, then to background script
      // chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      //   chrome.tabs.sendMessage(tabs[0].id, {type: 'REC_DUMP'}, (response) => {
      //     chrome.runtime.sendMessage({type: 'DOWNLOAD_TRACE', trace: response.trace});
      //   });
      // });
      
      updateStatus('(stub) Download requested');
    } catch (error) {
      console.error('Error downloading trace:', error);
      updateStatus('Error downloading trace');
    }
  }

  function updateUIState(state) {
    try {
      switch (state) {
        case 'ready':
          startBtn.disabled = false;
          stopBtn.disabled = true;
          downloadBtn.disabled = true;
          break;
        case 'recording':
          startBtn.disabled = true;
          stopBtn.disabled = false;
          downloadBtn.disabled = true;
          break;
        case 'stopped':
          startBtn.disabled = false;
          stopBtn.disabled = true;
          downloadBtn.disabled = false;
          break;
        default:
          console.warn('Unknown UI state:', state);
      }
    } catch (error) {
      console.error('Error updating UI state:', error);
    }
  }

  function updateStatus(message) {
    try {
      if (statusDiv) {
        statusDiv.textContent = message;
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

})();
