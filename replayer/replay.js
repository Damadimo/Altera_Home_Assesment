#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CONFIG = {
  DEFAULT_TIMEOUT: 2000,
  DEFAULT_SPEED: 1.0,
  GRACE_PERIOD: 10000,
  SLOW_MO_DELAY: 100,
  DEFAULT_VIEWPORT: { width: 1280, height: 720 }
};

class ArgumentParser {
  static parse() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      this.showUsage();
      process.exit(1);
    }

    const config = {
      tracePath: path.resolve(args[0]),
      headful: args.includes('--headful'),
      respectTiming: args.includes('--respect-timing'),
      video: args.includes('--video'),
      speed: this.parseNumericArg(args, '--speed=', CONFIG.DEFAULT_SPEED),
      timeout: this.parseNumericArg(args, '--timeout=', CONFIG.DEFAULT_TIMEOUT)
    };

    return config;
  }

  static parseNumericArg(args, prefix, defaultValue) {
    const arg = args.find(a => a.startsWith(prefix));
    if (!arg) return defaultValue;
    
    const value = parseFloat(arg.split('=')[1]);
    return isNaN(value) ? defaultValue : value;
  }

  static showUsage() {
    console.error('Usage: node replay.js <trace-file.json> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --headful          Run in headful mode (default: headless)');
    console.error('  --speed=N          Speed multiplier for typing (default: 1.0)');
    console.error('  --timeout=MS       Element wait timeout in ms (default: 2000)');
    console.error('  --respect-timing   Use recorded timestamps for realistic timing');
    console.error('  --video            Record video of replay (saves to artifacts/)');
    console.error('');
    console.error('Examples:');
    console.error('  node replay.js ../traces/example.json');
    console.error('  node replay.js ../traces/session.json --headful --speed=2');
    console.error('  node replay.js ../traces/example.json --timeout=5000 --respect-timing');
    console.error('  node replay.js ../traces/example.json --video --headful');
  }
}

