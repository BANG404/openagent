import { mount, unmount } from "svelte";
import McpAppFrame from "../../../src/lib/components/McpAppFrame.svelte";

// Exercise the real frame in the native window without provider calls or transcripts.
export function mountLocaleFrame() {
  const target = document.createElement("section");
  target.id = "plugin-i18n-frame-fixture";
  target.style.cssText = "position:fixed;right:24px;bottom:24px;width:360px;z-index:99999";
  document.body.append(target);
  const text = `<!doctype html><html><body><label>Retained draft <input value="Original 用户输入"></label><p id="locale"></p><script>
    function render(locale) {
      document.getElementById('locale').textContent = locale;
      const preserved = document.querySelector('input').value === 'Original 用户输入';
      parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:(locale === 'zh' ? 340 : 300) + (preserved ? 32 : 0)}}, '*');
    }
    addEventListener('message', event => {
      if (event.source !== parent) return;
      const message = event.data;
      if (message?.id === 101 && message.result) {
        render(message.result.hostContext.locale);
        parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'}, '*');
      }
      if (message?.method === 'ui/notifications/host-context-changed') render(message.params.locale);
    });
    parent.postMessage({jsonrpc:'2.0',id:101,method:'ui/initialize',params:{protocolVersion:'2026-01-26',appCapabilities:{}}}, '*');
  </script></body></html>`;
  const instance = mount(McpAppFrame, {
    target,
    props: {
      invocation: {
        descriptor: {
          server_id: "locale-fixture",
          tool_name: "probe",
          resource_uri: "ui://locale/fixture",
          visibility: ["app"],
        },
        resource: { uri: "ui://locale/fixture", mime_type: "text/html", text },
        arguments: {},
        content: [],
      },
    },
  });
  return async () => {
    await unmount(instance);
    target.remove();
  };
}
