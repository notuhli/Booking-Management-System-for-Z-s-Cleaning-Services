import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('zclean_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// ── receiptSrc ───────────────────────────────────────────────────────────────
// Payment receipts are no longer served to anyone with the URL — the server
// checks that the requester is the admin or the booking's own client.
//
// A browser will not attach an Authorization header to an <img> request, so the
// token travels as a query parameter instead and is verified the same way.
// Read fresh each time, because it changes across logout and login.
export function receiptSrc(url) {
  if (!url) return url;
  const token = localStorage.getItem('zclean_token');
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
}

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('zclean_token');
      localStorage.removeItem('zclean_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

export const servicesAPI = {
  list:            ()       => api.get('/services'),
  all:             ()       => api.get('/services/all'),
  create:          (data)   => api.post('/services', data),
  update:          (id, d)  => api.put(`/services/${id}`, d),
  delete:          (id)     => api.delete(`/services/${id}`),
  reactivate:      (id)     => api.patch(`/services/${id}/reactivate`),
  permanentDelete: (id)     => api.delete(`/services/${id}/permanent`),
};

export const bookingsAPI = {
  create:       (data)      => api.post('/bookings', data),
  // Walk-in / phone booking recorded by the admin on a caller's behalf
  adminCreate:  (data)      => api.post('/bookings/admin', data),
  getAll:       ()          => api.get('/bookings'),
  getMy:        ()          => api.get('/bookings/my'),
  updateStatus: (id, status)=> api.patch(`/bookings/${id}/status`, { status }),
  verifyGcash:  (id)        => api.patch(`/bookings/${id}/verify-gcash`),
  // Turning a receipt down. The reason is required — it is what the client is
  // shown and emailed, so a rejection is never silent.
  rejectGcash:  (id, reason)=> api.patch(`/bookings/${id}/reject-gcash`, { reason }),
  // Ending a booking whose receipts keep failing. Only works on a rejected one.
  cancelRejected: (id, reason) => api.patch(`/bookings/${id}/cancel-rejected`, { reason }),
  // The client's replacement receipt after a rejection. FormData, so the
  // browser sets the multipart boundary itself.
  reuploadReceipt: (id, formData) => api.patch(`/bookings/${id}/receipt`, formData),
  setHouseSize: (id, data)  => api.patch(`/bookings/${id}/house-size`, data),
  reschedule:         (id, data)  => api.patch(`/bookings/${id}/reschedule`, data),
  respondReschedule:  (id, action) => api.patch(`/bookings/${id}/reschedule-response`, { action }),
};

export const expensesAPI = {
  list:   (params) => api.get('/expenses', { params }),
  create: (data)   => api.post('/expenses', data),
  update: (id, d)  => api.put(`/expenses/${id}`, d),
  delete: (id)     => api.delete(`/expenses/${id}`),
};

export const paymentsAPI = {
  record:     (data) => api.post('/payments', data),
  getBooking: (id)   => api.get(`/payments/booking/${id}`),
};

export const reportsAPI = {
  dashboard:    ()       => api.get('/reports/dashboard'),
  monthly:      (p)      => api.get('/reports/monthly',       { params: p }),
  yearly:       (p)      => api.get('/reports/yearly',        { params: p }),
  range:        (p)      => api.get('/reports/range',         { params: p }),
  profitLoss:   (p)      => api.get('/reports/profit-loss',   { params: p }),
  logs:         ()       => api.get('/reports/schedule-logs'),
  serviceStats: (p)      => api.get('/reports/service-stats', { params: p }),
  publicStats:  ()       => api.get('/reports/public-stats'),
};

export const reviewsAPI = {
  public:  ()        => api.get('/reviews/public'),
  all:     ()        => api.get('/reviews'),
  create:  (data)    => api.post('/reviews', data),
  reply:   (id, d)   => api.patch(`/reviews/${id}/reply`, d),
};

export const globalAddonsAPI = {
  list:   ()        => api.get('/global-addons'),
  all:    ()        => api.get('/global-addons/all'),
  create: (data)    => api.post('/global-addons', data),
  update: (id, d)   => api.put(`/global-addons/${id}`, d),
  delete: (id)      => api.delete(`/global-addons/${id}`),
  // Removes the row outright. The server refuses if any booking uses the add-on.
  permanentDelete: (id) => api.delete(`/global-addons/${id}/permanent`),
};

export const transportFeesAPI = {
  get:  ()             => api.get('/transport-fees'),
  save: (muni, body)   => api.put(`/transport-fees/${encodeURIComponent(muni)}`, body),
};

export const settingsAPI = {
  get:      ()     => api.get('/settings'),
  update:   (d)    => api.put('/settings', d),
  uploadQr: (fd)   => api.post('/settings/gcash-qr', fd),
};

export const calendarAPI = {
  getBlocked:    ()     => api.get('/calendar/blocked'),
  getBookedDates:()     => api.get('/calendar/booked-dates'),
  block:         (d)    => api.post('/calendar/blocked', d),
  unblock:       (id)   => api.delete(`/calendar/blocked/${id}`),
};

export const notificationsAPI = {
  get:       ()   => api.get('/notifications'),
  markRead:  (id) => api.patch(`/notifications/${id}/read`),
  markAll:   ()   => api.patch('/notifications/read-all'),
};

export const profileAPI = {
  update:         (d) => api.put('/profile', d),
  changePassword: (d) => api.post('/profile/password', d),
  changeEmail:    (d) => api.put('/profile/email', d),
  deactivate:     (d) => api.post('/profile/deactivate', d),
};

export const clientsAPI = {
  list:        ()             => api.get('/clients'),
  bookings:    (id)           => api.get(`/clients/${id}/bookings`),
  setStatus:   (id, is_active) => api.patch(`/clients/${id}/status`, { is_active }),
  remove:      (id)           => api.delete(`/clients/${id}`),
};

export const messagesAPI = {
  get:               (other_user_id) => api.get(`/messages/${other_user_id}`),
  send:              (data)          => api.post('/messages', data),
  // With an attachment the payload must be multipart, so the file reaches
  // multer. Axios sets the boundary header itself when given FormData.
  sendWithImage:     (data, file)    => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== null && v !== undefined) fd.append(k, v); });
    fd.append('image', file);
    return api.post('/messages', fd);
  },
  markRead:          (other_user_id) => api.patch(`/messages/read/${other_user_id}`),
  unreadCount:       ()              => api.get('/messages/unread-count'),
  listConversations: ()              => api.get('/messages/conversations'),
  getAdminId:        ()              => api.get('/auth/admin-id'),
};

export const notesAPI = {
  list:   ()            => api.get('/notes'),
  create: (content)     => api.post('/notes', { content }),
  update: (id, content) => api.put(`/notes/${id}`, { content }),
  remove: (id)          => api.delete(`/notes/${id}`),
};
