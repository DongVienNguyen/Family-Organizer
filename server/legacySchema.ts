import type { FamilyOrganizerDB } from '../src/types.js';

export const COLLECTIONS: { key: keyof FamilyOrganizerDB; table: string }[] = [
  { key: "users", table: "users" },
  { key: "tasks", table: "tasks" },
  { key: "plans", table: "plans" },
  { key: "notes", table: "notes" },
  { key: "transactions", table: "transactions" },
  { key: "rewardLedger", table: "reward_ledger" },
  { key: "rewardItems", table: "reward_items" },
  { key: "budgets", table: "budgets" },
  { key: "customCategories", table: "custom_categories" },
  { key: "recurringBills", table: "recurring_bills" },
  { key: "savingsGoals", table: "savings_goals" },
  { key: "debts", table: "debts" },
  { key: "assets", table: "assets" },
  { key: "medications", table: "medications" },
  { key: "medicationLogs", table: "medication_logs" },
  { key: "vaccinations", table: "vaccinations" },
  { key: "growthRecords", table: "growth_records" },
  { key: "healthProfiles", table: "health_profiles" },
  { key: "documents", table: "documents" },
  { key: "shoppingItems", table: "shopping_items" },
  { key: "dishLibrary", table: "dish_library" },
  { key: "marketHistory", table: "market_history" },
  { key: "notifications", table: "notifications" },
  { key: "pushSubscriptions", table: "push_subscriptions" },
  { key: "activityLogs", table: "activity_logs" },
  { key: "backups", table: "backup_records" }
];

export const SINGLETON_KEYS: (keyof FamilyOrganizerDB)[] = ["mealPlan", "hiddenBuiltinCategories"];
export const LEGACY_KEYS = [...COLLECTIONS.map(c => c.key), ...SINGLETON_KEYS] as const;
