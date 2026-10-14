import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, Star, ChevronDown, ChevronUp, X, Receipt } from 'lucide-react';
import Navbar from '../../components/Navbar.jsx';
import { bookingsAPI, reviewsAPI } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.jsx';
import { usePolling } from '../../hooks/usePolling.jsx';
import ReceiptModal from '../../components/ReceiptModal.jsx';

const BADGE = {
  pending:            'badge-pending',
  confirmed:          'badge-confirmed',
  done:               'badge-done',
  completed:          'badge-done',
  pending_reschedule: 'badge-pending',
  cancelled:          'badge-cancelled',
};

export default function BookingHistory() {
  const { showToast } = useToast();
  const [receiptFor, setReceiptFor] = useState(null);   // booking shown in the receipt modal
  const navigate = useNavigate();
  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  const [expanded,   setExpanded]   = useState(null);
  const [reviewId,   setReviewId]   = useState(null);
  const [rating,     setRating]     = useState(5);
  const [comment,    setComment]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg,        setMsg]        = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [responding, setResponding] = useState(null); // booking id being responded to

  const handleRescheduleResponse = async (bookingId, action) => {
    try {
      setResponding(bookingId);
      await bookingsAPI.respondReschedule(bookingId, action);
      showToast(action === 'accept' ? 'Reschedule accepted! Your booking date has been updated.' : 'Reschedule declined. Your original date is kept.', 'success');
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || 'Error responding to reschedule.');
    } finally { setResponding(null); }
  };

  const load = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);   // background refresh keeps the page visible
      setLoadError(false);
      const res = await bookingsAPI.getMy();
      const parsed = (res.data || []).map(b => ({
        ...b,
        has_review: !!b.review_id,
        addons: b.addons_raw
          ? b.addons_raw.split(';;').filter(Boolean).map(s => {
              const [name, price] = s.split('|');
              return { name, price };
            })
          : [],
      }));
      setBookings(parsed);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  // A confirmation, a reschedule or a price change after the inspection shows
  // up without the client reloading the page.
  usePolling(() => load(true), 30000);

  const handleReview = async () => {
    if (!comment.trim()) return setMsg('Please write a comment.');
    try {
      setSubmitting(true);
      await reviewsAPI.create({ booking_id: reviewId, rating, comment });
      showToast('Review submitted! Thank you.', 'success');
      setReviewId(null);
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || 'Error submitting review.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (d) => {
    if (!d) return '—';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };


  return (
    <>
      <Navbar />
      <ReceiptModal booking={receiptFor} onClose={() => setReceiptFor(null)} fmt={fmt} />
      <main className="min-h-screen py-10 px-4" style={{ background: 'var(--bg)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>My Bookings</h1>
            {/* Show header CTA only when bookings exist — empty state has its own CTA */}
            {!loading && bookings.length > 0 && (
              <button onClick={() => navigate('/book')} className="btn-primary text-sm">+ New Booking</button>
            )}
          </div>


          {msg && (
            <div className="mb-4 p-3 rounded-xl text-sm flex justify-between items-center"
              style={{ background: 'var(--brand-pale)', color: 'var(--brand)', border: '1px solid var(--brand)' }}>
              {msg}
              <button onClick={() => setMsg('')}><X size={14} /></button>
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--surface)' }} />)}
            </div>
          )}

          {/* Load failure — shown INSTEAD of the empty state so a server error
              never masquerades as "No bookings yet" */}
          {!loading && loadError && (
            <div className="text-center py-20">
              <Calendar size={48} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="mb-1 font-semibold" style={{ color: 'var(--text-primary)' }}>Couldn't load your bookings</p>
              <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Please check your connection and try again.</p>
              <button onClick={load} className="btn-primary">Retry</button>
            </div>
          )}

          {!loading && !loadError && bookings.length === 0 && (
            <div className="text-center py-20">
              <Calendar size={48} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="mb-4" style={{ color: 'var(--text-muted)' }}>No bookings yet.</p>
              <button onClick={() => navigate('/book')} className="btn-primary">Book a Service</button>
            </div>
          )}

          {/* Status filter pills — only shown when there's something to filter */}
          {!loading && bookings.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {['all','pending','confirmed','done'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background:  statusFilter === s ? 'var(--brand)' : 'var(--surface2)',
                    color:       statusFilter === s ? 'white' : 'var(--text-muted)',
                    border: '1px solid ' + (statusFilter === s ? 'var(--brand)' : 'var(--border)'),
                  }}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {bookings
              .filter(b => statusFilter === 'all'
                || b.status === statusFilter
                || (statusFilter === 'done' && b.status === 'completed'))
              .map(b => (
              <div key={b.id} className="card overflow-hidden anim-up-1" style={{ padding: 0 }}>
                {/* Header row */}
                {/* Collapsed row. A date-block on the left anchors the card and
                    lets the list be scanned by date at a glance; service, status
                    and the true total sit in a clear hierarchy beside it. */}
                <button
                  className="w-full flex items-stretch gap-3 sm:gap-4 px-3 sm:px-4 py-3.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setExpanded(expanded === b.id ? null : b.id)}>

                  {/* Date block */}
                  <div className="flex flex-col items-center justify-center rounded-xl px-3 py-2 shrink-0"
                    style={{ background: 'var(--brand-pale)', minWidth: 58 }}>
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--brand)' }}>
                      {b.date ? new Date(b.date.slice(0,10) + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short' }) : '—'}
                    </span>
                    <span className="font-black text-xl leading-none" style={{ color: 'var(--brand)' }}>
                      {b.date ? new Date(b.date.slice(0,10) + 'T00:00:00').getDate() : '—'}
                    </span>
                  </div>

                  {/* Service + meta */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{b.service_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`badge ${BADGE[b.status] || 'badge-info'} text-[10px]`}>{b.status}</span>
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <Clock size={10} />9:00 AM
                      </span>
                    </div>
                  </div>

                  {/* Total + chevron */}
                  <div className="flex flex-col items-end justify-center gap-1 shrink-0">
                    <span className="font-bold text-sm whitespace-nowrap" style={{ color: 'var(--brand)' }}>
                      ₱{Number(b.total_price ?? b.service_price ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {expanded === b.id
                        ? <>Hide <ChevronUp size={12} /></>
                        : <>Details <ChevronDown size={12} /></>}
                    </span>
                  </div>
                </button>

                {/* Expanded details */}
                {expanded === b.id && (
                  <div className="px-4 sm:px-5 py-4 space-y-3 text-sm"
                    style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>

                    {/* Visual status timeline — only for the normal lifecycle, not pending_reschedule */}
                    {b.status !== 'pending_reschedule' && (() => {
                      const stages = ['pending', 'confirmed', 'done'];
                      const effectiveStatus = b.status === 'completed' ? 'done' : b.status;
                      const currentIdx = stages.indexOf(effectiveStatus);
                      const labels = ['Booked', 'Confirmed', 'Done'];
                      return (
                        <div className="flex items-center mb-2">
                          {stages.map((stg, i) => (
                            <div key={stg} className="flex items-center flex-1 last:flex-none">
                              <div className="flex flex-col items-center">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{
                                    background: i <= currentIdx ? 'var(--brand)' : 'var(--border)',
                                    color: i <= currentIdx ? 'white' : 'var(--text-muted)',
                                  }}>
                                  {i < currentIdx ? '✓' : i + 1}
                                </div>
                                <span className="text-[10px] mt-1 whitespace-nowrap"
                                  style={{ color: i <= currentIdx ? 'var(--brand)' : 'var(--text-muted)' }}>
                                  {labels[i]}
                                </span>
                              </div>
                              {i < stages.length - 1 && (
                                <div className="flex-1 h-0.5 mx-1 mb-4"
                                  style={{ background: i < currentIdx ? 'var(--brand)' : 'var(--border)' }}/>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    <div className="flex items-start gap-2">
                      <MapPin size={14} style={{ color: 'var(--brand)', marginTop: 2 }} className="shrink-0" />
                      <span style={{ color: 'var(--text-primary)' }}>{b.location}</span>
                    </div>

                    {/* Receipt — the full itemised breakdown, matching the
                        confirmation email and the admin's record. Previously
                        add-ons were listed but the surcharge, transport fee and
                        total were only visible in the email. */}
                    <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="eyebrow !mb-0">Receipt</p>
                        <button onClick={() => setReceiptFor(b)}
                          className="text-xs font-semibold hover:underline flex items-center gap-1"
                          style={{ color: 'var(--brand)' }}>
                          <Receipt size={12}/> View / Print
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span style={{ color: 'var(--text-secondary)' }}>{b.service_name}</span>
                          <span style={{ color: 'var(--text-primary)' }}>₱{Number(b.service_price || 0).toLocaleString()}</span>
                        </div>
                        {b.addons && b.addons.map((a, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span style={{ color: 'var(--text-secondary)' }}>{a.name}</span>
                            <span style={{ color: 'var(--text-primary)' }}>₱{Number(a.price || 0).toLocaleString()}</span>
                          </div>
                        ))}
                        {Number(b.area_surcharge || 0) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span style={{ color: 'var(--text-secondary)' }}>
                              Area surcharge{b.sqm_range ? ` (${String(b.sqm_range).replace(/_/g, ' ')})` : ''}
                            </span>
                            <span style={{ color: 'var(--text-primary)' }}>₱{Number(b.area_surcharge).toLocaleString()}</span>
                          </div>
                        )}
                        {Number(b.transport_fee || 0) > 0 && (
                          <div className="flex justify-between text-xs">
                            <span style={{ color: 'var(--text-secondary)' }}>Transport fee</span>
                            <span style={{ color: 'var(--text-primary)' }}>₱{Number(b.transport_fee).toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1.5" style={{ borderTop: '1px solid var(--border)' }}>
                          {/* A quote until the property has been checked. */}
                          <span className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                            {b.priced_at ? 'Final total' : 'Estimated total'}
                          </span>
                          <span className="font-bold text-sm" style={{ color: 'var(--brand)' }}>
                            ₱{Number(b.total_price ?? b.service_price ?? 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] pt-0.5">
                          <span style={{ color: 'var(--text-muted)' }}>
                            {b.payment_method === 'gcash' ? 'GCash' : 'Cash'}
                          </span>
                          <span style={{
                            color: b.payment_status === 'paid' ? 'var(--brand)' : 'var(--text-muted)',
                            fontWeight: 600,
                          }}>
                            {b.payment_status === 'paid' ? 'Paid'
                              : b.payment_status === 'partial'
                                ? `Paid ₱${Number(b.amount_paid || 0).toLocaleString()} · Balance ₱${Math.max(0, Number(b.total_price ?? b.service_price ?? 0) - Number(b.amount_paid || 0)).toLocaleString()}`
                              : b.payment_status === 'pending_verification' ? 'Receipt under review'
                              : 'Unpaid'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="eyebrow mb-0.5">Payment</p>
                        <p className="capitalize" style={{ color: 'var(--text-primary)' }}>{b.payment_method}</p>
                      </div>
                      <div>
                        <p className="eyebrow mb-0.5">Booking #</p>
                        <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{b.id}</p>
                      </div>
                    </div>

                    {b.notes && (
                      <div>
                        <p className="eyebrow mb-0.5">Notes</p>
                        <p style={{ color: 'var(--text-muted)' }}>{b.notes}</p>
                      </div>
                    )}

                    {/* Leave review for completed bookings */}
                    {(b.status === 'done' || b.status === 'completed') && (
                      <div className="flex items-center gap-4 flex-wrap">
                        {!b.has_review && (
                          <button
                            onClick={() => { setReviewId(b.id); setRating(5); setComment(''); }}
                            className="flex items-center gap-1.5 text-xs font-semibold hover:underline"
                            style={{ color: 'var(--brand)' }}>
                            <Star size={13} /> Leave a Review
                          </button>
                        )}
                        {b.has_review && (
                          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <Star size={13} className="text-yellow-400 fill-yellow-400" /> Review submitted — thank you!
                          </span>
                        )}
                        {/* Book Again — reuses existing serviceId navigation state, same as homepage "Book This" */}
                        <button
                          onClick={() => navigate('/book', { state: { serviceId: b.service_id } })}
                          className="flex items-center gap-1.5 text-xs font-semibold hover:underline"
                          style={{ color: 'var(--brand)' }}>
                          <Calendar size={13} /> Book Again
                        </button>
                      </div>
                    )}
                    {b.status === 'pending' && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Waiting for admin confirmation. Contact us at 0916-213-3460 for changes.
                      </p>
                    )}
                    {b.status === 'pending_reschedule' && b.proposed_date && (
                      <div className="rounded-xl p-3 mt-1 bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800">
                        <p className="text-xs font-bold mb-1 flex items-center gap-1.5 text-yellow-800 dark:text-yellow-300"><Calendar size={13}/>Admin proposed a new schedule</p>
                        <p className="text-sm font-semibold mb-2 text-yellow-900 dark:text-yellow-200">
                          {new Date(b.proposed_date + 'T00:00:00').toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
                        </p>
                        <div className="flex gap-2">
                          <button
                            disabled={responding === b.id}
                            onClick={() => handleRescheduleResponse(b.id, 'accept')}
                            className="btn-primary text-xs flex-1 !py-2">
                            {responding === b.id ? '…' : '✓ Accept'}
                          </button>
                          <button
                            disabled={responding === b.id}
                            onClick={() => handleRescheduleResponse(b.id, 'decline')}
                            className="btn-secondary text-xs flex-1 !py-2">
                            {responding === b.id ? '…' : '✕ Decline'}
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Review Modal */}
      {reviewId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Leave a Review</h2>
              <button onClick={() => setReviewId(null)} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Rating</label>
                <div className="flex gap-1 mt-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setRating(n)}>
                      <Star size={28} className={n <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Comment</label>
                <textarea className="input resize-none" rows={3}
                  placeholder="Share your experience…"
                  value={comment} onChange={e => setComment(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setReviewId(null)} className="flex-1 btn-secondary text-sm">Cancel</button>
              <button onClick={handleReview} disabled={submitting} className="flex-1 btn-primary text-sm">
                {submitting ? 'Submitting…' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
