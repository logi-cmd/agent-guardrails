use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub severity: String,
    pub category: String,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    pub files: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archaeology: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_key: Option<String>,
}

impl Finding {
    pub fn minimal(severity: impl Into<String>, category: impl Into<String>) -> Self {
        Self::new(severity, category, "", "")
    }

    pub fn new(
        severity: impl Into<String>,
        category: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity: severity.into(),
            category: category.into(),
            code: code.into(),
            message: message.into(),
            action: None,
            files: Vec::new(),
            archaeology: None,
            skip_key: None,
        }
    }

    pub fn with_action(mut self, action: impl Into<String>) -> Self {
        self.action = Some(action.into());
        self
    }

    pub fn with_files<I, S>(mut self, files: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let mut seen = HashSet::new();
        self.files = files
            .into_iter()
            .map(|file| normalize_repo_path(file.as_ref()))
            .filter(|file| !file.is_empty())
            .filter(|file| seen.insert(file.clone()))
            .collect();
        self
    }

    pub fn with_skip_key(mut self, skip_key: impl Into<String>) -> Self {
        self.skip_key = Some(skip_key.into());
        self
    }
}

fn normalize_repo_path(value: &str) -> String {
    value.trim().replace('\\', "/")
}
