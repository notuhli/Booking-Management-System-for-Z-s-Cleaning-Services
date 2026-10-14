import { useLocation, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, Calendar, Clock, MapPin, Package, CreditCard, Home, List, Printer } from 'lucide-react';
import Navbar from '../../components/Navbar.jsx';

export default function BookingConfirm() {
  const { state } = useLocation();
  const navigate  = useNavigate();

  if (!state || !state.booking_id) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No booking data found.</p>
          <button className="btn-primary" onClick={() => navigate('/book')}>Book a Service</button>
        </div>
      </>
    );
  }

  const { booking_id, service_name, service_price, date, time_start, location, payment_method } = state;

  const fmt = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }
    catch { return d; }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen py-12 px-4" style={{ background: 'var(--bg)' }}>
        <div className="max-w-md mx-auto">

          {/* Success Banner */}
          <div className="text-center mb-8 anim-up-1">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--brand-pale)' }}>
              <CheckCircle size={44} style={{ color: 'var(--brand)' }} />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Booking Submitted!</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {payment_method === 'gcash'
                ? "Your GCash receipt is pending verification. We'll confirm once reviewed."
                : "We'll confirm your appointment shortly. Please prepare payment on the day."}
            </p>
          </div>

          {/* Details Card */}
          <div className="card anim-up-2 overflow-hidden" style={{ padding: 0 }}>

            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="eyebrow mb-0.5">Booking Reference</p>
              <p className="font-mono font-bold text-lg" style={{ color: 'var(--brand)' }}>#{booking_id}</p>
            </div>

            <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Package size={18} style={{ color: 'var(--brand)', marginTop: 2 }} className="shrink-0" />
              <div>
                <p className="eyebrow mb-0.5">Service</p>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{service_name}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>₱{Number(service_price || 0).toLocaleString()} total</p>
              </div>
            </div>

            <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Calendar size={18} style={{ color: 'var(--brand)', marginTop: 2 }} className="shrink-0" />
              <div>
                <p className="eyebrow mb-0.5">Date & Time</p>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(date)}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{time_start}</p>
              </div>
            </div>

            <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <MapPin size={18} style={{ color: 'var(--brand)', marginTop: 2 }} className="shrink-0" />
              <div>
                <p className="eyebrow mb-0.5">Location</p>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{location}</p>
              </div>
            </div>

            <div className="px-5 py-4 flex items-start gap-3">
              <CreditCard size={18} style={{ color: 'var(--brand)', marginTop: 2 }} className="shrink-0" />
              <div>
                <p className="eyebrow mb-0.5">Payment Method</p>
                <p className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{payment_method}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {payment_method === 'gcash' ? 'Receipt submitted — pending verification' : 'Pay on the day of service'}
                </p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="text-center my-4 anim-up-3">
            <span className="badge badge-pending text-sm px-4 py-1.5">Status: PENDING</span>
          </div>

          {/* Actions — one primary action per screen principle:
              Primary: View My Booking (client's next step after confirming)
              Secondary: Print receipt, Go Home */}
          <div className="space-y-2 anim-up-3">
            <Link to="/my-bookings" className="btn-primary w-full justify-center flex items-center gap-2 !py-3.5 !text-base">
              <List size={16} /> View My Booking →
            </Link>
            <div className="flex gap-2">
              <button onClick={() => window.print()}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm">
                <Printer size={14}/> Print Receipt
              </button>
              <Link to="/" className="btn-secondary flex-1 justify-center flex items-center gap-2 text-sm">
                <Home size={14} /> Home
              </Link>
            </div>
          </div>

          {/* Print-only receipt */}
          <div className="hidden print:block mt-8 p-6 border-2 border-gray-300 rounded-xl text-sm">
            <div className="text-center mb-4">
              <p className="font-black text-xl">Z's Cleaning Services</p>
              <p className="text-gray-500">Calbayog City · 0916-213-3460</p>
              <p className="text-gray-400 text-xs mt-1">— Official Booking Receipt —</p>
            </div>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {[
                  ['Booking #', `#${booking_id}`],
                  ['Service', service_name],
                  ['Amount', `₱${Number(service_price || 0).toLocaleString()}`],
                  ['Date', fmt(date)],
                  ['Time', time_start || '9:00 AM'],
                  ['Location', location],
                  ['Payment', payment_method],
                  ['Status', 'PENDING CONFIRMATION'],
                ].map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td className="py-1.5 pr-4 font-semibold text-gray-500 w-32">{label}</td>
                    <td className="py-1.5 font-semibold">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-center text-gray-400 text-xs mt-4">
              Printed on {new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}
            </p>
          </div>

        </div>
      </main>
    </>
  );
}
