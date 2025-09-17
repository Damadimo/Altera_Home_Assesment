(function() {
  'use strict';

  const CONFIG = {
    ELEMENT_WAIT_TIMEOUT: 5000,
    MENU_WAIT_TIMEOUT: 3000,
    SCROLL_INTO_VIEW_DELAY: 20,
    STEP_RETRY_INTERVAL: 100,
    SPECIAL_MENU_SELECTORS: ['composer-plus-btn']
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const querySelector = (selector) => document.querySelector(selector);
  const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function flashElement(element) {
    if (!element) return;
    
    const rect = element.getBoundingClientRect();
    const highlight = document.createElement('div');
    
  Object.assign(highlight.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: '2px solid #2c2c2c',
    borderRadius: '6px',
    background: 'rgba(44, 44, 44, 0.08)',
    zIndex: '2147483647',
    pointerEvents: 'none',
    transition: 'opacity 0.25s',
    opacity: '1'
  });
    
    document.body.appendChild(highlight);
    setTimeout(() => highlight.style.opacity = '0', 300);
    setTimeout(() => highlight.remove(), 600);
  }

  class ElementUtils {
    static isVisible(element) {
      if (!element) return false;
      
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      
      const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

    static getClickableTarget(element) {
      return element.closest('[role^="menuitem"],[role="option"],button,[role="button"],a[href]') || element;
    }

    static getElementLabel(element) {
      const ariaLabel = element.getAttribute?.('aria-label');
      const textContent = element.innerText || element.textContent || '';
      return normalizeText(ariaLabel || textContent);
    }

    static async waitForPageLoad() {
    if (document.readyState === 'complete') return;
      
      return new Promise(resolve => {
        const onLoad = () => {
          window.removeEventListener('load', onLoad);
          resolve();
        };
        window.addEventListener('load', onLoad, { once: true });
      });
    }
  }

  class RoleUtils {
    static canonicalRole(role) {
      if (!role) return '';
      if (role === 'option') return 'menuitem';
      if (role.startsWith('menuitem')) return 'menuitem';
      return role;
    }

    static rolesMatch(actual, expected) {
      if (!expected) return true;
      return this.canonicalRole(actual) === this.canonicalRole(expected);
    }
  }

  class ContextManager {
    static getVisibleScopes() {
    const scopes = [];
      
      const menuContainers = document.querySelectorAll('[role="menu"],[role="listbox"]');
      menuContainers.forEach(container => {
        if (ElementUtils.isVisible(container)) {
          scopes.push(container);
        }
      });

      const portalMenus = document.querySelectorAll('[data-radix-portal] [role], [data-portal] [role]');
      portalMenus.forEach(element => {
        const menu = element.closest('[role="menu"],[role="listbox"]');
        if (menu && ElementUtils.isVisible(menu)) {
          scopes.push(menu);
        }
      });

      return scopes.length > 0 ? scopes : [document];
    }

    static async waitForMenuToAppear() {
      const startTime = Date.now();
      
      while (Date.now() - startTime < CONFIG.MENU_WAIT_TIMEOUT) {
        if (this.getVisibleScopes().length > 1) {
          return true;
        }
        await sleep(50);
      }
      
      return false;
    }
  }

  class ElementFinder {
    static findBySemantics(step) {
      if (!step.name) return null;

      const expectedName = normalizeText(step.name);
      const scopes = ContextManager.getVisibleScopes();

      for (const scope of scopes) {
        const candidates = scope.querySelectorAll('[role],[data-testid],button,[role="button"]');
        
        for (const element of candidates) {
          if (!RoleUtils.rolesMatch(element.getAttribute('role'), step.role)) {
            continue;
          }

          const elementLabel = ElementUtils.getElementLabel(element);
          if (elementLabel && (elementLabel === expectedName || elementLabel.includes(expectedName))) {
            const target = ElementUtils.getClickableTarget(element);
            if (ElementUtils.isVisible(target)) {
              return target;
            }
          }
        }
      }

      return null;
    }

    static findByNameOnly(step) {
      if (!step.name) return null;

      const expectedName = normalizeText(step.name);
      const candidates = document.querySelectorAll('[role],[data-testid],button,[role="button"],*');

      for (const element of candidates) {
        const elementLabel = ElementUtils.getElementLabel(element);
        if (elementLabel && (elementLabel === expectedName || elementLabel.includes(expectedName))) {
          const target = ElementUtils.getClickableTarget(element);
          if (ElementUtils.isVisible(target)) {
            return target;
          }
        }
      }

      return null;
    }

    static findBySelectors(step) {
      if (step.name || step.role) return null; // Only use when no semantic info

      const selectors = [step.selector, ...(step.fallbacks || [])].filter(Boolean);

      for (const selector of selectors) {
        try {
          const element = querySelector(selector);
          if (element && ElementUtils.isVisible(element)) {
            return ElementUtils.getClickableTarget(element);
          }
        } catch (error) {
          console.warn('Invalid selector:', selector, error);
        }
      }

      return null;
    }

    static async find(step) {
      const startTime = Date.now();
      const selectors = [step.selector, ...(step.fallbacks || [])];
      
      console.log('[replayer] Finding element:', {
        selectors,
        role: step.role,
        name: step.name
      });

      while (Date.now() - startTime < CONFIG.ELEMENT_WAIT_TIMEOUT) {
        let element = this.findBySemantics(step);
        if (element) {
          console.log('[replayer] Found by semantics:', step.role, step.name);
          return element;
        }

        element = this.findByNameOnly(step);
        if (element) {
          console.log('[replayer] Found by name:', step.name);
          return element;
        }

        element = this.findBySelectors(step);
        if (element) {
          console.log('[replayer] Found by selector');
          return element;
        }

        await sleep(CONFIG.STEP_RETRY_INTERVAL);
      }

      throw new Error(`Element not found: ${JSON.stringify({
        selectors,
        role: step.role,
        name: step.name
      })}`);
    }
  }

  class ActionExecutor {
    static async click(step) {
      const element = await ElementFinder.find(step);
      console.log('[replayer] Clicking:', element.tagName, element.id, element.className);

      element.scrollIntoView({ 
        block: 'center', 
        inline: 'center', 
        behavior: 'instant' 
      });
      
      await sleep(CONFIG.SCROLL_INTO_VIEW_DELAY);
      flashElement(element);
      await sleep(200);

      if (step.offset && element.getBoundingClientRect) {
        this.clickWithOffset(element, step.offset);
      } else {
        element.click();
      }

      await this.handlePostClickActions(step);
    }

    static clickWithOffset(element, offset) {
      const rect = element.getBoundingClientRect();
      const x = Math.max(0, Math.min(offset.x, Math.floor(rect.width) - 1));
      const y = Math.max(0, Math.min(offset.y, Math.floor(rect.height) - 1));
      const clientX = rect.left + x;
      const clientY = rect.top + y;

      console.log('[replayer] Clicking with offset:', { x, y, clientX, clientY });

      const eventOptions = {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        buttons: 1
      };

      ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
        element.dispatchEvent(new MouseEvent(eventType, eventOptions));
      });
    }

    static async handlePostClickActions(step) {
      const isSpecialButton = CONFIG.SPECIAL_MENU_SELECTORS.some(selector =>
        (step.fallbacks || []).some(fallback => fallback.includes(selector)) ||
        step.selector?.includes(selector)
      );

      if (isSpecialButton) {
        console.log('[replayer] Waiting for menu after special button click');
        await ContextManager.waitForMenuToAppear();
      }
    }

    static async type(step) {
      const element = await ElementFinder.find(step);
      console.log('[replayer] Typing into:', element.tagName, element.id, 'contentEditable:', element.isContentEditable);

      flashElement(element);
      await sleep(200);
      
      element.focus({ preventScroll: true });
    const text = step.text || '';

      if (element.isContentEditable) {
        await this.typeIntoContentEditable(element, text);
      } else {
        await this.typeIntoInput(element, text);
      }
    }

    static async typeIntoContentEditable(element, text) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);

      for (const char of text) {
        document.execCommand('insertText', false, char);
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          data: char,
          inputType: 'insertText'
        }));
        await sleep(0);
      }
    }

    static async typeIntoInput(element, text) {
      const previousValue = element.value || '';
      element.value = previousValue + text;
      
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: text,
        inputType: 'insertText'
      }));
    }

    static async pressKey(step) {
      const element = await ElementFinder.find(step);
      console.log('[replayer] Pressing key:', step.key, 'on:', element.tagName, element.id);

      element.focus({ preventScroll: true });
    const key = step.key || 'Enter';

      ['keydown', 'keypress', 'keyup'].forEach(eventType => {
        element.dispatchEvent(new KeyboardEvent(eventType, {
          key,
          bubbles: true
        }));
      });
    }

    static async scroll(step) {
      if (step.target === 'window') {
        window.scrollTo(step.x | 0, step.y | 0);
      }
    }

    static async waitVisible(step) {
      console.log('[replayer] Waiting for element to be visible:', step.selector);
      const deadline = Date.now() + (step.timeout || 5000);
      
      while (Date.now() < deadline) {
        try {
          const element = document.querySelector(step.selector);
          if (element && element.offsetParent !== null) {
            console.log('[replayer] Element became visible');
            return;
          }
        } catch (error) {
          console.warn('[replayer] Invalid selector in waitVisible:', step.selector);
          break;
        }
        await sleep(100);
      }
      
      console.warn('[replayer] waitVisible timeout for:', step.selector);
    }
  }

  class ReplayController {

    static async run(trace, options = {}) {
      try {
        window.TraceValidator.validate(trace);
      } catch (error) {
        console.error('[replayer] Trace validation failed:', error.message);
        chrome.runtime.sendMessage({ 
          type: 'REPLAY_STATUS', 
          status: 'error', 
          message: error.message 
        });
        return;
      }

      console.log('[replayer] Starting replay:', {
        stepCount: trace.steps?.length,
        options
      });

      chrome.runtime.sendMessage({ type: 'REPLAY_STATUS', status: 'started' });

      await ElementUtils.waitForPageLoad();
    console.log('[replayer] Page loaded, starting replay');

      let previousTimestamp = Number(trace.steps?.[0]?.ts ?? 0);

    for (let i = 0; i < trace.steps.length; i++) {
        const step = trace.steps[i];
        
      try {
          console.log(`[replayer] Step ${i + 1}/${trace.steps.length}:`, step.type);
        
        if (options.respectTiming) {
            await this.handleTiming(step, previousTimestamp);
            previousTimestamp = Number(step.ts ?? previousTimestamp);
          }

          chrome.runtime.sendMessage({
            type: 'REPLAY_STATUS',
            status: 'step',
            index: i,
            stepType: step.type
          });

          await this.executeStep(step, i);
          console.log(`[replayer] Step ${i + 1} completed`);

        } catch (error) {
          console.error(`[replayer] Step ${i + 1} failed:`, error);
          chrome.runtime.sendMessage({
            type: 'REPLAY_STATUS',
            status: 'error',
            index: i,
            message: error.message
          });
          throw error;
        }
      }

      console.log('[replayer] All steps completed');
      chrome.runtime.sendMessage({ type: 'REPLAY_STATUS', status: 'done' });
    }

    static async handleTiming(step, previousTimestamp) {
      const currentTimestamp = Number(step.ts ?? previousTimestamp);
      const deltaMs = Math.max(0, Math.floor((currentTimestamp - previousTimestamp) * 1000));
      
      if (deltaMs > 0) {
        console.log(`[replayer] Waiting ${deltaMs}ms for timing`);
        await sleep(deltaMs);
      }
    }

    static async executeStep(step, index) {
      switch (step.type) {
        case 'navigate':
          if (index === 0) {
            console.log('[replayer] Skipping initial navigation');
          } else {
            console.log('[replayer] Navigating to:', step.url);
            location.assign(step.url);
            await ElementUtils.waitForPageLoad();
          }
          break;

        case 'click':
          await ActionExecutor.click(step);
          break;

        case 'type':
          await ActionExecutor.type(step);
          break;

        case 'key':
          await ActionExecutor.pressKey(step);
          break;

        case 'scroll':
          await ActionExecutor.scroll(step);
          break;

        case 'waitVisible':
          await ActionExecutor.waitVisible(step);
          break;

        default:
          console.warn('[replayer] Unknown step type:', step.type);
      }
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    console.log('[replayer] Received message:', message?.type, 'steps:', message?.trace?.steps?.length);
    
    if (message?.type === 'RUN_TRACE') {
      ReplayController.run(message.trace, message.options || {})
        .catch(error => {
          console.error('[replayer] Replay failed:', error);
          chrome.runtime.sendMessage({
            type: 'REPLAY_STATUS',
            status: 'error',
            message: error.message
          });
        });
    }
  });
})();
