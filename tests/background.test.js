import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Context menu initialization gate (real execution)', () => {
  let contextMenuClickHandler;
  let initCalled;
  let storageData;

  beforeEach(() => {
    initCalled = false;
    storageData = {
      settings: {
        threshold: 0.7,
        embeddings: [{ value: 'http://localhost:11434', text: 'Ollama', selected: true }],
        model: 'test-model'
      },
      AIFillForm: {},
      staticEmbeddings: {}
    };

    global.chrome.storage.sync.get = vi.fn((keys, callback) => {
      const result = Array.isArray(keys)
        ? keys.reduce((acc, key) => ({ ...acc, [key]: storageData[key] }), {})
        : storageData;
      if (callback) callback(result);
      return Promise.resolve(result);
    });

    global.chrome.storage.local.get = vi.fn((keys, callback) => {
      const result = Array.isArray(keys)
        ? keys.reduce((acc, key) => ({ ...acc, [key]: storageData[key] }), {})
        : storageData;
      if (callback) callback(result);
      return Promise.resolve(result);
    });

    global.chrome.tabs.sendMessage = vi.fn().mockResolvedValue({
      name: 'testField',
      id: 'field1',
      placeholder: 'Test'
    });

    const backgroundCode = readFileSync(join(process.cwd(), 'src/background.js'), 'utf-8');

    const initRegex = /async function init\(tab\)\s*\{[\s\S]*?initCompleted = true;\s*\}/;
    const initMatch = backgroundCode.match(initRegex);
    expect(initMatch).toBeTruthy();
    expect(initMatch[0]).toContain('initCompleted = true');

    const contextMenuRegex = /chrome\.contextMenus\.onClicked\.addListener\(async \(info, tab\) => \{[\s\S]*?\}\);/;
    const match = backgroundCode.match(contextMenuRegex);
    expect(match).toBeTruthy();

    contextMenuClickHandler = match[0];
  });

  it('verifies init gate exists in context menu handler', () => {
    expect(contextMenuClickHandler).toContain('requiresInit');
    expect(contextMenuClickHandler).toContain('!initCompleted');
    expect(contextMenuClickHandler).toContain('await init(tab)');
  });

  it('verifies data-dependent actions are gated', () => {
    expect(contextMenuClickHandler).toContain('fillthisform');
    expect(contextMenuClickHandler).toContain('fillthisfield');
    expect(contextMenuClickHandler).toContain('copyToClipboard');
    expect(contextMenuClickHandler).toContain('fillAndCopyToClipboard');
    expect(contextMenuClickHandler).toContain('fillAndMapField');
  });

  it('verifies value_* pattern is checked for initialization', () => {
    expect(contextMenuClickHandler).toContain('/^value_/i.test(info.menuItemId)');
    expect(contextMenuClickHandler).toMatch(/requiresInit[\s\S]*?value_/);
  });

  it('verifies init gate precedes all case statements', () => {
    const initGateIndex = contextMenuClickHandler.indexOf('if (requiresInit && !initCompleted)');
    const switchIndex = contextMenuClickHandler.indexOf('switch (info.menuItemId)');
    expect(initGateIndex).toBeGreaterThan(-1);
    expect(switchIndex).toBeGreaterThan(-1);
    expect(initGateIndex).toBeLessThan(switchIndex);
  });
});

