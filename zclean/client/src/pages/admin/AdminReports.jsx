import { useEffect, useState } from 'react';
import { TrendingUp, Banknote, Receipt, Calendar, CalendarDays, Plus, Trash2, X, Download, BarChart2, AlertTriangle, FileText} from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import AdminLayout from '../../components/AdminLayout.jsx';
import { localDate } from '../../utils/localDate.js';
import { usePolling } from '../../hooks/usePolling.jsx';
import { downloadCSV } from '../../utils/csv.js';
import ProfitLossModal from '../../components/ProfitLossModal.jsx';
import ConfirmModal from '../../components/ConfirmModal.jsx';
import { reportsAPI, expensesAPI, calendarAPI } from '../../services/api.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TODAY  = localDate();
// Revenue and expenses can only report on days that have already happened, so
// every backward-looking picker stops at today. Taken from TODAY (which is
// local, not UTC) rather than new Date() so this agrees with the rest of the
// page in Philippine time.
const CUR_YEAR  = Number(TODAY.slice(0, 4));
const CUR_MONTH = Number(TODAY.slice(5, 7));
// A "to" bound that is never in the future: the other end of the range if it is
// earlier, otherwise today.
const notFuture = (other) => (other && other < TODAY ? other : TODAY);
// Year options for the report selectors: the current year plus the four before
// it. Generated rather than hardcoded so the list never goes stale.
// Year options run from the current year back to the year the system went
// live. Offering earlier years would list periods that cannot contain data —
// ZClean holds no records from before it existed.
const SYSTEM_START_YEAR = 2026;
const YEARS = Array.from(
  { length: Math.max(1, new Date().getFullYear() - SYSTEM_START_YEAR + 1) },
  (_, i) => new Date().getFullYear() - i,
);

// ── KPI sparkline ────────────────────────────────────────────────────────────
// A trend line in the empty lower half of each stat card. The "+6% vs last
// month" badge says the direction; this shows the shape that produced it — one
// good month after a flat run reads very differently from steady growth.
// Deliberately axis-free and tooltip-free: it is context for the big number,
// not a chart to interrogate. The Charts tab is for that.
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const id = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div style={{ height: 34, marginTop: 6 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.28}/>
              <stop offset="100%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8}
            fill={`url(#${id})`} dot={false} isAnimationActive={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Custom chart tooltip — replaces Recharts' plain default white box with one
// styled to match the rest of the app's card/border/shadow design system.
// isCurrency: pass true for charts showing peso amounts, false for plain counts.
const ChartTooltip = ({ active, payload, label, isCurrency = true }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="card p-3" style={{ boxShadow: 'var(--shadow-lg)', minWidth: 140 }}>
      {label && <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }}/>
            {p.name}
          </span>
          <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {isCurrency ? `₱${Number(p.value).toLocaleString()}` : `${p.value} bookings`}
          </span>
        </div>
      ))}
    </div>
  );
};


// ── CSV export helper ─────────────────────────────────────────────────────────

