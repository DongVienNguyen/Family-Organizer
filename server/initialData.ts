/** @license SPDX-License-Identifier: Apache-2.0 */
import type { FamilyOrganizerDB,User } from '../src/types.js';

/** First-install data only; existing installations are never seeded or reset. */
export function createInitialData(admin:User&{passwordHash:string}):FamilyOrganizerDB {
  const users=[admin];
  return {
    users,
    tasks: [],
    plans: [],
    notes: [],
    transactions: [],
    rewardLedger: [],
    rewardItems: [],
    budgets: [],
    customCategories: [],
    hiddenBuiltinCategories: [],
    recurringBills: [],
    savingsGoals: [],
    debts: [],
    assets: [],
    medications: [],
    medicationLogs: [],
    vaccinations: [],
    growthRecords: [],
    healthProfiles: [],
    documents: [],
    shoppingItems: [],
    dishLibrary: [],
    mealPlan: null,
    marketHistory: [],
    notifications: [],
    pushSubscriptions: [],
    activityLogs: [],
    backups: []
  };
}
