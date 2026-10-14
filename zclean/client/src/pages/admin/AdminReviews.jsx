import { useEffect, useState } from 'react';
import { Star, MessageCircle, X, Send, AlertTriangle } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { reviewsAPI } from '../../services/api.js';

export default function AdminReviews() {
  const { showToast } = useToast();
  const [reviews,   setReviews]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [replyId,   setReplyId]   = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submitting,setSubmitting]= useState(false);
  const [msg,       setMsg]       = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const res = await reviewsAPI.all();
      setReviews(res.data || []);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submitReply = async () => {
    if (!replyText.trim()) return;
    try {
      setSubmitting(true);
      await reviewsAPI.reply(replyId, { reply: replyText });
      showToast('Reply sent', 'success');
      setReplyId(null);
      setReplyText('');
      load();
    } catch (e) { setMsg(e.response?.data?.message || "Couldn't send the reply — try again."); }
    finally { setSubmitting(false); }
  };

  const fmt = (d) => new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });

  const avg = reviews.length
    ? (reviews.reduce((s,r) => s + Number(r.rating), 0) / reviews.length).toFixed(1)
    : '—';

  return (
    <AdminLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-2xl font-bold text-[var(--fg)]">Reviews</h1>
          <div className="flex items-center gap-2">
            <Star size={18} className="text-yellow-400 fill-yellow-400" />
            <span className="font-bold text-[var(--fg)]">{avg}</span>
            <span className="text-sm text-[var(--muted)]">({reviews.length} reviews)</span>
          </div>
        </div>

        {msg && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--brand-pale)] text-[var(--brand)] text-sm flex justify-between">
            {msg} <button onClick={() => setMsg('')}><X size={14}/></button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  {[1,2,3,4,5].map(s => <div key={s} className="w-3.5 h-3.5 rounded-full animate-pulse" style={{ background: 'var(--surface2)' }}/>)}
                </div>
                <div className="h-3.5 w-3/4 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
                <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: 'var(--surface2)' }}/>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="text-center py-20">
            <AlertTriangle size={36} className="mx-auto mb-2" style={{ color: '#dc2626' }}/>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Couldn't load reviews</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Check that the server is running, then try again.</p>
            <button onClick={load} className="btn-primary">Retry</button>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center text-[var(--muted)] py-20">
            <Star size={40} className="mx-auto mb-3 opacity-30" />
            <p>No reviews yet.</p>
          </div>
        ) : (
          /* Fixed 3-across on desktop (lg triggers inside the admin layout on
             laptops, unlike xl which often doesn't), 2 on tablets, 1 on
             phones. Default grid stretch keeps heights uniform per row. */
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map(r => (
              <div key={r.id} className="card p-4 anim-up-1 h-full flex flex-col">
                {/* Same shape as the client-facing review cards:
                    stars → quoted comment → reply chip → avatar footer */}
                <div className="flex gap-0.5 mb-3">
                  {[1,2,3,4,5].map(n => (
                    <Star key={n} size={14} className={n <= r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                  ))}
                </div>

                <p className="text-sm mb-4 leading-relaxed flex-1 text-[var(--fg)]">"{r.comment}"</p>

                {/* Existing reply — same chip style as the client side */}
                {r.reply && (
                  <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                    <strong>Your reply:</strong> {r.reply}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0" style={{ background: 'var(--brand)' }}>
                      {(r.client_name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--fg)]">{r.client_name}</p>
                      <p className="text-xs text-[var(--muted)]">{r.service_name} · {fmt(r.created_at)}</p>
                    </div>
                  </div>
                  {!r.reply && (
                    <button
                      onClick={() => { setReplyId(r.id); setReplyText(''); }}
                      className="text-xs text-[var(--brand)] hover:underline flex items-center gap-1 shrink-0"
                    >
                      <MessageCircle size={13}/> Reply
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {replyId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[var(--fg)]">Reply to Review</h2>
              <button onClick={() => setReplyId(null)}><X size={18} className="text-[var(--muted)]"/></button>
            </div>
            <textarea
              className="input resize-none min-h-[100px]" rows={4}
              placeholder="Write your reply..."
              value={replyText} onChange={e => setReplyText(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setReplyId(null)} className="flex-1 btn-secondary text-sm">Cancel</button>
              <button onClick={submitReply} disabled={submitting || !replyText.trim()}
                className="flex-1 btn-primary text-sm flex items-center justify-center gap-2">
                {submitting ? 'Sending...' : <><Send size={13}/> Send Reply</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
