import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'LassoClip',
    description: 'Capture anything. Shape it. Reuse it.',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting', 'storage', 'contextMenus', 'clipboardWrite'],
    action: {
      default_title: 'Start LassoClip',
      default_popup: 'popup.html',
    },
    commands: {
      'start-quick-clip': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: 'Start a LassoClip capture',
      },
    },
  },
});
