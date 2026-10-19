//! Deterministic public wire bindings. No transport or Runtime behavior lives here.
use openagent_protocol::*;
use ts_rs::{Config, TS};

fn main() {
    let config = Config::default().with_large_int("number");
    println!("// Generated from openagent-protocol. Run bun run generate:protocol; do not edit.");
    println!(
        "export const OPENAGENT_PROTOCOL_VERSION = {};",
        SDK_PROTOCOL_VERSION
    );
    println!(
        "export const PLUGIN_PROTOCOL_VERSION = {};",
        PLUGIN_PROTOCOL_VERSION
    );
    println!("export {}", AgentCommand::decl(&config));
    println!("export {}", AgentInputRequest::decl(&config));
    println!("export {}", ChatRunStartedEvent::decl(&config));
    println!("export {}", ChatModelUsageEvent::<()>::decl(&config));
    println!("export {}", ChatMemoryRetrievalStage::decl(&config));
    println!("export {}", ContextCompactionStage::decl(&config));
    println!(
        "export {}",
        OpenAgentWireEvent::<(), (), (), (), (), (), ()>::decl(&config)
    );
    println!("export {}", SuggestionLanguage::decl(&config));
    println!("export {}", ChatModelBinding::decl(&config));
    println!("export {}", ClientAction::decl(&config));
    println!("export {}", CommandArgument::decl(&config));
    println!("export {}", CommandOwner::decl(&config));
    println!("export {}", CommandSpec::decl(&config));
    println!("export {}", CreateConversationRequest::decl(&config));
    println!("export {}", EmbeddingResourceProgress::decl(&config));
    println!("export {}", EmbeddingResourceState::decl(&config));
    println!("export {}", EmbeddingResourceStatus::decl(&config));
    println!("export {}", InputDelivery::decl(&config));
    println!("export {}", InputError::decl(&config));
    println!("export {}", InputErrorCode::decl(&config));
    println!("export {}", InputQueueAction::decl(&config));
    println!("export {}", InputQueueRequest::decl(&config));
    println!("export {}", InputQueueSnapshot::decl(&config));
    println!("export {}", PluginEmbeddingRequest::decl(&config));
    println!("export {}", PluginEmbeddingResponse::decl(&config));
    println!("export {}", PluginEmbeddingStatus::decl(&config));
    println!("export {}", PluginI18n::decl(&config));
    println!("export {}", QueuedInput::decl(&config));
    println!("export {}", QueuedInputStatus::decl(&config));
    println!("export {}", RuntimeTransportStatus::decl(&config));
    println!("export {}", ResolvedInput::decl(&config));
    println!("export {}", ResumeInterruptRequest::decl(&config));
    println!("export {}", SubmissionOutcome::decl(&config));
    println!("export {}", SubmitInterruptResponseRequest::decl(&config));
    println!("export {}", UserMessageContext::decl(&config));
}
