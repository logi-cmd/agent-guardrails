use serde_json::{Value, json};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::repo::{DEFAULT_TASK_CONTRACT_PATH, read_config, resolve_task_contract_path};

const DEFAULT_EVIDENCE_PATH: &str = ".agent-guardrails/evidence/current-task.md";
const DEFAULT_SECURITY_HINT: &str =
    "Mention auth, secrets, permissions, and sensitive-data handling explicitly.";
const DEFAULT_DEPENDENCY_HINT: &str =
    "Mention new or upgraded packages, lockfile changes, and dependency impact explicitly.";
const DEFAULT_PERFORMANCE_HINT: &str =
    "Mention latency, throughput, or hotspot validation in evidence.";
const DEFAULT_UNDERSTANDING_HINT: &str =
    "Explain the main tradeoffs so future maintainers can follow the change.";
const DEFAULT_CONTINUITY_HINT: &str =
    "Mention reuse targets and any deliberate continuity break in evidence.";

pub struct PlanArgs {
    task: String,
    contract_path: String,
    print_only: bool,
    yes: bool,
    json: bool,
    flags: PlanFlags,
}

#[derive(Default)]
struct PlanFlags {
    explicit_allowed_paths: Vec<String>,
    explicit_intended_files: Vec<String>,
    explicit_required_commands: Vec<String>,
    explicit_evidence_paths: Vec<String>,
    protected_paths: Vec<String>,
    allowed_change_types: Vec<String>,
    risk_level: String,
    requires_review_notes: Option<bool>,
    validation_profile: String,
    security_requirements: Vec<String>,
    dependency_requirements: Vec<String>,
    performance_requirements: Vec<String>,
    understanding_requirements: Vec<String>,
    continuity_requirements: Vec<String>,
    acknowledged_skips: Vec<String>,
    pattern_summary: String,
    smallest_viable_change: String,
    assumptions: Vec<String>,
    acceptance_criteria: Vec<String>,
    non_goals: Vec<String>,
    expected_behavior_changes: Vec<String>,
    user_visible_effects: Vec<String>,
    intended_symbols: Vec<String>,
    expected_public_surface_changes: Vec<String>,
    expected_boundary_exceptions: Vec<String>,
    expected_test_targets: Vec<String>,
    production_profile: String,
    nfr_requirements: Vec<String>,
    expected_load_sensitive_paths: Vec<String>,
    expected_concurrency_impact: String,
    observability_requirements: Vec<String>,
    rollback_notes: String,
    risk_justification: String,
}

#[derive(Clone)]
struct PlanDefaults {
    allowed_paths: Vec<String>,
    required_commands: Vec<String>,
    evidence_paths: Vec<String>,
    security_requirements: Vec<String>,
    dependency_requirements: Vec<String>,
    performance_requirements: Vec<String>,
    understanding_requirements: Vec<String>,
    continuity_requirements: Vec<String>,
}

pub fn run_plan_cli(args: &[String]) -> i32 {
    let parsed = match parse_plan_args(args) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("agent-guardrails plan: {error}");
            return 1;
        }
    };
    let repo_root = match env::current_dir() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("agent-guardrails plan: failed to read current directory: {error}");
            return 1;
        }
    };
    match run_plan(&repo_root, parsed) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails plan: {error}");
            1
        }
    }
}

