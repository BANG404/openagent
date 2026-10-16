//! Signed, independently published product compatibility decisions.
//!
//! Rules can restrict a locally supported operation; they never add a migration
//! or authorize a reset. Hosts and Runtime supply facts, not inferred versions.
use anyhow::{bail, Context};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};

mod source;
pub use source::{PolicySnapshot, PolicySource, UPDATE_PUBLIC_KEY};

const MAX_RULES: usize = 512;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    Startup,
    OnlineActivation,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub schema_version: u32,
    pub revision: u64,
    pub issued_at: u64,
    pub expires_at: u64,
    pub rules: Vec<Rule>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub conditions: Conditions,
    pub action: Action,
    pub reason: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Conditions {
    pub operation: Option<Operation>,
    pub runtime: Option<VersionReq>,
    pub previous_runtime: Option<VersionReq>,
    pub shell: Option<VersionReq>,
    pub platform: Option<String>,
    pub sdk_protocol: Option<NumberRange>,
    pub config_version: Option<NumberRange>,
    pub conversation_schema: Option<NumberRange>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NumberRange {
    pub min: u32,
    pub max: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Block,
    RequireRestart,
}

/// Missing facts are conservative matches, so omitting a version cannot bypass
/// a restriction. Fresh/missing data has explicit version zero.
#[derive(Clone, Debug)]
pub struct ContextFacts {
    pub operation: Operation,
    pub runtime: Version,
    pub previous_runtime: Option<Version>,
    pub shell: Option<Version>,
    pub platform: String,
    pub sdk_protocol: u32,
    pub config_version: Option<u32>,
    pub conversation_schema: Option<u32>,
}

/// Inspect only the public configuration contract. Invalid configuration stays
/// unknown and must still pass the local persistence admission boundary.
pub fn configuration_version() -> Option<u32> {
    use openagent_config::{ConfigCompatibility, CURRENT_CONFIG_VERSION};
    match openagent_config::inspect_config_compatibility() {
        ConfigCompatibility::Missing => Some(0),
        ConfigCompatibility::Current => Some(CURRENT_CONFIG_VERSION),
        ConfigCompatibility::Legacy(version) | ConfigCompatibility::Future(version) => {
            Some(version)
        }
        ConfigCompatibility::Invalid => None,
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Decision {
    pub revision: u64,
    pub blocked: bool,
    pub restart_required: bool,
    pub matched_rules: Vec<String>,
    pub reasons: Vec<String>,
}

impl Decision {
    pub fn require_allowed(&self) -> anyhow::Result<()> {
        if self.blocked {
            bail!(
                "Compatibility policy revision {} blocked this operation ({}): {}",
                self.revision,
                self.matched_rules.join(", "),
                self.reasons.join("; ")
            );
        }
        Ok(())
    }
}

impl Policy {
    pub fn parse(bytes: &[u8]) -> anyhow::Result<Self> {
        let policy: Self = serde_json::from_slice(bytes).context("Invalid compatibility policy")?;
        policy.validate()?;
        Ok(policy)
    }

    pub fn validate(&self) -> anyhow::Result<()> {
        if self.schema_version != 1
            || self.revision > 9_007_199_254_740_991
            || self.issued_at >= self.expires_at
        {
            bail!("Unsupported policy schema or invalid validity interval");
        }
        if self.rules.len() > MAX_RULES {
            bail!("Compatibility policy has too many rules");
        }
        let mut ids = std::collections::HashSet::new();
        for rule in &self.rules {
            if rule.id.is_empty()
                || rule.id.len() > 128
                || !rule
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
                || !ids.insert(&rule.id)
                || rule.reason.trim().is_empty()
                || rule.reason.len() > 2048
                || rule.reason.chars().any(char::is_control)
            {
                bail!("Invalid or duplicate compatibility rule");
            }
            for range in [
                rule.conditions.sdk_protocol,
                rule.conditions.config_version,
                rule.conditions.conversation_schema,
            ]
            .into_iter()
            .flatten()
            {
                if range.min > range.max {
                    bail!("Invalid compatibility rule range");
                }
            }
            if rule.conditions.platform.as_ref().is_some_and(|p| {
                p.is_empty()
                    || p.len() > 128
                    || !p
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
            }) {
                bail!("Invalid policy platform");
            }
        }
        Ok(())
    }

    pub fn is_current(&self, now: u64) -> bool {
        self.issued_at <= now && now < self.expires_at
    }

    pub fn evaluate(&self, facts: &ContextFacts) -> Decision {
        let mut decision = Decision {
            revision: self.revision,
            blocked: false,
            restart_required: false,
            matched_rules: Vec::new(),
            reasons: Vec::new(),
        };
        for rule in &self.rules {
            if !rule.conditions.matches(facts) {
                continue;
            }
            decision.matched_rules.push(rule.id.clone());
            decision.reasons.push(rule.reason.clone());
            match rule.action {
                Action::Block => decision.blocked = true,
                // A process starting from rest already satisfies this action.
                Action::RequireRestart if facts.operation == Operation::OnlineActivation => {
                    decision.restart_required = true;
                }
                Action::RequireRestart => {}
            }
        }
        decision
    }
}

impl Conditions {
    fn matches(&self, facts: &ContextFacts) -> bool {
        self.operation.is_none_or(|v| v == facts.operation)
            && self
                .runtime
                .as_ref()
                .is_none_or(|v| v.matches(&facts.runtime))
            && version_matches(&self.previous_runtime, facts.previous_runtime.as_ref())
            && version_matches(&self.shell, facts.shell.as_ref())
            && self.platform.as_ref().is_none_or(|v| v == &facts.platform)
            && number_matches(self.sdk_protocol, Some(facts.sdk_protocol))
            && number_matches(self.config_version, facts.config_version)
            && number_matches(self.conversation_schema, facts.conversation_schema)
    }
}

fn version_matches(requirement: &Option<VersionReq>, value: Option<&Version>) -> bool {
    requirement
        .as_ref()
        .is_none_or(|r| value.is_none_or(|v| r.matches(v)))
}

fn number_matches(range: Option<NumberRange>, value: Option<u32>) -> bool {
    range.is_none_or(|r| value.is_none_or(|v| (r.min..=r.max).contains(&v)))
}

#[cfg(test)]
mod tests;
