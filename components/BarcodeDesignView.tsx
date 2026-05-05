import React from 'react';
import { BarcodeOrderBuilder } from './BarcodeOrderBuilder';

export const BarcodeDesignView: React.FC<{ designId: string }> = ({ designId }) => {
  return <BarcodeOrderBuilder initialDesignId={designId} />;
};
