/**
 * Pro tier detection.
 * A Pro tier is active when config.pro.licenseKey is present and non-empty.
 * No remote validation — just a local presence check.
 */

export function isProTier(config) {
  return !!(config?.pro?.licenseKey && config.pro.licenseKey.trim().length > 0);
}

export function getTierLabel(config) {
  return isProTier(config) ? "pro" : "oss";
}
