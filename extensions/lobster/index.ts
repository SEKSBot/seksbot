import type {
  AnyAgentTool,
  seksbotPluginApi,
  seksbotPluginToolFactory,
} from "../../src/plugins/types.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default function register(api: seksbotPluginApi) {
  api.registerTool(
    ((ctx) => {
      if (ctx.sandboxed) {
        return null;
      }
      return createLobsterTool(api) as AnyAgentTool;
    }) as seksbotPluginToolFactory,
    { optional: true },
  );
}
