// Row shapes mirroring supabase/migrations. Money is integer cents; dates are 'YYYY-MM-DD'.
export type Scope = 'personal' | 'shared';
export type TxType = 'income' | 'expense';

export interface Category { id: string; scope: Scope; type: TxType; name: string; owner_id: string | null; household_id: string | null; icon?: string | null }
export interface Split { user_id: string; share_cents: number }
export interface Tx {
  id: string; type: TxType; scope: Scope; household_id: string | null; paid_by: string; created_by: string;
  amount_cents: number; date: string; category_id: string; note: string | null; recurring_rule_id: string | null; splits: Split[];
}
export interface Settlement { id: string; household_id: string; from_user: string; to_user: string; amount_cents: number; date: string }
export interface Plan {
  id: string; user_id: string | null; household_id: string | null; month: string;
  expected_income_cents: number; savings_target_cents: number; limits: { category_id: string; limit_cents: number }[];
}
export type SplitInput =
  | { mode: 'equal' }
  | { mode: 'amounts'; cents: Record<string, number> }
  | { mode: 'percent'; pct: Record<string, number> };
export interface RecurringRule {
  id: string; type: TxType; scope: Scope; owner_id: string; household_id: string | null; paid_by: string;
  amount_cents: number; category_id: string; note: string | null; day_of_month: number; start_date: string;
  last_generated_date: string | null; split: SplitInput | null; active: boolean;
}
