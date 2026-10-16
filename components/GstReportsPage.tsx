import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCheck, ChevronDown, ChevronRight, Download, FileSpreadsheet, Loader2, Pencil, RefreshCw, Save, Trash2, Undo2, Upload } from 'lucide-react';
import {
  GstDocRef,
  GstPortalStatementInfo,
  GstProblem,
  Gstr1Report,
  Gstr2bMatchReport,
  Gstr3bRegisterReport,
  gstApi
} from '../services/api';
import { ErpSession } from '../types';
import { ErpTopMenu } from './ErpTopMenu';

interface Props {
  onBack: () => void;
  erpSession?: ErpSession | null;
}

type ReportKey =
  | 'gstr1' | 'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'cdnur' | 'exemp' | 'hsnB2b' | 'hsnB2c' | 'docs'
  | 'gstr3b' | 'gstr3bForm' | 'match' | 'problems';

const REPORT_GROUPS: Array<{ title: string; items: Array<{ key: ReportKey; label: string }> }> = [
  {
    title: 'GSTR-1 (outward)',
    items: [
      { key: 'gstr1', label: 'Summary of outward supplies' },
      { key: 'b2b', label: 'B2B · sale party registered' },
      { key: 'b2cl', label: 'B2CL · unregd inter-state large' },
      { key: 'b2cs', label: 'B2CS · others (state + rate)' },
      { key: 'cdnr', label: 'CDNR · notes to registered' },
      { key: 'cdnur', label: 'CDNUR · notes to unregistered' },
      { key: 'exemp', label: 'EXEMP · nil rated / exempt' },
      { key: 'hsnB2b', label: 'HSN summary (B2B)' },
      { key: 'hsnB2c', label: 'HSN summary (B2C)' },
      { key: 'docs', label: 'Outward documents summary (13)' }
    ]
  },
  {
    title: 'GSTR-3B',
    items: [
      { key: 'gstr3b', label: 'GSTR-3B register' },
      { key: 'gstr3bForm', label: 'GSTR-3B form (3.1 to 6.1)' }
    ]
  },
  {
    title: 'ITC reconciliation',
    items: [{ key: 'match', label: 'GSTR-2A / 2B matching' }]
  },
  {
    title: 'Checks',
    items: [{ key: 'problems', label: 'Invalid GSTINs / data entry problems' }]
  }
];

const NOT_BUILT = ['GSTR-9 / 9C annual', 'ITC-04 job work', 'Advances (AT / ATADJ)', 'Exports (EXP)', 'RCM self invoice'];

const GSTR1_KEYS: ReportKey[] = ['gstr1', 'b2b', 'b2cl', 'b2cs', 'cdnr', 'cdnur', 'exemp', 'hsnB2b', 'hsnB2c', 'docs'];

const money = (v: number | null | undefined) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: number | null | undefined) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const formatDate = (v?: string | null) => {
  if (!v) return '-';
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
};
const openEdit = (path?: string) => { if (path) window.location.href = path; };

const thClass = 'border border-indigo-200 bg-indigo-50 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-950';
const tdClass = 'border border-slate-200 px-2 py-1.5 align-middle';
const tdNum = `${tdClass} text-right tabular-nums`;
const tdCenter = `${tdClass} text-center`;
const btnClass = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black uppercase';

function previousMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function readUrl(): { report: ReportKey; period: string } {
  const params = new URLSearchParams(window.location.search);
  const report = params.get('report') as ReportKey | null;
  const valid = REPORT_GROUPS.some(group => group.items.some(item => item.key === report));
  const period = params.get('period') || '';
  const fallback: ReportKey = window.location.pathname.includes('gstr-3b') ? 'gstr3b' : 'gstr1';
  return { report: valid && report ? report : fallback, period: /^\d{4}-\d{2}$/.test(period) ? period : previousMonth() };
}

const Section: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <section className="mb-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-indigo-50 px-4 py-3">
      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-800">{title}</span>
      {right}
    </div>
    <div className="overflow-x-auto">{children}</div>
  </section>
);

const EmptyRow: React.FC<{ cols: number; text?: string }> = ({ cols, text = 'Nothing for this month.' }) => (
  <tr><td colSpan={cols} className={`${tdClass} p-8 text-center font-bold text-gray-400`}>{text}</td></tr>
);