fn run_plan(repo_root: &Path, args: PlanArgs) -> Result<(), String> {
    let config = read_config(repo_root)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| {
            "Missing .agent-guardrails/config.json. Run `agent-guardrails init . --preset node-service` first.".to_string()
        })?;
    if should_use_rough_intent(&args) {
        return run_rough_intent_plan(repo_root, &config, args);
    }

    let defaults = suggest_plan_defaults(&config);
    let runtime_files = runtime_file_context();
    let intended_files = if args.flags.explicit_intended_files.is_empty() {
        unique(runtime_files.selected_files.clone())
    } else {
        args.flags.explicit_intended_files.clone()
    };
    let allowed_paths = if !args.flags.explicit_allowed_paths.is_empty() {
        args.flags.explicit_allowed_paths.clone()
    } else if !intended_files.is_empty() {
        unique(
            intended_files
                .iter()
                .filter_map(|file_path| parent_scope(file_path))
                .collect(),
        )
    } else {
        defaults.allowed_paths.clone()
    };
    let required_commands = if args.flags.explicit_required_commands.is_empty() {
        defaults.required_commands.clone()
    } else {
        args.flags.explicit_required_commands.clone()
    };
    let evidence_paths = if args.flags.explicit_evidence_paths.is_empty() {
        defaults.evidence_paths.clone()
    } else {
        args.flags.explicit_evidence_paths.clone()
    };
    let security_requirements = choose_list(
        &args.flags.security_requirements,
        &defaults.security_requirements,
    );
    let dependency_requirements = choose_list(
        &args.flags.dependency_requirements,
        &defaults.dependency_requirements,
    );
    let performance_requirements = choose_list(
        &args.flags.performance_requirements,
        &defaults.performance_requirements,
    );
    let understanding_requirements = choose_list(
        &args.flags.understanding_requirements,
        &defaults.understanding_requirements,
    );
    let continuity_requirements = choose_list(
        &args.flags.continuity_requirements,
        &defaults.continuity_requirements,
    );
    let risk_level = if args.flags.risk_level.is_empty() {
        "standard".to_string()
    } else {
        args.flags.risk_level.clone()
    };
    let validation_profile = if args.flags.validation_profile.is_empty() {
        "standard".to_string()
    } else {
        args.flags.validation_profile.clone()
    };
    let requires_review_notes = args.flags.requires_review_notes.unwrap_or(false);

    let mut auto_filled_fields = Vec::new();
    if args.flags.explicit_allowed_paths.is_empty() && !allowed_paths.is_empty() {
        auto_filled_fields.push("allowed paths".to_string());
    }
    if args.flags.explicit_required_commands.is_empty() && !required_commands.is_empty() {
        auto_filled_fields.push("required commands".to_string());
    }
    if args.flags.explicit_evidence_paths.is_empty() && !evidence_paths.is_empty() {
        auto_filled_fields.push("evidence paths".to_string());
    }
    if args.flags.security_requirements.is_empty() && !security_requirements.is_empty() {
        auto_filled_fields.push("security requirements".to_string());
    }
    if args.flags.dependency_requirements.is_empty() && !dependency_requirements.is_empty() {
        auto_filled_fields.push("dependency requirements".to_string());
    }
    if args.flags.performance_requirements.is_empty() && !performance_requirements.is_empty() {
        auto_filled_fields.push("performance requirements".to_string());
    }
    if args.flags.understanding_requirements.is_empty() && !understanding_requirements.is_empty() {
        auto_filled_fields.push("understanding requirements".to_string());
    }
    if args.flags.continuity_requirements.is_empty() && !continuity_requirements.is_empty() {
        auto_filled_fields.push("continuity requirements".to_string());
    }
    if args.flags.explicit_intended_files.is_empty() && !intended_files.is_empty() {
        auto_filled_fields.push("intended files".to_string());
    }

    let created_at = current_timestamp();
    let session_id = format!("rust-plan-{}-{}", std::process::id(), created_at);
    let contract_source = if !runtime_files.selected_files.is_empty() {
        "runtime-suggested"
    } else if auto_filled_fields.is_empty() {
        "manual"
    } else {
        "preset-defaults"
    };
    let finish_check_hints = finish_check_hints(&required_commands, &evidence_paths);
    let evidence_path_suggested = evidence_paths.first().cloned().unwrap_or_default();
    let risk_dimensions = json!({
        "securityRequirements": security_requirements,
        "dependencyRequirements": dependency_requirements,
        "performanceRequirements": performance_requirements,
        "understandingRequirements": understanding_requirements,
        "continuityRequirements": continuity_requirements
    });
    let next_actions = build_next_actions(
        &required_commands,
        &evidence_paths,
        requires_review_notes,
        &risk_level,
    );
    let contract = json!({
        "schemaVersion": 3,
        "task": args.task,
        "preset": config.get("preset").and_then(Value::as_str).unwrap_or("generic"),
        "createdAt": created_at,
        "allowedPaths": allowed_paths.clone(),
        "requiredCommands": required_commands.clone(),
        "evidencePaths": evidence_paths.clone(),
        "intendedFiles": intended_files.clone(),
        "protectedPaths": args.flags.protected_paths.clone(),
        "allowedChangeTypes": args.flags.allowed_change_types.clone(),
        "riskLevel": risk_level,
        "requiresReviewNotes": requires_review_notes,
        "validationProfile": validation_profile,
        "securityRequirements": risk_dimensions["securityRequirements"],
        "dependencyRequirements": risk_dimensions["dependencyRequirements"],
        "performanceRequirements": risk_dimensions["performanceRequirements"],
        "understandingRequirements": risk_dimensions["understandingRequirements"],
        "continuityRequirements": risk_dimensions["continuityRequirements"],
        "acknowledgedSkips": args.flags.acknowledged_skips.clone(),
        "patternSummary": args.flags.pattern_summary.clone(),
        "smallestViableChange": args.flags.smallest_viable_change.clone(),
        "assumptions": args.flags.assumptions.clone(),
        "acceptanceCriteria": args.flags.acceptance_criteria.clone(),
        "nonGoals": args.flags.non_goals.clone(),
        "expectedBehaviorChanges": args.flags.expected_behavior_changes.clone(),
        "userVisibleEffects": args.flags.user_visible_effects.clone(),
        "intendedSymbols": args.flags.intended_symbols.clone(),
        "expectedPublicSurfaceChanges": args.flags.expected_public_surface_changes.clone(),
        "expectedBoundaryExceptions": args.flags.expected_boundary_exceptions.clone(),
        "expectedTestTargets": args.flags.expected_test_targets.clone(),
        "productionProfile": args.flags.production_profile.clone(),
        "nfrRequirements": args.flags.nfr_requirements.clone(),
        "expectedLoadSensitivePaths": args.flags.expected_load_sensitive_paths.clone(),
        "expectedConcurrencyImpact": args.flags.expected_concurrency_impact.clone(),
        "observabilityRequirements": args.flags.observability_requirements.clone(),
        "rollbackNotes": args.flags.rollback_notes.clone(),
        "riskJustification": args.flags.risk_justification.clone(),
        "autoFilledFields": auto_filled_fields.clone(),
        "session": {
            "version": 1,
            "sessionId": session_id,
            "createdAt": created_at,
            "repoRoot": repo_root.to_string_lossy(),
            "taskRequest": args.task,
            "contractSource": contract_source,
            "selectedFiles": runtime_files.selected_files.clone(),
            "changedFiles": runtime_files.changed_files.clone(),
            "autoFilledFields": auto_filled_fields.clone(),
            "requiredCommandsSuggested": required_commands.clone(),
            "evidencePathSuggested": evidence_path_suggested,
            "riskDimensions": risk_dimensions,
            "finishCheckHints": finish_check_hints,
            "riskSignals": [],
            "archaeologyNotes": [],
            "nextActions": next_actions
        }
    });

    if !args.print_only {
        let path = resolve_task_contract_path(repo_root, Some(&args.contract_path));
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "failed to create contract directory {}: {error}",
                    parent.display()
                )
            })?;
        }
        fs::write(
            &path,
            serde_json::to_string_pretty(&contract)
                .map_err(|error| format!("failed to serialize task contract: {error}"))?
                + "\n",
        )
        .map_err(|error| format!("failed to write task contract {}: {error}", path.display()))?;
    }

    print_plan_text(&contract, &config, &args.contract_path, args.print_only);
    Ok(())
}

