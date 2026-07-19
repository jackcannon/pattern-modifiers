const AUTO_RESET_FLAG = 'pattern-modifiers-auto-reset';
const HEALTHY_CLEAR_MS = 3000;

export const CRASH_RECOVERY_DELAY_MS = 5000;

/**
 * True when this page load followed an automatic crash reset.
 * Used to avoid an infinite reset loop if defaults also crash.
 */
export const didAutoResetOnThisLoad = (): boolean => {
  try {
    return sessionStorage.getItem(AUTO_RESET_FLAG) === '1';
  } catch {
    return false;
  }
};

export const markAutoResetPending = () => {
  try {
    sessionStorage.setItem(AUTO_RESET_FLAG, '1');
  } catch {
    // sessionStorage unavailable.
  }
};

export const clearAutoResetFlag = () => {
  try {
    sessionStorage.removeItem(AUTO_RESET_FLAG);
  } catch {
    // sessionStorage unavailable.
  }
};

/**
 * Clear persisted form state and reload via the existing `?reset=true` path.
 */
export const resetStateAndReload = () => {
  markAutoResetPending();
  const url = new URL(window.location.href);
  url.search = 'reset=true';
  url.hash = '';
  window.location.replace(url.toString());
};

/**
 * After a successful run without a new crash, clear the auto-reset flag
 * so a later crash can recover again.
 */
export const scheduleHealthyClear = (): (() => void) => {
  const timer = window.setTimeout(() => {
    clearAutoResetFlag();
  }, HEALTHY_CLEAR_MS);

  return () => window.clearTimeout(timer);
};
