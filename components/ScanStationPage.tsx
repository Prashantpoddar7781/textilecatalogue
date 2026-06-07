import React from 'react';
import { BarcodeOrderBuilder } from './BarcodeOrderBuilder';

interface Props {
  onBack: () => void;
  firmName?: string;
}

export const ScanStationPage: React.FC<Props> = ({ onBack, firmName }) => {
  return (
    <BarcodeOrderBuilder
      stationMode
      firmName={firmName}
      onClose={onBack}
    />
  );
};
