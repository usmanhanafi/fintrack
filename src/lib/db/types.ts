export type AccountType = "cash" | "bank" | "ewallet" | "credit_card";
export type TxType = "expense" | "income" | "transfer";
export type CategoryKind = "expense" | "income";
export type TxSource = "app" | "whatsapp" | "import" | "recurring";

export interface Synced {
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Account extends Synced {
  id: string;
  name: string;
  type: AccountType;
  opening_balance_minor: number;
  icon?: string | null;
  color?: string | null;
  sort_order: number;
  archived_at?: string | null;
}

export interface Category extends Synced {
  id: string;
  parent_id?: string | null;
  name: string;
  kind: CategoryKind;
  icon?: string | null;
  color?: string | null;
  sort_order: number;
  archived_at?: string | null;
}

export interface Transaction extends Synced {
  id: string;
  type: TxType;
  amount_minor: number;
  account_id: string;
  to_account_id?: string | null;
  category_id?: string | null;
  note?: string | null;
  merchant?: string | null;
  tags: string[];
  occurred_at: string;
  occurred_on: string;
  recurring_id?: string | null;
  source: TxSource;
  external_ref?: string | null;
  import_batch_id?: string | null;
}

export type Frequency = "daily" | "weekly" | "monthly" | "yearly" | "custom";

export interface RecurringRule extends Synced {
  id: string;
  name: string;
  template: {
    type: TxType;
    amount_minor: number;
    account_id: string;
    to_account_id?: string | null;
    category_id?: string | null;
    note?: string | null;
  };
  frequency: Frequency;
  interval_n: number;
  day_of_month?: number | null;
  day_of_week?: number | null;
  start_on: string;
  end_on?: string | null;
  mode: "auto" | "reminder";
  last_run_on?: string | null;
}

export interface Budget extends Synced {
  id: string;
  category_id: string;
  period_month: string;
  amount_minor: number;
  rollover: boolean;
}

export type Entity = "accounts" | "categories" | "transactions" | "budgets" | "recurring";

export interface OutboxRow {
  seq?: number;
  entity: Entity;
  entity_id: string;
  op: "upsert" | "delete";
  payload: Record<string, unknown>;
  base_updated_at?: string | null;
  created_at: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}
