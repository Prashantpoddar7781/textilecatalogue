import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { InterestReport } from '../utils/interestCalculation';

interface Props {
  report: InterestReport;
  onBack: () => void;
}

const money = (value: number) =>
  (Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const [y, m, d] = value.slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y.slice(2)}`;
};

export const InterestReportView: React.FC<Props> = ({ report, onBack }) => {
  const rows = Math.max(report.creditRows.length, report.debitRows.length, 1);

  const openRow = (editPath?: string | null) => {
    if (!editPath) return;
    window.location.href = editPath;
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ledger
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Interest Report Page 1</p>
          <h2 className="text-xl font-black text-gray-900">{report.party.name}</h2>
          {report.party.address && <p className="text-sm text-gray-600">{report.party.address}</p>}
          <p className="text-sm font-semibold text-gray-700">A/C Name: {report.party.accountName}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-right text-xs font-bold text-amber-950">
          <p>INT. RATE: {Number(report.interestRate).toFixed(2)}%</p>
          <p>GRACE DAYS: {report.graceDays} ({report.graceSource === 'typed' ? 'typed' : 'master'})</p>
          <p>DAYS / YEAR: {report.daysInYear}</p>
          <p>DATE-WISE: {formatDate(report.fromDate)} TO {formatDate(report.toDate)}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-700">
              <th className="border px-2 py-2 text-left" colSpan={6}>Credits (Receipts / Payments)</th>
              <th className="border px-2 py-2 text-left" colSpan={7}>Debits (Bills / Sales)</th>
            </tr>
            <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-600">
              <th className="border px-2 py-1.5">Date</th>
              <th className="border px-2 py-1.5">Book</th>
              <th className="border px-2 py-1.5">Chq/Bill</th>
              <th className="border px-2 py-1.5 text-right">Cr Amount</th>
              <th className="border px-2 py-1.5 text-right">Days</th>
              <th className="border px-2 py-1.5 text-right">Int. Amount</th>
              <th className="border px-2 py-1.5">Date</th>
              <th className="border px-2 py-1.5">Bill/Chq</th>
              <th className="border px-2 py-1.5 text-right">Grace</th>
              <th className="border px-2 py-1.5">Due Date</th>
              <th className="border px-2 py-1.5 text-right">Debit Amount</th>
              <th className="border px-2 py-1.5 text-right">Days</th>
              <th className="border px-2 py-1.5 text-right">Int. Amount</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, index) => {
              const credit = report.creditRows[index];
              const debit = report.debitRows[index];
              return (
                <tr key={index} className="align-top">
                  <td className="border px-2 py-1.5">{credit ? formatDate(credit.date) : ''}</td>
                  <td className="border px-2 py-1.5">{credit?.book || ''}</td>
                  <td
                    className={`border px-2 py-1.5 font-semibold ${credit?.editPath ? 'cursor-pointer text-indigo-800' : ''}`}
                    onClick={() => openRow(credit?.editPath)}
                    title={credit?.editPath ? 'Open entry' : undefined}
                  >
                    {credit?.billNumber || ''}
                  </td>
                  <td className="border px-2 py-1.5 text-right tabular-nums">{credit ? money(credit.amount) : ''}</td>
                  <td className="border px-2 py-1.5 text-right">{credit ? credit.days : ''}</td>
                  <td className="border px-2 py-1.5 text-right tabular-nums">{credit ? money(credit.interestAmount) : ''}</td>
                  <td className="border px-2 py-1.5">{debit ? formatDate(debit.date) : ''}</td>
                  <td
                    className={`border px-2 py-1.5 font-black ${debit?.editPath ? 'cursor-pointer text-indigo-800' : ''}`}
                    onClick={() => openRow(debit?.editPath)}
                    title={debit?.editPath ? 'Open bill' : undefined}
                  >
                    {debit?.billNumber || ''}
                  </td>
                  <td className="border px-2 py-1.5 text-right">{debit ? debit.grace : ''}</td>
                  <td className="border px-2 py-1.5">{debit ? formatDate(debit.dueDate) : ''}</td>
                  <td className="border px-2 py-1.5 text-right tabular-nums">{debit ? money(debit.amount) : ''}</td>
                  <td className="border px-2 py-1.5 text-right">{debit ? debit.days : ''}</td>
                  <td className="border px-2 py-1.5 text-right tabular-nums">{debit ? money(debit.interestAmount) : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-black">
              <td className="border px-2 py-2" colSpan={3}>Cr Total</td>
              <td className="border px-2 py-2 text-right">{money(report.creditTotal)}</td>
              <td className="border px-2 py-2" />
              <td className="border px-2 py-2 text-right">{money(report.creditInterest)}</td>
              <td className="border px-2 py-2" colSpan={4}>Dr Total</td>
              <td className="border px-2 py-2 text-right">{money(report.debitTotal)}</td>
              <td className="border px-2 py-2" />
              <td className="border px-2 py-2 text-right">{money(report.debitInterest)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 grid gap-2 rounded-2xl border bg-amber-50 p-4 text-sm font-bold text-amber-950 sm:grid-cols-2">
        <p>SALES / BILLS: {money(report.salesTotal || report.debitTotal)}</p>
        <p>LEDGER BALANCE: {money(Math.abs(report.ledgerBalance))} {report.ledgerBalanceType === 'CR' ? 'Cr' : 'Dr'}</p>
        <p className="text-rose-800">INTEREST AMT: {money(report.interestAmount)} {report.interestType === 'CR' ? 'Cr' : 'Dr'}</p>
        <p>BAL. WITH INT: {money(report.balanceWithInterest)} {report.balanceWithInterestType === 'CR' ? 'Cr' : 'Dr'}</p>
      </div>
    </div>
  );
};
