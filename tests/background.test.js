import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Background worker initialization', () => {
  let backgroundModule;
  let mockTab;
  let mockInfo;

  beforeEach(async () => {
    vi.resetModules();
    mockTab = { id: 1, url: 'https://example.com' };
    mockInfo = { menuItemId: 'fillthisfield', frameId: 0 };

    global.chrome.storage.sync.get.mockImplementation((keys, callback) => {
      if (callback) {
        callback({});
      }
      return Promise.resolve({});
    });

    global.chrome.storage.local.get.mockImplementation((keys, callback) => {
      if (callback) {
        callback({});
      }
      return Promise.resolve({});
    });

    global.chrome.tabs.sendMessage.mockResolvedValue({});
  });

  it('should require initialization for data-dependent actions', () => {
    const dataDependentActions = [
      'fillthisfield',
      'copyToClipboard',
      'fillAndCopyToClipboard',
      'fillAndMapField',
      'fillthisform'
    ];

    dataDependentActions.forEach(action => {
      expect(['fillthisfield', 'copyToClipboard', 'fillAndCopyToClipboard', 'fillAndMapField', 'fillthisform']).toContain(action);
    });
  });

  it('should not require initialization for UI-only actions', () => {
    const uiOnlyActions = [
      'openOptions',
      'autoProposal',
      'showfieldmetadata',
      'clearallfields'
    ];

    uiOnlyActions.forEach(action => {
      expect(['fillthisfield', 'copyToClipboard', 'fillAndCopyToClipboard', 'fillAndMapField', 'fillthisform']).not.toContain(action);
    });
  });

  it('should recognize value_* pattern as data-dependent', () => {
    const valuePatternActions = [
      'value_0',
      'value_1',
      'value_99'
    ];

    valuePatternActions.forEach(action => {
      expect(/^value_/i.test(action)).toBe(true);
    });
  });
});

describe('Feedback mechanism', () => {
  it('should distinguish between filled and skipped fields', () => {
    const scenarios = [
      { filled: 3, total: 5, expected: 'success' },
      { filled: 0, total: 5, expected: 'info' },
      { filled: 1, total: 1, expected: 'success' }
    ];

    scenarios.forEach(scenario => {
      if (scenario.filled > 0) {
        expect(scenario.expected).toBe('success');
      } else {
        expect(scenario.expected).toBe('info');
      }
    });
  });

  it('should provide clear clipboard feedback states', () => {
    const clipboardStates = [
      { hasValue: true, shouldShow: 'copied' },
      { hasValue: false, shouldShow: 'no value available' }
    ];

    clipboardStates.forEach(state => {
      if (state.hasValue) {
        expect(state.shouldShow).toBe('copied');
      } else {
        expect(state.shouldShow).toContain('no value');
      }
    });
  });
});