fn parse_plan_args(args: &[String]) -> Result<PlanArgs, String> {
    let mut flags = PlanFlags::default();
    let mut task = String::new();
    let mut contract_path = DEFAULT_TASK_CONTRACT_PATH.to_string();
    let mut print_only = false;
    let mut yes = false;
    let mut json = false;
    let mut positional = Vec::new();
    let mut index = 0;

    while index < args.len() {
        let token = &args[index];
        if !token.starts_with("--") {
            positional.push(token.clone());
            index += 1;
            continue;
        }
        match token.as_str() {
            "--task" => {
                task = read_flag_value(args, index, "--task")?;
                index += 2;
            }
            "--contract-path" => {
                contract_path =
                    normalize_repo_path(&read_flag_value(args, index, "--contract-path")?);
                index += 2;
            }
            "--print-only" => {
                print_only = true;
                index += 1;
            }
            "--allow-paths" | "--allow" => {
                flags.explicit_allowed_paths =
                    parse_comma_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--intended-files" => {
                flags.explicit_intended_files =
                    parse_comma_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--protected-paths" => {
                flags.protected_paths = parse_comma_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--allowed-change-types" => {
                flags.allowed_change_types =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--risk-level" => {
                flags.risk_level = read_flag_value(args, index, token)?.trim().to_lowercase();
                index += 2;
            }
            "--requires-review-notes" => {
                flags.requires_review_notes =
                    Some(parse_bool(&read_flag_value(args, index, token)?));
                index += 2;
            }
            "--validation-profile" => {
                flags.validation_profile =
                    read_flag_value(args, index, token)?.trim().to_lowercase();
                index += 2;
            }
            "--required-commands" | "--commands" => {
                flags.explicit_required_commands =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--evidence-paths" | "--evidence" => {
                flags.explicit_evidence_paths =
                    parse_comma_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--security-requirements" => {
                flags.security_requirements =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--dependency-requirements" => {
                flags.dependency_requirements =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--performance-requirements" => {
                flags.performance_requirements =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--understanding-requirements" => {
                flags.understanding_requirements =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--continuity-requirements" => {
                flags.continuity_requirements =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--acknowledged-skips" => {
                flags.acknowledged_skips = parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--pattern-summary" => {
                flags.pattern_summary = read_flag_value(args, index, token)?;
                index += 2;
            }
            "--smallest-change" | "--smallest-viable-change" => {
                flags.smallest_viable_change = read_flag_value(args, index, token)?;
                index += 2;
            }
            "--assumptions" => {
                flags.assumptions = parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--acceptance-criteria" => {
                flags.acceptance_criteria =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--non-goals" => {
                flags.non_goals = parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--expected-behavior-changes" => {
                flags.expected_behavior_changes =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--user-visible-effects" => {
                flags.user_visible_effects =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--intended-symbols" => {
                flags.intended_symbols = parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--expected-public-surface-changes" => {
                flags.expected_public_surface_changes =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--expected-boundary-exceptions" => {
                flags.expected_boundary_exceptions =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--expected-test-targets" => {
                flags.expected_test_targets =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--production-profile" => {
                flags.production_profile = read_flag_value(args, index, token)?;
                index += 2;
            }
            "--nfr-requirements" => {
                flags.nfr_requirements = parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--expected-load-sensitive-paths" => {
                flags.expected_load_sensitive_paths =
                    parse_comma_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--expected-concurrency-impact" => {
                flags.expected_concurrency_impact = read_flag_value(args, index, token)?;
                index += 2;
            }
            "--observability-requirements" => {
                flags.observability_requirements =
                    parse_string_list(&read_flag_value(args, index, token)?);
                index += 2;
            }
            "--rollback-notes" => {
                flags.rollback_notes = read_flag_value(args, index, token)?;
                index += 2;
            }
            "--risk-justification" => {
                flags.risk_justification = read_flag_value(args, index, token)?;
                index += 2;
            }
            "--lang" => {
                let _ = read_flag_value(args, index, token)?;
                index += 2;
            }
            "--json" => {
                json = true;
                index += 1;
            }
            "--yes" | "--y" | "--auto-confirm" => {
                yes = true;
                index += 1;
            }
            value => return Err(format!("unknown option: {value}")),
        }
    }

    if task.is_empty() {
        task = positional.join(" ");
    }
    if task.trim().is_empty() {
        return Err("Pass task text with --task \"...\"".to_string());
    }

    Ok(PlanArgs {
        task,
        contract_path,
        print_only,
        yes,
        json,
        flags,
    })
}

fn should_use_rough_intent(args: &PlanArgs) -> bool {
    let has_detailed_flags = !args.flags.explicit_allowed_paths.is_empty()
        || !args.flags.explicit_required_commands.is_empty()
        || !args.flags.explicit_intended_files.is_empty()
        || !args.flags.risk_level.is_empty()
        || !args.flags.explicit_evidence_paths.is_empty();
    !has_detailed_flags || is_rough_intent_task(&args.task)
}

#[derive(Clone)]
struct RoughIntent {
    task_type: String,
    confidence: f64,
    allowed_paths: Vec<String>,
    required_commands: Vec<String>,
    risk_level: String,
    guard_rules: Vec<String>,
    evidence_path: String,
}

fn run_rough_intent_plan(repo_root: &Path, config: &Value, args: PlanArgs) -> Result<(), String> {
    let parsed = parse_rough_intent(repo_root, config, &args.task);
    let repo_context = build_repo_context(repo_root);
    let pro_plan = try_plan_task_shapes_with_pro(repo_root, &args.task, &repo_context);

    if !args.yes {
        let suggestion = json!({
            "status": "suggestion",
            "suggestion": rough_suggestion_json(&parsed),
            "proPlan": pro_plan
        });
        if args.json {
            println!(
                "{}",
                serde_json::to_string_pretty(&suggestion).map_err(|error| {
                    format!("failed to serialize rough-intent suggestion: {error}")
                })?
            );
        } else {
            print_rough_suggestion(&parsed, pro_plan.as_ref());
        }
        return Ok(());
    }

    let selected_pro_option = select_pro_task_option(pro_plan.as_ref(), None);
    let contract = build_rough_contract(
        repo_root,
        config,
        &args,
        &parsed,
        pro_plan.as_ref(),
        selected_pro_option.as_ref(),
    );
    if !args.print_only {
        write_contract(repo_root, &args.contract_path, &contract)?;
    }

    if args.json {
        let result = json!({
            "status": "created",
            "task": args.task,
            "preset": config.get("preset").and_then(Value::as_str).unwrap_or("generic"),
            "taskType": contract.pointer("/roughIntent/taskType").cloned().unwrap_or(Value::Null),
            "confidence": contract.pointer("/roughIntent/confidence").cloned().unwrap_or(Value::Null),
            "allowedPaths": contract.get("allowedPaths").cloned().unwrap_or_else(|| json!([])),
            "requiredCommands": contract.get("requiredCommands").cloned().unwrap_or_else(|| json!([])),
            "riskLevel": contract.get("riskLevel").cloned().unwrap_or(Value::Null),
            "contractPath": if args.print_only { Value::Null } else { Value::String(resolve_task_contract_path(repo_root, Some(&args.contract_path)).to_string_lossy().to_string()) },
            "roughIntent": contract.get("roughIntent").cloned().unwrap_or(Value::Null),
            "proPlan": contract.get("proPlan").cloned().unwrap_or(Value::Null)
        });
        println!(
            "{}",
            serde_json::to_string_pretty(&result)
                .map_err(|error| format!("failed to serialize rough-intent result: {error}"))?
        );
    } else {
        println!("# Agent Guardrails Task Brief\n");
        println!("Task:\n{}\n", contract["task"].as_str().unwrap_or(""));
        println!(
            "Rough intent:\n- Detected: {} task\n- Confidence: {}%\n",
            contract
                .pointer("/roughIntent/taskType")
                .and_then(Value::as_str)
                .unwrap_or("general"),
            (contract
                .pointer("/roughIntent/confidence")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                * 100.0)
                .round()
        );
        println!("Task contract:");
        if args.print_only {
            println!("- Print only mode; no contract written.");
        } else {
            println!("- Written to {}", normalize_repo_path(&args.contract_path));
        }
        print_labeled_list("Allowed path", &string_array(contract.get("allowedPaths")));
        print_labeled_list(
            "Required command",
            &string_array(contract.get("requiredCommands")),
        );
        println!(
            "- Risk level: {}",
            contract["riskLevel"].as_str().unwrap_or("standard")
        );
        if let Some(option) = selected_pro_option {
            println!(
                "- Pro task shape: {}",
                option
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("selected option")
            );
        }
        println!("\nNext steps:");
        println!("- Let your AI agent implement this task.");
        println!("- Run: agent-guardrails check");
    }

    Ok(())
}

