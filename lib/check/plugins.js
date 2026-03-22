import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizePluginEntries(languagePlugins) {
  if (Array.isArray(languagePlugins)) {
    return languagePlugins
      .map((item) => (typeof item === "string" ? { name: item } : item))
      .filter((item) => item?.name);
  }

  if (!languagePlugins || typeof languagePlugins !== "object") {
    return [];
  }

  return Object.entries(languagePlugins).flatMap(([language, entries]) => {
    const values = Array.isArray(entries) ? entries : [entries];
    return values
      .map((item) => {
        if (typeof item === "string") {
          return { language, name: item };
        }

        if (item?.name) {
          return { language, ...item };
        }

        return null;
      })
      .filter(Boolean);
  });
}

function resolveLocalPluginFallback(specifier, repoRoot) {
  const rootPackagePath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(rootPackagePath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
    if (packageJson.name !== "agent-guardrails") {
      return null;
    }
  } catch {
    return null;
  }

  const localName = specifier.startsWith("@agent-guardrails/")
    ? specifier.slice("@agent-guardrails/".length)
    : specifier;
  const localEntry = path.join(repoRoot, "plugins", localName, "index.js");
  return fs.existsSync(localEntry) ? localEntry : null;
}

async function importPlugin(specifier, repoRoot) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const resolved = path.isAbsolute(specifier) ? specifier : path.join(repoRoot, specifier);
    return {
      module: await import(pathToFileURL(resolved).href),
      source: "path"
    };
  }

  try {
    const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
    const resolved = requireFromRepo.resolve(specifier);
    return {
      module: await import(pathToFileURL(resolved).href),
      source: "package"
    };
  } catch {
    const fallbackEntry = resolveLocalPluginFallback(specifier, repoRoot);
    if (fallbackEntry) {
      return {
        module: await import(pathToFileURL(fallbackEntry).href),
        source: "local-fallback"
      };
    }
  }

  return {
    module: await import(specifier),
    source: "package"
  };
}

export async function loadSemanticPlugins({ config, repoRoot }) {
  const entries = normalizePluginEntries(config.languagePlugins);
  const detectors = [];
  const plugins = [];

  for (const entry of entries) {
    try {
      const loaded = await importPlugin(entry.name, repoRoot);
      const exportedDetectors = Array.isArray(loaded.module.detectors)
        ? loaded.module.detectors
        : typeof loaded.module.getDetectors === "function"
          ? await loaded.module.getDetectors({ config, repoRoot })
          : [];

      detectors.push(...exportedDetectors);
      plugins.push({
        name: entry.name,
        language: entry.language ?? null,
        status: "loaded",
        detectorCount: exportedDetectors.length,
        source: loaded.source
      });
    } catch (error) {
      plugins.push({
        name: entry.name,
        language: entry.language ?? null,
        status: "missing",
        detectorCount: 0,
        source: null,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { detectors, plugins };
}
