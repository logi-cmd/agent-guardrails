use agent_guardrails_cli::check::{CheckContextOptions, build_check_context};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

struct TempRepo {
    path: PathBuf,
}

impl TempRepo {
    fn new(name: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "agent-guardrails-rs-context-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp repo");
        Self { path }
    }

    fn init_git(&self) {
        git(&self.path, ["init"]);
        git(&self.path, ["config", "user.email", "test@example.com"]);
        git(&self.path, ["config", "user.name", "Agent Guardrails Test"]);
        git(&self.path, ["config", "core.autocrlf", "false"]);
    }

    fn write(&self, relative: &str, content: &str) {
        let path = self.path.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, content).expect("write file");
    }

    fn commit_all(&self, message: &str) {
        git(&self.path, ["add", "."]);
        git(&self.path, ["commit", "-m", message]);
    }
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn check_context_builds_current_js_input_shape_from_working_tree() {
    let repo = TempRepo::new("working-tree");
    repo.init_git();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/", "tests/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "testRoots": ["tests"],
                "testExtensions": [".js"],
                "testFileSignals": [".test."]
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update service",
            "allowedPaths": ["src/"],
            "intendedFiles": ["src/service.js"],
            "allowedChangeTypes": ["implementation-only"]
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write(
        "tests/service.test.js",
        "test('value updated', () => {});\n",
    );
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");
    repo.write("tests/service.test.js", "test('value', () => {});\n");
    repo.write("docs/notes.md", "internal note\n");
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Changed contract should be ignored in changedFiles",
            "allowedPaths": ["src/"],
            "intendedFiles": ["src/service.js"],
            "allowedChangeTypes": ["implementation-only"]
        })
        .to_string(),
    );

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");

    assert_same_items(
        &context.changed_files,
        &["docs/notes.md", "src/service.js", "tests/service.test.js"],
    );
    assert_eq!(context.source_files, vec!["src/service.js"]);
    assert_eq!(context.test_files, vec!["tests/service.test.js"]);
    assert_eq!(context.allowed_paths, vec![json!("src/"), json!("tests/")]);
    assert_same_items(&context.out_of_scope_files, &["docs/notes.md"]);
    assert_same_items(
        &context.out_of_task_scope_files,
        &["docs/notes.md", "tests/service.test.js"],
    );
    assert_same_items(
        &context.out_of_intended_files,
        &["docs/notes.md", "tests/service.test.js"],
    );
    assert_same_items(&context.top_level_entries, &["docs", "src", "tests"]);
    assert_eq!(context.change_types["src/service.js"], "implementation");
    assert_eq!(context.change_types["tests/service.test.js"], "tests");
    assert_eq!(context.change_types["docs/notes.md"], "docs");
    assert_eq!(context.task_allowed_paths, vec![json!("src/")]);
    assert_eq!(context.intended_files, vec![json!("src/service.js")]);
}

#[test]
fn check_context_uses_base_ref_diff_when_requested() {
    let repo = TempRepo::new("base-ref");
    repo.init_git();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({ "checks": {} }).to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");
    repo.write("src/service.js", "export const value = 2;\n");
    repo.commit_all("change");

    let context = build_check_context(
        &repo.path,
        CheckContextOptions {
            base_ref: Some("HEAD~1".to_string()),
            ..CheckContextOptions::default()
        },
    )
    .expect("context");

    assert_eq!(context.diff_source, "git diff HEAD~1...HEAD");
    assert_eq!(context.changed_files, vec!["src/service.js"]);
}

fn git<I, S>(cwd: &Path, args: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output = Command::new("git")
        .args(args.into_iter().map(|arg| arg.as_ref().to_string()))
        .current_dir(cwd)
        .output()
        .expect("run git");
    assert!(
        output.status.success(),
        "git command failed in {}: {}",
        cwd.display(),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn assert_same_items(actual: &[String], expected: &[&str]) {
    let mut actual = actual.to_vec();
    let mut expected = expected
        .iter()
        .map(|item| item.to_string())
        .collect::<Vec<_>>();
    actual.sort();
    expected.sort();
    assert_eq!(actual, expected);
}
