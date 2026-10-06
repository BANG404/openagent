<script lang="ts">
  import { Tabs } from "bits-ui";
  import { t } from "$lib/i18n";
  import Select from "../ui/Select.svelte";
  import Switch from "../ui/Switch.svelte";
  import SettingsListInput from "../ui/SettingsListInput.svelte";
  import SettingsStatusToggle from "../ui/SettingsStatusToggle.svelte";
  import ScrollArea from "../ui/ScrollArea.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { channels, draft, options } = useSettingsContext();
</script>

<Tabs.Content value="channels" class="settings-tab-panel">
  <div class="channel-settings-layout">
    <nav class="channel-settings-list" aria-label={$t("channels")}>
      <div class="channel-settings-list-items">
        <button
          type="button"
          class:active={channels.channelSettingsNav === "feishu"}
          class="channel-settings-item"
          onclick={() => (channels.channelSettingsNav = "feishu")}
        >
          <span class="channel-settings-icon feishu" aria-hidden="true">
            <img src="/assets/channels/feishu.jpeg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("feishuChannel")}</strong><span>{$t("feishuChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={channels.channelSettingsNav === "telegram"}
          class="channel-settings-item"
          onclick={() => (channels.channelSettingsNav = "telegram")}
        >
          <span class="channel-settings-icon telegram" aria-hidden="true">
            <img src="/assets/channels/telegram.png" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("telegramChannel")}</strong><span>{$t("telegramChannelSubtitle")}</span
            ></span
          >
        </button>
        <button
          type="button"
          class:active={channels.channelSettingsNav === "qq"}
          class="channel-settings-item"
          onclick={() => (channels.channelSettingsNav = "qq")}
        >
          <span class="channel-settings-icon qq" aria-hidden="true">
            <img src="/assets/channels/qq.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("qqChannel")}</strong><span>{$t("qqChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={channels.channelSettingsNav === "wechat"}
          class="channel-settings-item"
          onclick={() => (channels.channelSettingsNav = "wechat")}
        >
          <span class="channel-settings-icon wechat" aria-hidden="true">
            <img src="/assets/channels/wechat.png" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("wechatChannel")}</strong><span>{$t("wechatChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={channels.channelSettingsNav === "discord"}
          class="channel-settings-item"
          onclick={() => (channels.channelSettingsNav = "discord")}
        >
          <span class="channel-settings-icon discord" aria-hidden="true">
            <img src="/assets/channels/discord.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("discordChannel")}</strong><span>{$t("discordChannelSubtitle")}</span
            ></span
          >
        </button>
        <button
          type="button"
          class:active={channels.channelSettingsNav === "slack"}
          class="channel-settings-item"
          onclick={() => (channels.channelSettingsNav = "slack")}
        >
          <span class="channel-settings-icon slack" aria-hidden="true">
            <img src="/assets/channels/slack.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("slackChannel")}</strong><span>{$t("slackChannelSubtitle")}</span></span
          >
        </button>
        <button
          type="button"
          class:active={channels.channelSettingsNav === "gateway"}
          class="channel-settings-item"
          onclick={() => (channels.channelSettingsNav = "gateway")}
        >
          <span class="channel-settings-icon gateway" aria-hidden="true">
            <img src="/assets/channels/gateway.svg" alt="" />
          </span>
          <span class="channel-settings-item-copy"
            ><strong>{$t("remoteGateway")}</strong><span>{$t("remoteGatewaySubtitle")}</span></span
          >
        </button>
      </div>
    </nav>
    <ScrollArea
      height="100%"
      class="settings-content-col channel-settings-detail"
      scrollHideDelay={350}
    >
      {#if channels.channelSettingsNav === "feishu"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("feishuChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("feishuChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.channels!.feishu!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label">
              <span class="label-text">{$t("channelAppId")}</span>
              <input class="detail-input" bind:value={draft.draftConfig.channels!.feishu!.app_id} />
            </label>
            <label class="detail-label">
              <span class="label-text">{$t("channelAppSecret")}</span>
              <input
                type="password"
                class="detail-input"
                bind:value={draft.draftConfig.channels!.feishu!.app_secret}
              />
            </label>
            <div class="detail-label">
              <span class="label-text">{$t("feishuDomain")}</span>
              <Select
                bind:value={draft.draftConfig.channels!.feishu!.domain}
                items={[
                  { value: "feishu", label: $t("feishuDomainChina") },
                  { value: "lark", label: $t("feishuDomainInternational") },
                ]}
                ariaLabel={$t("feishuDomain")}
              />
            </div>
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChatIds")}</span>
              <SettingsListInput
                value={draft.draftConfig.channels!.feishu!.allowed_chat_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (draft.draftConfig.channels!.feishu!.allowed_chat_ids =
                    channels.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if channels.channelStatuses.feishu?.error}
            <div class="provider-status error">{channels.channelStatuses.feishu.error}</div>
          {/if}
        </section>
      {:else if channels.channelSettingsNav === "telegram"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("telegramChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("telegramChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.channels!.telegram!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label">
              <span class="label-text">{$t("channelBotToken")}</span>
              <input
                type="password"
                class="detail-input"
                bind:value={draft.draftConfig.channels!.telegram!.bot_token}
              />
            </label>
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChatIds")}</span>
              <SettingsListInput
                value={draft.draftConfig.channels!.telegram!.allowed_chat_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (draft.draftConfig.channels!.telegram!.allowed_chat_ids =
                    channels.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if channels.channelStatuses.telegram?.error}<div class="provider-status error">
              {channels.channelStatuses.telegram.error}
            </div>{/if}
        </section>
      {:else if channels.channelSettingsNav === "qq"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("qqChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("qqChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.channels!.qq!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label"
              ><span class="label-text">{$t("channelAppId")}</span><input
                class="detail-input"
                bind:value={draft.draftConfig.channels!.qq!.app_id}
              /></label
            >
            <label class="detail-label"
              ><span class="label-text">{$t("channelClientSecret")}</span><input
                type="password"
                class="detail-input"
                bind:value={draft.draftConfig.channels!.qq!.client_secret}
              /></label
            >
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedUserIds")}</span>
              <SettingsListInput
                value={draft.draftConfig.channels!.qq!.allowed_user_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (draft.draftConfig.channels!.qq!.allowed_user_ids =
                    channels.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if channels.channelStatuses.qq?.error}<div class="provider-status error">
              {channels.channelStatuses.qq.error}
            </div>{/if}
        </section>
      {:else if channels.channelSettingsNav === "discord"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("discordChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("discordChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.channels!.discord!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label"
              ><span class="label-text">{$t("channelBotToken")}</span><input
                type="password"
                class="detail-input"
                bind:value={draft.draftConfig.channels!.discord!.bot_token}
              /></label
            >
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChannelIds")}</span>
              <SettingsListInput
                value={draft.draftConfig.channels!.discord!.allowed_channel_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (draft.draftConfig.channels!.discord!.allowed_channel_ids =
                    channels.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if channels.channelStatuses.discord?.error}<div class="provider-status error">
              {channels.channelStatuses.discord.error}
            </div>{/if}
        </section>
      {:else if channels.channelSettingsNav === "slack"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("slackChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("slackChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.channels!.slack!.enabled}
              ariaLabel={$t("channelEnabled")}
            />
          </div>
          <div class="application-settings-surface channel-config-card">
            <label class="detail-label"
              ><span class="label-text">{$t("slackBotToken")}</span><input
                type="password"
                class="detail-input"
                bind:value={draft.draftConfig.channels!.slack!.bot_token}
              /></label
            >
            <label class="detail-label"
              ><span class="label-text">{$t("slackAppToken")}</span><input
                type="password"
                class="detail-input"
                bind:value={draft.draftConfig.channels!.slack!.app_token}
              /></label
            >
            <label class="detail-label">
              <span class="label-text">{$t("channelAllowedChannelIds")}</span>
              <SettingsListInput
                value={draft.draftConfig.channels!.slack!.allowed_channel_ids.join("\n")}
                placeholder={$t("channelAllowlistPlaceholder")}
                oninput={(value) =>
                  (draft.draftConfig.channels!.slack!.allowed_channel_ids =
                    channels.parseChannelIds(value))}
              />
            </label>
          </div>
          {#if channels.channelStatuses.slack?.error}<div class="provider-status error">
              {channels.channelStatuses.slack.error}
            </div>{/if}
        </section>
      {:else if channels.channelSettingsNav === "wechat"}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("wechatChannel")}</h4>
              <p class="remote-gateway-subtitle">{$t("wechatChannelSubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.channels!.wechat.enabled}
              ariaLabel={$t("wechatChannelEnabled")}
            />
          </div>
          <div class="application-settings-surface remote-gateway-card">
            <div class="wechat-channel-access">
              <label class="label-text" for="wechat-allowed-users"
                >{$t("wechatChannelAllowedUsers")}</label
              >
              <p class="detail-hint">{$t("wechatChannelAllowedUsersHint")}</p>
              <SettingsListInput
                id="wechat-allowed-users"
                value={draft.draftConfig.channels!.wechat.allowed_user_ids.join("\n")}
                placeholder={$t("wechatChannelAllowedUsersPlaceholder")}
                oninput={(value) =>
                  (draft.draftConfig.channels!.wechat.allowed_user_ids =
                    channels.parseChannelIds(value))}
              />
            </div>
          </div>
          {#if draft.draftConfig.channels!.wechat.enabled && channels.wechatChannelStatus?.state === "awaiting_scan" && channels.wechatChannelStatus.qr_image_data_url}
            <div class="application-settings-surface wechat-qr-card">
              <img
                src={channels.wechatChannelStatus.qr_image_data_url}
                alt={$t("wechatChannelQrAlt")}
              />
              <div>
                <strong>{$t("wechatChannelScanTitle")}</strong>
                <p class="detail-hint">{$t("wechatChannelScanHint")}</p>
              </div>
            </div>
          {:else if draft.draftConfig.channels!.wechat.enabled && channels.wechatChannelStatus?.state === "connected"}
            <div class="application-settings-surface wechat-connected-card">
              <div>
                <span class="remote-credential-label">{$t("wechatChannelAccount")}</span><code
                  >{channels.wechatChannelStatus.account_id}</code
                >
              </div>
              <button
                class="remote-credential-action"
                disabled={channels.wechatChannelBusy}
                onclick={channels.reconnectWechatChannel}>{$t("wechatChannelReconnect")}</button
              >
            </div>
          {/if}
          {#if channels.wechatChannelStatus?.error || channels.wechatChannelMessage}<div
              class="provider-status"
              style="margin-top:8px"
            >
              {channels.wechatChannelMessage || channels.wechatChannelStatus?.error}
            </div>{/if}
        </section>
      {:else}
        <section class="detail-section">
          <div class="detail-section-header remote-gateway-heading">
            <div>
              <h4 class="detail-section-title">{$t("remoteGateway")}</h4>
              <p class="remote-gateway-subtitle">{$t("remoteGatewaySubtitle")}</p>
            </div>
            <SettingsStatusToggle
              bind:checked={draft.draftConfig.remote_gateway.enabled}
              ariaLabel={$t("remoteGatewayEnabled")}
            />
          </div>
          <div class="application-settings-surface remote-gateway-card">
            <div class="remote-gateway-toggle-row remote-gateway-workspace-row">
              <div class="remote-gateway-icon workspace" aria-hidden="true">LAN</div>
              <div class="startup-copy">
                <span class="label-text">{$t("remoteGatewayLanAccess")}</span>
                <p class="detail-hint">{$t("remoteGatewayLanAccessHint")}</p>
              </div>
              <Switch
                bind:checked={draft.draftConfig.remote_gateway.allow_lan_access}
                ariaLabel={$t("remoteGatewayLanAccess")}
              />
            </div>
            <div class="remote-gateway-toggle-row remote-gateway-workspace-row">
              <div class="remote-gateway-icon workspace" aria-hidden="true">⌂</div>
              <div class="startup-copy">
                <span class="label-text">{$t("remoteGatewayCurrentWorkspace")}</span>
                <p class="detail-hint remote-workspace-path">
                  {options.workspacePath || $t("noWorkspace")}
                </p>
              </div>
              <Switch
                checked={Boolean(options.workspacePath) &&
                  draft.draftConfig.remote_gateway.allowed_workspaces.includes(
                    options.workspacePath,
                  )}
                disabled={!options.workspacePath}
                onCheckedChange={channels.toggleCurrentWorkspaceAccess}
                ariaLabel={$t("remoteGatewayCurrentWorkspace")}
              />
            </div>
          </div>
          {#if draft.draftConfig.remote_gateway.enabled && channels.remoteGatewayStatus}
            <div class="application-settings-surface remote-gateway-credentials">
              <div class="remote-credential-row">
                <div class="remote-credential-copy">
                  <span class="remote-credential-label">{$t("remoteGatewayLocalUrl")}</span><code
                    >{channels.remoteGatewayStatus.url}</code
                  >
                </div>
                <button
                  class="remote-credential-action"
                  onclick={() =>
                    channels.copyRemoteGatewayValue(channels.remoteGatewayStatus?.url ?? "", "url")}
                  >{channels.copiedRemoteValue === "url"
                    ? $t("remoteGatewayCopied")
                    : $t("copy")}</button
                >
              </div>
              {#if draft.draftConfig.remote_gateway.allow_lan_access && channels.remoteGatewayStatus.lan_url}<div
                  class="remote-credential-row"
                >
                  <div class="remote-credential-copy">
                    <span class="remote-credential-label">{$t("remoteGatewayLanUrl")}</span><code
                      >{channels.remoteGatewayStatus.lan_url}</code
                    >
                  </div>
                  <button
                    class="remote-credential-action"
                    onclick={() =>
                      channels.copyRemoteGatewayValue(
                        channels.remoteGatewayStatus?.lan_url ?? "",
                        "lan",
                      )}
                    >{channels.copiedRemoteValue === "lan"
                      ? $t("remoteGatewayCopied")
                      : $t("copy")}</button
                  >
                </div>{/if}
              <div class="remote-credential-row pairing">
                <div class="remote-credential-copy">
                  <span class="remote-credential-label">{$t("remoteGatewayPairingCode")}</span><code
                    >{channels.remoteGatewayStatus.pairing_code}</code
                  >
                </div>
                <div class="remote-credential-actions">
                  <button
                    class="remote-credential-action"
                    onclick={() =>
                      channels.copyRemoteGatewayValue(
                        channels.remoteGatewayStatus?.pairing_code ?? "",
                        "code",
                      )}
                    >{channels.copiedRemoteValue === "code"
                      ? $t("remoteGatewayCopied")
                      : $t("copy")}</button
                  ><button
                    class="remote-credential-action primary"
                    disabled={channels.remoteGatewayBusy}
                    onclick={channels.rotateRemotePairingCode}>{$t("remoteGatewayRotate")}</button
                  >
                </div>
              </div>
              <div class="remote-security-note">
                <span aria-hidden="true">⌁</span>
                <p>{$t("remoteGatewayProxyHint")}</p>
              </div>
            </div>
          {/if}
          {#if channels.remoteGatewayMessage}<div class="provider-status" style="margin-top:8px">
              {channels.remoteGatewayMessage}
            </div>{/if}
        </section>
      {/if}
    </ScrollArea>
  </div>
</Tabs.Content>
