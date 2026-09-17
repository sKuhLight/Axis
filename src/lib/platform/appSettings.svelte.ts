// Global app settings that are unrelated to UI tokens and device data.
// Persisted locally alongside the theme configuration, but under their own key.

export interface AppSettingsCfg {
  blockLibraryPath: string;
  presetTemplatesPath: string;
}

const KEY = 'axis.settings';

function defaultCfg(): AppSettingsCfg {
  return { blockLibraryPath: '', presetTemplatesPath: '' };
}

class AppSettingsStore {
  cfg = $state<AppSettingsCfg>(defaultCfg());

  init(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AppSettingsCfg> | null;
      if (saved && typeof saved === 'object') {
        this.cfg = {
          blockLibraryPath: typeof saved.blockLibraryPath === 'string' ? saved.blockLibraryPath : '',
          presetTemplatesPath: typeof saved.presetTemplatesPath === 'string' ? saved.presetTemplatesPath : ''
        };
      }
    } catch { /* keep default */ }
  }

  #persist(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch { /* quota / private mode */ }
  }

  setBlockLibraryPath(path: string): void {
    this.cfg = { ...this.cfg, blockLibraryPath: path.trim() };
    this.#persist();
  }

  setPresetTemplatesPath(path: string): void {
    this.cfg = { ...this.cfg, presetTemplatesPath: path.trim() };
    this.#persist();
  }
}

export const appSettings = new AppSettingsStore();
