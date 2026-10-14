import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Star, Phone, MapPin, Clock, ChevronLeft, ChevronRight, CalendarDays, CalendarCheck, Package, CreditCard, Facebook } from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import { servicesAPI, reviewsAPI, globalAddonsAPI, calendarAPI, reportsAPI, bookingsAPI } from '../services/api.js';
import { localDate, fmtTime } from '../utils/localDate.js';
import { isLeadIn } from '../utils/serviceBullets.js';
import { useAuth } from '../hooks/useAuth.jsx';

const SERVICE_DETAILS = {
  'Standard Clean':  [
    'Sweeping & mopping of all floors',
    'Dusting of furniture & surfaces',
    'Wiping of tables, counters, appliances (outer surface only)',
    'Bathroom cleaning (toilet, sink, floor, mirror)',
    'Kitchen cleaning (sink, counters, stovetop)',
    'General trash disposal',
    'Basic disinfection of high-touch areas',
  ],
  'Platinum Clean':  [
    'Includes everything in Standard, plus:',
    'Deep scrubbing of bathroom tiles & grout',
    'Interior window cleaning (glass, sills, frames)',
    'Detailed dusting (corners, baseboards, ceiling edges)',
    'Vacuuming of sofas, carpets & curtains (if any)',
    'Appliance surface detail (fridge, microwave, oven outside)',
    'Extra disinfection (bathroom & kitchen focus)',
  ],
  'Deep Cleaning':   [
    'Includes everything in Platinum, plus:',
    'Complete kitchen deep clean (fridge, oven, cabinets outside)',
    'Heavy scrubbing of floors (stains, corners, hard-to-reach areas)',
    'Mattress vacuuming & dust mite treatment',
    'Furniture moving for full-area clean (where possible)',
    'Comprehensive bathroom sanitation (shower, hard water stains, molds)',
    'Full disinfection of all rooms',
  ],
};

const SERVICE_DEFAULT_IMAGES = {
  'Standard Clean': 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&q=80',
  'Platinum Clean':  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
  'Deep Cleaning':   'https://images.unsplash.com/photo-1527515545081-5db817172677?w=600&q=80',
};

const SERVICE_BADGE = {
  'Standard Clean': { label: 'Starter',      color: '#16a34a' },
  'Platinum Clean': { label: 'Popular',       color: '#d97706' },
  'Deep Cleaning':  { label: 'Most Popular',  color: '#dc2626' },
};

const SERVICE_PRICE_COLOR = {
  'Standard Clean': '#03624C',   /* Bangladesh Green — brand, entry level */
  'Platinum Clean': '#b45309',   /* Amber — mid tier, premium warmth      */
  'Deep Cleaning':  '#000F0F',   /* Rich Black — serious, thorough, top tier */
};


// ── Dark hero calendar widget ─────────────────────────────────────────────────
const MONTHS_LIST = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const CTODAY = localDate();

