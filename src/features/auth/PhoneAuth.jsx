import { useState, useEffect, useRef } from 'react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { supabase } from '../../supabaseClient.js';

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

  // true si on est en train de LIER ce numéro à une session anonyme
  // existante, plutôt que de créer/connecter un compte séparé.
  // Déterminé au moment de l'envoi du code, réutilisé à la vérification
  // pour que les deux étapes restent cohérentes.
  const [isLinkingAnonymous, setIsLinkingAnonymous] = useState(false);

  const timerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const otpInputRef = useRef(null);

  // Nettoyage des timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    };
  }, []);

  // Auto-focus et WebOTP
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
    // profiles.id = auth.users.id (UUID) uniquement
    if (!user || !user.id) return;
    const userId = user.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return;
    const normalizedPhone = normalizePhone(user.phone || phone);

    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, display_name, handle, flag, phone')
        .eq('id', userId)
        .maybeSingle();

      if (existingProfile) {
        // Ne touche jamais bio / avatar_url : on ne fait que compléter
        // les champs manquants, jamais écraser ce qui existe déjà.
        const updates = {};
        if (!existingProfile.phone && normalizedPhone) updates.phone = normalizedPhone;
        if (!existingProfile.display_name) updates.display_name = normalizedPhone || 'Membre BAARO';
        if (!existingProfile.handle) updates.handle = buildFallbackHandle(userId);
        if (!existingProfile.flag) updates.flag = '🌍';

        if (Object.keys(updates).length > 0) {
          await supabase.from('profiles').update(updates).eq('id', userId);
        }
        return;
      }

      await supabase.from('profiles').insert({
        id: userId,
        display_name: normalizedPhone || 'Membre BAARO',
        handle: buildFallbackHandle(userId),
        flag: '🌍',
        phone: normalizedPhone || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erreur mise à jour profil:', err);
      // On ne bloque pas la connexion si la mise à jour du profil échoue
    }
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
      // Si une session anonyme est active, on LIE ce numéro à ce compte
      // (updateUser + vérif type "phone_change") au lieu de créer/connecter
      // un compte séparé (signInWithOtp + vérif type "sms") : même id,
      // donc même ligne `profiles`, donc bio/avatar_url préservés.
      const { data: sessionData } = await supabase.auth.getSession();
      const anonymous = Boolean(sessionData?.session?.user?.is_anonymous);
      setIsLinkingAnonymous(anonymous);

      const { error: otpError } = anonymous
        ? await supabase.auth.updateUser({ phone: normalizedPhone })
        : await supabase.auth.signInWithOtp({ phone: normalizedPhone });

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
        type: isLinkingAnonymous ? 'phone_change' : 'sms',
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

  // --- RENDU JSX ---
  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {step === 'phone' && (
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-400">
              Numéro de téléphone
            </label>
            <PhoneInput
              international
              defaultCountry={defaultCountry}
              value={phone}
              onChange={setPhone}
              placeholder="Entre ton numéro"
              className="w-full border border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none bg-slate-950/60 text-slate-100"
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50 bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            {loading ? 'Envoi en cours...' : 'Recevoir le code'}
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form id="otp-form" onSubmit={verifyOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-400">
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
                className="w-full border border-slate-700 rounded-xl px-3 py-2.5 tracking-widest text-center text-sm outline-none font-mono bg-slate-950/60 text-slate-100 pr-20"
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
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50 bg-teal-500 text-slate-950 hover:bg-teal-400"
          >
            {loading ? 'Vérification...' : 'Valider le code'}
          </button>

          <div className="flex justify-between text-xs pt-1">
            <button type="button" onClick={changePhone} className="text-slate-400 hover:text-slate-200 hover:underline">
              Changer de numéro
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={resendCooldown > 0 || loading}
              className={`hover:underline disabled:opacity-50 ${resendCooldown > 0 ? 'text-slate-500' : 'text-amber-500'}`}
            >
              {resendCooldown > 0 ? `Renvoyer (${resendCooldown}s)` : 'Renvoyer le code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
