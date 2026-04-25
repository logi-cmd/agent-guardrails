use agent_guardrails_cli::diff::{
    get_top_level_entry, list_changed_files, list_changed_files_from_base_ref,
    parse_git_diff_name_status_z, parse_git_status_porcelain_z,
};
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
            "agent-guardrails-rs-diff-{name}-{}-{unique}",
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
fn parse_git_status_porcelain_z_handles_renames_and_dedupes() {
    let output = " M src/service.js\0R  src/old.js\0src/new.js\0 M src/service.js\0";

    assert_eq!(
        parse_git_status_porcelain_z(output),
        vec!["src/service.js", "src/old.js", "src/new.js"]
    );
}

#[test]
fn parse_git_diff_name_status_z_handles_renames_copies_and_dedupes() {
    let output = "M\0src/service.js\0R100\0src/old.js\0src/new.js\0C100\0src/a.js\0src/b.js\0M\0src/service.js\0";

    assert_eq!(
        parse_git_diff_name_status_z(output),
        vec![
            "src/service.js",
            "src/old.js",
            "src/new.js",
            "src/a.js",
            "src/b.js"
        ]
    );
}

#[test]
fn list_changed_files_reads_working_tree_changes() {
    let repo = TempRepo::new("working-tree");
    repo.init_git();
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");
    repo.write("src/service.js", "export const value = 2;\n");
    repo.write("tests/service.test.js", "test('value', () => {});\n");

    let result = list_changed_files(&repo.path);

    assert!(result.error.is_none(), "{:?}", result.error);
    assert!(result.files.contains(&"src/service.js".to_string()));
    assert!(result.files.contains(&"tests/service.test.js".to_string()));
}

#[test]
fn list_changed_files_filters_to_subdirectory_repo_root() {
    let repo = TempRepo::new("subdir");
    repo.init_git();
    repo.write("apps/web/src/app.js", "export const value = 1;\n");
    repo.write("packages/api/src/api.js", "export const api = 1;\n");
    repo.commit_all("initial");
    repo.write("apps/web/src/app.js", "export const value = 2;\n");
    repo.write("packages/api/src/api.js", "export const api = 2;\n");

    let result = list_changed_files(&repo.path.join("apps/web"));

    assert!(result.error.is_none(), "{:?}", result.error);
    assert_eq!(result.files, vec!["src/app.js"]);
}

#[test]
fn list_changed_files_from_base_ref_reads_committed_diff() {
    let repo = TempRepo::new("base-ref");
    repo.init_git();
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");
    repo.write("src/service.js", "export const value = 2;\n");
    repo.write("tests/service.test.js", "test('value', () => {});\n");
    repo.commit_all("change");

    let result = list_changed_files_from_base_ref(&repo.path, "HEAD~1");

    assert!(result.error.is_none(), "{:?}", result.error);
    assert!(!result.fallback);
    assert!(result.files.contains(&"src/service.js".to_string()));
    assert!(result.files.contains(&"tests/service.test.js".to_string()));
}

#[test]
fn list_changed_files_from_base_ref_falls_back_to_head_working_tree_diff() {
    let repo = TempRepo::new("fallback");
    repo.init_git();
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");
    repo.write("src/service.js", "export const value = 2;\n");

    let result = list_changed_files_from_base_ref(&repo.path, "origin/main");

    assert!(result.error.is_none(), "{:?}", result.error);
    assert!(result.fallback);
    assert!(
        result
            .fallback_reason
            .as_deref()
            .unwrap_or_default()
            .contains("base-ref \"origin/main\" not found")
    );
    assert_eq!(result.files, vec!["src/service.js"]);
}

#[test]
fn get_top_level_entry_matches_js_normalization() {
    assert_eq!(get_top_level_entry("./src\\service.js"), "src");
    assert_eq!(get_top_level_entry("/docs/notes.md"), "docs");
    assert_eq!(get_top_level_entry("README.md"), "README.md");
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
