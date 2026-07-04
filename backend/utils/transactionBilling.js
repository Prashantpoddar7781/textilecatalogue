export function formatTypeBillNumber(typeBillNumber) {
  if (typeBillNumber == null) return null;
  return String(typeBillNumber);
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

  const result = await tx.order.aggregate({
    where: { userId, transactionType: type },
    _max: { typeBillNumber: true }
  });
  return (result._max.typeBillNumber ?? 0) + 1;
}

export function resolveBillDisplayNumber(record) {
  if (record.typeBillNumber != null) {
    return formatTypeBillNumber(record.typeBillNumber);
  }
  if (record.invoiceNumber != null) {
    return String(record.invoiceNumber);
  }
  if (record.billNumber) {
    return String(record.billNumber);
  }
  return null;
}
