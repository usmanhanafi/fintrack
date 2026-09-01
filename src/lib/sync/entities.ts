import { z } from "zod";

export const ENTITY_TABLE = {
  accounts: "accounts",
  categories: "categories",
  transactions: "transactions",
  budgets: "budgets",
  recurring: "recurring_rules",
} as const;

export type Entity = keyof typeof ENTITY_TABLE;
export const ENTITIES = Object.keys(ENTITY_TABLE) as Entity[];

const iso = z.string().min(1);
const money = z.number().int().nonnegative();

export const accountSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  type: z.enum(["cash", "bank", "ewallet", "credit_card"]),
  opening_balance_minor: z.number().int(),
  icon: z.string().max(40).nullish(),
  color: z.string().max(20).nullish(),
  sort_order: z.number().int().default(0),
  archived_at: iso.nullish(),
  deleted_at: iso.nullish(),
});

export const categorySchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid().nullish(),
  name: z.string().min(1).max(80),
  kind: z.enum(["expense", "income"]),
  icon: z.string().max(40).nullish(),
  color: z.string().max(20).nullish(),
  sort_order: z.number().int().default(0),
  archived_at: iso.nullish(),
  deleted_at: iso.nullish(),
});

export const transactionSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(["expense", "income", "transfer"]),
    amount_minor: money.positive(),
    account_id: z.uuid(),
    to_account_id: z.uuid().nullish(),
    category_id: z.uuid().nullish(),
    note: z.string().max(500).nullish(),
    merchant: z.string().max(120).nullish(),
    tags: z.array(z.string().max(40)).max(20).default([]),
    occurred_at: iso,
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    recurring_id: z.uuid().nullish(),
    source: z.enum(["app", "whatsapp", "import", "recurring"]).default("app"),
    external_ref: z.string().max(200).nullish(),
    import_batch_id: z.uuid().nullish(),
    deleted_at: iso.nullish(),
  })
  .refine((t) => t.type !== "transfer" || !!t.to_account_id, {
    message: "Transfer wajib punya akun tujuan",
    path: ["to_account_id"],
  })
  .refine((t) => t.type === "transfer" || !!t.category_id, {
    message: "Kategori wajib diisi",
    path: ["category_id"],
  })
  .refine((t) => t.type !== "transfer" || t.account_id !== t.to_account_id, {
    message: "Akun asal dan tujuan tidak boleh sama",
    path: ["to_account_id"],
  });

export const budgetSchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  period_month: z.string().regex(/^\d{4}-\d{2}-01$/),
  amount_minor: money,
  rollover: z.boolean().default(false),
  deleted_at: iso.nullish(),
});

export const recurringSchema = z.object({
  id: z.uuid(),
  name: z.string().max(80).default(""),
  template: z.object({
    type: z.enum(["expense", "income", "transfer"]),
    amount_minor: money.positive(),
    account_id: z.uuid(),
    to_account_id: z.uuid().nullish(),
    category_id: z.uuid().nullish(),
    note: z.string().max(500).nullish(),
  }),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]),
  interval_n: z.number().int().min(1).max(365).default(1),
  day_of_month: z.number().int().min(1).max(31).nullish(),
  day_of_week: z.number().int().min(0).max(6).nullish(),
  start_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  mode: z.enum(["auto", "reminder"]).default("auto"),
  last_run_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  deleted_at: iso.nullish(),
});

export const SCHEMA = {
  accounts: accountSchema,
  categories: categorySchema,
  transactions: transactionSchema,
  budgets: budgetSchema,
  recurring: recurringSchema,
} as const;

export const changeSchema = z.object({
  entity: z.enum(ENTITIES as [Entity, ...Entity[]]),
  op: z.enum(["upsert", "delete"]),
  id: z.uuid(),
  payload: z.record(z.string(), z.unknown()),
  base_updated_at: z.string().nullish(),
});

export const pushSchema = z.object({
  changes: z.array(changeSchema).max(500),
});