fn build_rough_contract(
    repo_root: &Path,
    config: &Value,
    args: &PlanArgs,
    parsed: &RoughIntent,
    pro_plan: Option<&Value>,
    selected_pro_option: Option<&Value>,
) -> Value {
    let pro_draft = selected_pro_option.and_then(|option| option.get("contractDraft"));
    let allowed_paths =
        string_array_from_value(pro_draft.and_then(|draft| draft.get("allowedPaths")))
            .unwrap_or_else(|| parsed.allowed_paths.clone());
    let required_commands =
        string_array_from_value(pro_draft.and_then(|draft| draft.get("requiredCommands")))
            .unwrap_or_else(|| parsed.required_commands.clone());
    let evidence_paths =
        string_array_from_value(pro_draft.and_then(|draft| draft.get("evidencePaths")))
            .unwrap_or_else(|| vec![parsed.evidence_path.clone()]);
    let risk_level = pro_draft
        .and_then(|draft| draft.get("riskLevel"))
        .and_then(Value::as_str)
        .unwrap_or(&parsed.risk_level)
        .to_string();
    let created_at = current_timestamp();
    let pro_plan_contract = selected_pro_option.map(|selected| {
        json!({
            "selectedOptionId": selected.get("id").and_then(Value::as_str).unwrap_or(""),
            "recommendedOptionId": pro_plan.and_then(|plan| plan.get("recommendedOptionId")).and_then(Value::as_str).unwrap_or(""),
            "options": pro_plan.and_then(|plan| plan.get("options")).cloned().unwrap_or_else(|| json!([]))
        })
    });

    let mut contract = json!({
        "schemaVersion": 3,
        "task": args.task,
        "preset": config.get("preset").and_then(Value::as_str).unwrap_or("generic"),
        "createdAt": created_at,
        "allowedPaths": allowed_paths,
        "requiredCommands": required_commands,
        "evidencePaths": evidence_paths,
        "intendedFiles": [],
        "protectedPaths": [],
        "allowedChangeTypes": [],
        "riskLevel": risk_level,
        "requiresReviewNotes": matches!(risk_level.as_str(), "high" | "critical"),
        "validationProfile": "standard",
        "securityRequirements": [],
        "dependencyRequirements": [],
        "performanceRequirements": [],
        "understandingRequirements": [],
        "continuityRequirements": [],
        "acknowledgedSkips": [],
        "patternSummary": "",
        "smallestViableChange": "",
        "assumptions": [],
        "acceptanceCriteria": [],
        "nonGoals": [],
        "expectedBehaviorChanges": [],
        "userVisibleEffects": [],
        "intendedSymbols": [],
        "expectedPublicSurfaceChanges": [],
        "expectedBoundaryExceptions": [],
        "expectedTestTargets": [],
        "productionProfile": "",
        "nfrRequirements": [],
        "expectedLoadSensitivePaths": [],
        "expectedConcurrencyImpact": "",
        "observabilityRequirements": [],
        "rollbackNotes": "",
        "riskJustification": "",
        "guardRules": parsed.guard_rules,
        "roughIntent": {
            "detected": true,
            "taskType": parsed.task_type,
            "confidence": parsed.confidence,
            "sources": {
                "taskType": "keyword-match",
                "paths": "task-type-defaults",
                "testCommand": "repo-default",
                "riskLevel": "task-type-or-keyword"
            }
        },
        "autoFilledFields": ["allowedPaths", "requiredCommands", "riskLevel", "guardRules"],
        "session": {
            "version": 1,
            "sessionId": format!("rust-plan-{}-{}", std::process::id(), created_at),
            "createdAt": created_at,
            "repoRoot": repo_root.to_string_lossy(),
            "taskRequest": args.task,
            "contractSource": if selected_pro_option.is_some() { "pro-task-shape" } else { "rough-intent" },
            "selectedFiles": [],
            "changedFiles": [],
            "autoFilledFields": ["allowedPaths", "requiredCommands", "riskLevel", "guardRules"],
            "requiredCommandsSuggested": [],
            "evidencePathSuggested": "",
            "riskDimensions": {
                "securityRequirements": [],
                "dependencyRequirements": [],
                "performanceRequirements": [],
                "understandingRequirements": [],
                "continuityRequirements": []
            },
            "finishCheckHints": [],
            "riskSignals": [],
            "archaeologyNotes": [],
            "nextActions": ["Run agent-guardrails check after the implementation."]
        }
    });

    let required_commands = string_array(contract.get("requiredCommands"));
    let evidence_paths = string_array(contract.get("evidencePaths"));
    if let Some(session) = contract.get_mut("session").and_then(Value::as_object_mut) {
        session.insert(
            "requiredCommandsSuggested".to_string(),
            json!(required_commands),
        );
        session.insert(
            "evidencePathSuggested".to_string(),
            json!(evidence_paths.first().cloned().unwrap_or_default()),
        );
        session.insert(
            "finishCheckHints".to_string(),
            json!(finish_check_hints(&required_commands, &evidence_paths)),
        );
    }
    if let Some(pro_plan_contract) = pro_plan_contract {
        if let Some(object) = contract.as_object_mut() {
            object.insert("proPlan".to_string(), pro_plan_contract);
        }
    }
    contract
}

