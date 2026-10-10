import { z } from "zod";

/** The three seats. Its own module so messages.ts and scene.ts can both import it without a cycle. */
export const RoleSchema = z.enum(["navigator", "synaesthete", "theorist"]);
export type Role = z.infer<typeof RoleSchema>;
export const ROLES: readonly Role[] = RoleSchema.options;
