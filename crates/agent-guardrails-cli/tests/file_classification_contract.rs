use agent_guardrails_cli::diff::{
    classify_change_type, find_out_of_scope_files, is_path_within_allowed_scope, is_source_file,
    is_test_file, normalize_allowed_scope, normalize_change_type,
};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
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
            "agent-guardrails-rs-classify-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp repo");
        Self { path }
    }
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn config() -> serde_json::Value {
    json!({
        "checks": {
            "sourceRoots": ["src", "lib"],
            "sourceExtensions": [".js", ".ts"],
            "testRoots": ["tests"],
            "testExtensions": [".js", ".ts"],
            "testFileSignals": [".test.", ".spec."]
        }
    })
}

#[test]
fn source_and_test_file_detection_match_js_contract() {
    let config = config();

    assert!(is_source_file("src/service.js", &config));
    assert!(is_source_file("lib/domain/model.ts", &config));
    assert!(!is_source_file("docs/service.js", &config));
    assert!(is_test_file("tests/service.js", &config));
    assert!(is_test_file("src/service.test.js", &config));
    assert!(is_test_file("src/service.spec.ts", &config));
    assert!(!is_test_file("src/service.js", &config));
}

#[test]
fn classify_change_type_matches_current_js_order() {
    let config = config();

    assert_eq!(
        classify_change_type(".agent-guardrails/config.json", &config),
        "guardrails-internal"
    );
    assert_eq!(classify_change_type("tests/service.js", &config), "tests");
    assert_eq!(classify_change_type("docs/notes.md", &config), "docs");
    assert_eq!(classify_change_type("README.rst", &config), "docs");
    assert_eq!(
        classify_change_type("src/migrations/001.sql", &config),
        "migration"
    );
    assert_eq!(classify_change_type("package.json", &config), "config");
    assert_eq!(
        classify_change_type(".github/workflows/ci.yml", &config),
        "config"
    );
    assert_eq!(
        classify_change_type("src/types/user.ts", &config),
        "interface"
    );
    assert_eq!(
        classify_change_type("src/api/users.ts", &config),
        "interface"
    );
    assert_eq!(classify_change_type("src/user.d.ts", &config), "interface");
    assert_eq!(
        classify_change_type("src/service.js", &config),
        "implementation"
    );
    assert_eq!(classify_change_type("assets/logo.png", &config), "other");
}

#[test]
fn normalize_change_type_keeps_current_aliases() {
    assert_eq!(
        normalize_change_type(" Implementation-Only "),
        "implementation-only"
    );
    assert_eq!(
        normalize_change_type("interface-changing"),
        "interface-changing"
    );
    assert_eq!(normalize_change_type("docs"), "docs");
    assert_eq!(normalize_change_type(""), "");
}

#[test]
fn allowed_scope_matching_handles_all_files_dirs_globs_and_existing_dirs() {
    let repo = TempRepo::new("scope");
    fs::create_dir_all(repo.path.join("src")).expect("create src");

    assert_eq!(normalize_allowed_scope(".", &repo.path).kind, "all");
    assert!(is_path_within_allowed_scope(
        "src/service.js",
        ".",
        &repo.path
    ));
    assert!(is_path_within_allowed_scope(
        "src/service.js",
        "src/**",
        &repo.path
    ));
    assert!(is_path_within_allowed_scope(
        "src/service.js",
        "src/",
        &repo.path
    ));
    assert!(is_path_within_allowed_scope(
        "src/service.js",
        "src",
        &repo.path
    ));
    assert!(is_path_within_allowed_scope(
        "src/service.js",
        "src/service.js",
        &repo.path
    ));
    assert!(!is_path_within_allowed_scope(
        "src/other.js",
        "src/service.js",
        &repo.path
    ));
}

#[test]
fn find_out_of_scope_files_returns_only_disallowed_files() {
    let repo = TempRepo::new("out-of-scope");
    let files = vec![
        "src/service.js".to_string(),
        "tests/service.test.js".to_string(),
        "docs/notes.md".to_string(),
    ];

    assert_eq!(
        find_out_of_scope_files(
            &files,
            &["src/".to_string(), "tests/".to_string()],
            &repo.path
        ),
        vec!["docs/notes.md"]
    );
    assert!(find_out_of_scope_files(&files, &[], &repo.path).is_empty());
}
