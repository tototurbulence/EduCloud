import { useState } from 'react';
import styles from './App.module.css';

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export default function PasswordChange({
  user,
  csrfToken,
  onPasswordChanged,
  onLogout,
  isLoggingOut,
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choisissez un mot de passe différent du mot de passe temporaire.');
      return;
    }
    if (!csrfToken) {
      setError('La session sécurisée n’est pas prête. Rechargez la page et reconnectez-vous.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Le changement de mot de passe a échoué.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      onPasswordChanged(payload.user, payload.csrfToken);
    } catch (submitError) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setError(submitError.message || 'Impossible de joindre le service de connexion.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="password-change-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>EduCloud · sécurité du compte</p>
          <h1>Bienvenue {user.displayName}</h1>
          <p className={styles.description}>
            Un nouveau compte formateur doit définir son mot de passe personnel avant d’accéder à la plateforme.
          </p>
        </div>
        <div className={styles.authPanel}>
          <p className={styles.eyebrow}>Première connexion</p>
          <h2 id="password-change-title">Changer le mot de passe</h2>
          <p className={styles.descriptionSmall}>{user.email}</p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>Mot de passe temporaire</span>
              <input
                autoComplete="current-password"
                maxLength={128}
                required
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Nouveau mot de passe (12 caractères minimum)</span>
              <input
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Confirmer le nouveau mot de passe</span>
              <input
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.primaryButton} type="submit" disabled={isSubmitting || !csrfToken}>
              {isSubmitting ? 'Mise à jour…' : 'Enregistrer mon mot de passe'}
            </button>
          </form>
          <button className={styles.secondaryButton} type="button" onClick={onLogout} disabled={isLoggingOut}>
            {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </section>
    </main>
  );
}
