"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  accountBalances,
  budgetStatuses,
  categoryTotals,
  dailyTotals,
  listAccounts,
  listCategories,
  summarize,
  transactionsInRange,
} from "@/lib/db/queries";

export function useAccounts(includeArchived = false) {
  return useLiveQuery(() => listAccounts(includeArchived), [includeArchived], []);
}

export function useCategories(includeArchived = false) {
  return useLiveQuery(() => listCategories(includeArchived), [includeArchived], []);
}

export function useBalances() {
  return useLiveQuery(() => accountBalances(), [], new Map<string, number>());
}

export function useTransactions(from: string, to: string) {
  return useLiveQuery(() => transactionsInRange(from, to), [from, to], []);
}

export function useSummary(from: string, to: string) {
  return useLiveQuery(() => summarize(from, to), [from, to], {
    income: 0,
    expense: 0,
    net: 0,
    count: 0,
  });
}

export function useCategoryTotals(from: string, to: string, kind: "expense" | "income" = "expense") {
  return useLiveQuery(() => categoryTotals(from, to, kind), [from, to, kind], []);
}

export function useDailyTotals(from: string, to: string) {
  return useLiveQuery(() => dailyTotals(from, to), [from, to], []);
}

export function useBudgets(periodMonth: string) {
  return useLiveQuery(() => budgetStatuses(periodMonth), [periodMonth], []);
}
