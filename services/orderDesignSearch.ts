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
    const lines = order.orderLines || [];
    if (lines.length > 0) {
      for (const line of lines) {
        const code = (line.designCode || '').toLowerCase();
        const name = (line.designName || '').toLowerCase();
        const id = (line.designId || '').toLowerCase();
        if (code.includes(q) || name.includes(q) || id.includes(q)) {
          results.push({
            order,
            quantity: line.quantity,
            designLabel: line.designCode || line.designName || line.designId,
            designId: line.designId
          });
        }
      }
      continue;
    }

    const name = (order.design?.name || '').toLowerCase();
    const id = (order.designId || order.design?.id || '').toLowerCase();
    if (name.includes(q) || id.includes(q)) {
      results.push({
        order,
        quantity: order.quantity,
        designLabel: order.design?.name || order.designId || 'Design',
        designId: order.designId || order.design?.id
      });
    }
  }

  return results;
}
