export const UPDATE_PREFERENCE_VERSION = 1;

/** Earlier Chinese builds forced updates off without providing a working preference. */
export function migrateUpdatePreference<T extends { autoUpdateEnabled?: boolean; autoUpdatePreferenceVersion?: number }>(
  saved: T,
  merged: T,
): T {
  if ((saved.autoUpdatePreferenceVersion ?? 0) >= UPDATE_PREFERENCE_VERSION) return merged;
  return { ...merged, autoUpdateEnabled: true, autoUpdatePreferenceVersion: UPDATE_PREFERENCE_VERSION };
}

let notifiedVersion: string | null = null;
export function shouldNotifyUpdate(version: string): boolean {
  if (notifiedVersion === version) return false;
  notifiedVersion = version;
  return true;
}
export function resetUpdateNotification(): void {
  notifiedVersion = null;
}
