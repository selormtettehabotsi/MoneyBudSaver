export type TransactionType = "income" | "expense";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType;
  icon_name: string;
  color_hex: string;
  is_default: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string | null;
  amount: string; // Decimal string representation
  type: TransactionType;
  date: string;
  description: string;
  is_recurring: boolean;
  tags: string[];
  created_at: string;
  category?: Category;
}

export interface TransactionListResponse {
  items: Transaction[];
  total_count: number;
  total_income: string;
  total_expense: string;
  net_amount: string;
  limit: number;
  offset: number;
}

export interface BudgetProgress {
  id: string;
  category_id: string;
  category_name: string;
  category_color: string;
  category_icon: string;
  month: number;
  year: number;
  amount_limit: string;
  actual_spent: string;
  remaining_budget: string;
  percentage_used: number;
  is_over_budget: boolean;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  title: string;
  target_amount: string;
  current_amount: string;
  target_date: string | null;
  notes: string | null;
  is_completed: boolean;
  progress_percentage: number;
  remaining_amount: string;
  created_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  name: string;
  total_principal: string;
  remaining_balance: string;
  interest_rate: string;
  minimum_payment: string;
  due_day_of_month: number;
  start_date: string;
  estimated_payoff_date: string | null;
  notes: string | null;
  payoff_progress_percentage: number;
  months_to_payoff: number | null;
  created_at: string;
}

export interface CategoryExpenseBreakdown {
  category_id: string | null;
  category_name: string;
  color_hex: string;
  icon_name: string;
  total_amount: number;
  percentage_of_total: number;
}

export interface MonthlyTrendPoint {
  month_str: string;
  income: string;
  expense: string;
  net_savings: string;
}

export interface DashboardData {
  currency: string;
  total_income_current_month: string;
  total_expense_current_month: string;
  net_cashflow_current_month: string;
  savings_rate_percentage: number;
  total_liquid_savings: string;
  total_debt_balance: string;
  debt_to_income_ratio: number;
  runway_months: number;
  category_breakdown: CategoryExpenseBreakdown[];
  monthly_trend: MonthlyTrendPoint[];
  guardrail_warnings: string[];
}
