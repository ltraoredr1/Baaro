import { useState, useEffect, useRef } from 'react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { supabase } from '../../supabaseClient.js'; // ✅ Utilisation du client centralisé
import { COLORS } from '../../theme.js'; // ✅ Intégration du thème BAARO

const RESEND_DELAY = 30; // secondes

function guessDefaultCountry() {
  try {
    const locale = navigator.language || navigator.languages?.[0] || '';
    const region = locale.split('-')[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch {
    // ignore
  }
  return 'ML'; // Repli par défaut (Mali)
}

export default function PhoneAuth({ onAuthSuccess }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone] = useState(''); 
  const [defaultCountry] = useState(guessDefaultCountry);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  function startCooldown() {
    setResendCooldown(RESEND_DELAY);
    timerRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function sendOtp(e) {
    e?.preventDefault();
    setError('');

    if (!phone || !isValidPhoneNumber(phone)) {
      setError('Numéro de téléphone invalide pour ce pays.');
      return;
    }

    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone, 
    });
    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setStep('otp');
    startCooldown();
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setError('');

    if (otp.trim().length < 4) {
      setError('Code invalide.');
      return;
    }

    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: otp.trim(),
      type: 'sms',
    });

    if (verifyError) {
      setLoading(false);
      setError(verifyError.message);
      return;
    }

    // Vérifie/crée la ligne profiles liée à cet utilisateur
    const userId = data.user.id;
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabase.from('profiles').insert({
        id: userId,
        phone,
        created_at: new Date().toISOString(),
      });
    }

    setLoading(false);
    onAuthSuccess?.(data.user);
  }

  async function resendOtp() {
    if (resendCooldown > 0) return;
    await sendOtp();
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
        <form onSubmit={verifyOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: COLORS.muted }}>
              Code reçu par SMS ({phone})
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 tracking-widest text-center text-sm outline-none font-mono bg-slate-950/60"
              style={{ borderColor: COLORS.border, color: COLORS.ivory }}
              required
              autoFocus
            />
          </div>
          {error && <p className="text-rose-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50"
            style={{ background: COLORS.teal, color: COLORS.bg }}
          >
            {loading ? 'Vérification...' : 'Valider le code'}
          </button>
          <div className="flex justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => setStep('phone')}
              style={{ color: COLORS.muted }}
              className="hover:underline"
            >
              Changer de numéro
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={resendCooldown > 0}
              style={{ color: resendCooldown > 0 ? COLORS.muted : COLORS.gold }}
              className="disabled:opacity-50 hover:underline"
            >
              {resendCooldown > 0
                ? `Renvoyer (${resendCooldown}s)`
                : 'Renvoyer le code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
