use super::*;

pub(super) fn facts() -> ContextFacts {
    ContextFacts {
        operation: Operation::OnlineActivation,
        runtime: Version::parse("2.0.0").unwrap(),
        previous_runtime: Some(Version::parse("1.0.0").unwrap()),
        shell: Some(Version::parse("3.0.0").unwrap()),
        platform: "windows-x86_64".into(),
        sdk_protocol: 3,
        config_version: Some(1),
        conversation_schema: Some(10),
    }
}

#[test]
fn matches_source_target_and_storage_without_version_inference() {
    let policy = Policy::parse(
        br#"{
        "schema_version":1,"revision":7,"issued_at":1,"expires_at":999,
        "rules":[{"id":"upgrade-via-bridge","conditions":{
            "operation":"online_activation","runtime":">=2.0.0, <3.0.0",
            "previous_runtime":"<1.5.0","shell":">=3.0.0",
            "platform":"windows-x86_64","sdk_protocol":{"min":3,"max":3},
            "conversation_schema":{"min":1,"max":10},"config_version":{"min":1,"max":1}
        },"action":"block","reason":"Install the intermediate Runtime first"}]
    }"#,
    )
    .unwrap();
    assert!(policy.evaluate(&facts()).blocked);
    let mut newer = facts();
    newer.previous_runtime = Some(Version::parse("1.5.0").unwrap());
    assert!(!policy.evaluate(&newer).blocked);
    newer = facts();
    newer.platform = "linux-x86_64".into();
    assert!(!policy.evaluate(&newer).blocked);
    newer = facts();
    newer.conversation_schema = Some(11);
    assert!(!policy.evaluate(&newer).blocked);
    newer.conversation_schema = None;
    assert!(
        policy.evaluate(&newer).blocked,
        "unknown format cannot bypass a restriction"
    );
}

#[test]
fn combines_all_restrictions_and_restart_is_satisfied_by_cold_start() {
    let policy = Policy::parse(br#"{
        "schema_version":1,"revision":7,"issued_at":1,"expires_at":999,
        "rules":[
          {"id":"restart","conditions":{},"action":"require_restart","reason":"Restart first"},
          {"id":"block","conditions":{"operation":"online_activation"},"action":"block","reason":"Temporarily paused"}
        ]
    }"#).unwrap();
    let decision = policy.evaluate(&facts());
    assert!(decision.blocked && decision.restart_required);
    assert_eq!(decision.matched_rules, ["restart", "block"]);
    assert!(decision.require_allowed().is_err());
    let mut startup = facts();
    startup.operation = Operation::Startup;
    let decision = policy.evaluate(&startup);
    assert!(!decision.blocked && !decision.restart_required);
    assert_eq!(decision.matched_rules, ["restart"]);
}

#[test]
fn rejects_unknown_actions_fields_schemas_and_invalid_ranges() {
    let original = serde_json::json!({
        "schema_version":1,"revision":7,"issued_at":1,"expires_at":999,
        "rules":[{"id":"safe","conditions":{},"action":"block","reason":"Paused"}]
    });
    for (pointer, replacement) in [
        ("/schema_version", serde_json::json!(2)),
        ("/expires_at", serde_json::json!(0)),
        ("/rules/0/action", serde_json::json!("execute_script")),
        ("/rules/0/id", serde_json::json!("")),
        ("/rules/0/reason", serde_json::json!("bad\nmessage")),
        (
            "/rules/0/conditions",
            serde_json::json!({"conversation_schema":{"min":4,"max":1}}),
        ),
        (
            "/rules/0/conditions",
            serde_json::json!({"runtime": "invalid"}),
        ),
        (
            "/rules/0/conditions",
            serde_json::json!({"unrecognized":true}),
        ),
    ] {
        let mut changed = original.clone();
        *changed.pointer_mut(pointer).unwrap() = replacement;
        assert!(
            Policy::parse(&serde_json::to_vec(&changed).unwrap()).is_err(),
            "{pointer}"
        );
    }
    let mut duplicate = original.clone();
    duplicate["rules"]
        .as_array_mut()
        .unwrap()
        .push(original["rules"][0].clone());
    assert!(Policy::parse(&serde_json::to_vec(&duplicate).unwrap()).is_err());
}
