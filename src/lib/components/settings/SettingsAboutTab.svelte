<script lang="ts">
  import { Tabs } from "bits-ui";
  import SettingsAboutTab from "../SettingsAboutTab.svelte";
  import { useSettingsContext } from "$lib/settings/context";
  const { general } = useSettingsContext();
</script>

<Tabs.Content value="about" class="settings-tab-panel">
  <SettingsAboutTab release={general.componentVersions.release} />
</Tabs.Content>
