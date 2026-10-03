// @ts-check
process.env.BLACKBOX_PLUGIN_IDS = "goal";
process.env.BLACKBOX_GOAL_APPROVAL = "1";
await import("./test-official-plugin-functionality.mjs");
