import { X, Printer } from 'lucide-react';
import ZCleanLogo from './ZCleanLogo.jsx';
import { localDate } from '../utils/localDate.js';

// A statement can only cover days that have already happened, so the pickers
// below stop at today — same rule as the Revenue and Expenses tabs.
const TODAY     = localDate();
const CUR_YEAR  = Number(TODAY.slice(0, 4));
const CUR_MONTH = Number(TODAY.slice(5, 7));
const notFuture = (other) => (other && other < TODAY ? other : TODAY);

// ── Profit & Loss Statement ──────────────────────────────────────────────────
// Two-column layout (this year vs last) because a single year's figures show
// size but not direction — the comparison is what makes the statement useful.
//
// Revenue is grouped by service and expenses by category, mirroring how each is
// actually recorded, so every line traces back to real rows rather than an
// invented accounting bucket.
//
// Printing reuses the `print-receipt` rules already in index.css: everything
// outside this panel is hidden, so the output is the statement alone.
export default function ProfitLossModal({
  data, loading, onClose,
  period, onPeriodChange,
  year, onYearChange, years,
  month, onMonthChange, months,
  from, to, onFromChange, onToChange,
}) {
  const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = { fontVariantNumeric: 'tabular-nums' };
  const t = data?.totals;
  // Only compare when there is something to compare against.
  const hasPrev = !!t && (t.revenue_previous > 0 || t.expenses_previous > 0);

  const Section = ({ title, rows, totalLabel, totalCur, totalPrev }) => (
    <div className="mb-6">
      <div className={`pl-head grid ${hasPrev ? 'grid-cols-3' : 'grid-cols-2'} text-xs font-bold text-white`}
        style={{ background: 'var(--brand)' }}>
        <div className="px-3 py-2">{title}</div>
        {hasPrev && <div className="px-3 py-2 text-right">{data.previous_label}</div>}
        <div className="px-3 py-2 text-right">{data.label}</div>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
          No records for either year.
        </div>
      ) : rows.map((r, i) => (
        <div key={r.label} className={`pl-row ${i % 2 ? 'pl-alt' : ''} grid ${hasPrev ? 'grid-cols-3' : 'grid-cols-2'} text-xs`}
          style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--surface2)' : 'transparent' }}>
          <div className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{r.label}</div>
          {hasPrev && <div className="px-3 py-2 text-right" style={{ color: 'var(--text-primary)' , ...num }}>{peso(r.previous)}</div>}
          <div className="px-3 py-2 text-right" style={{ color: 'var(--text-primary)' , ...num }}>{peso(r.current)}</div>
        </div>
      ))}
      <div className={`pl-total grid ${hasPrev ? 'grid-cols-3' : 'grid-cols-2'} text-xs font-bold`} style={{ borderBottom: '2px solid var(--border)' }}>
        <div className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{totalLabel}</div>
        {hasPrev && <div className="px-3 py-2 text-right" style={{ color: 'var(--text-primary)' , ...num }}>{peso(totalPrev)}</div>}
        <div className="px-3 py-2 text-right" style={{ color: 'var(--text-primary)' , ...num }}>{peso(totalCur)}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print-overlay"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto print-receipt"
        style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} aria-label="Close"
            className="float-right no-print" style={{ color: 'var(--text-muted)' }}>
            <X size={18}/>
          </button>
          {/* Letterhead — a printed statement leaves the app, so it has to
              identify the business on its own. */}
          <div className="flex items-center gap-3">
            <ZCleanLogo size={44} />
            <div>
              <h2 className="font-serif font-black text-xl leading-tight" style={{ color: 'var(--text-primary)' }}>
                Profit and Loss
              </h2>
              <p className="font-serif text-base leading-tight" style={{ color: 'var(--text-muted)' }}>
                Statement Report
              </p>
            </div>
          </div>
          <div className="mt-2 pt-2" style={{ borderTop: '2px solid var(--brand)' }}>
            <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Z's Cleaning Services</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Calbayog City, Samar · 0916-213-3460
            </p>
          </div>
          {data?.label && (
            <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--brand)' }}>{data.label}</p>
          )}

          {/* Period controls — hidden when printing, since the statement
              itself already states the period it covers. */}
          <div className="mt-3 no-print flex flex-wrap items-end gap-2">
            <div>
              <label className="label">Period</label>
              <select className="input text-sm" value={period} style={{ minWidth: 120 }}
                onChange={e => onPeriodChange(e.target.value)}>
                <option value="yearly">Yearly</option>
                <option value="monthly">Monthly</option>
                <option value="range">Custom range</option>
              </select>
            </div>

            {period === 'monthly' && (
              <div>
                <label className="label">Month</label>
                <select className="input text-sm" value={month}
                  onChange={e => onMonthChange(Number(e.target.value))}>
                  {months.map((m, i) => (
                    <option key={m} value={i + 1} disabled={year === CUR_YEAR && i + 1 > CUR_MONTH}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {period !== 'range' && (
              <div>
                <label className="label">Year</label>
                <select className="input text-sm" value={year} style={{ maxWidth: 110 }}
                  onChange={e => onYearChange(Number(e.target.value))}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}

            {period === 'range' && (
              <>
                <div>
                  <label className="label">From</label>
                  <input type="date" className="input text-sm" value={from} max={notFuture(to)}
                    onChange={e => onFromChange(e.target.value)} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" className="input text-sm" value={to} min={from || undefined} max={TODAY}
                    onChange={e => onToChange(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-5">
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
              ))}
            </div>
          ) : period === 'range' && (!from || !to) ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Choose a start and end date above.
            </p>
          ) : !data ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Couldn't load the statement.
            </p>
          ) : (
            <>
              <Section title="Revenue" rows={data.revenue}
                totalLabel="Total Revenue"
                totalCur={t.revenue_current} totalPrev={t.revenue_previous} />

              <Section title="Expenses" rows={data.expenses}
                totalLabel="Total Expenses"
                totalCur={t.expenses_current} totalPrev={t.expenses_previous} />

              {/* Net profit band */}
              <div className="pl-net" style={{ background: 'var(--brand-pale)' }}>
                <div className={`grid ${hasPrev ? 'grid-cols-3' : 'grid-cols-2'} text-xs font-bold`}>
                  <div className="px-3 py-2.5" style={{ color: 'var(--text-primary)' }}>Net Profit (Loss)</div>
                  {hasPrev && (
                    <div className="px-3 py-2.5 text-right"
                      style={{ color: t.net_previous < 0 ? '#dc2626' : 'var(--brand)' , ...num }}>
                      {peso(t.net_previous)}
                    </div>
                  )}
                  <div className="px-3 py-2.5 text-right text-sm"
                    style={{ color: t.net_current < 0 ? '#dc2626' : 'var(--brand)' }}>
                    {peso(t.net_current)}
                  </div>
                </div>
              </div>

              <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
                Revenue is recorded when payment is received. The business is not VAT-registered,
                so net profit is revenue less expenses with no tax line.
              </p>

              {/* Footer identity, so a printed copy stands alone */}
              <div className="flex items-center justify-between mt-6 pt-3 text-[10px]"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <span>Generated {new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}</span>
                <span>Z's Cleaning Services</span>
              </div>
            </>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-2 no-print">
          <div className="flex-1">
            <button onClick={() => window.print()} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
              <Printer size={14}/> Print / Download PDF
            </button>
            {/* The browser's own print dialog carries the choice: its
                Destination list includes "Save as PDF". A separate Download
                button would open the same dialog, so offering two would be a
                fake choice. */}
            <p className="text-[10px] text-center mt-1.5" style={{ color: 'var(--text-muted)' }}>
              To download, choose <strong>Save as PDF</strong> as the destination.
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary text-sm px-4 self-start">Close</button>
        </div>
      </div>
    </div>
  );
}
