/** Bank voucher that still adjusts this document, if any. */
export async function bankAdjustmentBlock(prisma, userId, documentId) {
  if (!documentId) return null;
  const hit = await prisma.bankEntry.findFirst({
    where: {
      userId,
      billAllocations: { string_contains: documentId }
    },
    select: { voucherNumber: true, transactionType: true }
  });
  if (!hit) return null;
  const series = hit.transactionType || 'Bank';
  const number = hit.voucherNumber ? ` ${hit.voucherNumber}` : '';
  return `This entry is adjusted on ${series}${number}. Remove that adjustment before deleting.`;
}
