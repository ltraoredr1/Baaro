import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import PhoneInput, {
  isValidPhoneNumber,
} from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

// Réutilise ton client existant si tu en as déjà un ailleurs dans le projet
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const RESEND_DELAY = 30; // secondes

// Devine un pays par défaut à partir de la locale du navigateur.
// Reste un simple point de départ : l'utilisateur peut toujours changer
// le pays lui-même dans le sélecteur (aucune restriction géographique).
function guessDefaultCountry() {
  try {
    const locale = navigator.language || navigator.languages?.[0] || '';
    const region = locale.split('-')[1];
    if (region && region.length === 2) return region.toUpperCase();
  } catch {
    // ignore
  }
  return 'ML'; // repli neutre, n'importe quel autre code pays ferait l'affaire
}

export default function PhoneAuth({ onAuthSuccess }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone] = useState(''); // toujours au format E.164 (+223..., +33..., +1...)
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
      phone, // déjà en E.164 grâce à react-phone-number-input
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
    <div className="max-w-sm mx-auto p-6 space-y-4">
      {step === 'phone' && (
        <form onSubmit={sendOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Numéro de téléphone
            </label>
            {/* Sélecteur de pays (drapeaux + indicatif) + saisie du numéro.
                `international` force le format E.164 dans `phone`,
                `defaultCountry` ne fait que présélectionner un pays,
                l'utilisateur reste libre d'en choisir un autre. */}
            <PhoneInput
              international
              defaultCountry={defaultCountry}
              value={phone}
              onChange={setPhone}
              placeholder="Entre ton numéro"
              className="w-full border rounded-lg px-3 py-2 phone-input-baaro"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 disabled:opacity-50"
          >
            {loading ? 'Envoi...' : 'Recevoir le code'}
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Code reçu par SMS ({phone})
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 tracking-widest text-center"
              required
              autoFocus
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 disabled:opacity-50"
          >
            {loading ? 'Vérification...' : 'Valider'}
          </button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="text-gray-500"
            >
              Changer de numéro
            </button>
            <button
              type="button"
              onClick={resendOtp}
              disabled={resendCooldown > 0}
              className="text-blue-600 disabled:text-gray-400"
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
