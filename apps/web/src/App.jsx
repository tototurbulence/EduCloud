import { useEffect, useState } from 'react';
import styles from './App.module.css';
import CourseWorkspace from './CourseWorkspace.jsx';
import PasswordChange from './PasswordChange.jsx';
import MfaChallenge from './MfaChallenge.jsx';
import MfaSetup from './MfaSetup.jsx';

async function readJson(response) {
  return response.json().catch(() => ({}));
}

let csrfRequestInFlight;

async function fetchCsrfToken() {
  if (!csrfRequestInFlight) {
    csrfRequestInFlight = (async () => {
      const response = await fetch('/api/v1/auth/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await readJson(response);
      if (!response.ok || typeof payload.csrfToken !== 'string') {
        throw new Error(payload.error?.message ?? 'Impossible d’initialiser la session sécurisée.');
      }
      return payload.csrfToken;
    })().finally(() => {
      csrfRequestInFlight = undefined;
    });
  }

  return csrfRequestInFlight;
}

export default function App() {
  const [apiStatus, setApiStatus] = useState('Vérification en cours…');
  const [sessionReady, setSessionReady] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [authChallenge, setAuthChallenge] = useState('');
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/v1/health/live', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('API indisponible');
        return response.json();
      })
      .then((health) => setApiStatus(health.status === 'ok' ? 'Connectée' : 'Indisponible'))
      .catch((error) => {
        if (error.name !== 'AbortError') setApiStatus('Indisponible');
      });

    async function loadCurrentSession() {
      try {
        const initialCsrfToken = await fetchCsrfToken();
        if (controller.signal.aborted) return;
        setCsrfToken(initialCsrfToken);

        const meResponse = await fetch('/api/v1/auth/me', {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const mePayload = await readJson(meResponse);
        if (meResponse.status === 401) {
          setCurrentUser(null);
        } else if (!meResponse.ok) {
          setAuthError(mePayload.error?.message ?? 'Le service de connexion est indisponible.');
        } else {
          setCurrentUser(mePayload.user);
          setAuthChallenge(mePayload.authChallenge ?? '');
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          setAuthError(error.message || 'Impossible de joindre le service de connexion.');
        }
      } finally {
        if (!controller.signal.aborted) setSessionReady(true);
      }
    }

    loadCurrentSession();
    return () => controller.abort();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setAuthError('');

    if (!csrfToken) {
      setAuthError('La session sécurisée n’est pas prête. Rechargez la page et réessayez.');
      return;
    }
    if (mode === 'register' && password !== passwordConfirmation) {
      setAuthError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Refresh immediately before a mutation so the token always matches the
      // session cookie, including after an API restart or a dev StrictMode remount.
      const currentCsrfToken = await fetchCsrfToken();
      setCsrfToken(currentCsrfToken);
      const body = mode === 'register'
        ? { displayName, email, password }
        : { email, password };
      const response = await fetch(`/api/v1/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': currentCsrfToken,
        },
        body: JSON.stringify(body),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'La demande n’a pas abouti.');
      }

      setCurrentUser(payload.user);
      setAuthChallenge(payload.authChallenge ?? '');
      setCsrfToken(payload.csrfToken);
      setPassword('');
      setPasswordConfirmation('');
    } catch (error) {
      setPassword('');
      setPasswordConfirmation('');
      setAuthError(error.message || 'Impossible de joindre le service de connexion.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    setAuthError('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) {
        const payload = await readJson(response);
        throw new Error(payload.error?.message ?? 'La déconnexion a échoué.');
      }

      setCurrentUser(null);
      setAuthChallenge('');
      setCsrfToken('');
      setCsrfToken(await fetchCsrfToken());
    } catch (error) {
      setAuthError(error.message || 'Impossible de joindre le service de connexion.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setAuthError('');
    setPassword('');
    setPasswordConfirmation('');
  }

  if (sessionReady && currentUser?.mustChangePassword) {
    return (
      <PasswordChange
        user={currentUser}
        csrfToken={csrfToken}
        onPasswordChanged={(user, nextCsrfToken) => {
          setCurrentUser(user);
          setCsrfToken(nextCsrfToken);
          setAuthChallenge(user.role === 'admin' ? (user.mfaEnabled ? 'mfa' : 'mfa-setup') : '');
          setAuthError('');
        }}
        onLogout={handleLogout}
        isLoggingOut={isSubmitting}
      />
    );
  }

  if (sessionReady && currentUser && authChallenge === 'mfa-setup') {
    return (
      <MfaSetup
        csrfToken={csrfToken}
        onComplete={(user, nextCsrfToken) => {
          setCurrentUser(user);
          setCsrfToken(nextCsrfToken);
          setAuthChallenge('');
          setAuthError('');
        }}
        onLogout={handleLogout}
        isLoggingOut={isSubmitting}
      />
    );
  }

  if (sessionReady && currentUser && authChallenge === 'mfa') {
    return (
      <MfaChallenge
        csrfToken={csrfToken}
        onComplete={(user, nextCsrfToken) => {
          setCurrentUser(user);
          setCsrfToken(nextCsrfToken);
          setAuthChallenge('');
          setAuthError('');
        }}
        onLogout={handleLogout}
        isLoggingOut={isSubmitting}
      />
    );
  }

  if (sessionReady && currentUser) {
    return (
      <CourseWorkspace
        user={currentUser}
        csrfToken={csrfToken}
        onLogout={handleLogout}
        isLoggingOut={isSubmitting}
        authError={authError}
      />
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="page-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Plateforme de gestion des apprentissages</p>
          <h1 id="page-title">EduCloud</h1>
          <p className={styles.description}>
            Un espace clair pour apprendre, enseigner et suivre la progression des cours.
          </p>
          <div className={styles.status} role="status" aria-live="polite">
            <span className={apiStatus === 'Connectée' ? styles.dotOnline : styles.dotPending} />
            API : {apiStatus}
          </div>
        </div>

        <div className={styles.authPanel}>
          {!sessionReady ? (
            <p className={styles.loading} role="status">Préparation de votre session…</p>
          ) : (
            <>
              <div className={styles.formHeading}>
                <p className={styles.eyebrow}>Accès à la plateforme</p>
                <h2>{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h2>
              </div>

              <div className={styles.modeSwitch} aria-label="Type d’accès">
                <button
                  className={mode === 'login' ? styles.modeActive : styles.modeButton}
                  type="button"
                  aria-pressed={mode === 'login'}
                  onClick={() => changeMode('login')}
                >
                  Connexion
                </button>
                <button
                  className={mode === 'register' ? styles.modeActive : styles.modeButton}
                  type="button"
                  aria-pressed={mode === 'register'}
                  onClick={() => changeMode('register')}
                >
                  Inscription
                </button>
              </div>

              <form className={styles.form} onSubmit={handleSubmit}>
                {mode === 'register' && (
                  <label className={styles.field}>
                    <span>Nom affiché</span>
                    <input
                      autoComplete="name"
                      maxLength={100}
                      minLength={2}
                      name="displayName"
                      onChange={(event) => setDisplayName(event.target.value)}
                      required
                      value={displayName}
                    />
                  </label>
                )}
                <label className={styles.field}>
                  <span>Adresse courriel</span>
                  <input
                    autoComplete={mode === 'register' ? 'email' : 'username'}
                    maxLength={254}
                    name="email"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </label>
                <label className={styles.field}>
                  <span>Mot de passe{mode === 'register' ? ' (12 caractères minimum)' : ''}</span>
                  <input
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    maxLength={128}
                    minLength={mode === 'register' ? 12 : 1}
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </label>
                {mode === 'register' && (
                  <label className={styles.field}>
                    <span>Confirmer le mot de passe</span>
                    <input
                      autoComplete="new-password"
                      maxLength={128}
                      name="passwordConfirmation"
                      onChange={(event) => setPasswordConfirmation(event.target.value)}
                      required
                      type="password"
                      value={passwordConfirmation}
                    />
                  </label>
                )}

                {mode === 'register' && (
                  <p className={styles.note}>Toute nouvelle inscription crée un compte apprenant.</p>
                )}
                {authError && <p className={styles.error} role="alert">{authError}</p>}
                {!csrfToken && (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Réessayer
                  </button>
                )}
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting || !csrfToken}>
                  {isSubmitting
                    ? 'Veuillez patienter…'
                    : mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
