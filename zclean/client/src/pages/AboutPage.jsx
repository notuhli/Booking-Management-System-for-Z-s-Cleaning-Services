import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, CalendarCheck, Sparkles, MapPin, Target, Eye, ArrowRight,
} from 'lucide-react';
import Navbar from '../components/Navbar.jsx';

// ── About Us ─────────────────────────────────────────────────────────────────
// Static marketing content: who Z's Cleaning Services are, what they promise,
// and where they operate. Nothing here reads from the API, so the page renders
// instantly and can't fail — deliberate, since it's often the first page a
// prospective client opens after the homepage.

const WHY_US = [
  { icon: ShieldCheck,   title: 'Professional Service',
    text: 'Experienced and dedicated cleaning staff for different types of spaces.' },
  { icon: CalendarCheck, title: 'Easy Booking',
    text: 'Schedule your cleaning service through our convenient online booking system.' },
  { icon: Sparkles,      title: 'Quality Cleaning',
    text: 'We focus on cleanliness, attention to detail, and customer satisfaction.' },
  { icon: MapPin,        title: 'Local & Reliable',
    text: 'Serving Calbayog City, Gandara, Sta. Margarita, and San Jorge.' },
];

const AREAS = ['Calbayog City', 'Gandara', 'Sta. Margarita', 'San Jorge'];

export default function AboutPage() {
  // Reveal sections as they scroll into view — matches the homepage's
  // entrance behaviour so the two pages feel like one site.
  const [seen, setSeen] = useState({});
  const refs = useRef({});
  useEffect(() => {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) setSeen(s => ({ ...s, [e.target.dataset.k]: true }));
      }),
      { threshold: 0.15 }
    );
    Object.values(refs.current).forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const reg = (k) => (el) => { if (el) { el.dataset.k = k; refs.current[k] = el; } };
  const cls = (k) => (seen[k] ? 'anim-fade-slide' : 'anim-fade-slide-hidden');

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ minHeight: 420 }}>
        <img src="/staff/staff-4.jpg" alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(100deg, rgba(3,34,33,0.94) 0%, rgba(3,34,33,0.82) 45%, rgba(3,34,33,0.35) 100%)' }} />
        <div className="relative max-w-5xl mx-auto px-4 py-20">
          <p className="eyebrow mb-4" style={{ color: 'var(--brand-bright)' }}>About Z's Cleaning Services</p>
          <h1 className="font-serif font-black text-white leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>
            Making Homes and Workplaces<br />
            <span style={{ color: 'var(--brand-bright)' }}>Cleaner, Healthier,<br />and More Comfortable</span>
          </h1>
          <p className="text-green-100 text-sm">One space at a time.</p>
          <div className="w-16 h-0.5 mt-6" style={{ background: 'var(--brand-bright)' }} />
        </div>
      </section>

      {/* ── Intro ── */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <div ref={reg('intro')} className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center ${cls('intro')}`}>
          <img src="/staff/staff-1.jpg" alt="Z's Cleaning Services team at work"
            loading="lazy"
            className="rounded-2xl w-full h-64 lg:h-80 object-cover" />
          <div>
            <h2 className="font-serif font-bold text-xl mb-4 flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}>
              <ShieldCheck size={20} style={{ color: 'var(--brand)' }} />
              Professional Cleaning You Can Trust
            </h2>
            <div className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <p>
                Z's Cleaning Services is a local cleaning service dedicated to providing
                reliable, affordable, and high-quality cleaning solutions for homes and offices.
              </p>
              <p>
                We aim to make booking a cleaning service simple, convenient, and stress-free
                for customers in Calbayog City and nearby areas.
              </p>
              <p>
                Through our online booking system, you can easily choose a cleaning package,
                select an available date, provide your details, and wait for booking confirmation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mission & Vision ── */}
      <section className="max-w-5xl mx-auto px-4 pb-14">
        <div ref={reg('mv')} className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${cls('mv')}`}>
          {[
            { icon: Target, title: 'Our Mission',
              text: 'To provide dependable and professional cleaning services while helping our customers maintain clean, safe, and comfortable spaces.' },
            { icon: Eye, title: 'Our Vision',
              text: 'To become a trusted cleaning service provider in Samar, known for quality service, reliability, and customer satisfaction.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl p-6" style={{ background: 'var(--panel-dark)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(0,223,129,0.15)', color: 'var(--brand-bright)' }}>
                  <Icon size={18} />
                </div>
                <h3 className="font-serif font-bold" style={{ color: 'var(--brand-bright)' }}>{title}</h3>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why Choose Us ── */}
      <section className="home-band-pale py-14 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-serif font-bold text-xl text-center mb-8" style={{ color: 'var(--text-primary)' }}>
            Why Choose Us?
          </h2>
          <div ref={reg('why')} className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${cls('why')}`}>
            {WHY_US.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card card-accent p-5 text-center h-full">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'var(--brand-pale)', color: 'var(--brand)' }}>
                  <Icon size={22} />
                </div>
                <h3 className="font-bold text-sm mb-1.5" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Areas We Serve ── */}
      <section className="py-14 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-serif font-bold text-xl text-center mb-8" style={{ color: 'var(--text-primary)' }}>
            Areas We Serve
          </h2>
          <div ref={reg('areas')} className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${cls('areas')}`}>
            {AREAS.map(area => (
              <div key={area} className="card p-5 flex flex-col items-center justify-center gap-2 h-full">
                <MapPin size={20} style={{ color: 'var(--brand)' }} />
                <p className="font-semibold text-sm text-center" style={{ color: 'var(--text-primary)' }}>{area}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-5"
          style={{ background: 'var(--panel-dark)' }}>
          <div>
            <h2 className="font-serif font-bold text-xl text-white mb-1.5">Ready for a Cleaner Space?</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Let Z's Cleaning Services take care of the cleaning while you focus on what matters most.
            </p>
          </div>
          <Link to="/book" className="btn-primary shrink-0 flex items-center gap-2">
            Book a Cleaning Service <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
