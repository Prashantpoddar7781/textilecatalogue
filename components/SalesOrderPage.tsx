import React, { useEffect } from 'react';

/** Legacy route — Sales Order lives inside Sales via Type = SALES ORDERS. */
export const SalesOrderPage: React.FC = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const edit = params.get('edit');
    const next = new URLSearchParams();
    next.set('type', 'SALES ORDERS');
    if (edit) {
      next.set('edit', edit);
      next.set('kind', 'order');
    }
    window.location.replace(`/erp/sales?${next.toString()}`);
  }, []);

  return null;
};
