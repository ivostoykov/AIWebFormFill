import { vi } from 'vitest';

global.CSS = {
  escape: (str) => str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&')
};

global.chrome = {
  runtime: {
    getManifest: vi.fn(() => ({
      name: 'AI Form Fill Helper',
      version: '1.0.0'
    })),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn()
    }
  },
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn()
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn()
    },
    session: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn()
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn(),
    update: vi.fn()
  }
};
