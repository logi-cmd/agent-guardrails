use super::{CheckContextSnapshot, Finding, FindingStore};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Stdio};

const PLUGIN_RUNNER_SCRIPT: &str = r#"
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

function normalizePluginEntries(languagePlugins) {
  if (Array.isArray(languagePlugins)) {
    return languagePlugins
      .map((item) => (typeof item === 'string' ? { name: item } : item))
      .filter((item) => item?.name);
  }

  if (!languagePlugins || typeof languagePlugins !== 'object') {
    return [];
  }

  return Object.entries(languagePlugins).flatMap(([language, entries]) => {
    const values = Array.isArray(entries) ? entries : [entries];
    return values
      .map((item) => {
        if (typeof item === 'string') {
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
  const rootPackagePath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(rootPackagePath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
    if (packageJson.name !== 'agent-guardrails') {
      return null;
    }
  } catch {
    return null;
  }

  const localName = specifier.startsWith('@agent-guardrails/')
    ? specifier.slice('@agent-guardrails/'.length)
    : specifier;
  const localEntry = path.join(repoRoot, 'plugins', localName, 'index.js');
  return fs.existsSync(localEntry) ? localEntry : null;
}

async function importPlugin(specifier, repoRoot) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const resolved = path.isAbsolute(specifier) ? specifier : path.join(repoRoot, specifier);
    return {
      module: await import(pathToFileURL(resolved).href),
      source: 'path'
    };
  }

  try {
    const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
    const resolved = requireFromRepo.resolve(specifier);
    return {
      module: await import(pathToFileURL(resolved).href),
      source: 'package'
    };
  } catch {
    const fallbackEntry = resolveLocalPluginFallback(specifier, repoRoot);
    if (fallbackEntry) {
      return {
        module: await import(pathToFileURL(fallbackEntry).href),
        source: 'local-fallback'
      };
    }
  }

  return {
    module: await import(specifier),
    source: 'package'
  };
}

async function loadSemanticPlugins({ config, repoRoot }) {
  const entries = normalizePluginEntries(config.languagePlugins);
  const detectors = [];
  const plugins = [];

  for (const entry of entries) {
    try {
      const loaded = await importPlugin(entry.name, repoRoot);
      const exportedDetectors = Array.isArray(loaded.module.detectors)
        ? loaded.module.detectors
        : typeof loaded.module.getDetectors === 'function'
          ? await loaded.module.getDetectors({ config, repoRoot })
          : [];

      detectors.push(...exportedDetectors);
      plugins.push({
        name: entry.name,
        language: entry.language ?? null,
        status: 'loaded',
        detectorCount: exportedDetectors.length,
        source: loaded.source
      });
    } catch (error) {
      plugins.push({
        name: entry.name,
        language: entry.language ?? null,
        status: 'missing',
        detectorCount: 0,
        source: null,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { detectors, plugins };
}

const context = input.context || {};
const config = context.config || {};
const repoRoot = context.repoRoot || process.cwd();
const pluginLoad = await loadSemanticPlugins({ config, repoRoot });
const findings = [];
const addFinding = (finding) => {
  if (!finding || typeof finding !== 'object') {
    return;
  }
  findings.push({
    severity: finding.severity || 'warning',
    category: finding.category || 'risk',
    code: finding.code || 'plugin-finding',
    message: finding.message || 'Plugin finding.',
    action: finding.action ?? null,
    files: Array.isArray(finding.files) ? finding.files : []
  });
};

for (const detector of pluginLoad.detectors) {
  if (typeof detector?.run !== 'function') {
    continue;
  }
  try {
    await detector.run({ context, addFinding });
  } catch (error) {
    addFinding({
      severity: 'warning',
      category: 'risk',
      code: 'plugin-detector-error',
      message: `Plugin detector ${detector.name || 'unknown'} failed: ${error instanceof Error ? error.message : String(error)}.`,
      action: 'Review the plugin implementation or disable the failing plugin.',
      files: []
    });
  }
}

process.stdout.write(JSON.stringify({
  plugins: pluginLoad.plugins,
  findings
}));
"#;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginBridgeOutput {
    plugins: Vec<Value>,
    findings: Vec<Finding>,
}

pub fn run_semantic_plugins(
    context: &CheckContextSnapshot,
    store: &mut FindingStore,
) -> Vec<Value> {
    if context.config.get("languagePlugins").is_none() {
        return Vec::new();
    }

    let payload = build_plugin_payload(context);
    let Ok(mut child) = Command::new("node")
        .args(["--input-type=module", "-e", PLUGIN_RUNNER_SCRIPT])
        .current_dir(&context.repo_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return vec![json!({
            "name": "node-plugin-bridge",
            "language": null,
            "status": "missing",
            "detectorCount": 0,
            "source": null,
            "reason": "Node.js was not available to run JavaScript plugins."
        })];
    };

    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(payload.to_string().as_bytes()).is_err() {
            return vec![plugin_bridge_failure(
                "Failed to send context to the JavaScript plugin bridge.",
            )];
        }
    }

    let Ok(output) = child.wait_with_output() else {
        return vec![plugin_bridge_failure(
            "JavaScript plugin bridge did not return a result.",
        )];
    };
    if !output.status.success() || output.stdout.is_empty() {
        return vec![plugin_bridge_failure(
            "JavaScript plugin bridge failed before plugin metadata could be read.",
        )];
    }

    let Ok(plugin_output) = serde_json::from_slice::<PluginBridgeOutput>(&output.stdout) else {
        return vec![plugin_bridge_failure(
            "JavaScript plugin bridge returned invalid metadata.",
        )];
    };

    for finding in plugin_output.findings {
        store.add(finding);
    }

    plugin_output.plugins
}

fn plugin_bridge_failure(reason: &str) -> Value {
    json!({
        "name": "node-plugin-bridge",
        "language": null,
        "status": "missing",
        "detectorCount": 0,
        "source": null,
        "reason": reason
    })
}

fn build_plugin_payload(context: &CheckContextSnapshot) -> Value {
    json!({
        "context": {
            "repoRoot": context.repo_root.to_string_lossy(),
            "config": context.config,
            "policy": context.policy,
            "baseRef": context.base_ref,
            "diffSource": context.diff_source,
            "changedFiles": context.changed_files,
            "sourceFiles": context.source_files,
            "testFiles": context.test_files,
            "topLevelEntries": context.top_level_entries,
            "taskContract": context.task_contract,
            "taskAllowedPaths": context.task_allowed_paths,
            "intendedFiles": context.intended_files,
            "protectedPaths": context.protected_paths,
            "allowedChangeTypes": context.allowed_change_types,
            "requiredCommands": context.required_commands,
            "missingRequiredCommands": context.missing_required_commands,
            "evidencePaths": context.evidence_paths,
            "missingEvidencePaths": context.missing_evidence_paths,
            "commandsRun": context.commands_run,
            "allowedPaths": context.allowed_paths,
            "outOfScopeFiles": context.out_of_scope_files,
            "outOfTaskScopeFiles": context.out_of_task_scope_files,
            "outOfIntendedFiles": context.out_of_intended_files,
            "changeTypes": context.change_types,
            "evidenceSummary": context.evidence_summary,
            "evidenceText": context.evidence_summary.full_text,
            "protectedPathMatches": context.protected_path_matches,
            "configProtectedAreaMatches": context.config_protected_area_matches,
            "interfaceLikeFiles": context.interface_like_files,
            "configOrMigrationFiles": context.config_or_migration_files,
            "performanceSensitiveFiles": context.performance_sensitive_files,
            "criticalPathFiles": context.critical_path_files,
            "taskNfrRequirements": context.task_nfr_requirements,
            "security": context.policy.security
        }
    })
}