export default function AdminReports() {
  const now     = new Date();
  const [confirmState, setConfirmState] = useState(null);
  const [tab,   setTab]   = useState('revenue');
  // Which period the Revenue tab shows: a calendar month, a calendar year, or
  // an arbitrary span between two dates. Monthly and yearly were separate tabs
  // showing near-identical layouts; they are now one report over three spans.
  const [period,    setPeriod]    = useState('monthly');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo,   setRangeTo]   = useState('');
  const [rangeData, setRangeData] = useState(null);

  // ── Expense sorting / filtering ──
  // Applied client-side: the list is already fully loaded, so filtering here
  // is instant and avoids a round-trip per keystroke.
  // ── Profit & loss statement ──
  const [plOpen,    setPlOpen]    = useState(false);
  const [plYear,    setPlYear]    = useState(new Date().getFullYear());
  const [plPeriod,  setPlPeriod]  = useState('yearly');
  const [plMonth,   setPlMonth]   = useState(new Date().getMonth() + 1);
  const [plFrom,    setPlFrom]    = useState('');
  const [plTo,      setPlTo]      = useState('');
  const [plData,    setPlData]    = useState(null);
  const [plLoading, setPlLoading] = useState(false);
  useEffect(() => {
    if (!plOpen) return;
    setPlLoading(true);
    reportsAPI.profitLoss({ period: plPeriod, year: plYear, month: plMonth, from: plFrom, to: plTo })
      .then(r => setPlData(r.data))
      .catch(() => setPlData(null))
      .finally(() => setPlLoading(false));
  }, [plOpen, plPeriod, plYear, plMonth, plFrom, plTo]);

  const [expSort,  setExpSort]  = useState('date_desc');
  const [expFrom,  setExpFrom]  = useState('');
  const [expTo,    setExpTo]    = useState('');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [monthly,  setMonthly]  = useState(null);
  const [yearly,   setYearly]   = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [blocked,  setBlocked]  = useState([]);
  const [chartData,   setChartData]   = useState(null);   // yearly data for charts
  const [svcStats,    setSvcStats]    = useState([]);      // service popularity
  const [chartYear,   setChartYear]   = useState(new Date().getFullYear());
  const [chartsLoading, setChartsLoading] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Expense form
  const [expForm,  setExpForm]  = useState({ category:'', description:'', amount:'', expense_date: TODAY });
  const [expErr,   setExpErr]   = useState('');
  const [expMsg,   setExpMsg]   = useState('');
  const [saving,   setSaving]   = useState(false);

  // Block date
  const [blockDate,setBlockDate]= useState('');
  const [blockMsg, setBlockMsg] = useState('');

  /* ---- Load monthly / yearly ---- */
  const loadReport = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);   // background refresh keeps the figures on screen
      setLoadError(false);
      if (tab === 'revenue') {
        // Monthly buckets for the card sparklines. Same data the Charts tab
        // uses, fetched here so the KPI cards can show a trend line.
        if (period !== 'range') {
          reportsAPI.yearly({ year }).then(r => setChartData(r.data)).catch(() => {});
        }
        if (period === 'monthly') {
          const res = await reportsAPI.monthly({ year, month });
          setMonthly(res.data);
        } else if (period === 'yearly') {
          const res = await reportsAPI.yearly({ year });
          setYearly(res.data);
        } else if (period === 'range' && rangeFrom && rangeTo) {
          const res = await reportsAPI.range({ from: rangeFrom, to: rangeTo });
          setRangeData(res.data);
        }
      } else if (tab === 'expenses') {
        const res = await expensesAPI.list();
        setExpenses(res.data || []);
      } else if (tab === 'calendar') {
        const res = await calendarAPI.getBlocked();
        setBlocked(res.data || []);
      } else if (tab === 'charts') {
        setChartsLoading(true);
        const [yearRes, svcRes] = await Promise.all([
          reportsAPI.yearly({ year: chartYear }),
          reportsAPI.serviceStats({ year: chartYear }),
        ]);
        setChartData(yearRes.data);
        setSvcStats(svcRes.data || []);
        setChartsLoading(false);
      }
    } catch { setChartsLoading(false); setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadReport(); }, [tab, period, year, month, chartYear, rangeFrom, rangeTo]);
  // Figures refresh on their own, but more slowly than the other screens:
  // a report is read carefully, and numbers moving under the reader's eyes
  // is worse than being a minute out of date.
  usePolling(() => loadReport(true), 60000);

  /* ---- Expense CRUD ---- */
  const addExpense = async () => {
    if (!expForm.category || !expForm.amount || !expForm.expense_date) return setExpErr('Item, amount, and date are required.');
    try {
      setSaving(true); setExpErr('');
      await expensesAPI.create(expForm);
      setExpMsg('Expense added.');
      setExpForm({ category:'', description:'', amount:'', expense_date: TODAY });
      const res = await expensesAPI.list();
      setExpenses(res.data || []);
    } catch (e) { setExpErr(e.response?.data?.message || 'Error.'); }
    finally { setSaving(false); }
  };

  const deleteExpense = (id) => {
    setConfirmState({
      message: 'Delete this expense?',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await expensesAPI.delete(id);
          setExpenses(prev => prev.filter(e => e.id !== id));
          setExpMsg('Expense deleted.');
        } catch { }
      },
    });
  };

  /* ---- Block/unblock dates ---- */
  const addBlock = async () => {
    if (!blockDate) return;
    try {
      await calendarAPI.block({ date: blockDate });
      setBlockMsg(`${blockDate} blocked.`);
      setBlockDate('');
      const res = await calendarAPI.getBlocked();
      setBlocked(res.data || []);
    } catch (e) { setBlockMsg(e.response?.data?.message || 'Error.'); }
  };

  const removeBlock = async (id) => {
    try {
      await calendarAPI.unblock(id);
      setBlocked(prev => prev.filter(d => d.id !== id));
    } catch { }
  };

  const fmtPHP = (n) => `₱${Number(n || 0).toLocaleString()}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });

  // Sparkline series from the yearly monthly buckets.
  //  • Monthly period → the six months ending at the selected one, so the line
  //    leads up to the number shown rather than running past it.
  //  • Yearly period  → all twelve months of that year.
  // A custom range has no comparable series, so it gets none.
  const sparkFor = (key) => {
    const m = chartData?.monthly;
    if (!m || period === 'range') return null;
    const series = m.map(x => ({ v: parseFloat(x[key] || 0) }));
    return period === 'monthly' ? series.slice(Math.max(0, month - 6), month) : series;
  };

  // Filtered + sorted expenses. Everything downstream (the table, the total,
  // the CSV) reads from this one list, so what you see is exactly what you
  // export.
  const visibleExpenses = expenses
    .filter(e => {
      const d = String(e.expense_date).slice(0, 10);
      if (expFrom && d < expFrom) return false;
      if (expTo   && d > expTo)   return false;
      return true;
    })
    .sort((a, b) => {
      const da = String(a.expense_date).slice(0, 10);
      const db = String(b.expense_date).slice(0, 10);
      switch (expSort) {
        case 'date_asc':    return da.localeCompare(db);
        case 'amount_desc': return parseFloat(b.amount) - parseFloat(a.amount);
        case 'amount_asc':  return parseFloat(a.amount) - parseFloat(b.amount);
        default:            return db.localeCompare(da);   // date_desc
      }
    });

  const visibleExpTotal = visibleExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  const exportExpenses = () => downloadCSV(
    visibleExpenses.map(e => ({
      Date:        fmtDate(e.expense_date),
      Item:        e.category,
      Note:        e.description || '',
      'Amount (PHP)': parseFloat(e.amount || 0),
      'Recorded By': e.recorded_by_name || '',
    })),
    `ZClean_Expenses_${expFrom || 'all'}_to_${expTo || 'all'}.csv`
  );

  /* ---- Bar chart helper ---- */
  const maxBar = (arr) => Math.max(...arr.map(x => Number(x || 0)), 1);

  return (
    <>
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-[var(--fg)] mb-6">Reports</h1>

        {/* Tab Nav — data/report tabs on left, management action (Block Dates) on right */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div className="flex flex-wrap gap-1 border border-[var(--border)] rounded-xl overflow-hidden w-fit">
            {[
              // Monthly and yearly are the same report over different periods,
              // so they live under one Revenue tab with a period selector
              // rather than two tabs showing near-identical layouts.
              {key:'revenue', label:'Revenue'},
              {key:'expenses',label:'Expenses'},
              {key:'charts',  label:'Charts'},
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium transition flex items-center gap-1.5
                  ${tab===t.key ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--fg)]'}`}>
                {t.key === 'charts' && <BarChart2 size={14}/>}
                {t.label}
              </button>
            ))}
          </div>
          {/* Block Dates — management action, visually separate from report views */}
          <button onClick={() => setTab('calendar')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              tab === 'calendar'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)]'
            }`}>
            <CalendarDays size={15}/> Block Dates
          </button>
        </div>

        {/* Period selector — Revenue tab only. One report, three spans. */}
        {tab === 'revenue' && (
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <div>
              <label className="label">Period</label>
              <select className="input text-sm" value={period}
                onChange={e => setPeriod(e.target.value)} style={{ minWidth: 150 }}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="range">Custom date range</option>
              </select>
            </div>

            {period === 'monthly' && (
              <>
                <div>
                  <label className="label">Month</label>
                  <select className="input text-sm" value={month} onChange={e => setMonth(Number(e.target.value))}>
                    {/* Months that haven't happened yet in the current year are
                        greyed out — they can only ever report ₱0, which looks
                        like a broken report rather than an empty period. */}
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1} disabled={year === CUR_YEAR && i + 1 > CUR_MONTH}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Year</label>
                  <select className="input text-sm" value={year}
                    onChange={e => {
                      const y = Number(e.target.value);
                      setYear(y);
                      // Switching from an older year back to this one could leave
                      // a month that hasn't happened yet selected; pull it back.
                      if (y === CUR_YEAR && month > CUR_MONTH) setMonth(CUR_MONTH);
                    }}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </>
            )}

            {period === 'yearly' && (
              <div>
                <label className="label">Year</label>
                <select className="input text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}

            {period === 'range' && (
              <>
                <div>
                  <label className="label">From</label>
                  <input type="date" className="input text-sm" value={rangeFrom} max={notFuture(rangeTo)}
                    onChange={e => setRangeFrom(e.target.value)} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" className="input text-sm" value={rangeTo} min={rangeFrom || undefined} max={TODAY}
                    onChange={e => setRangeTo(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Load failure banner — covers all tabs; loadReport re-runs on tab
            change so the flag resets automatically */}
        {!loading && loadError && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3 mb-4"
            style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p className="text-sm font-medium" style={{ color: '#b91c1c' }}>
              <AlertTriangle size={16} className="inline mr-1.5 -mt-0.5"/>Couldn't load this report — the data shown may be incomplete.
            </p>
            <button onClick={loadReport} className="btn-primary" style={{ padding: '6px 16px' }}>Retry</button>
          </div>
        )}

        {/* ---- Monthly ---- */}
        {tab === 'revenue' && period === 'monthly' && (
          <div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="card p-4 space-y-2">
                    <div className="h-2.5 w-16 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                    <div className="h-5 w-20 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                  </div>
                ))}
              </div>
            ) : monthly && (
              <>
                {/* Financial metrics — primary group, larger weight, with icons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  {[
                    {label:'Gross Revenue',  value: fmtPHP(monthly.gross_revenue),  trend: monthly.revenue_trend,  goodIsUp: true,  icon: <Banknote size={18}/>,   spark: sparkFor('earnings'), color: 'var(--brand)'},
                    {label:'Total Expenses', value: fmtPHP(monthly.total_expenses), trend: monthly.expenses_trend, goodIsUp: false, icon: <Receipt size={18}/>,    spark: sparkFor('expenses'), color: '#e57373'},
                    {label:'Net Income',     value: fmtPHP(monthly.net_income),     trend: monthly.net_trend,      goodIsUp: true,  icon: <TrendingUp size={18}/>, spark: sparkFor('net'),      color: '#2CC295'},
                  ].map((s,i) => (
                    <div key={i} className="card p-5" style={{ border: '1.5px solid var(--brand)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{ color: 'var(--brand)' }}>{s.icon}</span>
                        <p className="eyebrow !mb-0">{s.label}</p>
                      </div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <p className="text-2xl font-bold text-[var(--brand)]">{s.value}</p>
                        {s.trend !== undefined && s.trend !== null && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                            (s.trend >= 0) === s.goodIsUp
                              ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950'
                              : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950'
                          }`}>
                            {s.trend >= 0 ? '↑' : '↓'} {Math.abs(s.trend)}%
                          </span>
                        )}
                      </div>
                      {s.trend !== undefined && (
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>vs last month</p>
                      )}
                      {s.spark && <Sparkline data={s.spark} color={s.color}/>}
                    </div>
                  ))}
                </div>

                {/* Activity metrics — secondary group, smaller, no icons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    {label:'Total Bookings', value: monthly.total_bookings ?? 0},
                    {label:'Pending',        value: monthly.pending ?? 0},
                    {label:'Completed',      value: monthly.completed ?? 0},
                    // Attrition — reported separately from the fulfilment
                    // figures above, and muted so it never reads as revenue.
                    {label:'Cancelled',      value: monthly.cancelled ?? 0, muted: true},
                  ].map((s,i) => (
                    <div key={i} className="card p-3.5">
                      <p className="eyebrow mb-1">{s.label}</p>
                      <p className="text-lg font-bold"
                        style={{ color: s.muted ? 'var(--text-muted)' : 'var(--text-primary)' }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Export button */}
                <div className="flex justify-end mt-4 mb-2">
                  <button
                    onClick={() => {
                      const rows = (monthly.bookings || []).map(b => ({
                        'Booking #': b.id,
                        'Client': b.client_name,
                        'Service': b.service_name,
                        'Date': b.date,
                        'Payment': b.payment_method,
                        'Amount (₱)': b.paid_amount || b.service_price || '',
                        'Status': b.status,
                      }));
                      downloadCSV(rows, `ZClean_Monthly_${MONTHS[month-1]}_${year}.csv`);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}>
                    <Download size={14}/> Export CSV
                  </button>
                </div>

                {/* Daily revenue bars */}
                {monthly.daily?.length > 0 && (
                  <div className="card p-5">
                    <p className="eyebrow mb-4">Daily Revenue</p>
                    <div className="flex items-end gap-1 h-28">
                      {monthly.daily.map((d,i) => {
                        const pct = (Number(d.revenue || 0) / maxBar(monthly.daily.map(x=>x.revenue))) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <div className="absolute bottom-full mb-1 text-xs bg-[var(--fg)] text-[var(--bg)] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
                              {fmtPHP(d.revenue)}
                            </div>
                            <div className="w-full bg-[var(--brand)] rounded-t" style={{height:`${pct}%`, minHeight: pct > 0 ? 4 : 0}} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-[var(--muted)] mt-1">
                      <span>1</span><span>{monthly.daily.length}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- Custom date range ---- */}
        {tab === 'revenue' && period === 'range' && (
          <div>
            {!rangeFrom || !rangeTo ? (
              <div className="card p-10 text-center">
                <CalendarDays size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }}/>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Choose a date range</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Pick a start and end date above to see revenue for that period.
                </p>
              </div>
            ) : loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <div key={i} className="card p-4 h-24 animate-pulse" style={{ background: 'var(--surface2)' }}/>)}
              </div>
            ) : rangeData && (
              <>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  {fmtDate(rangeData.from)} — {fmtDate(rangeData.to)}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    {label:'Gross Revenue',  value:`₱${Number(rangeData.gross_revenue).toLocaleString()}`},
                    {label:'Total Expenses', value:`₱${Number(rangeData.total_expenses).toLocaleString()}`},
                    {label:'Net Income',     value:`₱${Number(rangeData.net_income).toLocaleString()}`, brand:true},
                    {label:'Total Bookings', value: rangeData.total_bookings ?? 0},
                  ].map((c,i) => (
                    <div key={i} className="card p-4">
                      <p className="eyebrow mb-1">{c.label}</p>
                      <p className="text-lg font-bold"
                        style={{ color: c.brand ? 'var(--brand)' : 'var(--text-primary)' }}>{c.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    {label:'Pending',   value: rangeData.pending},
                    {label:'Confirmed', value: rangeData.confirmed},
                    {label:'Completed', value: rangeData.completed},
                    {label:'Cancelled', value: rangeData.cancelled, muted:true},
                  ].map((c,i) => (
                    <div key={i} className="card p-3.5">
                      <p className="eyebrow mb-1">{c.label}</p>
                      <p className="text-lg font-bold"
                        style={{ color: c.muted ? 'var(--text-muted)' : 'var(--text-primary)' }}>{c.value ?? 0}</p>
                    </div>
                  ))}
                </div>

                <button onClick={() => downloadCSV([{
                  From: rangeData.from, To: rangeData.to,
                  'Gross Revenue': rangeData.gross_revenue,
                  'Total Expenses': rangeData.total_expenses,
                  'Net Income': rangeData.net_income,
                  'Total Bookings': rangeData.total_bookings,
                  Pending: rangeData.pending, Confirmed: rangeData.confirmed,
                  Completed: rangeData.completed, Cancelled: rangeData.cancelled,
                }], `ZClean_Revenue_${rangeData.from}_to_${rangeData.to}.csv`)}
                  className="btn-secondary text-sm flex items-center gap-2">
                  <Download size={14}/> Export CSV
                </button>
              </>
            )}
          </div>
        )}

        {/* ---- Yearly ---- */}
        {tab === 'revenue' && period === 'yearly' && (
          <div>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="card p-4 space-y-2">
                    <div className="h-2.5 w-16 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                    <div className="h-5 w-20 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                  </div>
                ))}
              </div>
            ) : yearly && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                  {[
                    {label:'Gross Revenue',  value: fmtPHP(yearly.gross_revenue),  spark: sparkFor('earnings'), color: 'var(--brand)'},
                    {label:'Total Expenses', value: fmtPHP(yearly.total_expenses), spark: sparkFor('expenses'), color: '#e57373'},
                    {label:'Net Income',     value: fmtPHP(yearly.net_income),     spark: sparkFor('net'),      color: '#2CC295'},
                    {label:'Total Bookings', value: yearly.total_bookings ?? yearly.total_done ?? 0},
                    {label:'Cancelled',      value: yearly.total_cancelled ?? 0, muted: true},
                  ].map((s,i) => (
                    <div key={i} className="card p-4">
                      <p className="eyebrow mb-1">{s.label}</p>
                      <p className="text-xl font-bold"
                        style={{ color: s.muted ? 'var(--text-muted)' : 'var(--brand)' }}>{s.value}</p>
                      {s.spark && <Sparkline data={s.spark} color={s.color}/>}
                    </div>
                  ))}
                </div>

                {/* Export yearly CSV */}
                <div className="flex justify-end mt-4 mb-2">
                  <button
                    onClick={() => {
                      const rows = (yearly.monthly || []).map((m, i) => ({
                        'Month': MONTHS[i],
                        'Revenue (₱)': m.revenue || 0,
                        'Expenses (₱)': m.expenses || 0,
                        'Net (₱)': m.net || 0,
                      }));
                      downloadCSV(rows, `ZClean_Yearly_${year}.csv`);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}>
                    <Download size={14}/> Export CSV
                  </button>
                </div>

                {/* Monthly bars */}
                {yearly.monthly?.length > 0 && (
                  <div className="card p-5">
                    <p className="eyebrow mb-4">Revenue by Month</p>
                    <div className="flex items-end gap-2 h-32">
                      {yearly.monthly.map((m,i) => {
                        const pct = (Number(m.revenue || 0) / maxBar(yearly.monthly.map(x=>x.revenue))) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                            <div className="absolute bottom-full mb-1 text-xs bg-[var(--fg)] text-[var(--bg)] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
                              {fmtPHP(m.revenue)}
                            </div>
                            <div className="w-full bg-[var(--brand)] rounded-t transition-all" style={{height:`${pct}%`, minHeight: pct > 0 ? 4 : 0}} />
                            <span className="text-[10px] text-[var(--muted)]">{MONTHS[i]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- Expenses ---- */}
        {tab === 'expenses' && (
          <div>
            {expMsg && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--brand-pale)] text-[var(--brand)] text-sm flex justify-between">
                {expMsg} <button onClick={()=>setExpMsg('')}><X size={14}/></button>
              </div>
            )}

            {/* Add form */}
            <div className="card p-5 mb-5">
              <p className="font-semibold text-[var(--fg)] mb-3">Add Expense</p>
              {expErr && <p className="text-red-500 text-sm mb-3">{expErr}</p>}
              {/* One row: Item and Note sit side by side rather than stacked, so
                  the four fields share a single line instead of the first
                  column running twice as tall as the others. */}
              <div className="grid sm:grid-cols-4 gap-3">
                <div>
                  <label className="label">Item</label>
                  <input className="input" value={expForm.category} onChange={e=>setExpForm(f=>({...f,category:e.target.value}))} placeholder="e.g. Cleaning supplies" />
                </div>
                <div>
                  <label className="label">Note (optional)</label>
                  <input className="input" value={expForm.description} onChange={e=>setExpForm(f=>({...f,description:e.target.value}))} placeholder="e.g. 2 gallons bleach" />
                </div>
                <div>
                  <label className="label">Amount (₱)</label>
                  <input type="number" className="input" value={expForm.amount} onChange={e=>setExpForm(f=>({...f,amount:e.target.value}))} />
                </div>
                <div>
                  <label className="label">Date</label>
                  {/* An expense is money already spent, so it cannot be dated
                      in the future — that would also distort this month's
                      totals and the profit & loss statement. */}
                  <input type="date" className="input" max={TODAY} value={expForm.expense_date} onChange={e=>setExpForm(f=>({...f,expense_date:e.target.value}))} />
                </div>
              </div>
              <button onClick={addExpense} disabled={saving} className="btn-primary text-sm mt-3 flex items-center gap-2">
                {saving ? 'Adding...' : <><Plus size={14}/> Add</>}
              </button>
            </div>

            {/* Sort / filter / export toolbar */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="label">Sort by</label>
                <select className="input text-sm" value={expSort}
                  onChange={e => setExpSort(e.target.value)} style={{ minWidth: 170 }}>
                  <option value="date_desc">Date — newest first</option>
                  <option value="date_asc">Date — oldest first</option>
                  <option value="amount_desc">Amount — highest first</option>
                  <option value="amount_asc">Amount — lowest first</option>
                </select>
              </div>
              <div>
                <label className="label">From</label>
                <input type="date" className="input text-sm" value={expFrom} max={notFuture(expTo)}
                  onChange={e => setExpFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input type="date" className="input text-sm" value={expTo} min={expFrom || undefined} max={TODAY}
                  onChange={e => setExpTo(e.target.value)} />
              </div>
              {(expFrom || expTo) && (
                <button onClick={() => { setExpFrom(''); setExpTo(''); }}
                  className="btn-secondary text-sm">Clear dates</button>
              )}
              <button onClick={exportExpenses} disabled={visibleExpenses.length === 0}
                className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40 ml-auto">
                <Download size={14}/> Export CSV
              </button>
            </div>

            {/* Total for whatever is currently shown, so the figure always
                matches the rows and the export. */}
            {!loading && visibleExpenses.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl mb-3"
                style={{ background: 'var(--surface2)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {visibleExpenses.length} expense{visibleExpenses.length === 1 ? '' : 's'}
                  {(expFrom || expTo) ? ' in range' : ''}
                </span>
                <span className="text-sm font-bold" style={{ color: 'var(--brand)' }}>
                  ₱{visibleExpTotal.toLocaleString()}
                </span>
              </div>
            )}

            {/* Expense list */}
            {loading ? (
              <div className="card overflow-hidden">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="h-3.5 w-40 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                    <div className="h-3.5 w-16 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card overflow-hidden">
                {visibleExpenses.length === 0 ? (
                  <p className="text-center text-[var(--muted)] py-10 text-sm">
                    {expenses.length === 0 ? 'No expenses recorded.' : 'No expenses match these dates.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface)] border-b border-[var(--border)]">
                      <tr>
                        {['Date','Item','Amount',''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {visibleExpenses.map(e => (
                        <tr key={e.id} className="hover:bg-[var(--surface)] transition">
                          <td className="px-4 py-3 text-[var(--muted)]">{fmtDate(e.expense_date)}</td>
                          <td className="px-4 py-3 text-[var(--fg)]">
                            <span className="font-medium">{e.category}</span>
                            {e.description && (
                              <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{e.description}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-red-500">-{fmtPHP(e.amount)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => deleteExpense(e.id)} className="p-1 text-red-400 hover:bg-red-50 rounded">
                              <Trash2 size={14}/>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- Calendar / Block Dates ---- */}
        {tab === 'calendar' && (
          <div>
            {blockMsg && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--brand-pale)] text-[var(--brand)] text-sm flex justify-between">
                {blockMsg} <button onClick={()=>setBlockMsg('')}><X size={14}/></button>
              </div>
            )}

            <div className="card p-5 mb-5">
              <p className="font-semibold text-[var(--fg)] mb-3">Block a Date</p>
              <p className="text-sm text-[var(--muted)] mb-3">Clients won't be able to book on blocked dates.</p>
              <div className="flex gap-3">
                <input type="date" className="input flex-1" min={TODAY}
                  value={blockDate} onChange={e => setBlockDate(e.target.value)} />
                <button onClick={addBlock} disabled={!blockDate} className="btn-primary text-sm px-5 flex items-center gap-1">
                  <Plus size={14}/> Block
                </button>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)]">
                <p className="font-semibold text-[var(--fg)]">Blocked Dates ({blocked.length})</p>
              </div>
              {loading ? (
                <div className="p-5 space-y-3">
                  {[1,2].map(i => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="h-3.5 w-32 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                      <div className="h-3.5 w-10 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                    </div>
                  ))}
                </div>
              ) : blocked.length === 0 ? (
                <p className="text-center text-[var(--muted)] py-10 text-sm">No dates blocked.</p>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {blocked.map((d,i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <span className="text-[var(--fg)] text-sm font-semibold">{fmtDate(d.date)}</span>
                        {d.reason && <span className="text-xs ml-2" style={{color:'var(--text-muted)'}}>{d.reason}</span>}
                      </div>
                      <button onClick={() => removeBlock(d.id)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                        <X size={12}/> Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {/* ---- Charts Tab ---- */}
        {tab === 'charts' && (
          <div className="space-y-6">

            {/* Year selector and the statement share one row: both scope the
                same period of data, so separating them implied they were
                unrelated controls. */}
            <div className="card p-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <label className="label">Year</label>
                {/* Dropdown only: the arrows duplicated it AND could step to a
                    year the dropdown doesn't offer, so the two disagreed about
                    what was selectable. */}
                <select className="input text-sm" value={chartYear}
                  onChange={e => setChartYear(Number(e.target.value))} style={{ minWidth: 110 }}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="flex items-end gap-3">
                <div className="text-right hidden sm:block">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Profit and Loss Statement
                  </p>
                  {/* Wording follows the adaptive comparison: the prior-year
                      column only appears once that year has records. */}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Revenue and expenses by period. Printable.
                  </p>
                </div>
                <button onClick={() => setPlOpen(true)}
                  className="btn-primary text-sm flex items-center gap-2 shrink-0">
                  <FileText size={15}/> View Statement
                </button>
              </div>
              {/* Kept with the period controls it relates to */}
              {chartsLoading && (
                <span className="text-xs w-full sm:w-auto" style={{ color: 'var(--text-muted)' }}>Loading…</span>
              )}
            </div>

            {/* Revenue vs Expenses — smooth area chart with gradient fill, the
                conventional chart type for time-series financial trends */}
            <div className="card chart-card-premium p-5">
              <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Revenue vs Expenses</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Monthly comparison for {chartYear}</p>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={(chartData?.monthly || []).map((m, i) => ({
                  month: MONTHS[i],
                  Revenue: parseFloat(m.earnings || 0),
                  Expenses: parseFloat(m.expenses || 0),
                  Net: parseFloat(m.net || 0),
                }))}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--brand)" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="var(--brand)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#e57373" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#e57373" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--brand-bright)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--brand-bright)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₱${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Revenue"  stroke="var(--brand)" strokeWidth={2.5} fill="url(#revenueGradient)" animationDuration={800} animationEasing="ease-out" />
                  <Area type="monotone" dataKey="Expenses" stroke="#e57373" strokeWidth={2.5} fill="url(#expensesGradient)" animationDuration={800} animationEasing="ease-out" animationBegin={100} />
                  <Area type="monotone" dataKey="Net"      stroke="var(--brand-bright)" strokeWidth={2.5} fill="url(#netGradient)" animationDuration={800} animationEasing="ease-out" animationBegin={200} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Service Popularity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

              {/* Pie chart */}
              <div className="card chart-card-premium p-5">
                <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Bookings by Service</p>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Total bookings per package in {chartYear}</p>
                {svcStats.length === 0 ? (
                  <p className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>No data yet.</p>
                ) : (() => {
                  const donutColors = ['#03624C','#b45309','#2CC295'];
                  const total = svcStats.reduce((sum, s) => sum + (parseInt(s.total_bookings) || 0), 0);
                  return (
                    <>
                      <div className="relative">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={svcStats.map(s => ({ name: s.service_name, value: parseInt(s.total_bookings) || 0 }))}
                              cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value"
                              paddingAngle={2}
                              animationDuration={700} animationEasing="ease-out">
                              {svcStats.map((_, i) => (
                                <Cell key={i} fill={donutColors[i % 3]} stroke="var(--surface)" strokeWidth={2} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip isCurrency={false} />} />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Center label — total bookings across all services, classic donut-chart treatment */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <p className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{total}</p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Total</p>
                        </div>
                      </div>
                      {/* Legend list — replaces the old slice labels, which clipped at the
                          card edge for longer service names (e.g. "STANDARD"). A clean
                          list reads more clearly and is the pattern premium dashboards use. */}
                      <div className="space-y-1.5 mt-2">
                        {svcStats.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: donutColors[i % 3] }}/>
                              <span style={{ color: 'var(--text-secondary)' }}>{s.service_name}</span>
                            </span>
                            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                              {total > 0 ? Math.round((parseInt(s.total_bookings) || 0) / total * 100) : 0}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Bookings table summary */}
              <div className="card p-5">
                <p className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Service Summary</p>
                {svcStats.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Service','Bookings','Completed'].map(h => (
                          <th key={h} className="text-left py-2 text-xs font-bold uppercase"
                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {svcStats.map((s, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{s.service_name}</td>
                          <td className="py-2.5 font-bold" style={{ color: 'var(--brand)' }}>{s.total_bookings}</td>
                          <td className="py-2.5" style={{ color: 'var(--text-secondary)' }}>{s.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
                {/* Export chart data */}
                <button onClick={() => downloadCSV(
                  svcStats.map(s => ({
                    'Service': s.service_name,
                    'Total Bookings': s.total_bookings,
                    'Completed': s.completed,
                  })),
                  `ZClean_ServiceStats_${chartYear}.csv`
                )} className="flex items-center gap-2 mt-4 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all hover:border-[var(--brand)] hover:text-[var(--brand)]"
                  style={{ border: '1.5px solid var(--border)', color: 'var(--text-muted)' }}>
                  <Download size={12}/> Export CSV
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </AdminLayout>
    {plOpen && (
      <ProfitLossModal data={plData} loading={plLoading}
        period={plPeriod} onPeriodChange={setPlPeriod}
        year={plYear} onYearChange={setPlYear} years={YEARS}
        month={plMonth} onMonthChange={setPlMonth} months={MONTHS}
        from={plFrom} to={plTo} onFromChange={setPlFrom} onToChange={setPlTo}
        onClose={() => setPlOpen(false)} />
    )}
    <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
