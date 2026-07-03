import React from 'react';
import { ScanPurchaseBillPage } from './ScanPurchaseBillPage';

interface Props {
  onBack: () => void;
}

export const ErpPurchasePage: React.FC<Props> = ({ onBack }) => (
  <ScanPurchaseBillPage onBack={onBack} moduleTitle="Purchase Entry" erpMode />
);
