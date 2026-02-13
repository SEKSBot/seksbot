import type { seksbotPluginApi } from "seksbot/plugin-sdk";
import { emptyPluginConfigSchema } from "seksbot/plugin-sdk";
import { zulipPlugin } from "./src/channel.js";
import { setZulipRuntime } from "./src/runtime.js";

const plugin = {
  id: "zulip",
  name: "Zulip",
  description: "Zulip channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: seksbotPluginApi) {
    setZulipRuntime(api.runtime);
    api.registerChannel({ plugin: zulipPlugin });
  },
};

export default plugin;
