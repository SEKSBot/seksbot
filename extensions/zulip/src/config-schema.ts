/**
 * Zulip config schema (Zod)
 */

import { z } from "zod";

const ZulipAccountSchemaBase = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  siteUrl: z.string().optional(),
  botEmail: z.string().optional(),
  apiKey: z.string().optional(),
  dmPolicy: z.enum(["open", "pairing", "allowlist"]).optional(),
  allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  groupPolicy: z.enum(["open", "allowlist"]).optional(),
  groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  requireMention: z.boolean().optional(),
  historyLimit: z.number().optional(),
});

const ZulipAccountSchema = ZulipAccountSchemaBase;

export const ZulipConfigSchema = ZulipAccountSchemaBase.extend({
  accounts: z.record(z.string(), ZulipAccountSchema.optional()).optional(),
});
