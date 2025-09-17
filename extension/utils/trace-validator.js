/**
 * Shared trace validation utilities
 */
window.TraceValidator = window.TraceValidator || {};

window.TraceValidator.validate = function(trace) {
  if (!trace || typeof trace !== 'object') {
    throw new Error('Invalid trace: not an object');
  }
  
  if (trace.version !== 1) {
    throw new Error(`Unsupported trace version: ${trace.version}. Expected version 1.`);
  }
  
  if (!Array.isArray(trace.steps)) {
    throw new Error('Invalid trace: steps must be an array');
  }
  
  if (trace.steps.length === 0) {
    throw new Error('Invalid trace: no steps found');
  }
  
  const validTypes = ['navigate', 'click', 'type', 'key', 'scroll', 'waitVisible'];
  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i];
    if (!validTypes.includes(step.type)) {
      throw new Error(`Invalid step ${i + 1}: unknown type "${step.type}"`);
    }
    if (typeof step.ts !== 'number' || step.ts < 0) {
      throw new Error(`Invalid step ${i + 1}: invalid timestamp`);
    }
  }
};