function HeroCalendar({ blockedDates, bookedDates }) {
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const firstDay    = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  const ds = day => {
    const m = String(view.month+1).padStart(2,'0'), d = String(day).padStart(2,'0');
    return `${view.year}-${m}-${d}`;
  };
  const isBlocked = d => blockedDates.includes(d);
  const getBooked = d => bookedDates.find(b => b.date === d);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <button onClick={() => setView(v => v.month===0?{year:v.year-1,month:11}:{...v,month:v.month-1})}
          className="p-1 rounded-lg hover:bg-white/10 transition" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <ChevronLeft size={15}/>
        </button>
        <p className="font-bold text-sm text-white">{MONTHS_LIST[view.month]} {view.year}</p>
        <button onClick={() => setView(v => v.month===11?{year:v.year+1,month:0}:{...v,month:v.month+1})}
          className="p-1 rounded-lg hover:bg-white/10 transition" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <ChevronRight size={15}/>
        </button>
      </div>
      {/* Day labels */}
      <div className="grid grid-cols-7 mb-0.5">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold py-1"
            style={{ color: 'rgba(255,255,255,0.35)' }}>{d}</div>
        ))}
      </div>
      {/* Days */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`}/>;
          const d = ds(day);
          const blocked = isBlocked(d), booked = getBooked(d);
          const past = d < CTODAY, today = d === CTODAY;
          let bg = 'transparent', color = 'rgba(255,255,255,0.8)', dot = null;
          if (today)   { bg = '#16a34a'; color = 'white'; }
          if (blocked) { bg = 'rgba(239,68,68,0.25)'; color = 'rgba(239,68,68,0.8)'; }
          else if (booked?.full)  dot = 'bg-red-400';
          else if (booked)        dot = 'bg-yellow-400';
          if (past && !today) color = 'rgba(255,255,255,0.2)';
          return (
            <div key={d} className="relative flex items-center justify-center h-8 w-full rounded-lg text-xs font-semibold"
              style={{ background: bg, color, opacity: past&&!today&&!blocked ? 0.4 : 1 }}>
              {day}
              {dot && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dot}`}/>}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 px-1">
        {[['bg-yellow-400','1 slot left'],['bg-red-400','Full/Blocked']].map(([cls,lbl]) => (
          <span key={lbl} className="flex items-center gap-1.5 text-[10px]"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${cls} inline-block`}/>{lbl}
          </span>
        ))}
      </div>
    </div>
  );
}


export default function HomePage() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [reviews,  setReviews]  = useState([]);
  const [addons,      setAddons]      = useState([]);
  const [blockedDates,setBlockedDates] = useState([]);
  const [bookedDates, setBookedDates]  = useState([]);
  const [pubStats,    setPubStats]    = useState({ total_clients: 0, services_done: 0 });

  // Hero background slideshow — same cross-fade pattern as Login/Register pages,
  // different photo order so it feels distinct rather than identical.
  const HERO_SLIDES = [
    '/staff/staff-5.jpg',
    '/staff/staff-9.jpg',
    '/staff/staff-2.jpg',
    '/staff/staff-6.jpg',
    '/staff/staff-3.jpg',
  ];
  const [heroSlide,  setHeroSlide]  = useState(0);
  const [heroFading, setHeroFading] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setHeroFading(true);
      setTimeout(() => {
        setHeroSlide(s => (s + 1) % HERO_SLIDES.length);
        setHeroFading(false);
      }, 600);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Carousel scroll refs + helper — used by both Services and Reviews sections
  const servicesRef = useRef(null);
  const reviewsRef  = useRef(null);
  const scrollCarousel = (ref, direction) => {
    if (!ref.current) return;
    const cardWidth = ref.current.firstChild?.offsetWidth || 300;
    ref.current.scrollBy({ left: direction * (cardWidth + 24), behavior: 'smooth' });
  };

  // Reviews marquee is only sensible with enough cards that the duplicated
  // track never shows the same review twice side-by-side on screen.
  const reviewsMarquee = reviews.length >= 4;

  // Continuous slow marquee for the reviews carousel (~27px/sec via rAF).
  // The review list is rendered twice (see render below), so when scroll
  // passes the halfway point we silently subtract half the width — a seamless
  // infinite loop with no visible jump. Pauses on hover/touch so reading is
  // never interrupted; manual swipe and arrows still work on the same
  // container; never runs under prefers-reduced-motion or with < 4 reviews.
  useEffect(() => {
    const el = reviewsRef.current;
    if (!el || !reviewsMarquee) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let paused = false, raf;
    // Browsers round scrollLeft to whole pixels — adding 0.32 to a value that
    // snaps back to an integer accumulates nothing (the original bug: the
    // marquee never moved). Keep the true position in a float and assign it.
    let pos = el.scrollLeft;
    const pause  = () => { paused = true;  };
    const resume = () => { paused = false; };
    // Listen on the parent wrapper, not the scroll container: the arrow
    // buttons sit outside the container's box, so pausing must cover them —
    // otherwise the rAF loop overwrites the arrows' smooth scroll every frame.
    const zone = el.parentElement || el;
    zone.addEventListener('mouseenter', pause);
    zone.addEventListener('mouseleave', resume);
    el.addEventListener('touchstart', pause,  { passive: true });
    el.addEventListener('touchend',   resume, { passive: true });
    const step = () => {
      if (paused) {
        pos = el.scrollLeft; // track manual scrolls/arrow moves while paused
      } else {
        pos += 0.32;
        const half = el.scrollWidth / 2;
        if (half > 0 && pos >= half) pos -= half;
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      zone.removeEventListener('mouseenter', pause);
      zone.removeEventListener('mouseleave', resume);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('touchend',   resume);
    };
  }, [reviews, reviewsMarquee]);

  // Scroll-triggered entrance animation — replays every time each section
  // enters/exits the viewport (not just once on page load).
  const servicesSectionRef = useRef(null);
  const reviewsSectionRef  = useRef(null);
  const [servicesInView, setServicesInView] = useState(false);
  const [reviewsInView,  setReviewsInView]  = useState(false);

  // Hover spotlight — when a card is hovered, its siblings in the same
  // carousel dim/blur so the hovered card stands out. null = nothing hovered.
  const [hoveredServiceIdx, setHoveredServiceIdx] = useState(null);
  const [hoveredReviewIdx,  setHoveredReviewIdx]  = useState(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.target === servicesSectionRef.current) setServicesInView(entry.isIntersecting);
        if (entry.target === reviewsSectionRef.current)  setReviewsInView(entry.isIntersecting);
      });
    }, { threshold: 0.2 }); // fires once ~20% of the section is visible
    if (servicesSectionRef.current) observer.observe(servicesSectionRef.current);
    if (reviewsSectionRef.current)  observer.observe(reviewsSectionRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Logged-in client personalization: greeting + next booking in the hero.
  // The homepage doubles as the client's dashboard — same layout, aware of who
  // is looking. Fetched only for clients; guests cost nothing extra.
  const [myBookings, setMyBookings] = useState([]);
  useEffect(() => {
    if (user?.role !== 'client') return;
    bookingsAPI.getMy().then(r => setMyBookings(r.data || [])).catch(() => {});
  }, [user]);
  const todayStr = localDate();
  const nextBooking = myBookings
    .filter(b => ['pending', 'confirmed'].includes(b.status) && (b.date || '').slice(0, 10) >= todayStr)
    .sort((a, b) => ((a.date || '') + (a.time_start || '')).localeCompare((b.date || '') + (b.time_start || '')))[0] || null;
  const nextCountdown = (() => {
    if (!nextBooking) return '';
    const diff = Math.round((new Date((nextBooking.date || '').slice(0, 10) + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000);
    return diff <= 0 ? 'Today!' : diff === 1 ? 'Tomorrow' : `in ${diff} days`;
  })();
  const greet = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };

  useEffect(() => {
    servicesAPI.list().then(r => setServices(r.data)).catch(() => {});
    reviewsAPI.public().then(r => setReviews(r.data)).catch(() => {});
    globalAddonsAPI.list().then(r => setAddons(r.data)).catch(() => {});
    calendarAPI.getBlocked().then(r => setBlockedDates((r.data||[]).map(d => d.date))).catch(() => {});
    calendarAPI.getBookedDates().then(r => setBookedDates(r.data||[])).catch(() => {});
    reportsAPI.publicStats && reportsAPI.publicStats().then(r => setPubStats(r.data||{ total_clients:0, services_done:0 })).catch(() => {});
  }, []);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar />

      {/* Hero — photo slideshow background with dark overlay so existing text/widgets stay readable.
          pt-14 clears the fixed navbar height; the extra pt-8 on top gives real breathing room
          instead of content starting flush against the navbar edge. */}
      <section className="relative pt-14 pb-14 px-4 overflow-hidden">
        {/* Slideshow photos */}
        {HERO_SLIDES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: i === heroSlide ? (heroFading ? 0 : 1) : 0,
              transition: 'opacity 0.8s ease-in-out',
              zIndex: 0,
            }}
          />
        ))}
        {/* Dark overlay — identical technique to Login/Register so existing white text stays readable */}
        <div className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(12,26,18,0.92) 0%, rgba(26,58,42,0.88) 60%, rgba(15,46,26,0.9) 100%)',
            zIndex: 1,
          }}/>
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-10 relative mt-6" style={{ zIndex: 2 }}>

          {/* Left: text */}
          <div className="flex-1 text-center lg:text-left">
            {user?.role === 'client' ? (
              <p className="font-greeting text-3xl font-bold mb-3" style={{ color: 'var(--brand-bright)' }}>
                {greet()}, {user.name?.split(' ')[0]}!
              </p>
            ) : (
              <p className="eyebrow mb-4" style={{ color: 'var(--brand-bright)' }}>Professional Cleaning Services</p>
            )}
            {user?.role === 'client' ? (
              <h1 className="font-serif font-bold text-3xl sm:text-4xl text-white mb-6 leading-tight">
                Ready for your next<br/>
                <span style={{ color: 'var(--brand-bright)' }}>sparkling clean?</span>
              </h1>
            ) : (
              <>
                <h1 className="font-serif font-bold text-4xl sm:text-5xl text-white mb-4 leading-tight">
                  Sparkling Clean Homes<br/>
                  <span style={{ color: 'var(--brand-bright)' }}>Across Calbayog</span>
                </h1>
                <p className="text-green-200 text-base max-w-lg mb-8 mx-auto lg:mx-0">
                  Trusted cleaning services for homes and offices in Calbayog City, Gandara, Sta. Margarita, and San Jorge.
                </p>
              </>
            )}

            {/* Next booking + CTAs share one w-fit wrapper, so the card stretches
                to exactly the width of the two buttons below it — their right
                edges line up no matter how long the button labels are. */}
            <div className="w-fit mx-auto lg:mx-0">
            {/* Client's next booking — status before actions in the reading order */}
            {user?.role === 'client' && nextBooking && (
              <div className="mb-6 rounded-2xl p-4 w-full flex items-center justify-between gap-4"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <div>
                  <p className="text-[10px] font-bold tracking-widest mb-1" style={{ color: 'var(--brand-bright)' }}>NEXT BOOKING</p>
                  <p className="font-bold text-white">{nextBooking.service_name}</p>
                  <p className="text-sm text-green-200">
                    {new Date((nextBooking.date || '').slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    {nextBooking.time_start && ` · ${fmtTime(nextBooking.time_start)}`}
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-full text-xs font-bold shrink-0"
                  style={{ background: 'var(--brand-bright)', color: '#032221' }}>
                  {nextCountdown}
                </span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              {user?.role === 'client' ? (
                <Link to="/book" className="btn-primary !py-3.5 !px-8 !text-base !rounded-xl">Book a Service →</Link>
              ) : (
                <Link to="/register" className="btn-primary !py-3.5 !px-8 !text-base !rounded-xl">Get Started →</Link>
              )}
              {/* Phone — clearly secondary/ghost so it doesn't compete with the primary CTA */}
              <a href="tel:09162133460"
                className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-medium text-sm"
                style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <Phone size={14}/> 0916-213-3460
              </a>
            </div>
            </div>
            {user?.role !== 'client' && (
            <div className="flex flex-wrap justify-center lg:justify-start gap-0 mt-10 rounded-2xl overflow-hidden w-fit mx-auto lg:mx-0"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {[[`${pubStats.total_clients}+`,'Satisfied Clients'],[`${pubStats.services_done}+`,'Services Done'],['4','Areas Covered']].map(([n, l], i) => (
                <div key={l} className="px-7 py-4 text-center"
                  style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                  <p className="font-black text-4xl leading-none" style={{ color: 'var(--brand-bright)' }}>{n}</p>
                  <p className="text-xs mt-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{l}</p>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* Right: calendar widget */}
          <div className="w-full lg:w-auto lg:min-w-[380px]">
            <div className="rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)' }}>
              {/* Widget header */}
              <div className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div>
                  <p className="font-bold text-white text-sm">Available Dates</p>
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Up to 2 bookings/day · Starts 9:00 AM</p>
                </div>
                <CalendarDays size={20} style={{ color: 'var(--brand-bright)' }}/>
              </div>
              {/* Calendar inside widget */}
              <div className="px-2 py-2">
                <HeroCalendar blockedDates={blockedDates} bookedDates={bookedDates}/>
              </div>
              {/* Widget footer CTA */}
              <div className="px-4 pb-4 pt-1 space-y-3">
                {/* Social proof — uses live pubStats already loaded */}
                {pubStats.services_done > 0 && (
                  <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold"
                    style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <span style={{ color: 'var(--brand-bright)' }}>✓</span>
                    {pubStats.services_done}+ homes cleaned in Calbayog City
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── How to Book Tutorial ─────────────────────────────────────────────
          Placed between hero and services so first-time clients understand
          the process before choosing a package. Answers the 4 most common
          questions: what to choose, when it starts, what info is needed,
          and how confirmation works.
      ──────────────────────────────────────────────────────────────────── */}
      <section className="home-band-pale py-16 px-4">
        <div className="max-w-5xl mx-auto">

          {/* Section header */}
          <div className="text-center mb-12">
            <p className="eyebrow mb-2">Getting Started</p>
            <h2 className="font-serif font-bold text-3xl mb-3" style={{ color: 'var(--text-primary)' }}>
              How to Book a Cleaning Service
            </h2>
            <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Booking takes less than 3 minutes. Here's exactly what to expect.
            </p>
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: 1,
                icon: <Package size={24}/>,
                title: 'Choose a Service',
                desc: 'Pick Standard, Platinum, or Deep Cleaning. Add optional extras like laundry or aircon cleaning.',
                note: null,
              },
              {
                step: 2,
                icon: <CalendarCheck size={24}/>,
                title: 'Pick a Date',
                desc: 'Select an available date from the calendar. We accept up to 2 bookings per day.',
                note: 'All services start at 9:00 AM',
              },
              {
                step: 3,
                icon: <MapPin size={24}/>,
                title: 'Enter Your Details',
                desc: 'Provide your address, house size, special notes, and choose your payment method.',
                note: 'GCash or cash accepted',
              },
              {
                step: 4,
                icon: <CalendarDays size={24}/>,
                title: 'Wait for Confirmation',
                desc: 'Our team reviews your booking and confirms it. You\'ll get an email notification once confirmed.',
                note: 'Usually within the same day',
              },
            ].map(({ step, icon, title, desc, note }) => (
              <div key={step} className="relative flex lg:block gap-4">

                {/* Mobile: vertical timeline line on left */}
                <div className="flex flex-col items-center lg:hidden shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0 z-10"
                    style={{ background: 'var(--brand)' }}>
                    {step}
                  </div>
                  {step < 4 && <div className="w-0.5 flex-1 mt-1" style={{ background: 'var(--border)', minHeight: 40 }}/>}
                </div>

                {/* Connector line between steps (desktop only) */}
                {step < 4 && (
                  <div className="hidden lg:block absolute top-8 left-[calc(100%_-_12px)] w-6 h-0.5 z-10"
                    style={{ background: 'var(--border)' }}/>
                )}

                <div className="card card-accent h-full flex flex-col gap-4 p-5 flex-1">
                  {/* Number + icon row */}
                  <div className="flex items-center gap-3">
                    {/* Step number badge — hidden on mobile (shown in timeline) */}
                    <div className="hidden lg:flex w-8 h-8 rounded-full items-center justify-center text-sm font-black text-white shrink-0"
                      style={{ background: 'var(--brand)' }}>
                      {step}
                    </div>
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                      {icon}
                    </div>
                  </div>

                  {/* Text */}
                  <div className="flex-1">
                    <h3 className="font-bold text-base mb-1.5" style={{ color: 'var(--text-primary)' }}>
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {desc}
                    </p>
                  </div>

                  {/* Note pill — specific detail that sets expectations */}
                  {note && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg w-fit"
                      style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                      <CheckCircle size={11}/>
                      {note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Services */}
      <section ref={servicesSectionRef} className="home-band-surface py-16 px-4 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="eyebrow mb-2">What We Offer</p>
          <h2 className="font-serif text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Our Cleaning Packages</h2>
        </div>

        {/* ── Swipeable carousel ──────────────────────────────────────────────
            Handles any number of services safely — no index-based lookups that
            break when a 4th+ service is added. Touch-swipe on mobile via native
            scroll-snap; click arrows on desktop for the same gesture. */}
        <div className="relative">
          {services.length > 3 && (
            <>
              <button type="button" onClick={() => scrollCarousel(servicesRef, -1)}
                aria-label="Previous service"
                className="hidden sm:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full items-center justify-center shadow-lg"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--brand)' }}>
                <ChevronLeft size={18}/>
              </button>
              <button type="button" onClick={() => scrollCarousel(servicesRef, 1)}
                aria-label="Next service"
                className="hidden sm:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full items-center justify-center shadow-lg"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--brand)' }}>
                <ChevronRight size={18}/>
              </button>
            </>
          )}
          <div ref={servicesRef}
            className="flex gap-6 overflow-x-auto pb-2"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            {services.map((s, i) => {
              // Safe name-based lookups only — no index fallback, so a 4th+ service
              // (or any reordering caused by price changes) never silently reuses
              // another service's image/color/details.
              const priceColor = SERVICE_PRICE_COLOR[s.name] || 'var(--brand)';
              // Bullet details: the original 3 services keep their hardcoded,
              // hand-written bullet text exactly as before. Any other service
              // (added later by admin) uses whatever bullet points admin typed
              // into its own "Bullet Points" field — one bullet per line.
              // Bullet points: whatever the admin typed into the service's
              // "Bullet Points" field wins (one bullet per line). SERVICE_DETAILS
              // is only a fallback for the original three services if that field
              // is still empty — otherwise admin edits would be silently ignored.
              const items = (s.details && s.details.trim())
                ? s.details.split('\n').map(l => l.trim()).filter(Boolean)
                : (SERVICE_DETAILS[s.name] || []);
              const fallbackImg = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&q=80';
              const imgSrc = (s.image_url && s.image_url.trim())
                ? s.image_url
                : (SERVICE_DEFAULT_IMAGES[s.name] || fallbackImg);
              return (
                <div key={s.id}
                  className={servicesInView ? 'anim-fade-slide' : 'anim-fade-slide-hidden'}
                  style={{
                    scrollSnapAlign: 'start',
                    width: 'min(340px, 85vw)',
                    animationDelay: servicesInView ? `${i * 0.08}s` : '0s',
                    flexShrink: 0,
                  }}>
                <div
                  className="flex flex-col rounded-3xl overflow-hidden shadow-xl group cursor-pointer h-full"
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, filter 0.25s ease, opacity 0.25s ease',
                    // Spotlight: dim/blur this card if a sibling is hovered instead of it
                    filter: hoveredServiceIdx !== null && hoveredServiceIdx !== i ? 'blur(3px)' : 'none',
                    opacity: hoveredServiceIdx !== null && hoveredServiceIdx !== i ? 0.55 : 1,
                  }}
                  onMouseEnter={e => {
                    setHoveredServiceIdx(i);
                    e.currentTarget.style.transform='translateY(-6px) scale(1.02)'; e.currentTarget.style.boxShadow='var(--shadow-lg)';
                  }}
                  onMouseLeave={e => {
                    setHoveredServiceIdx(null);
                    e.currentTarget.style.transform='translateY(0) scale(1)'; e.currentTarget.style.boxShadow='';
                  }}>

                  {/* ── Image ── */}
                  <div className="relative overflow-hidden" style={{ height: 220 }}>
                    <img src={imgSrc} alt={s.name} loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                      onError={e => { e.target.src = fallbackImg; }}/>
                  </div>

                  {/* ── Content ── */}
                  <div className="flex flex-col flex-1 p-6">
                    <h3 className="font-black text-2xl mb-4 uppercase" style={{ color: 'var(--brand)' }}>
                      {s.name}
                    </h3>

                    <ul className="space-y-2 mb-6 flex-1">
                      {items.map((item, i) => (
                        isLeadIn(item) ? (
                          <li key={i} className="text-xs italic pb-1" style={{ color: 'var(--text-muted)' }}>{item}</li>
                        ) : (
                          <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <CheckCircle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--brand)' }}/>
                            {item}
                          </li>
                        )
                      ))}
                    </ul>

                    <div className="flex items-center justify-center py-2.5 px-6 rounded-2xl mb-4 font-black text-2xl text-white w-full"
                      style={{ background: priceColor }}>
                      ₱{Number(s.price).toLocaleString()}
                    </div>

                    {user?.role === 'client' ? (
                      <Link to="/book" state={{ serviceId: s.id }}
                        className="btn-primary w-full !rounded-2xl !py-3 text-center block font-bold">
                        Book This →
                      </Link>
                    ) : (
                      <Link to="/register"
                        className="btn-primary w-full !rounded-2xl !py-3 text-center block font-bold">
                        Book This →
                      </Link>
                    )}
                  </div>
                </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>


      {/* Reviews */}
      {/* Reviews */}
      <section ref={reviewsSectionRef} className="home-band-pale py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="eyebrow mb-2">Client Feedback</p>
            <h2 className="font-serif text-3xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>What Our Clients Say</h2>
            {/* Aggregate rating — only shown when reviews exist */}
            {reviews.length > 0 && (() => {
              const avg = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);
              return (
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} size={16} fill={s <= Math.round(avg) ? '#fbbf24' : 'none'}
                        stroke={s <= Math.round(avg) ? '#fbbf24' : 'currentColor'}
                        style={{ color: '#d1d5db' }}/>
                    ))}
                  </div>
                  <span className="font-black text-lg" style={{ color: 'var(--text-primary)' }}>{avg}</span>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    / 5.0 · {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                  </span>
                </div>
              );
            })()}
          </div>
          {reviews.length === 0 ? (
            <div className="text-center py-10">
              <div className="flex justify-center gap-1 mb-3">
                {[1,2,3,4,5].map(s => <Star key={s} size={24} fill="#fbbf24" stroke="#fbbf24"/>)}
              </div>
              <p className="font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Be our first reviewer!</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Client reviews will appear here after completed bookings.</p>
            </div>
          ) : (
            <div className="relative">
              {reviews.length > 3 && (
                <>
                  <button type="button" onClick={() => scrollCarousel(reviewsRef, -1)}
                    aria-label="Previous review"
                    className="hidden sm:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full items-center justify-center shadow-lg"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--brand)' }}>
                    <ChevronLeft size={18}/>
                  </button>
                  <button type="button" onClick={() => scrollCarousel(reviewsRef, 1)}
                    aria-label="Next review"
                    className="hidden sm:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full items-center justify-center shadow-lg"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--brand)' }}>
                    <ChevronRight size={18}/>
                  </button>
                </>
              )}
              <div ref={reviewsRef}
                className="flex gap-5 overflow-x-auto pb-2"
                style={{ scrollSnapType: reviewsMarquee ? 'none' : 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                {(reviewsMarquee ? [...reviews, ...reviews] : reviews).map((r, i) => (
                  <div key={i}
                    className={reviewsInView ? 'anim-fade-slide' : 'anim-fade-slide-hidden'}
                    style={{
                      scrollSnapAlign: 'start', width: 'min(320px, 85vw)',
                      animationDelay: reviewsInView ? `${i * 0.08}s` : '0s',
                      flexShrink: 0,
                    }}>
                  {/* Float layer — its own element so the bob animation can't
                      fight the entrance animation (outer) or the hover-scale
                      spotlight transform (inner card) */}
                  <div className="h-full">
                  <div className="card card-accent h-full"
                    style={{
                      transition: 'transform 0.2s ease, filter 0.25s ease, opacity 0.25s ease',
                      // Spotlight: dim/blur this card if a sibling is hovered instead of it
                      filter: hoveredReviewIdx !== null && hoveredReviewIdx !== i ? 'blur(3px)' : 'none',
                      opacity: hoveredReviewIdx !== null && hoveredReviewIdx !== i ? 0.55 : 1,
                      transform: hoveredReviewIdx === i ? 'scale(1.02)' : 'scale(1)',
                    }}
                    onMouseEnter={() => setHoveredReviewIdx(i)}
                    onMouseLeave={() => setHoveredReviewIdx(null)}>
                    <div className="flex gap-0.5 mb-3">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} size={14} fill={s <= r.rating ? '#fbbf24' : 'none'} stroke={s <= r.rating ? '#fbbf24' : 'currentColor'}
                          style={{ color: 'var(--text-muted)' }} />
                      ))}
                    </div>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>"{r.comment}"</p>
                    {r.reply && (
                      <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                        <strong>Z's Cleaning:</strong> {r.reply}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center" style={{ background: 'var(--brand)' }}>
                        {r.client_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{r.client_name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.service_name}</p>
                      </div>
                    </div>
                  </div>
                  </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>


      {/* CTA */}
      <section className="py-16 px-4 text-center" style={{ background: 'var(--brand)' }}>
        <h2 className="font-serif text-3xl font-bold text-white mb-3">Ready for a Cleaner Home?</h2>
        <p className="text-green-100 mb-8">Book online and get a confirmation in minutes.</p>
        {user?.role === 'client' ? (
          <Link to="/book" className="inline-block bg-white font-bold text-green-700 px-8 py-3.5 rounded-xl text-base">
            Book Now →
          </Link>
        ) : (
          <Link to="/register" className="inline-block bg-white font-bold text-green-700 px-8 py-3.5 rounded-xl text-base">
            Get Started →
          </Link>
        )}
      </section>

      {/* Footer */}
      <footer className="py-12 px-4" style={{ background: 'var(--panel-dark)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">

            {/* Brand column */}
            <div>
              <p className="font-serif font-bold text-white text-lg mb-2">Z's Cleaning Services</p>
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Professional cleaning for homes and offices in Calbayog City, Samar.
              </p>
              <div className="space-y-1.5 text-sm" style={{ color: '#2CC295' }}>
                <p className="flex items-center gap-2"><Phone size={13}/> 0916-213-3460</p>
                <p className="flex items-center gap-2"><MapPin size={13}/> Calbayog City, Samar</p>
              </div>
              <a href="https://www.facebook.com/share/1L8494Z6se/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-sm font-semibold transition-colors hover:underline"
                style={{ color: 'rgba(255,255,255,0.7)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#1877F2'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
                <Facebook size={16}/> Follow us on Facebook
              </a>
            </div>

            {/* Quick links */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Quick Links</p>
              <div className="space-y-2">
                {[
                  { to: '/',            label: 'Home' },
                  { to: '/about',       label: 'About Us' },
                  { to: '/book',        label: 'Book a Service' },
                  { to: '/my-bookings', label: 'My Bookings' },
                  { to: '/messages',    label: 'Messages' },
                ].map(l => (
                  <Link key={l.to} to={l.to}
                    className="block text-sm hover:underline transition-colors"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                    onMouseEnter={e => e.target.style.color='#00DF81'}
                    onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.5)'}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Services */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Our Services</p>
              <div className="space-y-2">
                {['Standard Clean', 'Platinum Clean', 'Deep Cleaning', 'Global Add-ons'].map(s => (
                  <Link key={s} to="/book"
                    className="block text-sm hover:underline transition-colors"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                    onMouseEnter={e => e.target.style.color='#00DF81'}
                    onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.5)'}>
                    {s}
                  </Link>
                ))}
              </div>
            </div>

          </div>

          {/* Bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              © {new Date().getFullYear()} Z's Cleaning Services. All rights reserved.
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Calbayog City, Samar, Philippines
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
