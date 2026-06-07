import React from 'react';
import { BarcodeOrderBuilder } from './BarcodeOrderBuilder';

interface Props {
  onBack: () => void;
}

export const ScanStationPage: React.FC<Props> = ({ onBack }) => {
  return (
    <BarcodeOrderBuilder
      stationMode
      onClose={onBack}
      onCreated={() => { window.location.href = '/orders'; }}
    />
  );
};
