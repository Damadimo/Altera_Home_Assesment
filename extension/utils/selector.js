window.SelectorUtils = window.SelectorUtils || {};

const SELECTOR_CONFIG = {
  MAX_ID_LENGTH: 24,
  MAX_DIGIT_RATIO: 0.35,
  MIN_CLASS_LENGTH: 3,
  MAX_CLASS_LENGTH: 24,
  MAX_DEPTH: 4,
  
  PREFERRED_DATA_ATTRS: [
    'data-testid', 'data-test', 'data-cy', 'data-qa', 
    'data-qaid', 'data-automation-id', 'data-test-id'
  ],
  
  ARIA_ATTRS: [
    'aria-label', 'aria-controls', 'aria-haspopup', 
    'aria-expanded', 'aria-selected', 'aria-current'
  ],
  
  UTILITY_CLASS_PATTERNS: [
    /^([a-f0-9]{6,}|[A-Z0-9]{6,})$/,
    /(^|-)((p|m|gap|text|bg|w|h|min|max|flex|grid|col|row)\-)/
  ],
  
  UNSTABLE_ID_PATTERNS: [
    /^radix-/,
    /^[a-f0-9-]{8,}$/,
    /[A-Z].*[a-z].*\d.*/
  ]
};

const selectorCache = new WeakMap();

window.SelectorUtils.isUnique = function(selector) {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch (error) {
    console.warn('Invalid selector:', selector, error);
    return false;
  }
};

window.SelectorUtils.selectUnique = function(element, candidates) {
  for (const candidate of candidates) {
    if (this.isUnique(candidate)) {
      return candidate;
    }
  }
  return null;
};

window.SelectorUtils.isStableId = function(id) {
  if (!id || id.length > SELECTOR_CONFIG.MAX_ID_LENGTH) {
    return false;
  }

  for (const pattern of SELECTOR_CONFIG.UNSTABLE_ID_PATTERNS) {
    if (pattern.test(id)) return false;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;

  const digitCount = (id.match(/\d/g) || []).length;
  const digitRatio = digitCount / id.length;
  
  return digitRatio <= SELECTOR_CONFIG.MAX_DIGIT_RATIO;
};

window.SelectorUtils.getStableClasses = function(element) {
  if (!element.classList || element.classList.length === 0) {
    return [];
  }

  return Array.from(element.classList)
    .filter(className => {
      if (!/^[a-z][\w-]*$/i.test(className)) return false;
      if (className.length < SELECTOR_CONFIG.MIN_CLASS_LENGTH || 
          className.length > SELECTOR_CONFIG.MAX_CLASS_LENGTH) return false;

      return !SELECTOR_CONFIG.UTILITY_CLASS_PATTERNS.some(pattern => 
        pattern.test(className)
      );
    })
    .slice(0, 2);
};

window.SelectorUtils.buildSemanticSelector = function(element) {
  const role = element.getAttribute('role');
  const ariaLabel = element.getAttribute('aria-label');
  
  if (!role || !ariaLabel) return null;
  
  if (!/^(menuitem|button|option)$/i.test(role)) return null;
  
  const tagName = element.tagName.toLowerCase();
  const selector = `${tagName}[role="${CSS.escape(role)}"][aria-label="${CSS.escape(ariaLabel)}"]`;
  
  return this.isUnique(selector) ? selector : null;
};

window.SelectorUtils.buildDataSelector = function(element) {
  const candidates = [];
  
  for (const attr of SELECTOR_CONFIG.PREFERRED_DATA_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      candidates.push(`[${attr}="${CSS.escape(value)}"]`);
    }
  }
  
  for (const attr of element.attributes) {
    if (attr.name.startsWith('data-') && 
        !SELECTOR_CONFIG.PREFERRED_DATA_ATTRS.includes(attr.name) && 
        attr.value) {
      candidates.push(`[${attr.name}="${CSS.escape(attr.value)}"]`);
    }
  }
  
  return this.selectUnique(element, candidates);
};

window.SelectorUtils.buildAriaSelector = function(element) {
  const candidates = [];
  const role = element.getAttribute('role');
  
  for (const attr of SELECTOR_CONFIG.ARIA_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      candidates.push(`[${attr}="${CSS.escape(value)}"]`);
      
      if (role) {
        candidates.push(`[role="${CSS.escape(role)}"][${attr}="${CSS.escape(value)}"]`);
      }
    }
  }
  
  return this.selectUnique(element, candidates);
};

window.SelectorUtils.buildIdSelector = function(element) {
  if (!element.id || !this.isStableId(element.id)) {
    return null;
  }
  
  const selector = `#${CSS.escape(element.id)}`;
  return this.isUnique(selector) ? selector : null;
};

window.SelectorUtils.buildStructuralPath = function(element) {
  const path = [];
  let current = element;
  let depth = 0;
  
  while (current && current.tagName && depth < SELECTOR_CONFIG.MAX_DEPTH) {
    const tagName = current.tagName.toLowerCase();
    let segment = tagName;
    
    const stableClasses = this.getStableClasses(current);
    if (stableClasses.length > 0) {
      segment += '.' + stableClasses.join('.');
    }
    
    if (current.parentNode) {
      const siblings = Array.from(current.parentNode.children)
        .filter(child => child.tagName === current.tagName);
        
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }
    
    path.unshift(segment);
    
    const currentSelector = path.join(' > ');
    if (this.isUnique(currentSelector)) {
      return currentSelector;
    }
    
    current = current.parentElement;
    depth++;
  }
  
  return path.join(' > ') || element.tagName?.toLowerCase() || 'unknown';
};

window.SelectorUtils.buildRobustSelector = function(element) {
  if (!element || !element.tagName) {
    return '';
  }

  if (selectorCache.has(element)) {
    return selectorCache.get(element);
  }

  let selector;

  selector = this.buildSemanticSelector(element);
  if (selector) {
    selectorCache.set(element, selector);
    return selector;
  }

  selector = this.buildDataSelector(element);
  if (selector) {
    selectorCache.set(element, selector);
    return selector;
  }

  selector = this.buildAriaSelector(element);
  if (selector) {
    selectorCache.set(element, selector);
    return selector;
  }

  selector = this.buildIdSelector(element);
  if (selector) {
    selectorCache.set(element, selector);
    return selector;
  }

  selector = this.buildStructuralPath(element);
  selectorCache.set(element, selector);
  return selector;
};

// Dev performance monitoring
if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
  const originalBuildRobustSelector = window.SelectorUtils.buildRobustSelector;
  
  window.SelectorUtils.buildRobustSelector = function(element) {
    const start = performance.now();
    const result = originalBuildRobustSelector.call(this, element);
    const duration = performance.now() - start;
    
    if (duration > 10) {
      console.warn(`Slow selector generation: ${duration.toFixed(2)}ms for`, element);
    }
    
    return result;
  };
}