fn parse_rough_intent(repo_root: &Path, config: &Value, task: &str) -> RoughIntent {
    let task_type = classify_task(task);
    let confidence = if task_type == "general" { 0.3 } else { 0.8 };
    let mut allowed_paths = task_type_default_paths(&task_type);
    if allowed_paths.is_empty() {
        allowed_paths = suggest_plan_defaults(config).allowed_paths;
    }
    allowed_paths = allowed_paths
        .into_iter()
        .filter(|item| path_exists_or_plausible(repo_root, item))
        .collect();
    if allowed_paths.is_empty() {
        allowed_paths = vec!["src/".to_string()];
    }
    RoughIntent {
        task_type: task_type.clone(),
        confidence,
        allowed_paths,
        required_commands: vec![
            infer_test_command(repo_root).unwrap_or_else(|| "npm test".to_string()),
        ],
        risk_level: infer_rough_risk_level(task, &task_type),
        guard_rules: task_type_guard_rules(&task_type),
        evidence_path: DEFAULT_EVIDENCE_PATH.to_string(),
    }
}

fn rough_suggestion_json(parsed: &RoughIntent) -> Value {
    json!({
        "taskType": parsed.task_type,
        "confidence": parsed.confidence,
        "inferred": {
            "allowedPaths": parsed.allowed_paths,
            "requiredCommands": parsed.required_commands,
            "riskLevel": parsed.risk_level,
            "guardRules": parsed.guard_rules,
            "evidencePath": parsed.evidence_path
        }
    })
}

fn print_rough_suggestion(parsed: &RoughIntent, pro_plan: Option<&Value>) {
    println!("Generated Task Contract");
    println!("Detected: {} task", parsed.task_type);
    println!("Confidence: {}%", (parsed.confidence * 100.0).round());
    println!("Inferred scope:");
    for path in &parsed.allowed_paths {
        println!("- {path}");
    }
    println!("Inferred test commands:");
    for command in &parsed.required_commands {
        println!("- {command}");
    }
    println!("Risk level: {}", parsed.risk_level);
    if let Some(options) = pro_plan
        .and_then(|plan| plan.get("options"))
        .and_then(Value::as_array)
    {
        if !options.is_empty() {
            println!("Pro task shapes:");
            for option in options {
                println!(
                    "- {}",
                    option
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or("task shape")
                );
            }
        }
    }
    println!("Run again with --yes to write this contract.");
}

fn classify_task(task: &str) -> String {
    let normalized = task.to_ascii_lowercase();
    let candidates: &[(&str, &[&str])] = &[
        (
            "auth",
            &["auth", "login", "signin", "signup", "password", "token"],
        ),
        ("bugfix", &["bug", "fix", "error", "issue", "crash"]),
        ("refactor", &["refactor", "clean", "optimize", "improve"]),
        (
            "performance",
            &["performance", "slow", "fast", "speed", "memory"],
        ),
        ("api", &["api", "endpoint", "rest", "graphql", "route"]),
        ("ui", &["ui", "page", "component", "style", "css"]),
        ("test", &["test", "spec", "coverage"]),
        ("config", &["config", "settings", "env"]),
        ("docs", &["docs", "readme", "documentation"]),
        (
            "deploy",
            &[
                "deploy",
                "release",
                "ship",
                "docker",
                "dockerfile",
                "compose",
                "container",
                "k8s",
                "kubernetes",
            ],
        ),
        (
            "security",
            &["security", "vulnerability", "xss", "csrf", "injection"],
        ),
        ("database", &["database", "sql", "migration", "schema"]),
        ("feature", &["feature", "add", "implement"]),
    ];
    candidates
        .iter()
        .find(|(_, keywords)| keywords.iter().any(|keyword| normalized.contains(keyword)))
        .map(|(task_type, _)| (*task_type).to_string())
        .unwrap_or_else(|| "general".to_string())
}

fn task_type_default_paths(task_type: &str) -> Vec<String> {
    match task_type {
        "auth" => vec!["src/auth/", "src/middleware/", "src/services/"],
        "api" => vec!["src/routes/", "src/controllers/", "src/api/"],
        "ui" => vec!["src/components/", "src/pages/", "src/styles/"],
        "test" => vec!["tests/", "test/"],
        "config" => vec!["config/", "src/config/"],
        "docs" => vec!["docs/", "README.md"],
        "deploy" => vec![
            "Dockerfile",
            "docker-compose.yml",
            "compose.yml",
            "compose.yaml",
            ".github/workflows/",
            "deploy/",
            "k8s/",
        ],
        "database" => vec!["migrations/", "prisma/", "db/"],
        "security" => vec!["src/middleware/", "src/security/", "src/auth/"],
        "feature" | "performance" => vec!["src/"],
        _ => Vec::new(),
    }
    .into_iter()
    .map(ToString::to_string)
    .collect()
}

fn task_type_guard_rules(task_type: &str) -> Vec<String> {
    match task_type {
        "auth" => vec![
            "Do not lower authentication or session safety.",
            "Keep sensitive data out of logs.",
        ],
        "bugfix" => vec![
            "Preserve existing behavior outside the bug boundary.",
            "Add regression coverage.",
        ],
        "refactor" => vec!["Do not change external behavior.", "Keep tests passing."],
        "performance" => vec![
            "Record before/after validation.",
            "Keep correctness tests in scope.",
        ],
        "api" => vec![
            "Keep API compatibility explicit.",
            "Update API-facing tests.",
        ],
        "ui" => vec![
            "Keep responsive behavior intact.",
            "Follow existing design patterns.",
        ],
        "test" => vec!["Do not change production logic unless the contract says so."],
        "config" => vec![
            "Do not commit secrets.",
            "Document config behavior changes.",
        ],
        "docs" => vec!["Do not change runtime logic."],
        "deploy" => vec![
            "Keep rollback steps explicit.",
            "Validate outside production first.",
        ],
        "security" => vec![
            "Do not lower the security bar.",
            "Add security-focused validation.",
        ],
        "database" => vec![
            "Keep migration rollback explicit.",
            "Validate against a safe database.",
        ],
        _ => vec!["Keep the change small and bounded."],
    }
    .into_iter()
    .map(ToString::to_string)
    .collect()
}

