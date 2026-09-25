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

// Transforme un numéro de téléphone en e-mail technique pour Supabase
function phoneToEmail(phone) {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  return `phone_${cleanPhone}@baaro.app`;
}

function buildFallbackHandle(userId) {
  const cleanId = String(userId).replace(/-/g, '').slice(0, 12);
  return `@user_${cleanId}`;
}

export default function PhoneAuth({ onAuthSuccess }) {
  // Étapes : 'phone', 'login_password', 'register_password', 'otp_verify'
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [defaultCountry] = useState(guessDefaultCountry);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(300);
  const [isRecovery, setIsRecovery] = useState(false);

  const timerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const otpInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    };
  }, []);

  // Auto-focus sur l'input OTP
  useEffect(() => {
    if (step === 'otp_verify') {
      setTimeout(() => {
        if (otpInputRef.current) otpInputRef.current.focus();
      }, 100);
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
    if (!user || !user.id) return;
    const userId = user.id;
    const normalizedPhone = normalizePhone(phone);

    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, display_name, handle, flag, phone')
        .eq('id', userId)
        .maybeSingle();

      if (existingProfile) {
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
    }
  }

  // ÉTAPE 1 : Vérifier si le numéro existe déjà en base
  async function handleCheckPhone(event) {
    if (event) event.preventDefault();
    setError('');

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) {
      setError('Numéro de téléphone invalide.');
      return;
    }

    setLoading(true);
    try {
      // On vérifie si un profil existe déjà avec ce numéro
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      setPhone(normalizedPhone);

      if (existingProfile) {
        // Compte existant -> Demander directement le mot de passe (Pas de SMS)
        setStep('login_password');
      } else {
        // Nouveau compte -> Demander à créer un mot de passe avant l'envoi du SMS d'inscription
        setStep('register_password');
      }
    } catch (err) {
      console.error('Erreur vérification:', err);
      setError("Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  // ÉTAPE 2A : Connexion directe avec le mot de passe (Utilisateur existant)
  async function handleLoginWithPassword(event) {
    if (event) event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailTech = phoneToEmail(phone);
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: emailTech,
        password: password,
      });

      if (loginError) throw loginError;

      if (!data || !data.user) throw new Error('Utilisateur introuvable.');

      await ensureProfile(data.user);
      if (onAuthSuccess) onAuthSuccess(data.user);
    } catch (err) {
      console.error('Erreur connexion:', err);
      setError('Mot de passe incorrect ou compte introuvable.');
    } finally {
      setLoading(false);
    }
  }

  // ÉTAPE 2B : Lancer l'inscription (Envoi du code SMS unique de vérification)
  async function handleStartRegistration(event) {
    if (event) event.preventDefault();
    if (!password || password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
      if (otpError) throw otpError;

      setIsRecovery(false);
      setStep('otp_verify');
      setOtp('');
      startCooldown();
      startExpiryTimer();
    } catch (err) {
      console.error('Erreur SMS:', err);
      setError(err.message || "Impossible d'envoyer le code SMS.");
    } finally {
      setLoading(false);
    }
  }

  // ÉTAPE 3 : Vérification de l'OTP (Inscription finale ou Récupération)
  async function verifyOtpAndProceed(event) {
    if (event) event.preventDefault();
    setError('');

    const normalizedOtp = otp.replace(/\D/g, '');
    if (normalizedOtp.length !== 6) {
      setError('Le code doit contenir 6 chiffres.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: phone,
        token: normalizedOtp,
        type: 'sms',
      });

      if (verifyError) throw verifyError;
      if (!data || !data.user) throw new Error('Validation échouée.');

      const emailTech = phoneToEmail(phone);

      if (isRecovery) {
        // En mode récupération : mise à jour du mot de passe
        const { error: updateError } = await supabase.auth.updateUser({ password: password });
        if (updateError) throw updateError;
      } else {
        // En mode inscription : association de l'e-mail technique et du mot de passe
        const { error: updateError } = await supabase.auth.updateUser({
          email: emailTech,
          password: password,
        });
        if (updateError) throw updateError;
      }

      await ensureProfile(data.user);
      if (onAuthSuccess) onAuthSuccess(data.user);
    } catch (err) {
      console.error('Erreur vérification OTP:', err);
      setError(err.message || 'Code incorrect ou expiré.');
    } finally {
      setLoading(false);
    }
  }

  // Mot de passe oublié : déclencher un SMS de réinitialisation
  async function handleForgotPassword() {
    setError('');
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
      if (otpError) throw otpError;

      setIsRecovery(true);
      setStep('otp_verify');
      setOtp('');
      setPassword('');
      startCooldown();
      startExpiryTimer();
    } catch (err) {
      setError("Impossible d'envoyer le code de récupération.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (resendCooldown > 0 || loading) return;
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
      if (otpError) throw otpError;
      startCooldown();
      startExpiryTimer();
      setError('Nouveau code envoyé.');
    } catch (err) {
      setError("Impossible de renvoyer le code.");
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {/* 1. SAISIE DU NUMÉRO */}
      {step === 'phone' && (
        <form onSubmit={handleCheckPhone} className="space-y-4">
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
              autoComplete="username"
              className="w-full border border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none bg-slate-950/60 text-slate-100"
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50 bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            {loading ? 'Vérification...' : 'Continuer'}
          </button>
        </form>
      )}

      {/* 2A. CONNEXION AVEC MOT DE PASSE (Compte existant) */}
      {step === 'login_password' && (
        <form onSubmit={handleLoginWithPassword} className="space-y-4">
          <div>
            <p className="text-xs text-slate-400 mb-2">
              Connexion pour : <span className="text-slate-200 font-semibold">{phone}</span>
            </p>
            <label className="block text-xs font-semibold mb-1 text-slate-400">
              Mot de passe
            </label>
            <input
              type="password"
              placeholder="Ton mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full border border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none bg-slate-950/60 text-slate-100"
              required
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50 bg-teal-500 text-slate-950 hover:bg-teal-400"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>

          <div className="flex justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => { setStep('phone'); setPassword(''); }}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Changer de numéro
            </button>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-amber-500 hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>
        </form>
      )}

      {/* 2B. CRÉATION DU MOT DE PASSE (Nouvelle inscription) */}
      {step === 'register_password' && (
        <form onSubmit={handleStartRegistration} className="space-y-4">
          <div>
            <p className="text-xs text-slate-400 mb-2">
              Première inscription pour : <span className="text-slate-200 font-semibold">{phone}</span>
            </p>
            <label className="block text-xs font-semibold mb-1 text-slate-400">
              Crée un mot de passe
            </label>
            <input
              type="password"
              placeholder="Minimum 6 caractères"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full border border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none bg-slate-950/60 text-slate-100"
              required
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50 bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            {loading ? 'Envoi du code...' : "S'inscrire (Recevoir le code SMS)"}
          </button>

          <button
            type="button"
            onClick={() => setStep('phone')}
            className="w-full text-center text-xs text-slate-400 hover:underline"
          >
            Changer de numéro
          </button>
        </form>
      )}

      {/* 3. VÉRIFICATION SMS (Uniquement à l'inscription ou récupération) */}
      {step === 'otp_verify' && (
        <form onSubmit={verifyOtpAndProceed} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-400">
              {isRecovery ? 'Code de réinitialisation' : "Code de confirmation"} reçu par SMS ({phone})
            </label>

            <div className={`mb-3 text-center text-sm font-semibold ${timeLeft < 60 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ⏱️ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </div>

            <input
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full border border-slate-700 rounded-xl px-3 py-2.5 tracking-widest text-center text-sm outline-none font-mono bg-slate-950/60 text-slate-100"
              required
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full py-3 rounded-xl font-bold text-xs shadow-lg transition disabled:opacity-50 bg-teal-500 text-slate-950 hover:bg-teal-400"
          >
            {loading ? 'Validation...' : 'Valider et finaliser'}
          </button>

          <div className="flex justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="text-slate-400 hover:text-slate-200 hover:underline"
            >
              Annuler
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
