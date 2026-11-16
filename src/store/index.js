import { createLiveStore } from './live.js';
import { createOfflineStore } from './offline.js';

export function createStore(cfg) {
  return cfg.offline ? createOfflineStore(cfg.snapshotPath) : createLiveStore(cfg.databaseUrl);
}
