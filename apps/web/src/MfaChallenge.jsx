import { useState } from 'react';
import styles from './MfaAuth.module.css';

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export default function MfaChallenge({ csrfToken, onComplete, onLogout, isLoggingOut }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/mfa/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ code }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error?.message ?? 'Le code n’a pas été accepté.');
      setVerified(payload);
    } catch (reason) {
      setError(reason.message || 'Impossible de joindre le service de sécurité.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="mfa-title">
        <p className={styles.eyebrow}>Vérification administrateur</p>
        {verified ? (
          <>
            <h1 id="mfa-title">Identité confirmée</h1>
            <p className={styles.body}>Vous pouvez maintenant accéder à l’espace EduCloud.</p>
            {verified.recoveryCodeUsed && <p className={styles.success} role="status">Un code de secours a été consommé. Il ne pourra plus être réutilisé.</p>}
            <button className={styles.button} onClick={() => onComplete(verified.user, verified.csrfToken)} type="button">
              Continuer vers EduCloud
            </button>
          </>
        ) : (
          <>
            <h1 id="mfa-title">Confirmez votre identité</h1>
            <p className={styles.body}>
              Entrez le code à six chiffres de votre application d’authentification, ou l’un de vos codes de secours à usage unique.
            </p>
            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.field}>
                <span>Code d’authentification ou code de secours</span>
                <input
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={64}
                  onChange={(event) => setCode(event.target.value.slice(0, 64))}
                  required
                  value={code}
                />
              </label>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.button} disabled={busy || code.trim().length < 6} type="submit">
                {busy ? 'Vérification…' : 'Continuer'}
              </button>
            </form>
          </>
        )}
        <div className={styles.footer}>
          <button className={`${styles.button} ${styles.secondary}`} disabled={isLoggingOut} onClick={onLogout} type="button">
            {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </section>
    </main>
  );
}
