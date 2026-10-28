import { useEffect, useState } from 'react';
import styles from './CourseWorkspace.module.css';

const labels = {
  courseCount: 'Cours gérés',
  enrollmentCount: 'Inscriptions actives',
  assignmentCount: 'Devoirs',
  pendingReviews: 'Corrections à faire',
  enrolledCourseCount: 'Cours suivis',
  dueAssignmentCount: 'Devoirs à venir',
  submittedAssignmentCount: 'Devoirs remis',
  gradedAssignmentCount: 'Devoirs corrigés',
  averageGrade: 'Moyenne des notes',
  progress: 'Progression des modules',
};

function formatLabel(value) {
  return value.replaceAll(':', ' · ').replaceAll('_', ' ');
}

export default function RoleDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/dashboard', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message ?? 'Les indicateurs sont indisponibles.');
        setDashboard(payload.dashboard);
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  if (error) return <p className={styles.error} role="status">{error}</p>;
  if (!dashboard) return <p className={styles.loading} role="status">Chargement des indicateurs…</p>;

  const metrics = [];
  for (const [key, value] of Object.entries(dashboard)) {
    if (key === 'role' || key === 'users' || key === 'courses') continue;
    if (key === 'progress') {
      metrics.push({ label: labels.progress, value: `${value.percent} %`, detail: `${value.completedModules} module(s) sur ${value.totalModules}` });
    } else {
      metrics.push({
        label: labels[key] ?? formatLabel(key),
        value: value === null
          ? '—'
          : key === 'averageGrade' ? `${Number(value).toLocaleString('fr-FR')} %` : Number(value).toLocaleString('fr-FR'),
        detail: key === 'averageGrade' && value !== null ? 'Moyenne normalisée sur 100' : '',
      });
    }
  }
  if (dashboard.users) {
    for (const [key, value] of Object.entries(dashboard.users)) metrics.push({ label: `Comptes · ${formatLabel(key)}`, value: value.toLocaleString('fr-FR') });
  }
  if (dashboard.courses) {
    for (const [key, value] of Object.entries(dashboard.courses)) metrics.push({ label: `Cours · ${formatLabel(key)}`, value: value.toLocaleString('fr-FR') });
  }

  return (
    <section className={styles.panel} aria-labelledby="dashboard-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Vue d’ensemble</p>
          <h2 id="dashboard-title">Votre tableau de bord</h2>
        </div>
      </div>
      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <article className={styles.metric} key={metric.label}>
            <p className={styles.metricLabel}>{metric.label}</p>
            <p className={styles.metricValue}>{metric.value}</p>
            {metric.detail && <p className={styles.metricDetail}>{metric.detail}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