fn infer_rough_risk_level(task: &str, task_type: &str) -> String {
    let normalized = task.to_ascii_lowercase();
    if [
        "production",
        "database",
        "migration",
        "delete",
        "security",
        "auth",
        "payment",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
    {
        return "high".to_string();
    }
    match task_type {
        "bugfix" | "performance" | "config" | "deploy" | "security" | "database" => "high",
        "auth" | "refactor" | "api" => "medium",
        "ui" | "test" | "docs" => "low",
        _ => "standard",
    }
    .to_string()
}

fn is_rough_intent_task(task: &str) -> bool {
    let normalized = task.to_ascii_lowercase();
    [
        "rough idea",
        "smallest safe",
        "smallest change",
        "not sure",
        "help me move",
        "move this project",
        "find the smallest",
        "start with",
        "help me figure",
    ]
    .iter()
    .any(|pattern| normalized.contains(pattern))
}

fn infer_test_command(repo_root: &Path) -> Option<String> {
    let package_json = read_json_file(&repo_root.join("package.json"));
    if package_json
        .as_ref()
        .and_then(|value| value.pointer("/scripts/test"))
        .and_then(Value::as_str)
        .is_some()
    {
        return Some("npm test".to_string());
    }
    if repo_root.join("Cargo.toml").exists() {
        return Some("cargo test".to_string());
    }
    if repo_root.join("go.mod").exists() {
        return Some("go test ./...".to_string());
    }
    if repo_root.join("pyproject.toml").exists() || repo_root.join("requirements.txt").exists() {
        return Some("pytest".to_string());
    }
    None
}

fn build_repo_context(repo_root: &Path) -> Value {
    json!({
        "fileTree": list_repo_files(repo_root),
        "packageJson": read_json_file(&repo_root.join("package.json")),
        "topLevelEntries": fs::read_dir(repo_root)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|entry| !entry.starts_with('.'))
            .collect::<Vec<_>>()
    })
}

fn list_repo_files(repo_root: &Path) -> Vec<String> {
    let mut files = Vec::new();
    collect_repo_files(repo_root, repo_root, &mut files, 0);
    files
}

