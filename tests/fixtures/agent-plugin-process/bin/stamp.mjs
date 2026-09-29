// The fixture plugin's portable command.
//
// OpenAgent writes one JSON request to the command's stdin and reads the prompt
// it returns on stdout. This run has no provider, so the fixture is invoked with
// the argument `fail`: the command validates the request it was given and then
// exits non-zero with the message the run asserts on. That message only appears
// when the request really carried that argument and the namespaced command
// name, which makes it end-to-end evidence for the documented stdin contract
// rather than only for the spawn.
//
// A portable command is documented to receive the JSON request and nothing
// else: unlike a stdio MCP server, it is not given PLUGIN_ROOT or PLUGIN_DATA,
// and its working directory is the active workspace. So this file deliberately
// writes nothing to disk and reports what it received on the two protocol
// streams the host already captures.

import { readFileSync } from "node:fs";

const PLUGIN_ID = "openagent-process-plugin";
const COMMAND_NAME = `${PLUGIN_ID}:stamp`;
const FIXTURE_FAILURE_ARGUMENT = "fail";
const REQUEST_FIELDS = ["conversation_id", "plugin_id", "command", "argument", "input"];

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const raw = readStdin();
let request = null;
try {
  request = JSON.parse(raw);
} catch {
  request = null;
}

const missing = REQUEST_FIELDS.filter((field) => typeof request?.[field] !== "string");
if (missing.length > 0 && request !== null) {
  process.stderr.write(
    `openagent-process-plugin stamp received an incomplete request: ${missing.join(", ")}\n`,
  );
  process.exit(2);
}
if (request === null) {
  process.stderr.write("openagent-process-plugin stamp received no JSON request on stdin\n");
  process.exit(2);
}
if (request.plugin_id !== PLUGIN_ID || request.command !== COMMAND_NAME) {
  process.stderr.write(
    `openagent-process-plugin stamp was addressed as '${request.plugin_id}/${request.command}'\n`,
  );
  process.exit(3);
}

if (request.argument.trim() === FIXTURE_FAILURE_ARGUMENT) {
  process.stderr.write(
    "openagent-process-plugin stamp recorded this invocation and stopped before the model turn\n",
  );
  process.exit(1);
}

process.stdout.write(`Recorded a plugin command invocation for ${request.conversation_id}.\n`);
