import { Order } from '../types';

export interface DesignOrderMatch {
  order: Order;
  quantity: number;
  designLabel: string;
  designId?: string;
}

export function findOrdersByDesignQuery(orders: Order[], query: string): DesignOrderMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: DesignOrderMatch[] = [];

  for (const order of orders) {
    const orderFields = [
      order.id,
      order.orderNumber,
      order.buyerName,
      order.buyerPhone,
      order.status,
      order.remarks,
      order.agentName,
      order.transportName,
      order.haste,
      order.station,
      order.priceCategory,
      order.customer?.organizationName,
      order.customer?.contactPersonName,
      order.customer?.mobileNumber,
      order.customer?.city,
      order.customer?.state
    ];
    const orderMatches = orderFields
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(q));
    const lines = order.orderLines || [];
    if (lines.length > 0) {
      let matchedLine = false;
      for (const line of lines) {
        const lineFields = [
          line.designCode,
          line.designName,
          line.designId,
          line.fabric,
          line.remarks
        ];
        const lineMatches = lineFields
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(q));
        if (lineMatches) {
          matchedLine = true;
          results.push({
            order,
            quantity: line.quantity,
            designLabel: line.designCode || line.designName || line.designId,
            designId: line.designId
          });
        }
      }
      if (!matchedLine && orderMatches) {
        results.push({
          order,
          quantity: order.quantity,
          designLabel: order.orderNumber ? `Order #${order.orderNumber}` : order.buyerName || 'Order',
          designId: order.designId || order.id
        });
      }
      continue;
    }

    const designFields = [
      order.design?.name,
      order.design?.designCode,
      order.design?.fabric,
      order.designId,
      order.design?.id
    ];
    const designMatches = designFields
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(q));
    if (orderMatches || designMatches) {
      results.push({
        order,
        quantity: order.quantity,
        designLabel: designMatches
          ? (order.design?.designCode || order.design?.name || order.designId || 'Design')
          : (order.orderNumber ? `Order #${order.orderNumber}` : order.buyerName || 'Order'),
        designId: order.designId || order.design?.id
      });
    }
  }

  return results;
}
