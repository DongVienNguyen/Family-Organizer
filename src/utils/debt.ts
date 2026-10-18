/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Logic thuần về khoản vay/cho mượn — tách khỏi server/db.ts và DebtTracker.tsx
// để test được luồng tiền (đã trả / còn lại / tất toán) độc lập với DB và UI.

import {addTrackingAmount,subtractTrackingAmount,compareTrackingAmount,type TrackingAmount} from '../features/wallet/linkedMoney.js';

export interface DebtPaymentLike { amount: number }
export interface DebtLike {
  amount: number;
  payments: DebtPaymentLike[];
}

/** Tổng số tiền đã trả của một khoản nợ. */
export function debtPaid(debt: DebtLike): number {
  return debt.payments.reduce((s, p) => s + p.amount, 0);
}

/** Số tiền còn lại phải trả (không âm — trả dư vẫn coi là còn 0). */
export function debtRemaining(debt: DebtLike): number {
  return Math.max(0, debt.amount - debtPaid(debt));
}

/**
 * Khoản nợ đã trả đủ chưa — nguồn chân lý cho việc tự đánh dấu tất toán
 * khi thêm khoản trả, và MỞ LẠI khi xóa khoản trả làm tổng tụt xuống dưới nợ gốc.
 */
export interface LinkedDebtLike {amount:TrackingAmount;payments:readonly {amount:TrackingAmount}[]}
export function debtPaidAmount(debt:LinkedDebtLike):TrackingAmount {
  return debt.payments.reduce<TrackingAmount>((sum,payment)=>addTrackingAmount(sum,payment.amount),0);
}
export function debtRemainingAmount(debt:LinkedDebtLike):TrackingAmount {
  const remaining=subtractTrackingAmount(debt.amount,debtPaidAmount(debt));
  return compareTrackingAmount(remaining,0)<0?(typeof remaining==='number'?0:{minor:'0',currency:remaining.currency}):remaining;
}
export function isDebtFullyPaid(debt: LinkedDebtLike): boolean {
  return compareTrackingAmount(debtPaidAmount(debt),debt.amount)>=0;
}