class TraceLoader {
  static load(tracePath) {
    if (!fs.existsSync(tracePath)) {
      throw new Error(`Trace file not found: ${tracePath}`);
    }

    let traceData;
    try {
      const content = fs.readFileSync(tracePath, 'utf8');
      traceData = JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse trace file: ${error.message}`);
    }

    this.validate(traceData);
    return traceData;
  }

  static validate(traceData) {
    if (!traceData || typeof traceData !== 'object') {
      throw new Error('Invalid trace: not an object');
    }
    
    if (traceData.version !== 1) {
      throw new Error(`Unsupported trace version: ${traceData.version}. Expected version 1.`);
    }
    
    if (!traceData.steps || !Array.isArray(traceData.steps)) {
      throw new Error('Invalid trace format: missing or invalid steps array');
    }

    if (traceData.steps.length === 0) {
      throw new Error('Invalid trace: no steps found');
    }
    
    const validTypes = ['navigate', 'click', 'type', 'key', 'scroll', 'waitVisible'];
    for (let i = 0; i < traceData.steps.length; i++) {
      const step = traceData.steps[i];
      if (!validTypes.includes(step.type)) {
        throw new Error(`Invalid step ${i + 1}: unknown type "${step.type}"`);
      }
      if (typeof step.ts !== 'number' || step.ts < 0) {
        throw new Error(`Invalid step ${i + 1}: invalid timestamp`);
      }
    }

    const hasNavigate = traceData.steps.some(step => step.type === 'navigate');
    if (!hasNavigate) {
      console.warn('Warning: No navigate step found in trace');
    }
  }
}

class ElementLocator {
  constructor(page, timeout) {
    this.page = page;
    this.timeout = timeout;
  }

  async locate(step) {
    const strategies = this.buildStrategies(step);
    const errors = [];

    for (const strategy of strategies) {
      try {
        const locator = await strategy.call();
        await locator.waitFor({ state: 'visible', timeout: this.timeout });
        return locator;
      } catch (error) {
        errors.push(`${strategy.name}: ${error.message}`);
      }
    }

    throw new Error(
      `Element not found after trying ${strategies.length} strategies:\n` +
      `Step: ${JSON.stringify({ type: step.type, selector: step.selector, role: step.role, name: step.name })}\n` +
      `Errors:\n${errors.join('\n')}`
    );
  }

  buildStrategies(step) {
    const strategies = [];

    if (step.selector) {
      strategies.push({
        name: 'Primary Selector',
        call: () => this.page.locator(step.selector).first()
      });
    }

    if (step.fallbacks?.length) {
      step.fallbacks.forEach((fallback, index) => {
        if (fallback) {
          strategies.push({
            name: `Fallback ${index + 1}`,
            call: () => this.page.locator(fallback).first()
          });
        }
      });
    }

    if (step.role && step.name) {
      strategies.push({
        name: 'Role + Name',
        call: () => this.page.getByRole(step.role, { name: step.name }).first()
      });
    }

    if (step.name) {
      strategies.push({
        name: 'Text Content',
        call: () => this.page.getByText(step.name, { exact: false }).first()
      });
    }

    return strategies;
  }
}

class StepExecutor {
  constructor(page, config) {
    this.page = page;
    this.config = config;
    this.locator = new ElementLocator(page, config.timeout);
  }

  async execute(step, stepIndex) {
    const methodName = `execute${step.type.charAt(0).toUpperCase() + step.type.slice(1)}`;
    const method = this[methodName];

    if (!method) {
      console.warn(`Unknown step type: ${step.type}`);
      return;
    }

    await method.call(this, step, stepIndex);
  }

  async executeNavigate(step) {
    await this.page.goto(step.url, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle').catch(() => {
      console.warn('Network idle timeout - continuing anyway');
    });
    await this.page.waitForTimeout(150);
  }

  async executeClick(step) {
    const locator = await this.locator.locate(step);
    await locator.scrollIntoViewIfNeeded();
    
    if (step.offset) {
      const boundingBox = await locator.boundingBox().catch(() => null);
      if (boundingBox) {
        const x = Math.max(0, Math.min(step.offset.x, Math.floor(boundingBox.width) - 1));
        const y = Math.max(0, Math.min(step.offset.y, Math.floor(boundingBox.height) - 1));
        await locator.click({ position: { x, y } });
        return;
      }
    }
    
    await locator.click();
    await this.page.waitForTimeout(75);
  }

  async executeType(step) {
    const locator = await this.locator.locate(step);
    await locator.focus();
    
    const delay = Math.max(1, Math.round(20 / (this.config.speed || 1)));
    await locator.type(step.text || '', { delay });
  }

  async executeKey(step) {
    const locator = await this.locator.locate(step);
    await locator.focus();
    await this.page.keyboard.press(step.key || 'Enter');
  }

  async executeScroll(step) {
    if (step.target === 'window') {
      await this.page.evaluate(
        ([x, y]) => window.scrollTo(x, y),
        [step.x | 0, step.y | 0]
      );
    }
  }

  async executeWaitVisible(step) {
    try {
      const locator = this.page.locator(step.selector);
      await locator.waitFor({ 
        state: 'visible', 
        timeout: step.timeout || 5000 
      });
    } catch (error) {
      console.warn(`waitVisible timeout for: ${step.selector}`);
    }
  }
}

class ArtifactManager {
  constructor(artifactsDir) {
    this.artifactsDir = artifactsDir;
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.artifactsDir)) {
      fs.mkdirSync(this.artifactsDir, { recursive: true });
    }
  }

  async saveError(stepIndex, step, error) {
    const errorEntry = {
      step: stepIndex,
      type: step.type,
      selector: step.selector,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    const errorsFile = path.join(this.artifactsDir, 'errors.json');
    let errors = [];
    
    if (fs.existsSync(errorsFile)) {
      try {
        errors = JSON.parse(fs.readFileSync(errorsFile, 'utf8'));
      } catch (e) {
        console.warn('Failed to read existing errors file:', e.message);
        errors = [];
      }
    }
    
    errors.push(errorEntry);
    fs.writeFileSync(errorsFile, JSON.stringify(errors, null, 2));
  }

  async saveScreenshot(page, stepIndex, suffix = 'fail') {
    const filename = `step-${String(stepIndex).padStart(2, '0')}-${suffix}.png`;
    const filepath = path.join(this.artifactsDir, filename);
    
    try {
      await page.screenshot({ path: filepath });
      console.log(`Screenshot saved: ${filename}`);
    } catch (error) {
      console.warn('Failed to save screenshot:', error.message);
    }
  }
}

class ReplayOrchestrator {
  constructor(config) {
    this.config = config;
    this.artifactManager = new ArtifactManager(path.join(__dirname, 'artifacts'));
  }

  async run() {
    const trace = TraceLoader.load(this.config.tracePath);
    console.log(`Replaying trace: ${this.config.tracePath}`);
    console.log(`Configuration: headful=${this.config.headful}, speed=${this.config.speed}x, timeout=${this.config.timeout}ms, respectTiming=${this.config.respectTiming}, video=${this.config.video}`);

    const browser = await this.launchBrowser();
    const context = await this.createContext(trace, browser);
    const page = await context.newPage();
    
    const executor = new StepExecutor(page, this.config);

    try {
      await this.executeSteps(trace.steps, executor, page);
      console.log('All steps completed successfully');
    } finally {
      if (this.config.video) {
        console.log('Video saved to artifacts/ directory');
      }
      await this.cleanup(browser);
    }
  }

  async launchBrowser() {
    return chromium.launch({
      headless: !this.config.headful,
      slowMo: this.config.headful ? CONFIG.SLOW_MO_DELAY : 0
    });
  }

  async createContext(trace, browser) {
    const contextOptions = {
      viewport: trace.meta?.viewport || CONFIG.DEFAULT_VIEWPORT
    };
    
    if (this.config.video) {
      contextOptions.recordVideo = {
        dir: this.artifactManager.artifactsDir,
        size: trace.meta?.viewport || CONFIG.DEFAULT_VIEWPORT
      };
    }
    
    return browser.newContext(contextOptions);
  }

  async executeSteps(steps, executor, page) {
    let previousTimestamp = Number(steps[0]?.ts ?? 0);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      try {
        if (this.config.respectTiming) {
          await this.handleTiming(step, previousTimestamp, page);
          previousTimestamp = Number(step.ts ?? previousTimestamp);
        }

        console.log(`Step ${i + 1}/${steps.length}: ${step.type}`);
        await executor.execute(step, i);

      } catch (error) {
        console.error(`Step ${i + 1} failed:`, error.message);
        await this.artifactManager.saveError(i, step, error);
        await this.artifactManager.saveScreenshot(page, i);
      }
    }
  }

  async handleTiming(step, previousTimestamp, page) {
    const currentTimestamp = Number(step.ts ?? previousTimestamp);
    const deltaMs = Math.max(0, Math.floor((currentTimestamp - previousTimestamp) * 1000));
    
    if (deltaMs > 0) {
      await page.waitForTimeout(deltaMs);
    }
  }

  async cleanup(browser) {
    console.log(`Waiting ${CONFIG.GRACE_PERIOD / 1000} seconds before closing...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.GRACE_PERIOD));
    await browser.close();
    console.log('Replay completed');
  }
}

async function main() {
  try {
    const config = ArgumentParser.parse();
    const orchestrator = new ReplayOrchestrator(config);
    await orchestrator.run();
  } catch (error) {
    console.error('Replay failed:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { ReplayOrchestrator, TraceLoader, ArgumentParser };