import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Scale,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useApp, getHomeRouteForRole } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { formatISTDateTime } from '../shared/scheduling.ts';
import { CategoryIcon, ImageWithFallback } from '../components/SharedUI.tsx';
import type { Category } from '../shared/types.ts';

const HERO_IMG = '/src/assets/images/hero_scrapease_logistics_1795230716512.jpg';
const FACILITY_IMG = '/src/assets/images/facility_recycler_sorting_1795230716307.jpg';
const COLLECTOR_IMG = '/src/assets/images/collector_portrait_verified_1795230716320.jpg';
const SORTED_IMG = '/src/assets/images/household_sorting_items_1795230716725.jpg';

export function ValueCalculatorWidget({ categories }: { categories: Category[] }) {
  const { user, navigate } = useApp();
  const [weights, setWeights] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    categories.slice(0, 3).forEach((c, idx) => {
      init[c.id] = idx === 0 ? 12 : idx === 1 ? 5 : 3;
    });
    return init;
  });

  const summary = useMemo(() => {
    let totalKg = 0;
    let totalInr = 0;
    let totalCo2 = 0;
    for (const c of categories) {
      const w = Number(weights[c.id] || 0);
      if (w > 0) {
        totalKg += w;
        totalInr += w * c.rate_per_kg;
        totalCo2 += w * c.co2_factor_per_kg;
      }
    }
    return {
      totalKg: Math.round(totalKg * 10) / 10,
      totalInr: Math.round(totalInr * 100) / 100,
      totalCo2: Math.round(totalCo2 * 10) / 10,
    };
  }, [categories, weights]);

  const handleBook = () => {
    if (user?.role === 'household') {
      navigate('/dashboard/book');
    } else if (user) {
      navigate(getHomeRouteForRole(user.role));
    } else {
      navigate('/book');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-slate-200">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-700" />
            <span>Estimated Value Calculator</span>
          </h3>
          <p className="text-sm text-slate-600 mt-0.5">
            Enter approximate weights (kg) across scrap categories for an instant Bengaluru payout estimate.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6">
        {categories.map((cat) => {
          const val = weights[cat.id] ?? 0;
          return (
            <div key={cat.id} className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-slate-900 truncate">{cat.name}</span>
                <span className="text-xs font-mono font-semibold text-emerald-800 whitespace-nowrap">
                  ₹{cat.rate_per_kg}/kg
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={0.5}
                  value={val === 0 ? '' : val}
                  placeholder="0"
                  aria-label={`${cat.name} weight in kg`}
                  onChange={(e) => {
                    const num = Math.max(0, Number(e.target.value) || 0);
                    setWeights((prev) => ({ ...prev, [cat.id]: num }));
                  }}
                  className="w-full px-3 py-1.5 text-sm font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:border-emerald-700"
                />
                <span className="text-xs font-mono text-slate-500">kg</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-xs text-slate-500">Estimated Total Weight</div>
            <div className="text-xl font-bold font-mono text-slate-900">{summary.totalKg} kg</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Estimated Payout</div>
            <div className="text-2xl font-bold font-mono text-emerald-700">₹{summary.totalInr.toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Projected CO₂ Saved</div>
            <div className="text-xl font-bold font-mono text-slate-900">{summary.totalCo2} kg</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleBook}
          className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2"
        >
          <span>Schedule This Pickup</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function HomePage() {
  const { bootstrap, user, navigate } = useApp();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const categories = bootstrap?.categories || [];
  const impact = bootstrap?.impact;
  const heroBanner = bootstrap?.banners.find((b) => b.key === 'hero');

  const handlePrimaryCta = () => {
    if (user?.role === 'household') navigate('/dashboard/book');
    else if (user) navigate(getHomeRouteForRole(user.role));
    else navigate('/book');
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <div className="text-xs font-medium text-slate-500 mb-3">
                Bengaluru Doorstep Logistics · Operating Mon–Sat, 8 AM – 8 PM IST
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.08] max-w-xl">
                {heroBanner?.title || 'Turn your scrap into value. Schedule a pickup in 60 seconds.'}
              </h1>
              <p className="text-base sm:text-lg text-slate-600 mt-5 max-w-xl leading-relaxed">
                {heroBanner?.subtitle ||
                  'Book a 2-hour pickup window across Indiranagar, Koramangala, Jayanagar, Whitefield, and HSR Layout. Verified collectors weigh on digital scales and pay via UPI or Cash at your gate.'}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handlePrimaryCta}
                  className="px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2"
                >
                  <span>{heroBanner?.cta_text || 'Schedule Pickup'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/rate-card')}
                  className="px-5 py-3 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Check Today’s ₹/kg Rates
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200">
                <ImageWithFallback
                  src={HERO_IMG}
                  alt="ScrapEase electric collection vehicle on a tree-lined Bengaluru street with sorted cardboard and recyclables"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Full-Width Impact Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-8 border-t border-slate-200">
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                {impact ? `${impact.totalKgRecycled.toLocaleString('en-IN')} kg` : '38,533 kg'}
              </div>
              <div className="text-xs sm:text-sm text-slate-600 mt-1">Scrap diverted from landfills</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-700">
                {impact ? `${impact.co2SavedKg.toLocaleString('en-IN')} kg` : '84,812 kg'}
              </div>
              <div className="text-xs sm:text-sm text-slate-600 mt-1">Estimated CO₂ emissions saved</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                {impact ? impact.treesEquivalent.toLocaleString('en-IN') : '4,038'}
              </div>
              <div className="text-xs sm:text-sm text-slate-600 mt-1">Mature trees equivalent</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                {impact ? `${impact.activeCollectors} verified` : '2 verified'}
              </div>
              <div className="text-xs sm:text-sm text-slate-600 mt-1">
                Active Bengaluru partners across {impact?.serviceAreasCount ?? 9} zones
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Rate Card & Calculator */}
      <section className="py-14 lg:py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Live Bengaluru Scrap Rate Card</h2>
              <p className="text-sm sm:text-base text-slate-600 mt-1.5 max-w-2xl">
                Transparent per-kilogram rates updated by our operations desk. No hidden deductions at your doorstep.
              </p>
            </div>
            <div className="text-xs font-mono text-slate-500">
              Last updated: {formatISTDateTime(bootstrap?.latestRateUpdate)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-slate-500 mb-3">
                    <CategoryIcon name={cat.icon} className="w-5 h-5 text-emerald-700" />
                    <span className="text-xs font-mono">{cat.co2_factor_per_kg} kg CO₂/kg</span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{cat.name}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{cat.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-emerald-700">₹{cat.rate_per_kg}</span>
                  <span className="text-xs font-mono text-slate-500">per {cat.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {categories.length > 0 && <ValueCalculatorWidget categories={categories} />}
        </div>
      </section>

      {/* How It Works + Sorted Materials Editorial Split */}
      <section className="py-14 lg:py-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-5">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200">
                <ImageWithFallback
                  src={SORTED_IMG}
                  alt="Neatly sorted newspapers, cardboard cartons, glass bottles, and copper wire coils ready for weighing"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How Doorstep Pickup Works</h2>
              <p className="text-sm sm:text-base text-slate-600 mt-2 mb-8 max-w-xl">
                Every stage is tracked in real time from booking to digital receipt.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="border border-slate-200 rounded-lg p-5">
                  <div className="text-xs font-mono text-emerald-700 font-semibold mb-1.5">01. Select Items & Weight</div>
                  <h3 className="text-base font-semibold text-slate-900">Pick categories in 60s</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Choose Paper, Metal, Plastic, E-waste, or Batteries and enter approximate weights.
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-5">
                  <div className="text-xs font-mono text-emerald-700 font-semibold mb-1.5">02. Choose IST Time Slot</div>
                  <h3 className="text-base font-semibold text-slate-900">2-hour windows, Mon–Sat</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Check Bengaluru pincode coverage and pick any slot from 8 AM to 8 PM (3h advance same-day).
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-5">
                  <div className="text-xs font-mono text-emerald-700 font-semibold mb-1.5">03. Verified Collector Arrives</div>
                  <h3 className="text-base font-semibold text-slate-900">Calibrated digital scale</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Our nearby KYC-verified partner weighs each category cleanly at your gate.
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-5">
                  <div className="text-xs font-mono text-emerald-700 font-semibold mb-1.5">04. Instant UPI & Receipt</div>
                  <h3 className="text-base font-semibold text-slate-900">Cash or UPI on the spot</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Receive instant payout plus a downloadable PDF receipt and CO₂ impact update.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials & Proof */}
      <section className="py-14 lg:py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Trusted Across Bengaluru Neighborhoods</h2>
            <p className="text-sm sm:text-base text-slate-600 mt-1">
              Real outcomes from households, apartment RWAs, and industrial recycling buyers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(bootstrap?.testimonials || []).map((t) => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  {t.metric && (
                    <div className="text-xs font-mono font-semibold text-emerald-700 mb-3">{t.metric}</div>
                  )}
                  <p className="text-sm text-slate-700 leading-relaxed">“{t.quote}”</p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500">
                    {t.role} · {t.area}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-14 lg:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Frequently Asked Questions</h2>
              <p className="text-sm text-slate-600 mt-1">Clear answers on weighing, IST slots, and instant payouts.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/faq')}
              className="text-sm font-medium text-emerald-700 hover:underline whitespace-nowrap"
            >
              View all FAQs
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 bg-white">
            {(bootstrap?.faqs || []).slice(0, 5).map((faq) => {
              const isOpen = openFaq === faq.id;
              return (
                <div key={faq.id}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50"
                  >
                    <span className="text-sm sm:text-base font-semibold text-slate-900">{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && <div className="px-6 pb-4 text-sm text-slate-600 leading-relaxed">{faq.answer}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

export function RateCardPage() {
  const { bootstrap } = useApp();
  const categories = bootstrap?.categories || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Services & Live Rate Card</h1>
          <p className="text-base text-slate-600 mt-2 max-w-2xl">
            Standardized per-kilogram payouts across Bengaluru. Verified collectors weigh on digital scales before settling via UPI or Cash.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">
          Rates updated: {formatISTDateTime(bootstrap?.latestRateUpdate)}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3.5 px-5">Category</th>
                <th className="py-3.5 px-5">Accepted Items</th>
                <th className="py-3.5 px-5 text-right">CO₂ Saved / kg</th>
                <th className="py-3.5 px-5 text-right">Live Rate (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-50/60">
                  <td className="py-4 px-5 font-semibold text-slate-900">
                    <div className="flex items-center gap-3">
                      <CategoryIcon name={cat.icon} className="w-5 h-5 text-emerald-700 shrink-0" />
                      <span>{cat.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-5 text-slate-600">{cat.description}</td>
                  <td className="py-4 px-5 text-right font-mono text-slate-700">{cat.co2_factor_per_kg} kg</td>
                  <td className="py-4 px-5 text-right font-mono font-bold text-emerald-700">
                    ₹{cat.rate_per_kg}/{cat.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {categories.length > 0 && <ValueCalculatorWidget categories={categories} />}
    </div>
  );
}

export function HowItWorksPage() {
  const { bootstrap, navigate } = useApp();
  const settings = bootstrap?.settings;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">How ScrapEase Works</h1>
        <p className="text-base text-slate-600 mt-3 leading-relaxed">
          From 60-second doorstep scheduling to verified recycler dispatch, every pickup follows strict IST slot guarantees and transparent digital weighing.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            step: '01. Choose Categories',
            title: 'Select scrap & approximate weight',
            body: 'Pick from 8 standardized categories and preview your payout immediately with our live rate card.',
            icon: <Scale className="w-5 h-5 text-emerald-700" />,
          },
          {
            step: '02. Verify Pincode & Slot',
            title: 'Bengaluru 2-hour windows',
            body: 'Check active Bengaluru pincodes and reserve a 2-hour slot between 8:00 AM and 8:00 PM IST.',
            icon: <Clock className="w-5 h-5 text-emerald-700" />,
          },
          {
            step: '03. Auto-Dispatch',
            title: 'Nearest online collector assigned',
            body: 'Our system matches the nearest KYC-approved collector serving your pincode, with 15-minute fallback protection.',
            icon: <Truck className="w-5 h-5 text-emerald-700" />,
          },
          {
            step: '04. Weigh, Pay & Track',
            title: 'UPI or Cash + PDF receipt',
            body: 'Weights are confirmed on a digital scale, paid instantly, and logged in your CO₂ impact ledger.',
            icon: <ShieldCheck className="w-5 h-5 text-emerald-700" />,
          },
        ].map((card) => (
          <div key={card.step} className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-semibold text-emerald-700">{card.step}</span>
              {card.icon}
            </div>
            <h3 className="text-base font-semibold text-slate-900">{card.title}</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Scheduling & Operating Rules (IST)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-semibold text-slate-900 mb-1">Operating Days & Hours</div>
            <p className="text-slate-600">
              Monday through Saturday, 8:00 AM to 8:00 PM IST across six 2-hour windows. Closed Sundays and configured public holidays.
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-900 mb-1">Advance Notice & Capacity</div>
            <p className="text-slate-600">
              Same-day booking is available for slots starting at least 3 hours from current IST time. Advance booking open up to 14 days (max {settings?.default_slot_capacity ?? 10} pickups per area slot).
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-900 mb-1">Reschedule & Cancellation</div>
            <p className="text-slate-600">
              Reschedule or cancel free up to 2 hours prior to slot start. Changes inside 2 hours display a warning and are flagged for dispatch.
            </p>
          </div>
        </div>

        {settings && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-700" />
              <span>Active Bengaluru Service Zones</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-mono text-slate-600">
              {settings.service_areas
                .filter((a) => a.active)
                .map((a) => (
                  <span key={a.pincode}>
                    {a.area} ({a.pincode})
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => navigate('/register')}
          className="px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
        >
          Create Account & Book Pickup
        </button>
      </div>
    </div>
  );
}

export function ForCollectorsPage() {
  const { navigate } = useApp();
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-center">
          <div className="text-xs font-mono text-emerald-700 font-semibold mb-2">Collector Partner Program</div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            Steady neighborhood pickups without idle street cruising.
          </h1>
          <p className="text-base text-slate-600 mt-4 leading-relaxed">
            Register with Aadhaar or Driving Licence KYC and your cargo vehicle. Toggle Online/Offline anytime, receive pre-scheduled 2-hour slots in your chosen Bengaluru pincodes, and log digital scale weights cleanly.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
              'Auto-assigned jobs matched to your pincodes',
              'Transparent working hours & day-off controls',
              'Digital weight entry & instant UPI/Cash receipts',
              'Verified partner badge & household star ratings',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/register?role=collector')}
              className="px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Register as Scrap Collector
            </button>
            <button
              type="button"
              onClick={() => navigate('/login/collector')}
              className="px-6 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Collector Partner Sign In
            </button>
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200">
            <ImageWithFallback
              src={COLLECTOR_IMG}
              alt="Verified ScrapEase collection partner holding digital hanging scale beside cargo cart"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ForRecyclersPage() {
  const { navigate } = useApp();
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-6">
          <div className="h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200">
            <ImageWithFallback
              src={FACILITY_IMG}
              alt="Clean material recovery and recycling sorting facility with baled cardboard and sorted plastics"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        <div className="lg:col-span-6 flex flex-col justify-center">
          <div className="text-xs font-mono text-emerald-700 font-semibold mb-2">Industrial & MRF Buyers</div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            Source aggregated, category-sorted scrap lots directly.
          </h1>
          <p className="text-base text-slate-600 mt-4 leading-relaxed">
            Authorized recyclers and material recovery facilities publish accepted material streams and buying ₹/kg rates, browse live zone-wise aggregated tonnage, and submit verified bulk purchase orders.
          </p>
          <div className="mt-6 space-y-2.5 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>GST-verified business onboarding & compliance tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Real-time Bengaluru lot availability by material & neighborhood</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>End-to-end order lifecycle from request to dispatch</span>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/register?role=recycler')}
              className="px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Register Recycler Facility
            </button>
            <button
              type="button"
              onClick={() => navigate('/login/recycler')}
              className="px-6 py-3 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Recycler Business Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">About ScrapEase</h1>
      <p className="text-base text-slate-700 leading-relaxed">
        ScrapEase is a Bengaluru-born circular logistics platform built to replace opaque neighborhood scrap bargaining with predictable doorstep pickup slots, calibrated digital weighing, and traceable material recovery.
      </p>
      <p className="text-base text-slate-700 leading-relaxed">
        By connecting urban households, verified independent collectors, and GST-compliant recyclers in one unified system, ScrapEase increases household recovery rates while improving collector route efficiency and income stability.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-2xl font-bold font-mono text-emerald-700">100%</div>
          <div className="text-sm text-slate-600 mt-1">Digital scale weight verification at doorstep</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-2xl font-bold font-mono text-slate-900">15 min</div>
          <div className="text-sm text-slate-600 mt-1">Auto-dispatch SLA with manual hub backup</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-2xl font-bold font-mono text-slate-900">IST</div>
          <div className="text-sm text-slate-600 mt-1">Strict timezone-safe slot & reminder engine</div>
        </div>
      </div>
    </div>
  );
}

export function FaqPage() {
  const { bootstrap } = useApp();
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Frequently Asked Questions</h1>
        <p className="text-sm text-slate-600 mt-1">Everything you need to know about ScrapEase pickups, rates, and partners.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {(bootstrap?.faqs || []).map((faq) => {
          const open = openId === faq.id;
          return (
            <div key={faq.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : faq.id)}
                className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50"
              >
                <div>
                  <div className="text-xs font-mono text-emerald-700 mb-0.5">{faq.category}</div>
                  <div className="text-base font-semibold text-slate-900">{faq.question}</div>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </button>
              {open && <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed">{faq.answer}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setStatus({ type: 'ok', text: res.message });
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err) {
      setStatus({ type: 'err', text: err instanceof Error ? err.message : 'Unable to send message.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-4">
          <h1 className="text-3xl font-bold text-slate-900">Contact ScrapEase</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Questions about apartment society drives, collector onboarding, or bulk recycler lots? Reach our Bengaluru operations desk directly.
          </p>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
            <div>
              <div className="font-semibold text-slate-900">Bengaluru Hub</div>
              <div className="text-slate-600">100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru 560038</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Support Hours</div>
              <div className="font-mono text-slate-600 text-xs">Mon–Sat · 8:00 AM – 8:00 PM IST</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Email</div>
              <div className="text-slate-600">support@scrapease.in</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number (Optional)</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="9845012345"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
                <input
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Apartment RWA pickup / Partner query"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
              <textarea
                required
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            {status && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  status.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {status.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg"
            >
              {submitting ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-5 text-sm text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
      <p>
        ScrapEase collects contact details, pickup addresses, and KYC verification records strictly to schedule doorstep scrap collections, assign nearby verified collectors, settle payouts, and comply with Indian recycling and GST regulations.
      </p>
      <p>
        Passwords are hashed using bcrypt, sessions use signed HTTP-only tokens, and collector/recycler identity documents are accessible solely to authorized ScrapEase administrators during KYC review.
      </p>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-5 text-sm text-slate-700 leading-relaxed">
      <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
      <p>
        Pickups operate Monday–Saturday between 8:00 AM and 8:00 PM IST. Same-day requests require a minimum 3-hour lead time prior to slot start. Rescheduling and cancellations are free up to 2 hours before the slot start; late changes are flagged for dispatch management.
      </p>
      <p>
        Final payout amounts are determined by actual category-wise weights measured on calibrated digital scales at the pickup address against published live ₹/kg rates. Hazardous medical waste or pressurized cylinders are not accepted.
      </p>
    </div>
  );
}
