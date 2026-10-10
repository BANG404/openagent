import { desktopOpenAgent } from "$lib/openagent/tauriClient";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tr } from "$lib/i18n";
import type {
  PluginConfigurationStatus,
  PluginConnectorProbe,
  PluginOAuthStatus,
} from "@openagent/client/types";

type Value = string | boolean | number | null;
type SetupState = {
  loading: boolean;
  busy: boolean;
  configuration: PluginConfigurationStatus | null;
  edits: Record<string, Value>;
  message: string;
  error: boolean;
};
type ConnectorState = {
  authorizing?: boolean;
  busy: boolean;
  message: string;
  error: boolean;
  probe?: PluginConnectorProbe;
  oauth?: PluginOAuthStatus;
};

export function createPluginSetup() {
  const states = $state<Record<string, SetupState>>({});
  const connectors = $state<Record<string, ConnectorState>>({});
  const generations = new Map<string, number>();
  const authorizations = new Map<string, number>();
  function state(id: string): SetupState {
    return (
      states[id] ?? {
        loading: true,
        busy: false,
        configuration: null,
        edits: {},
        message: "",
        error: false,
      }
    );
  }
  function connector(id: string, name: string): ConnectorState {
    return connectors[`${id}:${name}`] ?? { busy: false, message: "", error: false };
  }
  async function load(id: string) {
    const generation = (generations.get(id) ?? 0) + 1;
    generations.set(id, generation);
    states[id] = { ...state(id), loading: true, message: "", error: false };
    try {
      const configuration = await desktopOpenAgent.invokeProduct("get_agent_plugin_configuration", {
        plugin_id: id,
      });
      if (generations.get(id) !== generation) return;
      states[id] = {
        loading: false,
        busy: false,
        configuration,
        edits: {},
        message: "",
        error: false,
      };
    } catch (error) {
      if (generations.get(id) === generation)
        states[id] = { ...state(id), loading: false, message: String(error), error: true };
    }
  }
  function edit(id: string, key: string, value: Value) {
    states[id] = { ...state(id), edits: { ...state(id).edits, [key]: value } };
  }
  function unedit(id: string, key: string) {
    const edits = { ...state(id).edits };
    delete edits[key];
    states[id] = { ...state(id), edits };
  }
  async function authorizationStatus(id: string, name: string) {
    const key = `${id}:${name}`;
    const generation = authorizations.get(key);
    try {
      const oauth = await desktopOpenAgent.invokeProduct("get_agent_plugin_oauth_status", {
        plugin_id: id,
        server_name: name,
      });
      if (connector(id, name).busy || authorizations.get(key) !== generation) return;
      connectors[`${id}:${name}`] = { ...connector(id, name), oauth };
    } catch (error) {
      if (connector(id, name).busy || authorizations.get(key) !== generation) return;
      connectors[`${id}:${name}`] = { ...connector(id, name), message: String(error), error: true };
    }
  }
  function value(id: string, key: string): Value | undefined {
    const current = state(id);
    return key in current.edits ? current.edits[key] : current.configuration?.values[key];
  }
  async function save(id: string) {
    const current = state(id);
    if (!current.configuration || current.busy || current.loading || connectorBusy(id)) return;
    const generation = (generations.get(id) ?? 0) + 1;
    generations.set(id, generation);
    states[id] = { ...current, busy: true, message: "", error: false };
    try {
      const configuration = await desktopOpenAgent.invokeProduct(
        "save_agent_plugin_configuration",
        {
          plugin_id: id,
          values: { ...current.edits },
          revision: current.configuration.revision,
        },
      );
      if (generations.get(id) !== generation) return;
      states[id] = {
        loading: false,
        busy: false,
        configuration,
        edits: {},
        message: tr("pluginConfigurationSaved"),
        error: false,
      };
      for (const key of Object.keys(connectors))
        if (key.startsWith(`${id}:`)) delete connectors[key];
    } catch (error) {
      if (generations.get(id) === generation)
        states[id] = { ...state(id), busy: false, message: String(error), error: true };
    }
  }
  async function probe(id: string, name: string) {
    const key = `${id}:${name}`;
    if (connector(id, name).busy) return;
    connectors[key] = { ...connector(id, name), busy: true, message: "", error: false };
    try {
      const [result, oauth] = await Promise.all([
        desktopOpenAgent.invokeProduct("test_agent_plugin_connector", {
          plugin_id: id,
          server_name: name,
        }),
        desktopOpenAgent.invokeProduct("get_agent_plugin_oauth_status", {
          plugin_id: id,
          server_name: name,
        }),
      ]);
      connectors[key] = {
        busy: false,
        probe: result,
        oauth,
        error: !result.probe,
        message: result.probe
          ? `${result.probe.tools.length} ${tr("mcpToolCount")}`
          : result.oauth === "required"
            ? tr("pluginAuthorizationRequired")
            : (result.error ?? tr("mcpTestFailed")),
      };
    } catch (error) {
      connectors[key] = {
        ...connector(id, name),
        busy: false,
        message: String(error),
        error: true,
      };
    }
  }
  async function authorize(id: string, name: string) {
    const key = `${id}:${name}`;
    if (connector(id, name).busy) return;
    const generation = (authorizations.get(key) ?? 0) + 1;
    authorizations.set(key, generation);
    connectors[key] = {
      ...connector(id, name),
      busy: true,
      authorizing: true,
      message: tr("mcpAuthorizationOpening"),
      error: false,
    };
    try {
      const result = await desktopOpenAgent.invokeProduct("test_agent_plugin_connector", {
        plugin_id: id,
        server_name: name,
      });
      if (authorizations.get(key) !== generation) return;
      connectors[key].probe = result;
      if (result.oauth !== "required" && result.oauth !== "unknown") {
        connectors[key] = {
          ...connector(id, name),
          busy: false,
          authorizing: false,
          message: tr(
            result.oauth === "not_required"
              ? "pluginAuthorizationNotRequired"
              : "mcpOAuthUnsupported",
          ),
          error: false,
        };
        return;
      }
      if (authorizations.get(key) !== generation) return;
      const start = await desktopOpenAgent.invokeProduct("begin_agent_plugin_oauth", {
        plugin_id: id,
        server_name: name,
      });
      if (authorizations.get(key) !== generation) return;
      try {
        await openUrl(start.authorization_url);
      } catch (error) {
        await desktopOpenAgent.invokeProduct("revoke_agent_plugin_oauth", {
          plugin_id: id,
          server_name: name,
        });
        throw error;
      }
      for (let attempt = 0; attempt < 240; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (authorizations.get(key) !== generation) return;
        const oauth = await desktopOpenAgent.invokeProduct("get_agent_plugin_oauth_status", {
          plugin_id: id,
          server_name: name,
        });
        if (authorizations.get(key) !== generation) return;
        connectors[key].oauth = oauth;
        if (oauth.authorized) {
          await desktopOpenAgent.invokeProduct("refresh_mcp_servers", {});
          if (authorizations.get(key) !== generation) return;
          connectors[key] = {
            ...connector(id, name),
            busy: false,
            authorizing: false,
            message: tr("mcpAuthorizationCompleted"),
            error: false,
          };
          await probe(id, name);
          return;
        }
        if (oauth.error) throw new Error(oauth.error);
      }
      await desktopOpenAgent.invokeProduct("revoke_agent_plugin_oauth", {
        plugin_id: id,
        server_name: name,
      });
      throw new Error(tr("mcpAuthorizationTimedOut"));
    } catch (error) {
      if (authorizations.get(key) !== generation) return;
      connectors[key] = {
        ...connector(id, name),
        busy: false,
        authorizing: false,
        message: String(error),
        error: true,
      };
    }
  }
  async function revoke(id: string, name: string) {
    const key = `${id}:${name}`;
    if (connector(id, name).busy && !connector(id, name).authorizing) return;
    authorizations.set(key, (authorizations.get(key) ?? 0) + 1);
    connectors[key] = { ...connector(id, name), busy: true, message: "", error: false };
    try {
      await desktopOpenAgent.invokeProduct("revoke_agent_plugin_oauth", {
        plugin_id: id,
        server_name: name,
      });
      connectors[key] = {
        busy: false,
        error: false,
        message: tr("pluginAuthorizationRevoked"),
        oauth: { authorized: false, expires_at: null, error: null },
      };
    } catch (error) {
      connectors[key] = {
        ...connector(id, name),
        busy: false,
        message: String(error),
        error: true,
      };
    }
  }
  function connectorBusy(id: string) {
    return Object.entries(connectors).some(
      ([key, value]) => key.startsWith(`${id}:`) && value.busy,
    );
  }
  return {
    connectorBusy,
    state,
    connector,
    load,
    edit,
    unedit,
    value,
    save,
    probe,
    authorize,
    revoke,
    authorizationStatus,
  };
}