/** Documents behind an aggregate row (B2CS, HSN, EXEMP, docs). Each opens its entry. */
const DocList: React.FC<{ docs: GstDocRef[]; cols: number }> = ({ docs, cols }) => (
  <tr>
    <td colSpan={cols} className="border border-slate-200 bg-slate-50 p-2">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>{['Date', 'Doc No.', 'Series', 'Party', 'Taxable', 'Tax', 'Value'].map(h => <th key={h} className={thClass}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {docs.map(doc => (
            <tr key={`${doc.source}-${doc.id}`} onClick={() => openEdit(doc.editPath)} className="cursor-pointer bg-white hover:bg-indigo-50">
              <td className={tdCenter}>{formatDate(doc.date)}</td>
              <td className={`${tdClass} font-bold`}>{doc.docNo || '(blank)'}</td>
              <td className={tdClass}>{doc.transactionType}</td>
              <td className={tdClass}>{doc.partyName || '-'}</td>
              <td className={tdNum}>{money(doc.taxable)}</td>
              <td className={tdNum}>{money(doc.tax)}</td>
              <td className={tdNum}>{money(doc.invoiceValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </td>
  </tr>
);

function useExpand() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  return { open, toggle };
}

/* --------------------------------- GSTR-1 --------------------------------- */

const SECTION_TO_REPORT: Record<string, ReportKey> = {
  b2b: 'b2b', b2cl: 'b2cl', b2cs: 'b2cs', cdnr: 'cdnr', cdnur: 'cdnur', exemp: 'exemp', hsnB2b: 'hsnB2b', hsnB2c: 'hsnB2c', docs: 'docs'
};

const Gstr1Summary: React.FC<{ data: Gstr1Report; onPick: (key: ReportKey) => void }> = ({ data, onPick }) => (
  <>
    <Section title={`Summary of outward supplies · ${data.company.name || 'Company'} · GSTIN ${data.company.gstin || '-'}`}>
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr>{['Section', 'Documents', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess', 'Value'].map(h => <th key={h} className={thClass}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.summary.map(row => (
            <tr key={row.section} onClick={() => onPick(SECTION_TO_REPORT[row.section])} className="cursor-pointer hover:bg-indigo-50">
              <td className={`${tdClass} font-black`}>{row.label}</td>
              <td className={tdCenter}>{row.documents}{row.cancelled ? ` (${row.cancelled} cancelled)` : ''}</td>
              <td className={tdNum}>{money(row.taxable)}</td>
              <td className={tdNum}>{money(row.igst)}</td>
              <td className={tdNum}>{money(row.cgst)}</td>
              <td className={tdNum}>{money(row.sgst)}</td>
              <td className={tdNum}>{money(row.cess)}</td>
              <td className={`${tdNum} font-bold`}>{money(row.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-indigo-900 text-white">
            <td className={`${tdClass} border-indigo-800 font-black`}>Total output tax (all outward, notes netted)</td>
            <td className={`${tdClass} border-indigo-800`} />
            <td className={`${tdNum} border-indigo-800 font-black`}>{money(data.liability.taxable)}</td>
            <td className={`${tdNum} border-indigo-800 font-black`}>{money(data.liability.igst)}</td>
            <td className={`${tdNum} border-indigo-800 font-black`}>{money(data.liability.cgst)}</td>
            <td className={`${tdNum} border-indigo-800 font-black`}>{money(data.liability.sgst)}</td>
            <td className={`${tdNum} border-indigo-800`}>0.00</td>
            <td className={`${tdNum} border-indigo-800 font-black`}>{money(data.liability.tax)}</td>
          </tr>
        </tfoot>
      </table>
    </Section>
    <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
      B2CL limit for this month: invoice value above ₹{data.b2clLimit.toLocaleString('en-IN')} to an unregistered buyer in another state
      (₹1,00,000 from 1 Aug 2024; ₹2,50,000 before). Click a section to see its rows.
    </p>
    {data.problems.length > 0 && (
      <button type="button" onClick={() => onPick('problems')} className="mb-4 flex w-full items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-xs font-bold text-rose-800">
        <AlertTriangle className="h-4 w-4" /> {data.problems.length} data entry problem(s) found in this month's outward documents. Fix them before filing.
      </button>
    )}
    <DocsIssued data={data} />
  </>
);

const DocsIssued: React.FC<{ data: Gstr1Report }> = ({ data }) => {
  const { open, toggle } = useExpand();
  return (
    <Section title="Summary of documents issued during the tax period (13)">
      <table className="w-full min-w-[800px] border-collapse text-xs">
        <thead>
          <tr>{['', 'Nature of Document', 'Series', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'].map(h => <th key={h} className={thClass}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {data.docs.length === 0 && <EmptyRow cols={7} />}
          {data.docs.map(row => {
            const key = `${row.nature}|${row.transactionType}`;
            return (
              <React.Fragment key={key}>
                <tr onClick={() => toggle(key)} className="cursor-pointer hover:bg-indigo-50">
                  <td className={tdCenter}>{open[key] ? <ChevronDown className="mx-auto h-3.5 w-3.5" /> : <ChevronRight className="mx-auto h-3.5 w-3.5" />}</td>
                  <td className={`${tdClass} font-bold`}>{row.nature}</td>
                  <td className={tdClass}>{row.transactionType}</td>
                  <td className={tdCenter}>{row.fromNo}</td>
                  <td className={tdCenter}>{row.toNo}</td>
                  <td className={tdCenter}>{row.totalNumber}</td>
                  <td className={tdCenter}>{row.cancelled}</td>
                </tr>
                {open[key] && <DocList docs={row.docs} cols={7} />}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
};

type Column<T> = { head: string; cell: (row: T) => React.ReactNode; num?: boolean };

function DocTable<T extends { id: string; editPath: string; rate?: number }>({ title, rows, columns }: { title: string; rows: T[]; columns: Column<T>[] }) {
  return (
    <Section title={`${title} · click a row to edit`}>
      <table className="w-full min-w-[1000px] border-collapse text-xs">
        <thead><tr>{columns.map(c => <th key={c.head} className={thClass}>{c.head}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={columns.length} />}
          {rows.map((row, index) => (
            <tr key={`${row.id}-${row.rate ?? ''}-${index}`} onClick={() => openEdit(row.editPath)} className="cursor-pointer hover:bg-indigo-50">
              {columns.map(c => <td key={c.head} className={c.num ? tdNum : tdClass}>{c.cell(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function GroupTable<T extends { docs: GstDocRef[] }>({ title, rows, columns, rowKey }: { title: string; rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string }) {
  const { open, toggle } = useExpand();
  const cols = columns.length + 1;
  return (
    <Section title={`${title} · click a row for its bills`}>
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead><tr><th className={thClass} />{columns.map(c => <th key={c.head} className={thClass}>{c.head}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={cols} />}
          {rows.map(row => {
            const key = rowKey(row);
            return (
              <React.Fragment key={key}>
                <tr onClick={() => toggle(key)} className="cursor-pointer hover:bg-indigo-50">
                  <td className={tdCenter}>{open[key] ? <ChevronDown className="mx-auto h-3.5 w-3.5" /> : <ChevronRight className="mx-auto h-3.5 w-3.5" />}</td>
                  {columns.map(c => <td key={c.head} className={c.num ? tdNum : tdClass}>{c.cell(row)}</td>)}
                </tr>
                {open[key] && <DocList docs={row.docs} cols={cols} />}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

const Gstr1Section: React.FC<{ report: ReportKey; data: Gstr1Report }> = ({ report, data }) => {
  if (report === 'b2b') {
    return (
      <DocTable<Gstr1Report['b2b'][number]> title="B2B, SEZ, DE (4A, 4B, 6B, 6C)" rows={data.b2b} columns={[
        { head: 'GSTIN/UIN of Recipient', cell: r => r.gstin },
        { head: 'Receiver Name', cell: r => r.receiverName },
        { head: 'Invoice Number', cell: r => <b>{r.invoiceNo}</b> },
        { head: 'Invoice date', cell: r => formatDate(r.invoiceDate) },
        { head: 'Invoice Value', cell: r => money(r.invoiceValue), num: true },
        { head: 'Place Of Supply', cell: r => r.pos },
        { head: 'Reverse Charge', cell: r => r.reverseCharge },
        { head: 'Invoice Type', cell: r => r.invoiceType },
        { head: 'Rate', cell: r => r.rate, num: true },
        { head: 'Taxable Value', cell: r => money(r.taxable), num: true },
        { head: 'IGST', cell: r => money(r.igst), num: true },
        { head: 'CGST', cell: r => money(r.cgst), num: true },
        { head: 'SGST', cell: r => money(r.sgst), num: true }
      ]} />
    );
  }
  if (report === 'b2cl') {
    return (
      <DocTable<Gstr1Report['b2cl'][number]> title={`B2CL (5) · unregistered, inter-state, invoice above ₹${data.b2clLimit.toLocaleString('en-IN')}`} rows={data.b2cl} columns={[
        { head: 'Invoice Number', cell: r => <b>{r.invoiceNo}</b> },
        { head: 'Invoice date', cell: r => formatDate(r.invoiceDate) },
        { head: 'Invoice Value', cell: r => money(r.invoiceValue), num: true },
        { head: 'Place Of Supply', cell: r => r.pos },
        { head: 'Rate', cell: r => r.rate, num: true },
        { head: 'Taxable Value', cell: r => money(r.taxable), num: true },
        { head: 'IGST', cell: r => money(r.igst), num: true }
      ]} />
    );
  }
  if (report === 'b2cs') {
    return (
      <GroupTable<Gstr1Report['b2cs'][number]> title="B2CS (7) · grouped by state and rate, notes included" rows={data.b2cs} rowKey={r => `${r.pos}|${r.rate}`} columns={[
        { head: 'Type', cell: r => r.type },
        { head: 'Place Of Supply', cell: r => <b>{r.pos}</b> },
        { head: 'Rate', cell: r => r.rate, num: true },
        { head: 'Taxable Value', cell: r => money(r.taxable), num: true },
        { head: 'IGST', cell: r => money(r.igst), num: true },
        { head: 'CGST', cell: r => money(r.cgst), num: true },
        { head: 'SGST', cell: r => money(r.sgst), num: true },
        { head: 'Bills', cell: r => r.docs.length, num: true }
      ]} />
    );
  }
  if (report === 'cdnr') {
    return (
      <DocTable<Gstr1Report['cdnr'][number]> title="CDNR (9B) · sales returns and credit / debit notes to registered parties" rows={data.cdnr} columns={[
        { head: 'GSTIN/UIN of Recipient', cell: r => r.gstin },
        { head: 'Receiver Name', cell: r => r.receiverName },
        { head: 'Note Number', cell: r => <b>{r.noteNo}</b> },
        { head: 'Note Date', cell: r => formatDate(r.noteDate) },
        { head: 'Note Type', cell: r => r.noteType },
        { head: 'Place Of Supply', cell: r => r.pos },
        { head: 'Note Value', cell: r => money(r.noteValue), num: true },
        { head: 'Rate', cell: r => r.rate, num: true },
        { head: 'Taxable Value', cell: r => money(r.taxable), num: true },
        { head: 'Tax', cell: r => money(r.igst + r.cgst + r.sgst), num: true }
      ]} />
    );
  }
  if (report === 'cdnur') {
    return (
      <DocTable<Gstr1Report['cdnur'][number]> title="CDNUR (9B) · notes to unregistered, inter-state, above the B2CL limit" rows={data.cdnur} columns={[
        { head: 'UR Type', cell: r => r.urType },
        { head: 'Note Number', cell: r => <b>{r.noteNo}</b> },
        { head: 'Note Date', cell: r => formatDate(r.noteDate) },
        { head: 'Note Type', cell: r => r.noteType },
        { head: 'Place Of Supply', cell: r => r.pos },
        { head: 'Note Value', cell: r => money(r.noteValue), num: true },
        { head: 'Rate', cell: r => r.rate, num: true },
        { head: 'Taxable Value', cell: r => money(r.taxable), num: true },
        { head: 'IGST', cell: r => money(r.igst), num: true }
      ]} />
    );
  }
  if (report === 'exemp') {
    return (
      <GroupTable<Gstr1Report['exemp'][number]> title="Nil rated, exempted and non-GST outward supplies (8)" rows={data.exemp} rowKey={r => r.description} columns={[
        { head: 'Description', cell: r => <b>{r.description}</b> },
        { head: 'Nil Rated Supplies', cell: r => money(r.nilRated), num: true },
        { head: 'Exempted', cell: r => money(r.exempted), num: true },
        { head: 'Non-GST Supplies', cell: r => money(r.nonGst), num: true }
      ]} />
    );
  }
  if (report === 'hsnB2b' || report === 'hsnB2c') {
    const rows = report === 'hsnB2b' ? data.hsnB2b : data.hsnB2c;
    return (
      <GroupTable<Gstr1Report['hsnB2b'][number]> title={`HSN summary (12) · ${report === 'hsnB2b' ? 'B2B' : 'B2C'} · credit notes negative`} rows={rows} rowKey={r => `${r.hsn}|${r.uqc}|${r.rate}`} columns={[
        { head: 'HSN', cell: r => <b>{r.hsn}</b> },
        { head: 'Description', cell: r => r.description },
        { head: 'UQC', cell: r => r.uqc },
        { head: 'Total Quantity', cell: r => qty(r.qty), num: true },
        { head: 'Total Value', cell: r => money(r.totalValue), num: true },
        { head: 'Rate', cell: r => r.rate, num: true },
        { head: 'Taxable Value', cell: r => money(r.taxable), num: true },
        { head: 'IGST', cell: r => money(r.igst), num: true },
        { head: 'CGST', cell: r => money(r.cgst), num: true },
        { head: 'SGST', cell: r => money(r.sgst), num: true }
      ]} />
    );
  }
  if (report === 'docs') return <DocsIssued data={data} />;
  return null;
};

/* --------------------------------- GSTR-3B -------------------------------- */

const AMOUNT_HEADS = ['Taxable', 'IGST', 'CGST', 'SGST', 'Cess', 'Bill Amount', 'Ledger Amt'];

const AmountCells: React.FC<{ a: { taxable: number; igst: number; cgst: number; sgst: number; cess: number; billAmount: number; ledgerAmount: number }; bold?: boolean }> = ({ a, bold }) => (
  <>
    {[a.taxable, a.igst, a.cgst, a.sgst, a.cess, a.billAmount, a.ledgerAmount].map((v, i) => (
      <td key={i} className={`${tdNum} ${bold ? 'font-black' : ''}`}>{money(v)}</td>
    ))}
  </>
);

const Gstr3bRegisterView: React.FC<{ data: Gstr3bRegisterReport }> = ({ data }) => {
  const { open, toggle } = useExpand();
  const cols = 3 + AMOUNT_HEADS.length;
  return (
    <>
      {!data.hasStatement && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          No GSTR-2B / 2A uploaded for this month, so all ITC shows as "Unreconciled with 2A". Upload the CA's file under GSTR-2A / 2B matching to split it.
        </p>
      )}
      <Section title="GSTR-3B register · 3B type → sub type → tran type · click a tran type for its bills">
        <table className="w-full min-w-[1100px] border-collapse text-xs">
          <thead>
            <tr>{['3B Type / Sub Type', 'Tran Type', 'Bills', ...AMOUNT_HEADS].map(h => <th key={h} className={thClass}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.register.length === 0 && <EmptyRow cols={cols} />}
            {data.register.map(type => (
              <React.Fragment key={type.type3b}>
                <tr className="bg-indigo-100">
                  <td className={`${tdClass} font-black`} colSpan={2}>{type.type3b}</td>
                  <td className={tdCenter}>{type.totals.count}</td>
                  <AmountCells a={type.totals} bold />
                </tr>
                {type.subTypes.map(sub => (
                  <React.Fragment key={sub.subType}>
                    <tr className="bg-slate-50">
                      <td className={`${tdClass} pl-5 font-bold`} colSpan={2}>{sub.subType} <span className="text-[10px] text-gray-400">({sub.table})</span></td>
                      <td className={tdCenter}>{sub.totals.count}</td>
                      <AmountCells a={sub.totals} bold />
                    </tr>
                    {sub.tranTypes.map(tran => {
                      const key = `${type.type3b}|${sub.subType}|${tran.transactionType}`;
                      return (
                        <React.Fragment key={key}>
                          <tr onClick={() => toggle(key)} className="cursor-pointer hover:bg-indigo-50">
                            <td className={`${tdClass} pl-8`}>{open[key] ? <ChevronDown className="inline h-3.5 w-3.5" /> : <ChevronRight className="inline h-3.5 w-3.5" />}</td>
                            <td className={tdClass}>{tran.transactionType}</td>
                            <td className={tdCenter}>{tran.totals.count}</td>
                            <AmountCells a={tran.totals} />
                          </tr>
                          {open[key] && tran.docs.map(doc => (
                            <tr key={`${doc.source}-${doc.id}`} onClick={() => openEdit(doc.editPath)} className="cursor-pointer bg-white text-[11px] hover:bg-indigo-50">
                              <td className={`${tdClass} pl-10 text-gray-500`}>{formatDate(doc.date)}</td>
                              <td className={tdClass}><b>{doc.docNo || '-'}</b>{doc.partyBillNo ? ` · bill ${doc.partyBillNo}` : ''} · {doc.partyName}</td>
                              <td className={`${tdCenter} text-[10px]`}>{doc.partyGstin || 'no GSTIN'}</td>
                              <AmountCells a={{ ...doc, cess: 0 }} />
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
};

const FormTable: React.FC<{ title: string; rows: Array<{ code?: string; label?: string; pos?: string; taxable: number; igst: number; cgst: number; sgst: number; cess: number }> }> = ({ title, rows }) => (
  <Section title={title}>
    <table className="w-full min-w-[800px] border-collapse text-xs">
      <thead><tr>{['Table', 'Nature', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess'].map(h => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <EmptyRow cols={7} />}
        {rows.map((row, i) => (
          <tr key={`${row.code || row.pos}-${i}`}>
            <td className={`${tdCenter} font-bold`}>{row.code || '3.2'}</td>
            <td className={tdClass}>{row.label || row.pos}</td>
            <td className={tdNum}>{money(row.taxable)}</td>
            <td className={tdNum}>{money(row.igst)}</td>
            <td className={tdNum}>{money(row.cgst)}</td>
            <td className={tdNum}>{money(row.sgst)}</td>
            <td className={tdNum}>{money(row.cess)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Section>
);

const Gstr3bFormView: React.FC<{ data: Gstr3bRegisterReport }> = ({ data }) => {
  const f = data.forms;
  const cash = f.table61.reduce((s, r) => s + r.cash, 0);
  return (
    <>
      <FormTable title="3.1 Outward supplies and inward supplies liable to reverse charge" rows={f.table31} />
      <FormTable title="3.2 Inter-state supplies to unregistered persons (by place of supply)" rows={f.table32} />
      <FormTable title="4 Eligible ITC (split by the Transaction Types ITC column)" rows={f.table4} />
      {f.itcCheck && (
        <p className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-900">
          ITC matched with {data.statementSource}: IGST {money(f.itcCheck.reconciled.igst)} · CGST {money(f.itcCheck.reconciled.cgst)} · SGST {money(f.itcCheck.reconciled.sgst)}.
          {' '}Not on the portal / not matched: IGST {money(f.itcCheck.unreconciled.igst)} · CGST {money(f.itcCheck.unreconciled.cgst)} · SGST {money(f.itcCheck.unreconciled.sgst)}.
          {' '}Claim only what is in 2B and eligible.
        </p>
      )}
      <FormTable title="5 Exempt, nil rated and non-GST inward supplies" rows={f.table5} />
      <Section title="6.1 Payment of tax · set-off estimate (IGST credit first, CGST ↛ SGST)">
        <table className="w-full min-w-[800px] border-collapse text-xs">
          <thead><tr>{['Tax head', 'Liability', 'Paid by IGST credit', 'Paid by CGST credit', 'Paid by SGST credit', 'Cash payable', 'Credit carried forward'].map(h => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
          <tbody>
            {f.table61.map(row => (
              <tr key={row.head}>
                <td className={`${tdCenter} font-black uppercase`}>{row.head}</td>
                <td className={tdNum}>{money(row.liability)}</td>
                <td className={tdNum}>{money(row.paidByIgst)}</td>
                <td className={tdNum}>{money(row.paidByCgst)}</td>
                <td className={tdNum}>{money(row.paidBySgst)}</td>
                <td className={`${tdNum} font-black`}>{money(row.cash)}</td>
                <td className={tdNum}>{money(row.creditCarriedForward)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-indigo-900 text-white">
              <td className={`${tdClass} border-indigo-800 font-black`} colSpan={5}>Estimated cash payable</td>
              <td className={`${tdNum} border-indigo-800 font-black`}>{money(cash)}</td>
              <td className={`${tdClass} border-indigo-800`} />
            </tr>
          </tfoot>
        </table>
      </Section>
      <p className="mb-4 text-xs font-semibold text-gray-500">
        This is a working estimate from the books. The portal's own offset and the CA's review are final; interest, late fee and RCM cash are not included.
      </p>
    </>
  );
};

/* ------------------------------- 2A/2B match ------------------------------ */

const STATUS_STYLE: Record<string, string> = {
  'MATCHED': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'MISMATCH': 'bg-amber-50 text-amber-800 border-amber-200',
  'GST BLANK': 'bg-slate-100 text-slate-700 border-slate-200',
  'ABSENT IN 2A': 'bg-rose-50 text-rose-800 border-rose-200',
  'ABSENT IN YOUR A/C': 'bg-orange-50 text-orange-800 border-orange-200',
  'ABSENT IN YOUR A/C - NO PARTY MASTER': 'bg-purple-50 text-purple-800 border-purple-200'
};

const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const MatchView: React.FC<{ period: string }> = ({ period }) => {
  const [data, setData] = useState<Gstr2bMatchReport | null>(null);
  const [statements, setStatements] = useState<GstPortalStatementInfo[]>([]);
  const [source, setSource] = useState<'2B' | '2A'>('2B');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [prevYear, setPrevYear] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ rowKey: string; bookBillNo: string; portalDocNo: string } | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [match, list] = await Promise.all([gstApi.getGstr2bMatch(period, prevYear), gstApi.listStatements()]);
      setData(match);
      setStatements(list.statements);
      setPicked(new Set());
      setEditing(null);
      if (match.statement?.source === '2A' || match.statement?.source === '2B') setSource(match.statement.source);
    } catch (err: any) {
      setError(err.message || 'Could not load the matching report.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, prevYear]);

  useEffect(() => { void load(); }, [load]);

  const act = async (work: () => Promise<string>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const message = await work();
      await load(true);
      setNotice(message);
    } catch (err: any) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const saveMatched = () => act(async () => {
    const { saved } = await gstApi.saveReconciliation({ period, prevYear, mode: 'matched' });
    return `${saved} matched bill(s) saved as reconciled for 3B month ${period}. They will not show in matching again.`;
  });

  const markDirect = () => act(async () => {
    const { saved } = await gstApi.saveReconciliation({ period, prevYear, mode: 'direct', rowKeys: Array.from(picked) });
    return `${saved} bill(s) marked directly as reconciled for 3B month ${period}.`;
  });

  const undo = (id: string) => act(async () => {
    await gstApi.undoReconciliation(id);
    return 'Reconciliation undone. The bill is back in matching.';
  });

  const saveBillNo = () => {
    if (!editing) return;
    const current = editing;
    void act(async () => {
      await gstApi.editMatchBillNo({ period, prevYear, ...current });
      return 'Bill no. updated and matching refreshed. Save reconciliation status to keep the matched bills.';
    });
  };

  const togglePick = (rowKey: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(rowKey)) next.delete(rowKey);
    else next.add(rowKey);
    return next;
  });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const contentBase64 = await readAsBase64(file);
      await gstApi.uploadStatement({ period, source, fileName: file.name, contentBase64 });
      await load();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this uploaded statement?')) return;
    setBusy(true);
    try {
      await gstApi.deleteStatement(id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not delete.');
    } finally {
      setBusy(false);
    }
  };

  const monthStatements = statements.filter(s => s.period === period);
  const rows = (data?.rows || []).filter(row => !filter || row.status === filter);
  const matchedCount = (data?.rows || []).filter(row => row.status === 'MATCHED').length;

  return (
    <>
      <Section title={`GSTR-2B / 2A from the CA · ${period}`}>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">Statement</span>
            <select className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold" value={source} onChange={e => setSource(e.target.value as '2B' | '2A')}>
              <option value="2B">GSTR-2B</option>
              <option value="2A">GSTR-2A</option>
            </select>
          </label>
          <label className={`${btnClass} cursor-pointer bg-indigo-600 text-white ${busy ? 'opacity-60' : ''}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload file (.xlsx / .json / .csv)
            <input type="file" accept=".xlsx,.xlsm,.json,.csv" className="hidden" disabled={busy}
              onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button type="button" onClick={() => void load(true)} disabled={busy || refreshing}
            className={`${btnClass} border border-indigo-200 bg-white text-indigo-700 disabled:opacity-60`}
            title="Match again with the latest entries. No need to upload the file again.">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh matching
          </button>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={prevYear} onChange={e => setPrevYear(e.target.checked)} />
            Show unreconciled purchase bills from previous financial year
          </label>
          {monthStatements.map(s => (
            <span key={s.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              {s.source}: {s.fileName || 'file'} · {s.rowCount} bills
              <button type="button" onClick={() => void remove(s.id)} className="text-rose-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
        <p className="px-4 pb-4 text-xs text-gray-500">
          Upload the portal download as is (GSTR-2B Excel with B2B and B2B-CDNR sheets, or the JSON). A plain sheet with GSTIN, invoice no., date,
          taxable and tax columns also works. Uploading again for the same month replaces the old file. 2B is used when both are uploaded.
        </p>
      </Section>

      {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
      {notice && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div>}
      {loading && <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" /></div>}

      {!loading && data && (
        <>
          {!data.statement && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              No statement uploaded for {period}. Without it every taxed purchase shows as "ABSENT IN 2A" (or "GST BLANK" when the party has no GSTIN).
            </p>
          )}
          <p className="mb-3 text-xs text-gray-500">
            Bills dated {formatDate(data.windowStart)} to {formatDate(data.toDate)} that are not saved as reconciled. Fix a bill no. or entry, press
            Refresh matching, then Save reconciliation status so those bills do not come back next month.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {data.summary.map(s => (
              <button key={s.status} type="button" onClick={() => setFilter(prev => (prev === s.status ? '' : s.status))} title={s.help}
                className={`rounded-xl border px-3 py-2 text-left ${STATUS_STYLE[s.status] || ''} ${filter === s.status ? 'ring-2 ring-indigo-500' : ''}`}>
                <div className="text-[10px] font-black uppercase leading-tight">{s.status}</div>
                <div className="text-lg font-black">{s.count}</div>
                <div className="text-[10px] font-semibold">Books tax {money(s.bookTax)} · Portal {money(s.portalTax)}</div>
              </button>
            ))}
          </div>
          <Section title={`Matching result${filter ? ` · ${filter}` : ''} · click a booked bill to edit`} right={
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void saveMatched()} disabled={busy || !matchedCount}
                className={`${btnClass} bg-emerald-600 text-white disabled:opacity-50`}
                title="Save all MATCHED bills as reconciled for this 3B month. They will not show in matching again.">
                <Save className="h-4 w-4" /> Save reconciliation status ({matchedCount})
              </button>
              <button type="button" onClick={() => void markDirect()} disabled={busy || !picked.size}
                className={`${btnClass} bg-indigo-600 text-white disabled:opacity-50`}
                title="Mark the ticked bills as reconciled even if they did not match.">
                <CheckCheck className="h-4 w-4" /> Mark ticked as reconciled ({picked.size})
              </button>
              <button type="button" onClick={() => void gstApi.downloadGstr2bMatchExcel(period, prevYear).catch(err => setError(err.message))} className={`${btnClass} bg-white text-indigo-700`}>
                <Download className="h-4 w-4" /> Excel
              </button>
            </div>
          }>
            <table className="w-full min-w-[1450px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className={thClass}>
                    <input type="checkbox" aria-label="Tick all" checked={rows.length > 0 && rows.every(row => picked.has(row.rowKey))}
                      onChange={e => setPicked(e.target.checked ? new Set(rows.map(row => row.rowKey)) : new Set())} />
                  </th>
                  {['Status', 'Party', 'GSTIN', 'Our V.No.', 'Party Bill No.', 'Bill Date', 'Books Taxable', 'Books Tax', 'Portal Bill No.', 'Portal Date', 'Portal Taxable', 'Portal Tax', 'Tax Diff', 'Remark'].map(h => <th key={h} className={thClass}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <EmptyRow cols={15} text="No bills." />}
                {rows.map(row => {
                  const isEditing = editing?.rowKey === row.rowKey;
                  const canEditBook = Boolean(row.book) && row.bookSource !== 'credit_debit_note';
                  return (
                    <tr key={row.rowKey} onClick={() => !isEditing && openEdit(row.editPath)}
                      className={`${row.editPath && !isEditing ? 'cursor-pointer hover:bg-indigo-50' : ''} ${isEditing ? 'bg-amber-50' : ''}`}>
                      <td className={tdCenter} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={picked.has(row.rowKey)} onChange={() => togglePick(row.rowKey)} />
                      </td>
                      <td className={tdClass}><span className={`rounded border px-1.5 py-0.5 text-[10px] font-black ${STATUS_STYLE[row.status] || ''}`}>{row.status}</span></td>
                      <td className={`${tdClass} font-bold`}>{row.partyName || '-'}</td>
                      <td className={tdClass}>{row.gstin || '-'}</td>
                      <td className={tdCenter}>{row.book?.voucherNo || '-'}</td>
                      <td className={tdCenter} onClick={e => isEditing && e.stopPropagation()}>
                        {isEditing && canEditBook
                          ? <input value={editing.bookBillNo} onChange={e => setEditing({ ...editing, bookBillNo: e.target.value })}
                              className="w-24 rounded border border-amber-300 px-1.5 py-1 text-xs" />
                          : (row.book?.billNo || '-')}
                      </td>
                      <td className={tdCenter}>{formatDate(row.book?.date)}</td>
                      <td className={tdNum}>{row.book ? money(row.book.taxable) : '-'}</td>
                      <td className={tdNum}>{row.book ? money(row.book.tax) : '-'}</td>
                      <td className={tdCenter} onClick={e => isEditing && e.stopPropagation()}>
                        {isEditing && row.portal
                          ? <input value={editing.portalDocNo} onChange={e => setEditing({ ...editing, portalDocNo: e.target.value })}
                              className="w-24 rounded border border-amber-300 px-1.5 py-1 text-xs" />
                          : (row.portal?.docNo || '-')}
                      </td>
                      <td className={tdCenter}>{formatDate(row.portal?.date)}</td>
                      <td className={tdNum}>{row.portal ? money(row.portal.taxable) : '-'}</td>
                      <td className={tdNum}>{row.portal ? money(row.portal.tax) : '-'}</td>
                      <td className={`${tdNum} ${row.taxDiff ? 'font-black text-rose-700' : ''}`}>{row.book && row.portal ? money(row.taxDiff) : '-'}</td>
                      <td className={`${tdClass} text-[11px]`} onClick={e => (row.status === 'MISMATCH' || isEditing) && e.stopPropagation()}>
                        {row.remark}
                        {row.status === 'MISMATCH' && !isEditing && (
                          <button type="button" className="ml-2 inline-flex items-center gap-1 font-black text-amber-700"
                            onClick={() => setEditing({ rowKey: row.rowKey, bookBillNo: row.book?.billNo || '', portalDocNo: row.portal?.docNo || '' })}>
                            <Pencil className="h-3 w-3" /> Edit bill no.
                          </button>
                        )}
                        {isEditing && (
                          <span className="ml-2 inline-flex gap-2">
                            <button type="button" disabled={busy} onClick={saveBillNo} className="font-black text-emerald-700">Save</button>
                            <button type="button" onClick={() => setEditing(null)} className="font-black text-slate-500">Cancel</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          <Section title={`Saved as reconciled · 3B month ${period} (${data.savedRows.length})`} right={
            <button type="button" onClick={() => setShowSaved(v => !v)} className={`${btnClass} bg-white text-indigo-700`}>
              {showSaved ? 'Hide' : 'Show'}
            </button>
          }>
            {showSaved && (
              <table className="w-full min-w-[1100px] border-collapse text-xs">
                <thead>
                  <tr>{['How', 'Status when saved', 'Party', 'GSTIN', 'Party Bill No.', 'Bill Date', 'Books Tax', 'Portal Bill No.', 'Portal Date', 'Portal Tax', 'Recon Date', ''].map(h => <th key={h} className={thClass}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {data.savedRows.length === 0 && <EmptyRow cols={12} text="Nothing saved for this 3B month yet." />}
                  {data.savedRows.map(rec => (
                    <tr key={rec.id}>
                      <td className={tdCenter}>{rec.method === 'DIRECT' ? 'Marked directly' : 'Matched'}</td>
                      <td className={tdCenter}><span className={`rounded border px-1.5 py-0.5 text-[10px] font-black ${STATUS_STYLE[rec.status] || ''}`}>{rec.status}</span></td>
                      <td className={`${tdClass} font-bold`}>{rec.partyName || '-'}</td>
                      <td className={tdClass}>{rec.gstin || '-'}</td>
                      <td className={tdCenter}>{rec.billNo || '-'}</td>
                      <td className={tdCenter}>{formatDate(rec.billDate)}</td>
                      <td className={tdNum}>{money(rec.bookTax)}</td>
                      <td className={tdCenter}>{rec.portalDocNo || '-'}</td>
                      <td className={tdCenter}>{formatDate(rec.portalDate)}</td>
                      <td className={tdNum}>{money(rec.portalTax)}</td>
                      <td className={tdCenter}>{formatDate(rec.reconciledAt?.slice(0, 10))}</td>
                      <td className={tdCenter}>
                        <button type="button" disabled={busy} onClick={() => void undo(rec.id)} className="inline-flex items-center gap-1 font-black text-rose-600">
                          <Undo2 className="h-3.5 w-3.5" /> Undo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </>
  );
};

/* -------------------------------- Problems -------------------------------- */

const ProblemTable: React.FC<{ title: string; rows: GstProblem[] }> = ({ title, rows }) => (
  <Section title={`${title} · click to fix the entry`}>
    <table className="w-full min-w-[1000px] border-collapse text-xs">
      <thead><tr>{['', 'Date', 'Doc No.', 'Series', 'Party', 'GSTIN', 'Problem'].map(h => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <EmptyRow cols={7} text="No problems found." />}
        {rows.map((row, i) => (
          <tr key={`${row.id}-${i}`} onClick={() => openEdit(row.editPath)} className="cursor-pointer hover:bg-indigo-50">
            <td className={tdCenter}>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${row.severity === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                {row.severity === 'error' ? 'ERROR' : 'CHECK'}
              </span>
            </td>
            <td className={tdCenter}>{formatDate(row.date)}</td>
            <td className={`${tdClass} font-bold`}>{row.docNo || '(blank)'}</td>
            <td className={tdClass}>{row.transactionType}</td>
            <td className={tdClass}>{row.partyName || '-'}</td>
            <td className={tdClass}>{row.partyGstin || '-'}</td>
            <td className={tdClass}>{row.issue}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </Section>
);

const ProblemsView: React.FC<{ period: string }> = ({ period }) => {
  const [data, setData] = useState<{ invalidGstins: GstProblem[]; problems: GstProblem[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    gstApi.getProblems(period).then(setData).catch(err => setError(err.message || 'Could not load.'));
  }, [period]);
  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>;
  if (!data) return <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" /></div>;
  return (
    <>
      <ProblemTable title="List of invalid GSTINs" rows={data.invalidGstins} />
      <ProblemTable title="List of data entry problems (sales, purchases, notes, challans)" rows={data.problems.filter(p => !data.invalidGstins.includes(p))} />
    </>
  );
};

/* ---------------------------------- Page ---------------------------------- */

export const GstReportsPage: React.FC<Props> = ({ onBack, erpSession }) => {
  const initial = useMemo(readUrl, []);
  const [report, setReport] = useState<ReportKey>(initial.report);
  const [period, setPeriod] = useState(initial.period);
  const [gstr1, setGstr1] = useState<Gstr1Report | null>(null);
  const [register, setRegister] = useState<Gstr3bRegisterReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [error, setError] = useState('');

  const isGstr1 = GSTR1_KEYS.includes(report);
  const is3b = report === 'gstr3b' || report === 'gstr3bForm';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('report', report);
    params.set('period', period);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [report, period]);

  useEffect(() => { setGstr1(null); setRegister(null); }, [period]);
  // A 2B upload on the matching screen changes the register's ITC split.
  useEffect(() => { if (report === 'match') setRegister(null); }, [report]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (isGstr1 && (!gstr1 || gstr1.period !== period)) {
        setLoading(true);
        setError('');
        try {
          const data = await gstApi.getGstr1(period);
          if (!cancelled) setGstr1(data);
        } catch (err: any) {
          if (!cancelled) setError(err.message || 'Could not load GSTR-1.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      if (is3b && (!register || register.period !== period)) {
        setLoading(true);
        setError('');
        try {
          const data = await gstApi.getGstr3bRegister(period);
          if (!cancelled) setRegister(data);
        } catch (err: any) {
          if (!cancelled) setError(err.message || 'Could not load GSTR-3B.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [report, period, isGstr1, is3b, gstr1, register]);

  const download = async (kind: 'gstr1' | 'gstr3b') => {
    setDownloading(kind);
    setError('');
    try {
      if (kind === 'gstr1') await gstApi.downloadGstr1Excel(period);
      else await gstApi.downloadGstr3bRegisterExcel(period);
    } catch (err: any) {
      setError(err.message || 'Download failed.');
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FB]">
      <ErpTopMenu title="GST Reports" erpSession={erpSession} showSessionActions onBackToCatalogue={onBack} />
      <main className="mx-auto max-w-[1500px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-gray-600">
            <ArrowLeft className="h-4 w-4" /> Back to ERP
          </button>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500">Return month</span>
              <input type="month" value={period} onChange={e => e.target.value && setPeriod(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold" />
            </label>
            <button type="button" onClick={() => void download('gstr1')} disabled={Boolean(downloading)} className={`${btnClass} bg-emerald-600 text-white disabled:opacity-60`}>
              {downloading === 'gstr1' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              GSTR-1 Excel (all in 1 file)
            </button>
            {is3b && (
              <button type="button" onClick={() => void download('gstr3b')} disabled={Boolean(downloading)} className={`${btnClass} bg-indigo-600 text-white disabled:opacity-60`}>
                {downloading === 'gstr3b' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                3B register Excel
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border bg-white p-2 shadow-sm">
            {REPORT_GROUPS.map(group => (
              <div key={group.title} className="mb-2">
                <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-widest text-indigo-700">{group.title}</p>
                {group.items.map(item => (
                  <button key={item.key} type="button" onClick={() => setReport(item.key)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${report === item.key ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-indigo-50'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
            <div className="mt-2 border-t pt-2">
              <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Not built yet</p>
              {NOT_BUILT.map(label => <p key={label} className="px-3 py-1 text-xs font-semibold text-gray-300">{label}</p>)}
            </div>
          </aside>

          <div className="min-w-0">
            {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
            {loading && <div className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" /></div>}
            {!loading && isGstr1 && gstr1 && (
              report === 'gstr1'
                ? <Gstr1Summary data={gstr1} onPick={setReport} />
                : <Gstr1Section report={report} data={gstr1} />
            )}
            {!loading && report === 'gstr3b' && register && <Gstr3bRegisterView data={register} />}
            {!loading && report === 'gstr3bForm' && register && <Gstr3bFormView data={register} />}
            {report === 'match' && <MatchView period={period} />}
            {report === 'problems' && <ProblemsView period={period} />}
          </div>
        </div>
      </main>
    </div>
  );
};
