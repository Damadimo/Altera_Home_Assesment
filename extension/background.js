const DEFAULT_STATE = { recording: false, tabId: null };
const BADGE_CONFIG = {
  RECORDING: { text: "REC", color: "#d00" },
  IDLE: { text: "", color: "#000" }
};
const MESSAGE_TYPES = {
  PING: "PING",
  REC_QUERY_STATE: "REC_QUERY_STATE",
  REC_START_REQUEST: "REC_START_REQUEST",
  REC_STOP_REQUEST: "REC_STOP_REQUEST",
  DOWNLOAD_TRACE: "DOWNLOAD_TRACE",
  GET_LAST_TRACE: "GET_LAST_TRACE",
  START_REPLAY: "START_REPLAY",
  REPLAY_STATUS: "REPLAY_STATUS"
};

class StateManager {
  static async get() {
    try {
      if (!chrome.storage?.session) return DEFAULT_STATE;
      const result = await chrome.storage.session.get(["recording", "tabId", "lastTrace"]);
      return { ...DEFAULT_STATE, ...result };
    } catch (error) {
      console.error("Failed to get state:", error);
      return DEFAULT_STATE;
    }
  }

  static async set(state) {
    try {
      if (chrome.storage?.session) {
        await chrome.storage.session.set(state);
      }
    } catch (error) {
      console.error("Failed to set state:", error);
    }
  }
}

class BadgeManager {
  static async update(recording) {
    try {
      const config = recording ? BADGE_CONFIG.RECORDING : BADGE_CONFIG.IDLE;
      await chrome.action.setBadgeText({ text: config.text });
      if (recording) {
        await chrome.action.setBadgeBackgroundColor({ color: config.color });
      }
    } catch (error) {
      console.error("Failed to update badge:", error);
    }
  }
}

class RecordingController {
  static async start(tabId) {
    try {
      await StateManager.set({ recording: true, tabId });
      await BadgeManager.update(true);
      await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.REC_START_REQUEST.replace("_REQUEST", "") });
    } catch (error) {
      console.error("Failed to start recording:", error);
      await StateManager.set({ recording: false, tabId: null });
      await BadgeManager.update(false);
      throw error;
    }
  }

  static async stop() {
    try {
      const { tabId } = await StateManager.get();
      await StateManager.set({ recording: false, tabId: null });
      await BadgeManager.update(false);
      
      if (tabId) {
        await chrome.tabs.sendMessage(tabId, { type: "REC_STOP" });
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
      await StateManager.set({ recording: false, tabId: null });
      await BadgeManager.update(false);
    }
  }
}

class ReplayManager {
  static async start(options = {}) {
    const state = await StateManager.get();
    const { lastTrace } = state;
    
    if (!lastTrace) {
      throw new Error('No trace recorded');
    }

    const startUrl = lastTrace.steps.find(s => s.type === 'navigate')?.url || 'about:blank';
    
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url: startUrl, active: true }, async (tab) => {
        if (!tab?.id) {
          reject(new Error('Failed to create tab'));
          return;
        }

        const tabId = tab.id;
        
        const injectAndRun = async () => {
          try {
            await chrome.scripting.executeScript({ 
              target: { tabId }, 
              files: ['replayer.content.js'] 
            });
            
            await chrome.tabs.sendMessage(tabId, {
              type: 'RUN_TRACE',
              trace: lastTrace,
              options: { respectTiming: !!options.respectTiming }
            });
            
            resolve({ success: true, tabId });
          } catch (error) {
            reject(error);
          }
        };

        const onUpdated = (id, info) => {
          if (id === tabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            injectAndRun();
          }
        };
        
        chrome.tabs.onUpdated.addListener(onUpdated);

        // Edge case: tab already loaded
        chrome.tabs.get(tabId, (currentTab) => {
          if (currentTab?.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            injectAndRun();
          }
        });
      });
    });
  }
}

class DownloadManager {
  static async downloadTrace(trace) {
    try {
      await StateManager.set({ lastTrace: trace });
      
      const jsonData = JSON.stringify(trace, null, 2);
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonData);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      await chrome.downloads.download({
        url: dataUrl,
        filename: `trace-${timestamp}.json`,
        saveAs: true
      });
    } catch (error) {
      console.error("Failed to download trace:", error);
      throw error;
    }
  }
}

class MessageHandler {
  static async handle(msg) {
    switch (msg?.type) {
      case MESSAGE_TYPES.PING:
        return { ok: true };

      case MESSAGE_TYPES.REC_QUERY_STATE: {
        const state = await StateManager.get();
        return { ok: true, state };
      }

      case MESSAGE_TYPES.REC_START_REQUEST: {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id) {
          return { ok: false, error: "No active tab" };
        }
        await RecordingController.start(tab.id);
        return { ok: true };
      }

      case MESSAGE_TYPES.REC_STOP_REQUEST:
        await RecordingController.stop();
        return { ok: true };

      case MESSAGE_TYPES.DOWNLOAD_TRACE:
        await DownloadManager.downloadTrace(msg.trace);
        return { ok: true };

      case MESSAGE_TYPES.GET_LAST_TRACE: {
        const state = await StateManager.get();
        return { trace: state.lastTrace || null };
      }

      case MESSAGE_TYPES.START_REPLAY: {
        const result = await ReplayManager.start({ respectTiming: msg.respectTiming });
        return result;
      }

      default:
        return { ok: false, error: "Unknown message type" };
    }
  }
}

// Initialize badge on startup
(async () => {
  const state = await StateManager.get();
  await BadgeManager.update(state.recording);
})();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  MessageHandler.handle(msg)
    .then(response => sendResponse(response))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  
  return true; // Keep sendResponse alive
});

// Forward replay status updates to popup
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === MESSAGE_TYPES.REPLAY_STATUS) {
    try {
      chrome.runtime.sendMessage(msg);
    } catch (_) {}
  }
});
