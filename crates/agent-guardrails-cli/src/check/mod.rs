mod context;
mod finding;
mod pipeline;
mod plugin_bridge;
mod pro_bridge;
mod result;
mod review;
mod scoring;

pub use context::{CheckContextOptions, CheckContextSnapshot, build_check_context};
pub use finding::Finding;
pub use pipeline::{FindingStore, run_oss_detectors};
pub use plugin_bridge::run_semantic_plugins;
pub use pro_bridge::try_enrich_check_result_with_pro;
pub use result::{CheckCounts, CheckResult, build_check_result_from_context};
pub use review::{Review, ReviewSummary, build_review, suppress_review_findings};
pub use scoring::{compute_composite_score, get_score_verdict};
