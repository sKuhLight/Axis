// Global app settings that are unrelated to UI tokens and device data.
// Persisted locally alongside the theme configuration, but under their own key.

export interface AppSettingsCfg {
  blockLibraryPath: string;
}

const KEY = 'axis.settings';

function defaultCfg(): AppSettingsCfg {
  return { blockLibraryPath: '' };
}

class AppSettingsStore {
  cfg = $state<AppSettingsCfg>(defaultCfg());

  init(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (saved && typeof saved === 'object' && typeof saved.blockLibraryPath === 'string') {
        this.cfg = { blockLibraryPath: saved.blockLibraryPath };
      }
    } catch { /* keep default */ }
  }

  setBlockLibraryPath(path: string): void {
    this.cfg = { blockLibraryPath: path.trim() };
    try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch { /* quota / private mode */ }
  }
}

export const appSettings = new AppSettingsStore();