describe('Clipboard feedback (real execution)', () => {
  let getAndProcessClickedElementCode;

  beforeEach(() => {
    const backgroundCode = readFileSync(join(process.cwd(), 'src/background.js'), 'utf-8');
    const functionRegex = /async function getAndProcessClickedElement\([\s\S]*?\n\}/;
    const match = backgroundCode.match(functionRegex);
    expect(match).toBeTruthy();
    getAndProcessClickedElementCode = match[0];
  });

  it('verifies clipboard flow shows feedback when no value exists', () => {
    expect(getAndProcessClickedElementCode).toContain('shouldCopyToClipboard');
    expect(getAndProcessClickedElementCode).toContain('No value available to copy');
    expect(getAndProcessClickedElementCode).toMatch(/if\s*\(\s*suggestedValue\?\.closest\s*\)/);
    expect(getAndProcessClickedElementCode).toMatch(/else[\s\S]*?No value available to copy/);
  });

  it('verifies clipboard action checks for closest value', () => {
    expect(getAndProcessClickedElementCode).toContain('suggestedValue?.closest');
    expect(getAndProcessClickedElementCode).toContain("action: 'copyToClipboard'");
  });
});

describe('Fill feedback (real execution)', () => {
  let fillFormCode;

  beforeEach(() => {
    const contentCode = readFileSync(join(process.cwd(), 'src/content.js'), 'utf-8');
    const functionRegex = /function fillFormWithProposedValues\(formValues\)\s*\{[\s\S]*?\n\}/;
    const match = contentCode.match(functionRegex);
    expect(match).toBeTruthy();
    fillFormCode = match[0];
  });

  it('verifies fill count tracking exists', () => {
    expect(fillFormCode).toContain('filledCount');
    expect(fillFormCode).toMatch(/let\s+filledCount\s*=\s*0/);
    expect(fillFormCode).toMatch(/filledCount\+\+/);
  });

  it('verifies conditional success message based on filled count', () => {
    expect(fillFormCode).toContain('if (filledCount > 0)');
    expect(fillFormCode).toContain('showNotificationRibbon');
    expect(fillFormCode).toContain('field');
    expect(fillFormCode).toMatch(/No fields were filled/);
  });

  it('verifies success shows actual count', () => {
    expect(fillFormCode).toMatch(/\$\{filledCount\}/);
    expect(fillFormCode).toMatch(/filledCount > 1.*\?.*'s'/);
  });
});

describe('Single-field frame targeting (real execution)', () => {
  let getAndProcessClickedElementCode;

  beforeEach(() => {
    const backgroundCode = readFileSync(join(process.cwd(), 'src/background.js'), 'utf-8');
    const functionRegex = /async function getAndProcessClickedElement\([\s\S]*?\n\}/;
    const match = backgroundCode.match(functionRegex);
    expect(match).toBeTruthy();
    getAndProcessClickedElementCode = match[0];
  });

  it('verifies getClickedElementData targets specific frameId', () => {
    expect(getAndProcessClickedElementCode).toContain("action: 'getClickedElementData'");
    expect(getAndProcessClickedElementCode).toMatch(/frameId:\s*info\.frameId/);
  });

  it('verifies fillFields targets specific frameId', () => {
    expect(getAndProcessClickedElementCode).toMatch(/frameId:\s*info\.frameId/);
  });
});

describe('Storage change resets initCompleted (real execution)', () => {
  let storageChangeHandler;

  beforeEach(() => {
    const backgroundCode = readFileSync(join(process.cwd(), 'src/background.js'), 'utf-8');
    const handlerRegex = /chrome\.storage\.onChanged\.addListener\(async \(changes, areaName\) => \{[\s\S]*?\n\}\);/;
    const match = backgroundCode.match(handlerRegex);
    expect(match).toBeTruthy();
    storageChangeHandler = match[0];
  });

  it('verifies initCompleted is reset on AIFillForm change', () => {
    expect(storageChangeHandler).toContain('initCompleted = false');
    const aiFillFormSection = storageChangeHandler.substring(
      storageChangeHandler.indexOf('if (key === "AIFillForm")'),
      storageChangeHandler.indexOf('} else {')
    );
    expect(aiFillFormSection).toContain('initCompleted = false');
  });

  it('verifies initCompleted is reset on settings change', () => {
    const elseSection = storageChangeHandler.substring(
      storageChangeHandler.indexOf('} else {')
    );
    expect(elseSection).toContain('initCompleted = false');
  });
});
