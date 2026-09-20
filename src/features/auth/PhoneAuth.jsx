import { useState, useEffect, useRef } from 'react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { supabase } from '../../supabaseClient.js';
import { COLORS } from '../../theme.js';

const RESEND_DELAY = 30;

function guessDefaultCountry() {
  try {
    const locale = navigator.language || navigator.languages?.[0] || '';
    const region = locale.split('-')[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch (e) {}
  return 'ML';
}

function normalizePhone(value) {
  if (!value) return '';
  const normalized = value.replace(/[^\d+]/g, '');
  return normalized.startsWith('+') ? normalized : '+' + normalized;
}

function buildFallbackHandle(userId) {
  const cleanId = String(userId).replace(/-/g, '').slice(0, 12);
  return `@user_${cleanId}`;
}

export default function PhoneAuth({ onAuthSuccess }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [defaultCountry] = useState(guessDefaultCountry);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300);

  const timerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const otpInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => {
        if (otpInputRef.current) otpInputRef.current.focus();
      }, 100);

      if ('credentials' in navigator && 'OTPCredential' in window) {
        const abortController = new AbortController();
        navigator.credentials
          .get({ otp: { transport: ['sms'] }, signal: abortController.signal })
          .then((credential) => {
            if (credential && credential.code) {
              const code = credential.code.replace(/\D/g, '').slice(0, 6);
              setOtp(code);
              setTimeout(() => {
                const form = document.getElementById('otp-form');
                if (form) form.requestSubmit();
              }, 500);
            }
          })
          .catch((err) => console.log('WebOTP non disponible:', err));
        return () => abortController.abort();
      }
    }
  }, [step]);

  function startCooldown() {
    if (timerRef.current) clearInterval(timerRef.current);
    setResendCooldown(RESEND_DELAY);
    timerRef.current = setInterval(() => {
      setResendCooldown((seconds) => {
        if (seconds <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  function startExpiryTimer() {
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    setTimeLeft(300);
    expiryTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === 60) setError('⚠️ Le code expire dans moins d\'une minute');
        if (prev <= 1) {
          clearInterval(expiryTimerRef.current);
          setError('Code expiré. Veuillez en demander un nouveau.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function ensureProfile(user) {
    if (!user || !user.id) throw new Error('Identifiant introuvable.');
    const userId = user.id;
    const normalizedPhone = normalizePhone(user.phone || phone);

    const { data: existingProfile, error: profileReadError } = await supabase
      .from('profiles')
      .select('id, display_name, handle, flag, bio, phone')
      .eq('id', userId)
      .maybeSingle();

    if (profileReadError) throw profileReadError;

    if (existingProfile) {
      const updates = {};
      if (!existingProfile.phone && normalizedPhone) updates.phone = normalizedPhone;
      if (!existingProfile.display_name) updates.display_name = normalizedPhone || 'Membre BAARO';
      if (!existingProfile.handle) updates.handle = buildFallbackHandle(userId);
      if (!existingProfile.flag) updates.flag = '🌍';

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId);
        if (updateError) throw updateError;
      }
      return;
    }

    const profile = {
      id: userId,
      display_name: normalizedPhone || 'Membre BAARO',
      handle: buildFallbackHandle(userId),
      flag: '🌍',
      bio: '',
      phone: normalizedPhone || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from('profiles').insert(profile);
    if (insertError) throw insertError;
  }

  async function sendOtp(event) {
    if (event) event.preventDefault();
    setError('');

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) {
      setError('Numéro de téléphone invalide.');
      return;
    }

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
      });
      if (otpError) throw otpError;

      setPhone(normalizedPhone);
      setStep('otp');
      setOtp('');
      startCooldown();
      startExpiryTimer();
    } catch (err) {
      console.error('Erreur envoi OTP:', err);
      setError(err.message || "Impossible d'envoyer le code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event) {
    if (event) event.preventDefault();
    setError('');

    const normalizedOtp = otp.replace(/\D/g, '');
    if (normalizedOtp.length !== 6) {
      setError('Le code doit contenir 6 chiffres.');
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    setLoading(true);

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: normalizedOtp,
        type: 'sms',
      });

      if (verifyError) {
        if (verifyError.message.includes('expired') || verifyError.message.includes('invalid')) {
          setError('Code expiré ou invalide. Cliquez sur "Renvoyer le code".');
        } else {
          throw verifyError;
        }
        return;
      }

      if (!data || !data.user || !data.user.id) {
        throw new Error('Identifiant introuvable.');
      }

      await ensureProfile(data.user);
      if (onAuthSuccess) onAuthSuccess(data.user);
    } catch (err) {
      console.error('Erreur vérification OTP:', err);
      setError(err.message || 'Code incorrect.');
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (resendCooldown > 0 || loading) return;
    await sendOtp();
  }

  function changePhone() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (expiryTimerRef.current) {
      clearInterval(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    setResendCooldown(0);
    setTimeLeft(300);
    setOtp('');
    setError('');
    setStep('phone');
  }

  function handleOtpChange(event) {
    const value = event.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(value);
  }

  async function handlePasteCode() {
    try {
      const text = await navigator.clipboard.readText();
      const code = text.replace(/\D/g, '').slice(0, 6);
      if (code.length === 6) {
        setOtp(code);
        setTimeout(() => {
          const form = document.getElementById('otp-form');
          if (form) form.requestSubmit();
        }, 300);
      } else {
        setError('Code invalide (6 chiffres requis).');
      }
    } catch (err) {
      setError('Impossible de coller. Saisissez manuellement.');
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {step === 'phone' && (
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: COLORS.muted }}>
              Numéro de téléphone
            </label>
            <PhoneInput
              international
              defaultCountry={defaultCountry}
              value={phone}
              onChange={setPhone}
              placeholder="Entre ton numéro"
              className="w-full border rounded-xl px-3 py-2.5 text-xs outline-none phone-input-baaro bg-slate-950/60"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50"
            style={{ background: COLORS.gold, color: COLORS.bg }}
          >
            {loading ? 'Envoi en cours...' : 'Recevoir le code'}
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form id="otp-form" onSubmit={verifyOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: COLORS.muted }}>
              Code reçu par SMS ({phone})
            </label>

            <div className={`mb-3 text-center text-sm font-semibold ${timeLeft < 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ⏱️ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </div>

            <div className="relative">
              <input
                ref={otpInputRef}
                type="text"
                id="otp"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={handleOtpChange}
                className="w-full border rounded-xl px-3 py-2.5 tracking-widest text-center text-sm outline-none font-mono bg-slate-950/60 pr-20"
                style={{ borderColor: COLORS.border, color: COLORS.ivory }}
                required
              />
              <button
                type="button"
                onClick={handlePasteCode}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700"
              >
                Coller
              </button>
            </div>

            <p className="text-xs text-slate-500 text-center mt-2">
              Code à 6 chiffres envoyé au {phone}
            </p>
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50"
            style={{ background: COLORS.teal, color: COLORS.bg }}
          >
            {loading ? 'Vérification...' : 'Valider le code'}
          </button>

          <div className="flex justify-between text-xs pt-1">
            <button type="button" onClick={changePhone} style={{ color: COLORS.muted }} className="hover:underline">
              Changer de numéro
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={resendCooldown > 0 || loading}
              style={{ color: resendCooldown > 0 ? COLORS.muted : COLORS.gold }}
              className="disabled:opacity-50 hover:underline"
            >
              {resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : 'Renvoyer le code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
            }
