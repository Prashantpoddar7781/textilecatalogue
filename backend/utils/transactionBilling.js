import { formatSeriesBillNumber } from '../constants/erpTransactionPostingRules.js';

export function formatTypeBillNumber(typeBillNumber, transactionType = null) {
  if (typeBillNumber == null) return null;
  if (!transactionType) return String(typeBillNumber);
  return formatSeriesBillNumber(transactionType, typeBillNumber) || String(typeBillNumber);
}

export async function allocateNextTypeBillNumber(tx, userId, transactionType, source) {
  const type = String(transactionType || '').trim();
  if (!type) return null;

  if (source === 'purchase_bill') {
    const result = await tx.purchaseBill.aggregate({
      where: { userId, transactionType: type },
      _max: { typeBillNumber: true }
    });
    return (result._max.typeBillNumber ?? 0) + 1;
  }

  if (source === 'grey_purchase') {
    const result = await tx.greyPurchase.aggregate({
      where: { userId, transactionType: type },
      _max: { typeBillNumber: true }
    });
    return (result._max.typeBillNumber ?? 0) + 1;
  }

  const result = await tx.order.aggregate({
    where: { userId, transactionType: type },
    _max: { typeBillNumber: true }
  });
  return (result._max.typeBillNumber ?? 0) + 1;
}

export function resolveBillDisplayNumber(record) {
  if (record.typeBillNumber != null) {
    return formatTypeBillNumber(record.typeBillNumber, record.transactionType);
  }
  if (record.invoiceNumber != null) {
    return String(record.invoiceNumber);
  }
  if (record.billNumber) {
    return String(record.billNumber);
  }
  return null;
}
