import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Upload } from 'lucide-react';
import { useApp } from '../context/AuthContext.tsx';
import { GoogleSignInButton } from './AuthPages.tsx';
import { apiFetch, readImageFileAsDataUrl } from '../lib/api.ts';
import { CategoryIcon, SkeletonRows, StatusText } from '../components/SharedUI.tsx';
import { formatISTDate, getBookingDateOptions, type SlotAvailability } from '../shared/scheduling.ts';
import type { Pickup } from '../shared/types.ts';

export function PublicBookingPage() {
  const { bootstrap, navigate, user, loginWithGoogleHousehold } = useApp();
  const categories = bootstrap?.categories || [];
  const settings = bootstrap?.settings;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [googleLoading, setGoogleLoading] = useState(false);

  // Contact & Address
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [pincode, setPincode] = useState(settings?.service_areas[0]?.pincode || '560038');
  const [area, setArea] = useState(settings?.service_areas[0]?.area || 'Indiranagar');

  useEffect(() => {
    if (user) {
      if (!name) setName(user.name);
      if (!email) setEmail(user.email);
      if (!phone && user.phone) setPhone(user.phone);
    }
  }, [user, name, email, phone]);

  useEffect(() => {
    if (settings?.service_areas.length && !area) {
      setPincode(settings.service_areas[0].pincode);
      setArea(settings.service_areas[0].area);
    }
  }, [settings, area]);

  // Date & Slot
  const dateOptions = useMemo(() => (settings ? getBookingDateOptions(settings) : []), [settings]);
  const firstOperatingDate = dateOptions.find((d) => d.isOperatingDay && !d.isHoliday)?.dateStr || '';
  const [pickupDate, setPickupDate] = useState(firstOperatingDate);
  const [slotId, setSlotId] = useState('');
  const [slotAvailabilities, setSlotAvailabilities] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!pickupDate && firstOperatingDate) setPickupDate(firstOperatingDate);
  }, [pickupDate, firstOperatingDate]);

  useEffect(() => {
    if (!pickupDate || pincode.length !== 6) return;
    let cancelled = false;
    setLoadingSlots(true);
    apiFetch<{ slots: SlotAvailability[] }>(
      `/api/public/slots?date=${encodeURIComponent(pickupDate)}&pincode=${encodeURIComponent(pincode)}`
    )
      .then((res) => {
        if (cancelled) return;
        setSlotAvailabilities(res.slots);
        setSlotId((prev) => {
          if (res.slots.find((s) => s.slot.id === prev && s.available)) return prev;
          const first = res.slots.find((s) => s.available);
          return first ? first.slot.id : '';
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickupDate, pincode]);

  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedPickup, setConfirmedPickup] = useState<Pickup | null>(null);

  const selectedItems = useMemo(() => {
    return categories
      .filter((c) => Number(weights[c.id] || 0) > 0)
      .map((c) => {
        const w = Number(weights[c.id]);
        return {
          category_id: c.id,
          category_name: c.name,
          est_weight: w,
          rate_per_kg: c.rate_per_kg,
          amount: Math.round(w * c.rate_per_kg * 100) / 100,
        };
      });
  }, [categories, weights]);

  const estTotalWeight = selectedItems.reduce((s, i) => s + i.est_weight, 0);
  const estTotalAmount = selectedItems.reduce((s, i) => s + i.amount, 0);
  const isAreaServiceable = Boolean(settings?.service_areas.find((a) => a.pincode === pincode && a.active));

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4 - photos.length);
    setError(null);
    try {
      const converted = await Promise.all(files.map(readImageFileAsDataUrl));
      setPhotos((prev) => [...prev, ...converted].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid photo upload.');
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ pickup: Pickup }>('/api/public/book', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          phone,
          address: {
            label: 'Home',
            line1,
            line2,
            area,
            city: 'Bengaluru',
            pincode,
          },
          items: selectedItems.map((i) => ({ category_id: i.category_id, est_weight: i.est_weight })),
          pickup_date: pickupDate,
          slot_id: slotId,
          notes,
          photos,
        }),
      });
      setConfirmedPickup(res.pickup);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to book pickup.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedPickup) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Pickup Appointment Confirmed</h1>
              <p className="text-sm text-slate-600 mt-1">
                Reference <span className="font-mono font-semibold text-slate-900">{confirmedPickup.code}</span> ·{' '}
                <StatusText status={confirmedPickup.status} />
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">Scheduled Window</div>
              <div className="font-semibold text-slate-900 mt-0.5">{formatISTDate(confirmedPickup.pickup_date)}</div>
              <div className="text-xs font-mono text-emerald-700 mt-0.5">{confirmedPickup.slot_label} IST</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Collector & Location</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {confirmedPickup.collector_name || 'Assigning nearby collector'}
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                {confirmedPickup.area} ({confirmedPickup.pincode})
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-5 py-2.5 text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              Back to Home
            </button>
            <button
              type="button"
              onClick={() => navigate('/login/household')}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Sign In to Track Pickups
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleGoogleBookSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const authed = await loginWithGoogleHousehold();
      setName(authed.name);
      setEmail(authed.email);
      if (authed.phone) setPhone(authed.phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Schedule a Scrap Pickup</h1>
        <p className="text-sm text-slate-600 mt-1">
          Book a 2-hour doorstep collection slot across Bengaluru in 4 quick steps.
        </p>
      </div>

      {!user ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Save addresses & track pickups with Google</div>
            <div className="text-xs text-slate-600 mt-0.5">
              Optional: Sign in as a Household customer with Google, or continue filling this booking below.
            </div>
          </div>
          <div className="sm:w-64 shrink-0">
            <GoogleSignInButton onClick={handleGoogleBookSignIn} loading={googleLoading} />
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-900 flex items-center justify-between gap-2">
          <span>
            Signed in as <strong>{user.name}</strong> ({user.email})
          </span>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="font-semibold text-emerald-800 hover:underline whitespace-nowrap"
          >
            Open Household Dashboard
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { num: 1, label: '01. Categories' },
          { num: 2, label: '02. Contact & Address' },
          { num: 3, label: '03. Date & Slot' },
          { num: 4, label: '04. Review' },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            disabled={s.num > step}
            onClick={() => s.num <= step && setStep(s.num as 1 | 2 | 3 | 4)}
            className={`px-3 py-2.5 text-xs sm:text-sm font-medium rounded-lg border text-left ${
              step === s.num
                ? 'border-emerald-700 bg-emerald-50 text-emerald-800 font-semibold'
                : s.num < step
                  ? 'border-slate-200 bg-white text-slate-900'
                  : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 1: Select Scrap Categories & Approx. Weights</h2>
              <p className="text-sm text-slate-600 mt-1">Actual payout is calculated on a calibrated digital scale at pickup.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map((cat) => {
                const w = weights[cat.id] ?? 0;
                return (
                  <div
                    key={cat.id}
                    className={`border rounded-xl p-4 ${w > 0 ? 'border-emerald-700 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <CategoryIcon name={cat.icon} className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{cat.name}</div>
                          <div className="text-xs font-mono text-emerald-700">₹{cat.rate_per_kg}/{cat.unit}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          step={0.5}
                          value={w === 0 ? '' : w}
                          placeholder="0"
                          onChange={(e) => setWeights((prev) => ({ ...prev, [cat.id]: Math.max(0, Number(e.target.value) || 0) }))}
                          className="w-20 px-2.5 py-1.5 text-sm font-mono text-right border border-slate-300 rounded-lg bg-white"
                        />
                        <span className="text-xs font-mono text-slate-500">kg</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div className="font-mono text-sm">
                <span className="text-slate-500">Est. Payout: </span>
                <strong className="text-lg text-emerald-700">₹{estTotalAmount.toLocaleString('en-IN')}</strong>
                <span className="text-slate-500 ml-2">({estTotalWeight.toFixed(1)} kg)</span>
              </div>
              <button
                type="button"
                disabled={selectedItems.length === 0}
                onClick={() => setStep(2)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-slate-900">Step 2: Contact & Bengaluru Pickup Address</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">10-Digit Mobile</label>
                <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9845012345" className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">House / Flat & Street</label>
                <input required value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="42, 12th Main Road" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Landmark (Optional)</label>
                <input value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Near Metro Station" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Service Area (Bengaluru)</label>
                <select
                  value={pincode}
                  onChange={(e) => {
                    const sa = settings?.service_areas.find((a) => a.pincode === e.target.value);
                    setPincode(e.target.value);
                    if (sa) setArea(sa.area);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {(settings?.service_areas || []).map((sa) => (
                    <option key={sa.pincode} value={sa.pincode}>
                      {sa.area} ({sa.pincode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Pincode</label>
                <input value={pincode} onChange={(e) => setPincode(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
              </div>
            </div>
            {!isAreaServiceable && pincode.length === 6 && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                Pincode {pincode} is currently outside our active Bengaluru service zones.
              </div>
            )}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button type="button" onClick={() => setStep(1)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={!isAreaServiceable || name.trim().length < 2 || !email.includes('@') || phone.trim().length < 10 || line1.trim().length < 4}
                onClick={() => setStep(3)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2"
              >
                <span>Choose Date & Slot</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 3: Choose Pickup Date & 2-Hour IST Slot</h2>
              <p className="text-sm text-slate-600 mt-1">Mon–Sat, 8:00 AM – 8:00 PM IST. Same-day requires 3h notice.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {dateOptions.map((d) => {
                const disabled = !d.isOperatingDay || d.isHoliday;
                const selected = pickupDate === d.dateStr;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPickupDate(d.dateStr)}
                    className={`p-3 text-left rounded-lg border ${
                      disabled
                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                        : selected
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">{d.label}</div>
                    <div className="text-[11px] font-mono mt-0.5">{d.reason || d.dateStr}</div>
                  </button>
                );
              })}
            </div>
            {loadingSlots ? (
              <SkeletonRows rows={2} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {slotAvailabilities.map((sa) => (
                  <button
                    key={sa.slot.id}
                    type="button"
                    disabled={!sa.available}
                    onClick={() => setSlotId(sa.slot.id)}
                    className={`p-3.5 text-left rounded-lg border ${
                      !sa.available
                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                        : slotId === sa.slot.id
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-semibold font-mono">{sa.slot.label}</div>
                    <div className="text-xs mt-1">{sa.available ? `${sa.remaining} slots open` : sa.reason}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button type="button" onClick={() => setStep(2)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={!pickupDate || !slotId}
                onClick={() => setStep(4)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2"
              >
                <span>Review Booking</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-900">Step 4: Confirm Appointment</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Customer & Location</div>
                <div className="font-semibold text-slate-900 mt-0.5">{name} ({phone})</div>
                <div className="text-xs text-slate-600 mt-0.5">{line1}, {area} — {pincode}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Appointment Window</div>
                <div className="font-semibold text-slate-900 mt-0.5">{formatISTDate(pickupDate)}</div>
                <div className="text-xs font-mono text-emerald-700 mt-0.5">
                  {slotAvailabilities.find((s) => s.slot.id === slotId)?.slot.label} IST
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes (Optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Gate instructions or material details"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Photos (Optional)</label>
              <div className="flex flex-wrap gap-3">
                {photos.map((src, idx) => (
                  <img key={idx} src={src} alt={`Scrap ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                ))}
                {photos.length < 4 && (
                  <label className="w-16 h-16 border border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer text-[11px] text-slate-500">
                    <Upload className="w-4 h-4 text-emerald-700" />
                    <span>Add</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handlePhotoUpload} className="hidden" />
                  </label>
                )}
              </div>
            </div>
            {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button type="button" onClick={() => setStep(3)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirm}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg"
              >
                {submitting ? 'Confirming...' : `Confirm Appointment (Est. ₹${estTotalAmount.toLocaleString('en-IN')})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
