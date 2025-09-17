document.addEventListener("DOMContentLoaded", () => {
  'use strict';

  const MESSAGES = {
    REC_QUERY_STATE: "REC_QUERY_STATE",
    REC_START_REQUEST: "REC_START_REQUEST", 
    REC_STOP_REQUEST: "REC_STOP_REQUEST",
    REC_DUMP: "REC_DUMP",
    GET_LAST_TRACE: "GET_LAST_TRACE",
    START_REPLAY: "START_REPLAY",
    REPLAY_STATUS: "REPLAY_STATUS"
  };

  const STATUS_MESSAGES = {
    READY: "Ready",
    RECORDING: "Recording…",
    IDLE: "Idle",
    STOPPED: "Stopped",
    CONNECTION_ERROR: "Connection error",
    NO_ACTIVE_TAB: "No active tab",
    FAILED_TO_START: "Failed to start",
    FAILED_TO_STOP: "Failed to stop",
    NO_TRACE_DATA: "No trace data - reload page and try again",
    TRACE_DOWNLOADED: "Trace downloaded",
    REPLAY_STARTED: "Replay started in new tab",
    REPLAY_COMPLETED: "Replay completed"
  };

  const elements = {
    startBtn: document.getElementById("startBtn"),
    stopBtn: document.getElementById("stopBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    replayBtn: document.getElementById("replayBtn"),
    respectTimingCheckbox: document.getElementById("respectTimingCheckbox"),
    statusEl: document.getElementById("status")
  };

  class UIController {
    static setStatus(message, statusClass = '') {
      if (elements.statusEl) {
        elements.statusEl.textContent = message;
        elements.statusEl.className = statusClass;
      }
    }

    static setRecordingState(isRecording) {
      elements.startBtn.disabled = !!isRecording;
      elements.stopBtn.disabled = !isRecording;
      elements.downloadBtn.disabled = !!isRecording;
    }

    static setReplayState(hasTrace) {
      elements.replayBtn.disabled = !hasTrace;
    }

    static updateForRecordingState(isRecording) {
      this.setRecordingState(isRecording);
      this.setStatus(
        isRecording ? STATUS_MESSAGES.RECORDING : STATUS_MESSAGES.IDLE,
        isRecording ? 'recording' : 'ready'
      );
    }
  }

  class BackgroundCommunicator {
    static async sendMessage(message) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || {});
        });
      });
    }

    static async queryRecordingState() {
      const response = await this.sendMessage({ type: MESSAGES.REC_QUERY_STATE });
      
      if (response.error) {
        UIController.setStatus(STATUS_MESSAGES.CONNECTION_ERROR, 'error');
        return null;
      }

      return response.state;
    }

    static async startRecording() {
      const response = await this.sendMessage({ type: MESSAGES.REC_START_REQUEST });
      
      if (response.error) {
        UIController.setStatus(STATUS_MESSAGES.FAILED_TO_START);
        return false;
      }

      const success = response.ok;
      UIController.updateForRecordingState(success);
      return success;
    }

    static async stopRecording() {
      const response = await this.sendMessage({ type: MESSAGES.REC_STOP_REQUEST });
      
      if (response.error) {
        UIController.setStatus(STATUS_MESSAGES.FAILED_TO_STOP);
        return false;
      }

      UIController.updateForRecordingState(false);
      UIController.setStatus(STATUS_MESSAGES.STOPPED);
      return true;
    }

    static async downloadTrace() {
      const tabs = await new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, resolve);
      });

      if (!tabs[0]) {
        UIController.setStatus(STATUS_MESSAGES.NO_ACTIVE_TAB);
        return false;
      }

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: MESSAGES.REC_DUMP }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            UIController.setStatus(STATUS_MESSAGES.NO_TRACE_DATA);
            resolve(false);
            return;
          }

        UIController.setStatus(STATUS_MESSAGES.TRACE_DOWNLOADED, 'ready');
        resolve(true);
        });
      });
    }

    static async startReplay() {
      const respectTiming = elements.respectTimingCheckbox.checked;
      const response = await this.sendMessage({ 
        type: MESSAGES.START_REPLAY, 
        respectTiming 
      });

      if (response.error || !response.success) {
        UIController.setStatus(response.error || "Failed to start replay");
        return false;
      }

      UIController.setStatus(STATUS_MESSAGES.REPLAY_STARTED);
      return true;
    }

    static async checkForTrace() {
      const response = await this.sendMessage({ type: MESSAGES.GET_LAST_TRACE });
      return !!response.trace;
    }
  }

  /**
   * Event handlers
   */
  class EventHandlers {
    static async handleStart() {
      await BackgroundCommunicator.startRecording();
    }

    static async handleStop() {
      await BackgroundCommunicator.stopRecording();
    }

    static async handleDownload() {
      const success = await BackgroundCommunicator.downloadTrace();
      if (success) {
        const hasTrace = await BackgroundCommunicator.checkForTrace();
        UIController.setReplayState(hasTrace);
      }
    }

    static async handleReplay() {
      await BackgroundCommunicator.startReplay();
    }

    static handleReplayStatus(message) {
      switch (message.status) {
        case 'started':
          UIController.setStatus("Replay started");
          break;
        case 'step':
          UIController.setStatus(`Step ${message.index + 1}: ${message.stepType}`);
          break;
        case 'done':
          UIController.setStatus(STATUS_MESSAGES.REPLAY_COMPLETED);
          break;
        case 'error':
          UIController.setStatus(`Step ${message.index + 1} failed: ${message.message}`);
          break;
      }
    }
  }

  async function initialize() {
    try {
      const state = await BackgroundCommunicator.queryRecordingState();
      if (state) {
        UIController.updateForRecordingState(state.recording);
      }

      const hasTrace = await BackgroundCommunicator.checkForTrace();
      UIController.setReplayState(hasTrace);

      elements.startBtn.addEventListener("click", EventHandlers.handleStart);
      elements.stopBtn.addEventListener("click", EventHandlers.handleStop);
      elements.downloadBtn.addEventListener("click", EventHandlers.handleDownload);
      elements.replayBtn.addEventListener("click", EventHandlers.handleReplay);

      chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === MESSAGES.REPLAY_STATUS) {
          EventHandlers.handleReplayStatus(message);
        }
      });

      console.log('Popup initialized successfully');
    } catch (error) {
      console.error('Failed to initialize popup:', error);
      UIController.setStatus(STATUS_MESSAGES.CONNECTION_ERROR);
    }
  }

  initialize();
});