fn collect_repo_files(repo_root: &Path, current: &Path, files: &mut Vec<String>, depth: usize) {
    if depth > 6 {
        return;
    }
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            collect_repo_files(repo_root, &path, files, depth + 1);
        } else if path.is_file() {
            if let Ok(relative) = path.strip_prefix(repo_root) {
                files.push(relative.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

fn path_exists_or_plausible(repo_root: &Path, path_value: &str) -> bool {
    matches!(
        path_value,
        "src/"
            | "Dockerfile"
            | "docker-compose.yml"
            | "compose.yml"
            | "compose.yaml"
            | ".github/workflows/"
            | "deploy/"
            | "k8s/"
    ) || repo_root.join(path_value.trim_end_matches('/')).exists()
}

fn read_json_file(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

const PRO_PLAN_SCRIPT: &str = r#"
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

async function loadPro(repoRoot) {
  try {
    const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
    const resolved = requireFromRepo.resolve('@agent-guardrails/pro');
    return await import(pathToFileURL(resolved).href);
  } catch {
    return null;
  }
}

const pro = await loadPro(input.repoRoot || process.cwd());
if (!pro?.planTaskShapes) {
  process.exit(0);
}
const result = await pro.planTaskShapes(input.intent || '', input.repoContext || {});
if (result) {
  process.stdout.write(JSON.stringify(result));
}
"#;

fn try_plan_task_shapes_with_pro(
    repo_root: &Path,
    intent: &str,
    repo_context: &Value,
) -> Option<Value> {
    let payload = json!({
        "repoRoot": repo_root.to_string_lossy(),
        "intent": intent,
        "repoContext": repo_context
    });
    let Ok(mut child) = Command::new("node")
        .args(["--input-type=module", "-e", PRO_PLAN_SCRIPT])
        .current_dir(repo_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return None;
    };
    if let Some(mut stdin) = child.stdin.take() {
        if stdin.write_all(payload.to_string().as_bytes()).is_err() {
            return None;
        }
    }
    let Ok(output) = child.wait_with_output() else {
        return None;
    };
    if !output.status.success() || output.stdout.is_empty() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

fn select_pro_task_option(pro_plan: Option<&Value>, option_id: Option<&str>) -> Option<Value> {
    let options = pro_plan
        .and_then(|plan| plan.get("options"))
        .and_then(Value::as_array)?;
    if let Some(option_id) = option_id {
        if let Some(option) = options
            .iter()
            .find(|option| option.get("id").and_then(Value::as_str) == Some(option_id))
        {
            return Some(option.clone());
        }
    }
    let recommended = pro_plan
        .and_then(|plan| plan.get("recommendedOptionId"))
        .and_then(Value::as_str);
    options
        .iter()
        .find(|option| option.get("id").and_then(Value::as_str) == recommended)
        .or_else(|| options.first())
        .cloned()
}

fn suggest_plan_defaults(config: &Value) -> PlanDefaults {
    let workflow_defaults = config
        .pointer("/workflow/planDefaults")
        .unwrap_or(&Value::Null);
    let workflow_allowed = string_array(workflow_defaults.get("allowedPaths"))
        .into_iter()
        .map(|item| normalize_directory_scope(&item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    let source_roots = string_array(config.pointer("/checks/sourceRoots"))
        .into_iter()
        .map(|item| normalize_directory_scope(&item));
    let test_roots = string_array(config.pointer("/checks/testRoots"))
        .into_iter()
        .map(|item| normalize_directory_scope(&item));

    let allowed_paths = if workflow_allowed.is_empty() {
        unique(
            source_roots
                .chain(test_roots)
                .filter(|item| !item.is_empty())
                .collect(),
        )
    } else {
        workflow_allowed
    };

    let evidence_paths = string_array(workflow_defaults.get("evidencePaths"))
        .into_iter()
        .map(|item| normalize_repo_path(&item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    PlanDefaults {
        allowed_paths,
        required_commands: string_array(workflow_defaults.get("requiredCommands")),
        evidence_paths: if evidence_paths.is_empty() {
            vec![DEFAULT_EVIDENCE_PATH.to_string()]
        } else {
            evidence_paths
        },
        security_requirements: vec![policy_hint(
            config,
            "/nfrPolicies/security/evidenceHint",
            DEFAULT_SECURITY_HINT,
        )],
        dependency_requirements: vec![policy_hint(
            config,
            "/nfrPolicies/dependency/evidenceHint",
            DEFAULT_DEPENDENCY_HINT,
        )],
        performance_requirements: vec![policy_hint(
            config,
            "/nfrPolicies/performance/evidenceHint",
            DEFAULT_PERFORMANCE_HINT,
        )],
        understanding_requirements: vec![policy_hint(
            config,
            "/nfrPolicies/understanding/evidenceHint",
            DEFAULT_UNDERSTANDING_HINT,
        )],
        continuity_requirements: vec![policy_hint(
            config,
            "/nfrPolicies/continuity/evidenceHint",
            DEFAULT_CONTINUITY_HINT,
        )],
    }
}

fn print_plan_text(contract: &Value, config: &Value, contract_path: &str, print_only: bool) {
    println!("# Agent Guardrails Task Brief\n");
    println!("Task:\n{}\n", contract["task"].as_str().unwrap_or(""));
    println!(
        "Preset:\n{}\n",
        contract["preset"].as_str().unwrap_or("generic")
    );
    println!("Read before writing:");
    print_list_or_default(
        &string_array(config.pointer("/workflow/readBeforeWrite")),
        "README.md (if it exists)",
    );
    println!("\nConstraints:");
    print_list_or_default(
        &string_array(config.pointer("/workflow/constraints")),
        "Keep the change small and bounded.",
    );
    println!("\nDefinition of done:");
    print_list_or_default(
        &string_array(config.pointer("/workflow/definitionOfDone")),
        "Tests and checks pass.",
    );
    println!("\nTask contract:");
    if print_only {
        println!("- Print only mode; no contract written.");
    } else {
        println!("- Written to {}", normalize_repo_path(contract_path));
    }
    let auto_filled = string_array(contract.get("autoFilledFields"));
    if !auto_filled.is_empty() {
        println!(
            "- Auto-filled from preset defaults: {}",
            auto_filled.join(", ")
        );
    }
    println!(
        "- Contract source: {}",
        contract["session"]["contractSource"]
            .as_str()
            .unwrap_or("manual")
    );
    println!(
        "- Session ID: {}",
        contract["session"]["sessionId"].as_str().unwrap_or("")
    );
    print_labeled_list("Allowed path", &string_array(contract.get("allowedPaths")));
    print_labeled_list(
        "Intended file",
        &string_array(contract.get("intendedFiles")),
    );
    print_labeled_list(
        "Protected path",
        &string_array(contract.get("protectedPaths")),
    );
    print_labeled_list(
        "Allowed change type",
        &string_array(contract.get("allowedChangeTypes")),
    );
    println!(
        "- Risk level: {}",
        contract["riskLevel"].as_str().unwrap_or("standard")
    );
    println!(
        "- Review notes required: {}",
        if contract["requiresReviewNotes"].as_bool().unwrap_or(false) {
            "yes"
        } else {
            "no"
        }
    );
    println!(
        "- Validation profile: {}",
        contract["validationProfile"].as_str().unwrap_or("standard")
    );
    print_labeled_list(
        "Required command",
        &string_array(contract.get("requiredCommands")),
    );
    print_labeled_list(
        "Evidence path",
        &string_array(contract.get("evidencePaths")),
    );
    println!("Risk dimensions:");
    print_labeled_list(
        "Security requirement",
        &string_array(contract.get("securityRequirements")),
    );
    print_labeled_list(
        "Dependency requirement",
        &string_array(contract.get("dependencyRequirements")),
    );
    print_labeled_list(
        "Performance requirement",
        &string_array(contract.get("performanceRequirements")),
    );
    print_labeled_list(
        "Understanding requirement",
        &string_array(contract.get("understandingRequirements")),
    );
    print_labeled_list(
        "Continuity requirement",
        &string_array(contract.get("continuityRequirements")),
    );
    println!("\nAcceptance alignment:");
    print_labeled_list(
        "Acceptance criterion",
        &string_array(contract.get("acceptanceCriteria")),
    );
    print_labeled_list("Non-goal", &string_array(contract.get("nonGoals")));
    print_labeled_list(
        "Expected behavior change",
        &string_array(contract.get("expectedBehaviorChanges")),
    );
    print_labeled_list(
        "User-visible effect",
        &string_array(contract.get("userVisibleEffects")),
    );
    println!("\nImplementation shape:");
    println!(
        "- Existing pattern summary: {}",
        string_or_default(
            contract.get("patternSummary"),
            "describe the current module pattern before editing"
        )
    );
    println!(
        "- Smallest viable change: {}",
        string_or_default(
            contract.get("smallestViableChange"),
            "keep the implementation to the narrowest working slice"
        )
    );
    print_labeled_list(
        "Assumption or unknown",
        &string_array(contract.get("assumptions")),
    );
    println!(
        "\nProduction profile: {}",
        string_or_default(contract.get("productionProfile"), "none declared")
    );
    print_labeled_list(
        "Non-functional requirement",
        &string_array(contract.get("nfrRequirements")),
    );
    print_labeled_list(
        "Intended symbol",
        &string_array(contract.get("intendedSymbols")),
    );
    print_labeled_list(
        "Expected public surface change",
        &string_array(contract.get("expectedPublicSurfaceChanges")),
    );
    print_labeled_list(
        "Expected boundary exception",
        &string_array(contract.get("expectedBoundaryExceptions")),
    );
    print_labeled_list(
        "Expected test target",
        &string_array(contract.get("expectedTestTargets")),
    );
    print_labeled_list(
        "Load-sensitive path",
        &string_array(contract.get("expectedLoadSensitivePaths")),
    );
    println!(
        "- Expected concurrency impact: {}",
        string_or_default(contract.get("expectedConcurrencyImpact"), "none declared")
    );
    print_labeled_list(
        "Observability requirement",
        &string_array(contract.get("observabilityRequirements")),
    );
    println!(
        "- Rollback notes: {}",
        string_or_default(contract.get("rollbackNotes"), "none declared")
    );
    println!(
        "- Risk justification: {}",
        string_or_default(contract.get("riskJustification"), "none declared")
    );
    println!("\nImplementation note:");
    println!("- List the exact files you plan to touch before editing.");
    println!(
        "- If the task requires new abstractions, justify why existing patterns are insufficient."
    );
    println!(
        "- Keep interface, config, and migration changes explicit instead of folding them into a generic task."
    );
    println!("- Stop and surface missing context instead of inventing it.");
    let next_actions = string_array(contract.pointer("/session/nextActions"));
    if !next_actions.is_empty() {
        println!("\nNext actions:");
        for action in next_actions {
            println!("- {action}");
        }
    }
}

#[derive(Default)]
struct RuntimeFiles {
    selected_files: Vec<String>,
    changed_files: Vec<String>,
}

fn runtime_file_context() -> RuntimeFiles {
    let selected_files = parse_runtime_file_list(env::var("AGENT_GUARDRAILS_SELECTED_FILES").ok());
    let changed_files = parse_runtime_file_list(env::var("AGENT_GUARDRAILS_CHANGED_FILES").ok());
    RuntimeFiles {
        selected_files: unique(
            selected_files
                .into_iter()
                .chain(changed_files.clone())
                .collect(),
        ),
        changed_files: unique(changed_files),
    }
}

fn build_next_actions(
    required_commands: &[String],
    evidence_paths: &[String],
    requires_review_notes: bool,
    risk_level: &str,
) -> Vec<String> {
    let mut actions = vec!["Implement the smallest change that fits the contract.".to_string()];
    if !required_commands.is_empty() {
        actions.push(format!(
            "Run required commands: {}",
            required_commands.join(", ")
        ));
    }
    if !evidence_paths.is_empty() {
        actions.push(format!("Update evidence: {}", evidence_paths.join(", ")));
    }
    if requires_review_notes || matches!(risk_level, "high" | "critical") {
        actions.push("Capture review-oriented notes before finishing.".to_string());
    }
    actions.push("Run npx agent-guardrails check --review before completing the task.".to_string());
    unique(actions)
}

fn finish_check_hints(required_commands: &[String], evidence_paths: &[String]) -> Vec<String> {
    let mut hints = Vec::new();
    if !required_commands.is_empty() {
        hints.push(format!(
            "Report the commands you actually ran: {}",
            required_commands.join(", ")
        ));
    }
    if !evidence_paths.is_empty() {
        hints.push(format!(
            "Keep the evidence note current: {}",
            evidence_paths.join(", ")
        ));
    }
    hints.push(
        "Finish with npx agent-guardrails check --review before handing off or merging."
            .to_string(),
    );
    hints
}

fn write_contract(repo_root: &Path, contract_path: &str, contract: &Value) -> Result<(), String> {
    let path = resolve_task_contract_path(repo_root, Some(contract_path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create contract directory {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::write(
        &path,
        serde_json::to_string_pretty(contract)
            .map_err(|error| format!("failed to serialize task contract: {error}"))?
            + "\n",
    )
    .map_err(|error| format!("failed to write task contract {}: {error}", path.display()))
}

fn string_array_from_value(value: Option<&Value>) -> Option<Vec<String>> {
    let values = value?
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    Some(values)
}

fn choose_list(explicit: &[String], fallback: &[String]) -> Vec<String> {
    if explicit.is_empty() {
        fallback.to_vec()
    } else {
        explicit.to_vec()
    }
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}

fn parse_bool(value: &str) -> bool {
    matches!(
        value.trim().to_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn parse_comma_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|item| normalize_repo_path(item.trim()))
        .filter(|item| !item.is_empty())
        .collect()
}

fn parse_string_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn parse_runtime_file_list(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(runtime_path_delimiter())
        .map(|item| normalize_repo_path(item.trim()))
        .filter(|item| !item.is_empty())
        .collect()
}

#[cfg(windows)]
fn runtime_path_delimiter() -> char {
    ';'
}

#[cfg(not(windows))]
fn runtime_path_delimiter() -> char {
    ':'
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn policy_hint(config: &Value, pointer: &str, default_value: &str) -> String {
    config
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_value)
        .to_string()
}

fn normalize_directory_scope(value: &str) -> String {
    let normalized = normalize_repo_path(value);
    if normalized.is_empty() {
        return normalized;
    }
    if normalized.ends_with('/') {
        normalized
    } else {
        format!("{normalized}/")
    }
}

fn normalize_repo_path(value: &str) -> String {
    let mut parts = Vec::new();
    let normalized_separators = value.replace('\\', "/");
    for part in normalized_separators.trim_start_matches("./").split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    let mut normalized = parts.join("/");
    if value.ends_with('/') && !normalized.is_empty() {
        normalized.push('/');
    }
    normalized.trim_start_matches('/').to_string()
}

fn parent_scope(value: &str) -> Option<String> {
    let normalized = normalize_repo_path(value);
    normalized
        .rfind('/')
        .map(|index| normalized[..index + 1].to_string())
        .filter(|item| !item.is_empty())
}

fn unique(values: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .filter(|item| seen.insert(item.clone()))
        .collect()
}

fn current_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{millis}")
}

fn print_list_or_default(items: &[String], fallback: &str) {
    if items.is_empty() {
        println!("- {fallback}");
        return;
    }
    for item in items {
        println!("- {item}");
    }
}

fn print_labeled_list(label: &str, items: &[String]) {
    if items.is_empty() {
        println!("- {label}: none declared");
        return;
    }
    for item in items {
        println!("- {label}: {item}");
    }
}

fn string_or_default(value: Option<&Value>, fallback: &str) -> String {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

#[allow(dead_code)]
fn _contract_path_for_tests(repo_root: &Path, custom_path: Option<&str>) -> PathBuf {
    resolve_task_contract_path(repo_root, custom_path)
}
