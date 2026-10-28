import { useEffect, useState } from 'react';
import styles from './MfaAuth.module.css';

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export default function MfaSetup({ csrfToken, onComplete, onLogout, isLoggingOut }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/auth/mfa/setup', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await readJson(response);
        if (!response.ok) throw new Error(payload.error?.message ?? 'La configuration MFA est indisponible.');
        setSetup(payload);
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/mfa/enable', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ code }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error?.message ?? 'Le code n’a pas été accepté.');
      setResult(payload);
      setCode('');
    } catch (reason) {
      setError(reason.message || 'Impossible de joindre le service de sécurité.');
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    if (!acknowledged || !result) return;
    onComplete(result.user, result.csrfToken);
    setResult(null);
    setSetup(null);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="mfa-title">
        <p className={styles.eyebrow}>Sécurité du compte administrateur</p>
        {result ? (
          <>
            <h1 id="mfa-title">Enregistrez vos codes de secours</h1>
            <p className={styles.body}>
              Chaque code ne peut servir qu’une fois. Copiez-les dans un gestionnaire de mots de passe ou un endroit sûr ; ils ne seront plus affichés après cette étape.
            </p>
            <ul className={styles.codes} aria-label="Codes de secours à usage unique">
              {result.recoveryCodes.map((recoveryCode) => <li key={recoveryCode}>{recoveryCode}</li>)}
            </ul>
            <label className={styles.checkbox}>
              <input checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />
              <span>J’ai enregistré les codes de secours dans un endroit sûr.</span>
            </label>
            <button className={styles.button} disabled={!acknowledged} onClick={finish} type="button">
              Continuer vers EduCloud
            </button>
          </>
        ) : (
          <>
            <h1 id="mfa-title">Activez l’authentification à deux facteurs</h1>
            <p className={styles.body}>
              Utilisez une application d’authentification compatible TOTP. Cette étape est nécessaire pour accéder aux fonctions d’administration.
            </p>
            {!setup && !error && <p role="status">Préparation de la configuration…</p>}
            {setup && (
              <>
                <ol className={styles.steps}>
                  <li>Ajoutez un compte dans votre application d’authentification.</li>
                  <li>Saisissez cette clé manuellement, ou importez l’URI ci-dessous si votre application le permet.</li>
                  <li>Entrez le code à six chiffres généré par l’application.</li>
                </ol>
                <span className={styles.secret} aria-label="Clé secrète TOTP">{setup.secret}</span>
                <code className={styles.uri}>{setup.otpauthUrl}</code>
                <form className={styles.form} onSubmit={handleSubmit}>
                  <label className={styles.field}>
                    <span>Code de vérification</span>
                    <input
                      autoComplete="one-time-code"
                      autoFocus
                      inputMode="numeric"
                      maxLength={6}
                      minLength={6}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      pattern="[0-9]{6}"
                      required
                      value={code}
                    />
                  </label>
                  <button className={styles.button} disabled={busy || code.length !== 6} type="submit">
                    {busy ? 'Vérification…' : 'Activer la MFA'}
                  </button>
                </form>
              </>
            )}
          </>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.footer}>
          <button className={`${styles.button} ${styles.secondary}`} disabled={isLoggingOut} onClick={onLogout} type="button">
            {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </section>
    </main>
  );
}
