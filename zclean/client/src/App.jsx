import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import { initSound } from './utils/sound.js';

import HomePage          from './pages/HomePage.jsx';
import AboutPage         from './pages/AboutPage.jsx';
import LoginPage         from './pages/LoginPage.jsx';
import RegisterPage      from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';

import BookingPage       from './pages/client/BookingPage.jsx';
import BookingConfirm    from './pages/client/BookingConfirm.jsx';
import BookingHistory    from './pages/client/BookingHistory.jsx';
import ProfilePage       from './pages/client/ProfilePage.jsx';
import ClientChat        from './pages/client/ClientChat.jsx';

import AdminDashboard    from './pages/admin/AdminDashboard.jsx';
import AdminBookings     from './pages/admin/AdminBookings.jsx';
import AdminServices     from './pages/admin/AdminServices.jsx';
import AdminClients      from './pages/admin/AdminClients.jsx';
import AdminReviews      from './pages/admin/AdminReviews.jsx';
import AdminReports      from './pages/admin/AdminReports.jsx';
import AdminChat         from './pages/admin/AdminChat.jsx';

function PrivateRoute({ children, role }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user)  return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user)   return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
}

// Wraps <Routes> and replays a fade-in on every route change.
// Keying by pathname forces the wrapper div to remount, restarting the CSS animation.
// Also sets the browser-tab title per route (falls back to the full SEO title
// from index.html for the homepage and any unmapped path).
const PAGE_TITLES = {
  '/about':           'About Us',
  '/login':           'Login',
  '/register':        'Create Account',
  '/forgot-password': 'Reset Password',
  '/book':            'Book a Service',
  '/book/confirm':    'Confirm Booking',
  '/my-bookings':     'My Bookings',
  '/messages':        'Messages',
  '/profile':         'My Profile',
  '/admin':           'Dashboard',
  '/admin/bookings':  'Bookings',
  '/admin/services':  'Services & Add-ons',
  '/admin/clients':   'Clients',
  '/admin/reviews':   'Reviews',
  '/admin/reports':   'Reports',
  '/admin/chat':      'Chat',
};
const BASE_TITLE = "Z's Cleaning Services — Book Online | Calbayog City";

function PageFade({ children }) {
  const location = useLocation();
  useEffect(() => {
    const page = PAGE_TITLES[location.pathname];
    document.title = page ? `${page} — Z's Cleaning Services` : BASE_TITLE;
    // New page starts at the top — without this, SPA navigation keeps the
    // previous page's scroll position (e.g., arriving mid-page on /book
    // after scrolling the homepage footer).
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div key={location.pathname} className="page-fade-in">
      {children}
    </div>
  );
}

export default function App() {
  // Mobile browsers block sound that did not start from a tap, so the audio is
  // primed on the first interaction of the visit. Runs once; harmless on
  // desktop, where the rule is looser.
  useEffect(() => { initSound(); }, []);

  return (
    <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <PageFade>
        <Routes>
          {/* Public */}
          <Route path="/"  element={<HomePage />} />
          {/* Public — no auth, so prospective clients can read it before signing up */}
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login"    element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />

          {/* Client */}
          <Route path="/book"         element={<PrivateRoute role="client"><BookingPage /></PrivateRoute>} />
          <Route path="/book/confirm" element={<PrivateRoute role="client"><BookingConfirm /></PrivateRoute>} />
          <Route path="/my-bookings"  element={<PrivateRoute role="client"><BookingHistory /></PrivateRoute>} />
          <Route path="/messages"     element={<PrivateRoute role="client"><ClientChat /></PrivateRoute>} />
          <Route path="/profile"      element={<PrivateRoute role="client"><ProfilePage /></PrivateRoute>} />

          {/* Admin */}
          <Route path="/admin"          element={<PrivateRoute role="admin"><AdminDashboard /></PrivateRoute>} />
          <Route path="/admin/bookings" element={<PrivateRoute role="admin"><AdminBookings /></PrivateRoute>} />
          <Route path="/admin/services" element={<PrivateRoute role="admin"><AdminServices /></PrivateRoute>} />
          <Route path="/admin/clients"  element={<PrivateRoute role="admin"><AdminClients /></PrivateRoute>} />
          <Route path="/admin/reviews"  element={<PrivateRoute role="admin"><AdminReviews /></PrivateRoute>} />
          <Route path="/admin/reports"  element={<PrivateRoute role="admin"><AdminReports /></PrivateRoute>} />
          <Route path="/admin/chat"     element={<PrivateRoute role="admin"><AdminChat /></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </PageFade>
      </BrowserRouter>
    </AuthProvider>
    </ToastProvider>
  );
}
