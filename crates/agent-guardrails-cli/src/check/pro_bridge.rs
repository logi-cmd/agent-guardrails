use super::CheckResult;
use serde_json::{Value, json};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

const PRO_ENRICH_SCRIPT: &str = r#"
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

async function loadPro(repoRoot) {
  const requireRoots = [];
  if (repoRoot) {
    requireRoots.push(path.join(repoRoot, 'package.json'));
  }
  for (const requireRoot of requireRoots) {
    try {
      const require = createRequire(requireRoot);
      const resolved = require.resolve('@agent-guardrails/pro');
      return await import(pathToFileURL(resolved).href);
    } catch {
      // Missing Pro is an OSS-safe no-op.
    }
  }
  return null;
}

function summarizeProProofRecipe(proofPlan = {}) {
  const proof = proofPlan.cheapestNextProof;
  const learned = proof?.learnedEvidence;
  if (!learned) {
    return null;
  }

  return {
    source: learned.source || 'repo-memory',
    title: proof.title || null,
    command: learned.command || proof.command || null,
    summary: learned.summary || null,
    effectiveScore: learned.effectiveScore ?? null,
    recommendationScore: learned.recommendationScore ?? proofPlan.proofWorkbench?.recommendationScore ?? null,
    confidenceLevel: learned.confidenceLevel ?? proofPlan.proofWorkbench?.confidenceLevel ?? null,
    applicabilityScore: learned.applicabilityScore ?? null,
    freshnessPenalty: learned.freshnessPenalty ?? null,
    memoryHealthPenalty: learned.memoryHealthPenalty ?? null,
    memoryHealthWarning: learned.memoryHealthWarning || null,
    scoreReason: learned.scoreReason || null,
    nextAction: proofPlan.proofWorkbench?.nextAction || null
  };
}

function summarizeProofMemoryContext(proofPlan = {}) {
  const context = proofPlan.proofWorkbench?.memoryContext;
  if (!context) {
    return null;
  }

  return {
    state: context.state || 'unknown',
    summary: context.summary || null,
    appliedAt: context.appliedAt || null,
    archivedCount: context.archivedCount ?? null,
    archivedCommands: context.archivedCommands || [],
    reasons: context.reasons || [],
    goLiveImpact: context.goLiveImpact || null
  };
}

const pro = await loadPro(input.repoRoot);
if (!pro?.enrichReview) {
  process.exit(0);
}

const review = await pro.enrichReview(input.review || {}, input.context || {});
const proofPlan = review?.proofPlan ?? null;
process.stdout.write(JSON.stringify({
  goLiveDecision: review?.goLiveDecision ?? null,
  goLiveReport: review?.goLiveReport ?? null,
  proofPlan,
  proofRecipe: summarizeProProofRecipe(proofPlan),
  proofMemoryContext: summarizeProofMemoryContext(proofPlan)
}));
"#;

pub fn try_enrich_check_result_with_pro(repo_root: &Path, result: &mut CheckResult) {
    let payload = json!({
        "repoRoot": repo_root.to_string_lossy(),
        "review": {
            "score": result.score,
            "scoreVerdict": result.score_verdict,
            "summary": {
                "scopeIssues": result.findings.iter().filter(|finding| finding.category == "scope").count(),
                "validationIssues": result.findings.iter().filter(|finding| finding.category == "validation").count(),
                "consistencyConcerns": result.findings.iter().filter(|finding| finding.category == "consistency").count(),
                "continuityConcerns": result.findings.iter().filter(|finding| finding.category == "continuity").count(),
                "performanceConcerns": result.findings.iter().filter(|finding| finding.category == "performance").count(),
                "riskConcerns": result.findings.iter().filter(|finding| finding.category == "risk").count()
            }
        },
        "context": {
            "repoRoot": repo_root.to_string_lossy(),
            "findings": &result.findings
        }
    });

    let Ok(mut child) = Command::new("node")
        .args(["--input-type=module", "-e", PRO_ENRICH_SCRIPT])
        .current_dir(repo_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return;
    };

    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(payload.to_string().as_bytes()).is_err() {
            return;
        }
    }

    let Ok(output) = child.wait_with_output() else {
        return;
    };
    if !output.status.success() || output.stdout.is_empty() {
        return;
    }

    let Ok(enrichment) = serde_json::from_slice::<Value>(&output.stdout) else {
        return;
    };

    if let Some(value) = non_null_field(&enrichment, "goLiveDecision") {
        result.go_live_decision = Some(value);
    }
    if let Some(value) = non_null_field(&enrichment, "goLiveReport") {
        result.go_live_report = Some(value);
    }
    if let Some(value) = non_null_field(&enrichment, "proofPlan") {
        result.proof_plan = Some(value);
    }
    if let Some(value) = non_null_field(&enrichment, "proofRecipe") {
        result.proof_recipe = Some(value);
    }
    if let Some(value) = non_null_field(&enrichment, "proofMemoryContext") {
        result.proof_memory_context = Some(value);
    }
}

fn non_null_field(value: &Value, key: &str) -> Option<Value> {
    value.get(key).filter(|field| !field.is_null()).cloned()
}
