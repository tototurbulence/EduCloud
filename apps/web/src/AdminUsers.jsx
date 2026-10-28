import { useCallback, useEffect, useState } from 'react';
import styles from './AdminUsers.module.css';

const roleLabels = {
  admin: 'Administrateur',
  instructor: 'Formateur',
  learner: 'Apprenant',
};

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function apiRequest(path, { method = 'GET', body, csrfToken } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error?.message ?? 'La demande n’a pas abouti.');
  return payload;
}

export default function AdminUsers({ csrfToken, currentUserId, onChange }) {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [busyUserId, setBusyUserId] = useState('');
  const [roleDrafts, setRoleDrafts] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const loadUsers = useCallback(async (nextPage = 1, append = false, searchValue = '') => {
    const query = new URLSearchParams({ page: String(nextPage), limit: '12' });
    if (searchValue) query.set('search', searchValue);
    const result = await apiRequest(`/api/v1/users?${query.toString()}`);
    setUsers((previous) => append ? [...previous, ...result.items] : result.items);
    setPage(nextPage);
    setHasMore(nextPage < result.pagination.totalPages);
  }, []);

  useEffect(() => {
    let active = true;
    loadUsers().catch((loadError) => {
      if (active) setError(loadError.message);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [loadUsers]);

  async function createInstructor(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setTemporaryPassword('');
    setBusyUserId('create');
    try {
      const result = await apiRequest('/api/v1/users/instructors', {
        method: 'POST',
        csrfToken,
        body: { displayName, email },
      });
      setTemporaryPassword(result.temporaryPassword);
      setDisplayName('');
      setEmail('');
      await loadUsers(1, false, search);
      onChange?.();
      setNotice(`Le compte formateur de ${result.user.displayName} a été créé. Transmettez le mot de passe temporaire par un canal privé.`);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusyUserId('');
    }
  }

  async function updateUser(user, changes) {
    if (changes.role === 'admin'
      && !window.confirm(`Accorder le rôle administrateur à ${user.displayName} ? Ce rôle ne peut pas être retiré depuis cette interface.`)) return;
    setError('');
    setNotice('');
    setBusyUserId(user.id);
    try {
      const result = await apiRequest(`/api/v1/users/${user.id}`, {
        method: 'PATCH',
        csrfToken,
        body: changes,
      });
      setUsers((previous) => previous.map((item) => item.id === user.id ? result.user : item));
      onChange?.();
      setRoleDrafts((previous) => {
        const next = { ...previous };
        delete next[user.id];
        return next;
      });
      setNotice(`Le compte de ${result.user.displayName} a été mis à jour.`);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusyUserId('');
    }
  }

  async function resetPassword(user) {
    if (!window.confirm(`Créer un nouveau mot de passe temporaire pour ${user.displayName} ? Les sessions ouvertes seront invalidées.`)) return;
    setError('');
    setNotice('');
    setTemporaryPassword('');
    setBusyUserId(user.id);
    try {
      const result = await apiRequest(`/api/v1/users/${user.id}/reset-password`, {
        method: 'POST',
        csrfToken,
      });
      setUsers((previous) => previous.map((item) => item.id === user.id ? result.user : item));
      setTemporaryPassword(result.temporaryPassword);
      onChange?.();
      setNotice(`Un mot de passe temporaire a été créé pour ${result.user.displayName}. Il devra le changer à sa prochaine connexion.`);
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setBusyUserId('');
    }
  }

  async function resetMfa(user) {
    if (!window.confirm(`Réinitialiser la MFA de ${user.displayName} ? Ses sessions seront invalidées et il devra enrôler à nouveau son application.`)) return;
    setError('');
    setNotice('');
    setBusyUserId(user.id);
    try {
      const result = await apiRequest(`/api/v1/users/${user.id}/reset-mfa`, {
        method: 'POST',
        csrfToken,
      });
      setUsers((previous) => previous.map((item) => item.id === user.id ? result.user : item));
      onChange?.();
      setNotice(`La MFA de ${result.user.displayName} a été réinitialisée. Il devra la configurer à sa prochaine connexion.`);
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setBusyUserId('');
    }
  }

  async function applySearch(event) {
    event.preventDefault();
    const normalized = searchInput.trim();
    if (normalized.length === 1) {
      setError('Saisissez au moins deux caractères pour rechercher.');
      return;
    }
    setError('');
    setSearch(normalized);
    setIsLoading(true);
    try {
      await loadUsers(1, false, normalized);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMore() {
    setIsLoadingMore(true);
    setError('');
    try {
      await loadUsers(page + 1, true, search);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function copyTemporaryPassword() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyMessage('Mot de passe copié.');
    } catch {
      setCopyMessage('Copie indisponible dans ce navigateur. Sélectionnez le mot de passe pour le copier.');
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="users-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Administration</p>
          <h2 id="users-title">Comptes et rôles</h2>
        </div>
        <p className={styles.helper}>Les rôles et états sont validés par l’API. Les comptes administrateur restent protégés.</p>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status" aria-live="polite">{notice}</p>}

      {temporaryPassword && (
        <div className={styles.credential}>
          <div>
            <h3>Mot de passe temporaire · affiché une seule fois</h3>
            <p>Partagez-le uniquement avec le formateur par un canal privé. Il devra le changer à sa première connexion.</p>
            <label className={styles.field}>
              <span>Mot de passe temporaire</span>
              <input type="text" autoComplete="off" readOnly value={temporaryPassword} />
            </label>
          </div>
          <div className={styles.credentialActions}>
            <button className={styles.secondaryButton} type="button" onClick={copyTemporaryPassword}>Copier</button>
            <button className={styles.textButton} type="button" onClick={() => { setTemporaryPassword(''); setCopyMessage(''); }}>Masquer</button>
            {copyMessage && <span role="status">{copyMessage}</span>}
          </div>
        </div>
      )}

      <form className={styles.createForm} onSubmit={createInstructor}>
        <h3>Créer un compte formateur</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Nom affiché</span>
            <input autoComplete="name" minLength={2} maxLength={100} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Adresse courriel</span>
            <input autoComplete="email" type="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className={styles.primaryButton} type="submit" disabled={busyUserId === 'create' || !csrfToken}>
            {busyUserId === 'create' ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </form>

      <form className={styles.searchForm} onSubmit={applySearch}>
        <label className={styles.field}>
          <span>Rechercher un compte</span>
          <input
            type="search"
            maxLength={100}
            placeholder="Nom ou adresse courriel"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <button className={styles.secondaryButton} type="submit">Rechercher</button>
        {search && <button className={styles.textButton} type="button" onClick={() => { setSearch(''); setSearchInput(''); setIsLoading(true); loadUsers(1, false, '').catch((loadError) => setError(loadError.message)).finally(() => setIsLoading(false)); }}>Effacer</button>}
      </form>

      {isLoading ? (
        <p className={styles.loading} role="status">Chargement des comptes…</p>
      ) : users.length === 0 ? (
        <p className={styles.emptyState}>Aucun compte trouvé.</p>
      ) : (
        <div className={styles.accountList}>
          {users.map((user) => {
            const isProtectedAdmin = user.role === 'admin';
            const roleDraft = roleDrafts[user.id] ?? user.role;
            return (
              <article className={styles.accountCard} key={user.id}>
                <div className={styles.accountIdentity}>
                  <h3>{user.displayName}</h3>
                  <p>{user.email}</p>
                  <span className={user.status === 'active' ? styles.activeBadge : styles.disabledBadge}>
                    {user.status === 'active' ? 'Actif' : 'Désactivé'}
                  </span>
                  {user.mustChangePassword && <span className={styles.pendingBadge}>Changement requis</span>}
                  {user.role === 'admin' && (
                    <span className={user.mfaEnabled ? styles.activeBadge : styles.pendingBadge}>
                      {user.mfaEnabled ? 'MFA activée' : 'MFA à configurer'}
                    </span>
                  )}
                </div>
                <div className={styles.accountActions}>
                  <label className={styles.field}>
                    <span>Rôle · {roleLabels[user.role]}</span>
                    <select
                      value={roleDraft}
                      disabled={isProtectedAdmin || busyUserId === user.id}
                      onChange={(event) => setRoleDrafts((previous) => ({ ...previous, [user.id]: event.target.value }))}
                    >
                      <option value="admin">Administrateur</option>
                      <option value="learner">Apprenant</option>
                      <option value="instructor">Formateur</option>
                    </select>
                  </label>
                  {!isProtectedAdmin && roleDraft !== user.role && (
                    <button className={styles.primaryButton} type="button" disabled={busyUserId === user.id} onClick={() => updateUser(user, { role: roleDraft })}>
                      Appliquer le rôle
                    </button>
                  )}
                  {!isProtectedAdmin && (
                    <button
                      className={user.status === 'active' ? styles.dangerButton : styles.secondaryButton}
                      type="button"
                      disabled={busyUserId === user.id}
                      onClick={() => updateUser(user, { status: user.status === 'active' ? 'disabled' : 'active' })}
                    >
                      {user.status === 'active' ? 'Désactiver' : 'Réactiver'}
                    </button>
                  )}
                  {!isProtectedAdmin && user.status === 'active' && (
                    <button className={styles.textButton} type="button" disabled={busyUserId === user.id} onClick={() => resetPassword(user)}>
                      Réinitialiser le mot de passe
                    </button>
                  )}
                  {isProtectedAdmin && user.id !== currentUserId && user.mfaEnabled && (
                    <button className={styles.dangerButton} type="button" disabled={busyUserId === user.id} onClick={() => resetMfa(user)}>
                      Réinitialiser la MFA
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && !isLoading && (
        <button className={styles.loadMoreButton} type="button" onClick={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? 'Chargement…' : 'Afficher plus de comptes'}
        </button>
      )}
      <p className={styles.footnote}>Les comptes formateur qui possèdent encore des cours actifs doivent être transférés ou archivés avant leur désactivation ou changement de rôle.</p>
    </section>
  );
}
