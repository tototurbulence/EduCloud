import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './CourseWorkspace.module.css';
import AdminUsers from './AdminUsers.jsx';
import RoleDashboard from './RoleDashboard.jsx';

const roleLabels = {
  admin: 'Administrateur',
  instructor: 'Formateur',
  learner: 'Apprenant',
};

const MAX_MODULES = 50;
const MAX_RESOURCES_PER_MODULE = 20;

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
  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'La demande n’a pas abouti. Réessayez.');
  }
  return payload;
}

function CourseCard({ course, children, status }) {
  return (
    <article className={styles.courseCard}>
      <div className={styles.courseTitleRow}>
        <h3>{course.title}</h3>
        {status && <span className={styles.statusBadge}>{status}</span>}
      </div>
      <p className={styles.courseDescription}>{course.description || 'Aucune description fournie.'}</p>
      <p className={styles.byline}>Formateur : {course.instructor?.displayName ?? 'Non renseigné'}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </article>
  );
}

function emptyModule() {
  return { title: '', description: '', resources: [] };
}

export default function CourseWorkspace({ user, csrfToken, onLogout, isLoggingOut, authError }) {
  const [catalog, setCatalog] = useState([]);
  const [managedCourses, setManagedCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [managedPage, setManagedPage] = useState(1);
  const [enrollmentPage, setEnrollmentPage] = useState(1);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [managedHasMore, setManagedHasMore] = useState(false);
  const [enrollmentsHaveMore, setEnrollmentsHaveMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedContent, setSelectedContent] = useState(null);
  const [selectedAssignmentsCourse, setSelectedAssignmentsCourse] = useState(null);
  const [selectedAssignments, setSelectedAssignments] = useState([]);
  const [assignmentsPage, setAssignmentsPage] = useState(1);
  const [assignmentsHasMore, setAssignmentsHasMore] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentInstructions, setAssignmentInstructions] = useState('');
  const [assignmentDeadline, setAssignmentDeadline] = useState('');
  const [assignmentMaxScore, setAssignmentMaxScore] = useState('100');
  const [submissionDrafts, setSubmissionDrafts] = useState({});
  const [selectedAssignmentForReview, setSelectedAssignmentForReview] = useState(null);
  const [reviewSubmissions, setReviewSubmissions] = useState([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState(null);
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterHasMore, setRosterHasMore] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [modules, setModules] = useState([emptyModule()]);

  const isLearner = user.role === 'learner';
  const canManageCourses = user.role === 'instructor' || user.role === 'admin';
  const enrolledCourseIds = useMemo(
    () => new Set(enrollments.map((enrollment) => enrollment.course?.id).filter(Boolean)),
    [enrollments],
  );
  const managedCourseIds = useMemo(
    () => new Set(managedCourses.map((course) => course.id)),
    [managedCourses],
  );

  const loadCatalog = useCallback(async (page = 1, append = false) => {
    const result = await apiRequest(`/api/v1/courses?page=${page}&limit=12`);
    setCatalog((previous) => append ? [...previous, ...result.items] : result.items);
    setCatalogPage(page);
    setCatalogHasMore(page < result.pagination.totalPages);
  }, []);

  const loadManagedCourses = useCallback(async (page = 1, append = false) => {
    const result = await apiRequest(`/api/v1/courses/mine?page=${page}&limit=12`);
    setManagedCourses((previous) => append ? [...previous, ...result.items] : result.items);
    setManagedPage(page);
    setManagedHasMore(page < result.pagination.totalPages);
  }, []);

  const loadEnrollments = useCallback(async (page = 1, append = false) => {
    const result = await apiRequest(`/api/v1/enrollments/me?page=${page}&limit=12`);
    setEnrollments((previous) => append ? [...previous, ...result.items] : result.items);
    setEnrollmentPage(page);
    setEnrollmentsHaveMore(page < result.pagination.totalPages);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      setIsLoading(true);
      setPageError('');
      const jobs = [loadCatalog(1)];
      if (isLearner) jobs.push(loadEnrollments(1));
      if (canManageCourses) jobs.push(loadManagedCourses(1));
      const results = await Promise.allSettled(jobs);
      if (!active) return;
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) setPageError(failure.reason?.message ?? 'Impossible de charger votre espace.');
      setIsLoading(false);
    }
    loadWorkspace();
    return () => { active = false; };
  }, [canManageCourses, isLearner, loadCatalog, loadEnrollments, loadManagedCourses]);

  async function openCourse(courseId) {
    setPageError('');
    setNotice('');
    setIsLoadingContent(true);
    setSelectedContent(null);
    try {
      const [contentResult, assignmentResult] = await Promise.all([
        apiRequest(`/api/v1/courses/${courseId}/content`),
        apiRequest(`/api/v1/courses/${courseId}/assignments?page=1&limit=50`),
      ]);
      setSelectedContent(contentResult.course);
      setSelectedAssignmentsCourse({ id: courseId, title: contentResult.course.title, status: contentResult.course.status });
      setSelectedAssignments(assignmentResult.items);
      setAssignmentsPage(1);
      setAssignmentsHasMore(assignmentResult.pagination.page < assignmentResult.pagination.totalPages);
      setSubmissionDrafts(Object.fromEntries(assignmentResult.items
        .filter((assignment) => assignment.submission)
        .map((assignment) => [assignment.id, assignment.submission.content ?? ''])));
      setSelectedAssignmentForReview(null);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setIsLoadingContent(false);
    }
  }

  async function openAssignmentManagement(course) {
    setPageError('');
    setNotice('');
    setBusyAction(`assignments:${course.id}`);
    try {
      const result = await apiRequest(`/api/v1/courses/${course.id}/assignments?page=1&limit=50`);
      setSelectedAssignmentsCourse({ id: course.id, title: course.title, status: course.status });
      setSelectedAssignments(result.items);
      setAssignmentsPage(1);
      setAssignmentsHasMore(result.pagination.page < result.pagination.totalPages);
      setSelectedContent(null);
      setSelectedAssignmentForReview(null);
      setReviewSubmissions([]);
      setAssignmentTitle('');
      setAssignmentInstructions('');
      setAssignmentDeadline('');
      setAssignmentMaxScore('100');
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function loadMoreAssignments() {
    if (!selectedAssignmentsCourse) return;
    setIsLoadingMore('assignments');
    setPageError('');
    try {
      const result = await apiRequest(`/api/v1/courses/${selectedAssignmentsCourse.id}/assignments?page=${assignmentsPage + 1}&limit=50`);
      setSelectedAssignments((previous) => [...previous, ...result.items]);
      setAssignmentsPage(result.pagination.page);
      setAssignmentsHasMore(result.pagination.page < result.pagination.totalPages);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setIsLoadingMore('');
    }
  }

  async function createAssignment(event) {
    event.preventDefault();
    if (!selectedAssignmentsCourse || !assignmentDeadline) return;
    setBusyAction('assignment-create');
    setPageError('');
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/courses/${selectedAssignmentsCourse.id}/assignments`, {
        method: 'POST',
        csrfToken,
        body: {
          title: assignmentTitle,
          instructions: assignmentInstructions,
          deadline: new Date(assignmentDeadline).toISOString(),
          maxScore: Number(assignmentMaxScore),
        },
      });
      setSelectedAssignments((previous) => [...previous, { ...result.assignment, submission: null }]
        .sort((left, right) => new Date(left.deadline) - new Date(right.deadline)));
      setAssignmentTitle('');
      setAssignmentInstructions('');
      setAssignmentDeadline('');
      setAssignmentMaxScore('100');
      setNotice(`Le devoir « ${result.assignment.title} » a été créé.`);
      setDashboardRefreshKey((value) => value + 1);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function submitAssignment(assignment) {
    setBusyAction(`submission:${assignment.id}`);
    setPageError('');
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/assignments/${assignment.id}/submissions/me`, {
        method: 'POST',
        csrfToken,
        body: { content: submissionDrafts[assignment.id] ?? '' },
      });
      setSelectedAssignments((previous) => previous.map((item) => item.id === assignment.id
        ? { ...item, submission: result.submission }
        : item));
      setNotice(`Votre remise pour « ${assignment.title} » a été enregistrée.`);
      setDashboardRefreshKey((value) => value + 1);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function loadReviewSubmissions(assignment, page = 1, append = false) {
    const result = await apiRequest(`/api/v1/assignments/${assignment.id}/submissions?page=${page}&limit=20`);
    setReviewSubmissions((previous) => append ? [...previous, ...result.items] : result.items);
    setReviewPage(page);
    setReviewHasMore(page < result.pagination.totalPages);
    setSelectedAssignmentForReview(assignment);
    if (!append) {
      setGradeDrafts(Object.fromEntries(result.items.map((item) => [item.id, item.grade ?? ''])));
      setFeedbackDrafts(Object.fromEntries(result.items.map((item) => [item.id, item.feedback ?? ''])));
    }
  }

  async function openReviewSubmissions(assignment) {
    setPageError('');
    setBusyAction(`reviews:${assignment.id}`);
    try {
      await loadReviewSubmissions(assignment);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function saveGrade(event, submission) {
    event.preventDefault();
    setBusyAction(`grade:${submission.id}`);
    setPageError('');
    setNotice('');
    try {
      const result = await apiRequest(`/api/v1/submissions/${submission.id}/grade`, {
        method: 'PATCH',
        csrfToken,
        body: {
          grade: Number(gradeDrafts[submission.id]),
          feedback: feedbackDrafts[submission.id] ?? '',
        },
      });
      setReviewSubmissions((previous) => previous.map((item) => item.id === submission.id
        ? { ...item, ...result.submission, learner: item.learner }
        : item));
      setNotice(`La remise de ${submission.learner?.displayName ?? 'l’apprenant'} a été notée.`);
      setDashboardRefreshKey((value) => value + 1);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function toggleModuleCompletion(module) {
    if (!selectedContent) return;
    setBusyAction(`module:${module.id}`);
    setPageError('');
    try {
      const result = await apiRequest(`/api/v1/courses/${selectedContent.id}/modules/${module.id}/completion`, {
        method: 'PUT',
        csrfToken,
        body: { completed: !module.completed },
      });
      setSelectedContent((previous) => previous ? {
        ...previous,
        modules: previous.modules.map((item) => item.id === result.moduleId
          ? { ...item, completed: result.completed }
          : item),
      } : previous);
      setDashboardRefreshKey((value) => value + 1);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function enroll(course) {
    setBusyAction(`enroll:${course.id}`);
    setPageError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/courses/${course.id}/enrollments`, {
        method: 'POST',
        csrfToken,
      });
      await loadEnrollments(1);
      setDashboardRefreshKey((value) => value + 1);
      setNotice(`Votre inscription au cours « ${course.title} » est confirmée.`);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function submitCourse(event) {
    event.preventDefault();
    setPageError('');
    setNotice('');

    const hasUnsafeLink = modules.some((module) => module.resources.some((resource) => {
      if (resource.type !== 'link') return false;
      try {
        const url = new URL(resource.value);
        return url.protocol !== 'https:' || url.username !== '' || url.password !== '';
      } catch {
        return true;
      }
    }));
    if (hasUnsafeLink) {
      setPageError('Chaque lien de ressource doit être une adresse HTTPS valide, sans identifiant intégré.');
      return;
    }

    const preparedModules = modules.map((module, moduleIndex) => ({
      title: module.title,
      description: module.description,
      order: moduleIndex,
      resources: module.resources.map((resource, resourceIndex) => ({
        title: resource.title,
        type: resource.type,
        order: resourceIndex,
        [resource.type === 'link' ? 'url' : 'body']: resource.value,
      })),
    }));

    const wasEditing = Boolean(editingCourseId);
    setBusyAction(wasEditing ? 'edit' : 'create');
    try {
      const result = await apiRequest(
        wasEditing ? `/api/v1/courses/${editingCourseId}` : '/api/v1/courses',
        {
          method: wasEditing ? 'PATCH' : 'POST',
          csrfToken,
          body: { title, description, modules: preparedModules },
        },
      );
      await Promise.all([loadManagedCourses(1), loadCatalog(1)]);
      setTitle('');
      setDescription('');
      setModules([emptyModule()]);
      setEditingCourseId('');
      setSelectedContent(null);
      setDashboardRefreshKey((value) => value + 1);
      setNotice(wasEditing
        ? `Le cours « ${result.course.title} » a été modifié.`
        : `Le cours « ${result.course.title} » a été créé comme brouillon.`);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function startEditingCourse(course) {
    setPageError('');
    setNotice('');
    setIsLoadingContent(true);
    try {
      const result = await apiRequest(`/api/v1/courses/${course.id}/content`);
      setTitle(result.course.title);
      setDescription(result.course.description ?? '');
      setModules(result.course.modules.length > 0
        ? result.course.modules.map((module) => ({
            title: module.title,
            description: module.description ?? '',
            resources: module.resources.map((resource) => ({
              title: resource.title,
              type: resource.type,
              value: resource.type === 'link' ? resource.url : resource.body,
            })),
          }))
        : [emptyModule()]);
      setEditingCourseId(course.id);
      setSelectedContent(null);
      setNotice(`Modification du cours « ${course.title} ».`);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setIsLoadingContent(false);
    }
  }

  function cancelEdit() {
    setEditingCourseId('');
    setTitle('');
    setDescription('');
    setModules([emptyModule()]);
    setNotice('Modification annulée.');
  }

  async function loadRoster(course, page = 1, append = false) {
    const result = await apiRequest(`/api/v1/courses/${course.id}/enrollments?page=${page}&limit=12`);
    setSelectedRoster((previous) => append && previous?.course.id === course.id
      ? { course, items: [...previous.items, ...result.items] }
      : { course, items: result.items });
    setRosterPage(page);
    setRosterHasMore(page < result.pagination.totalPages);
  }

  async function openRoster(course) {
    setPageError('');
    setNotice('');
    setBusyAction(`roster:${course.id}`);
    try {
      await loadRoster(course);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function publishCourse(course) {
    setBusyAction(`publish:${course.id}`);
    setPageError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/courses/${course.id}`, {
        method: 'PATCH',
        csrfToken,
        body: { status: 'published' },
      });
      await Promise.all([loadManagedCourses(1), loadCatalog(1)]);
      setDashboardRefreshKey((value) => value + 1);
      setNotice(`Le cours « ${course.title} » est maintenant publié.`);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function archiveCourse(course) {
    if (!window.confirm(`Archiver le cours « ${course.title} » ? Il ne sera plus visible dans le catalogue.`)) return;
    setBusyAction(`archive:${course.id}`);
    setPageError('');
    setNotice('');
    try {
      await apiRequest(`/api/v1/courses/${course.id}`, {
        method: 'DELETE',
        csrfToken,
      });
      await Promise.all([loadManagedCourses(1), loadCatalog(1)]);
      setDashboardRefreshKey((value) => value + 1);
      if (selectedContent?.id === course.id) setSelectedContent(null);
      setNotice(`Le cours « ${course.title} » a été archivé.`);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyAction('');
    }
  }

  function updateModule(moduleIndex, field, value) {
    setModules((previous) => previous.map((module, index) => (
      index === moduleIndex ? { ...module, [field]: value } : module
    )));
  }

  function updateResource(moduleIndex, resourceIndex, field, value) {
    setModules((previous) => previous.map((module, index) => {
      if (index !== moduleIndex) return module;
      return {
        ...module,
        resources: module.resources.map((resource, childIndex) => (
          childIndex === resourceIndex ? { ...resource, [field]: value } : resource
        )),
      };
    }));
  }

  function addModule() {
    setModules((previous) => previous.length >= MAX_MODULES
      ? previous
      : [...previous, emptyModule()]);
  }

  function removeModule(moduleIndex) {
    setModules((previous) => previous.filter((_module, index) => index !== moduleIndex));
  }

  function addResource(moduleIndex) {
    setModules((previous) => previous.map((module, index) => index === moduleIndex
      ? module.resources.length >= MAX_RESOURCES_PER_MODULE
        ? module
        : { ...module, resources: [...module.resources, { title: '', type: 'link', value: '' }] }
      : module));
  }

  function removeResource(moduleIndex, resourceIndex) {
    setModules((previous) => previous.map((module, index) => index === moduleIndex
      ? { ...module, resources: module.resources.filter((_resource, childIndex) => childIndex !== resourceIndex) }
      : module));
  }

  async function loadMore(key, loader, page) {
    setIsLoadingMore(key);
    setPageError('');
    try {
      await loader(page + 1, true);
    } catch (error) {
      setPageError(error.message);
    } finally {
      setIsLoadingMore('');
    }
  }

  function courseActions(course, isManaged = false) {
    const alreadyEnrolled = enrolledCourseIds.has(course.id);
    const canOpen = (isLearner && alreadyEnrolled && course.status === 'published')
      || (canManageCourses && managedCourseIds.has(course.id));

    return (
      <>
        {isLearner && !alreadyEnrolled && course.status === 'published' && (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => enroll(course)}
            disabled={busyAction === `enroll:${course.id}`}
          >
            {busyAction === `enroll:${course.id}` ? 'Inscription…' : 'S’inscrire'}
          </button>
        )}
        {isLearner && alreadyEnrolled && course.status === 'published' && (
          <button className={styles.primaryButton} type="button" onClick={() => openCourse(course.id)}>
            Ouvrir le cours
          </button>
        )}
        {isLearner && alreadyEnrolled && course.status === 'archived' && (
          <span className={styles.mutedAction}>Cours archivé</span>
        )}
        {canOpen && (
          <button className={styles.secondaryButton} type="button" onClick={() => openCourse(course.id)}>
            {course.status === 'draft' ? 'Prévisualiser' : 'Voir le contenu'}
          </button>
        )}
        {isManaged && course.status === 'draft' && course.moduleCount > 0 && (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => publishCourse(course)}
            disabled={busyAction === `publish:${course.id}`}
          >
            {busyAction === `publish:${course.id}` ? 'Publication…' : 'Publier'}
          </button>
        )}
        {isManaged && course.status !== 'archived' && (
          <button className={styles.secondaryButton} type="button" onClick={() => startEditingCourse(course)}>
            Modifier le cours
          </button>
        )}
        {isManaged && (
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => openRoster(course)}
            disabled={busyAction === `roster:${course.id}`}
          >
            {busyAction === `roster:${course.id}` ? 'Chargement…' : 'Voir les inscrits'}
          </button>
        )}
        {isManaged && (
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => openAssignmentManagement(course)}
            disabled={busyAction === `assignments:${course.id}`}
          >
            {busyAction === `assignments:${course.id}` ? 'Chargement…' : 'Gérer les devoirs'}
          </button>
        )}
        {isManaged && course.status !== 'archived' && (
          <button
            className={styles.dangerButton}
            type="button"
            onClick={() => archiveCourse(course)}
            disabled={busyAction === `archive:${course.id}`}
          >
            {busyAction === `archive:${course.id}` ? 'Archivage…' : 'Archiver'}
          </button>
        )}
      </>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>EduCloud · espace sécurisé</p>
          <h1>Bonjour {user.displayName}</h1>
          <p className={styles.headerDetail}>{roleLabels[user.role] ?? 'Utilisateur'} · {user.email}</p>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onLogout} disabled={isLoggingOut}>
          {isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </header>

      {authError && <p className={styles.error} role="alert">{authError}</p>}
      {pageError && <p className={styles.error} role="alert">{pageError}</p>}
      {notice && <p className={styles.notice} role="status" aria-live="polite">{notice}</p>}

      {isLoading ? (
        <p className={styles.loading} role="status">Chargement de votre espace…</p>
      ) : (
        <>
          <RoleDashboard key={dashboardRefreshKey} />

          {user.role === 'admin' && <AdminUsers csrfToken={csrfToken} currentUserId={user.id} onChange={() => setDashboardRefreshKey((value) => value + 1)} />}

          {canManageCourses && (user.role === 'instructor' || editingCourseId) && (
            <section className={styles.panel} aria-labelledby="create-course-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>{user.role === 'admin' ? 'Supervision' : 'Espace formateur'}</p>
                  <h2 id="create-course-title">{editingCourseId ? 'Modifier un cours' : 'Créer un cours'}</h2>
                </div>
                <p className={styles.helper}>{editingCourseId
                  ? 'Les changements sont appliqués au cours après enregistrement.'
                  : 'Le cours sera créé en brouillon. Vous pourrez le publier après vérification.'}</p>
              </div>
              <form className={styles.courseForm} onSubmit={submitCourse}>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Titre du cours</span>
                    <input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span>Description</span>
                    <textarea maxLength={6000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
                  </label>
                </div>

                {modules.map((module, moduleIndex) => (
                  <fieldset className={styles.moduleForm} key={`module-${moduleIndex}`}>
                    <legend>Module {moduleIndex + 1}</legend>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>Titre du module</span>
                        <input required minLength={2} maxLength={120} value={module.title} onChange={(event) => updateModule(moduleIndex, 'title', event.target.value)} />
                      </label>
                      <label className={styles.field}>
                        <span>Description du module</span>
                        <textarea maxLength={5000} rows={2} value={module.description} onChange={(event) => updateModule(moduleIndex, 'description', event.target.value)} />
                      </label>
                    </div>

                    <div className={styles.resourceHeading}>
                      <h3>Ressources</h3>
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={() => addResource(moduleIndex)}
                        disabled={module.resources.length >= MAX_RESOURCES_PER_MODULE}
                      >
                        {module.resources.length >= MAX_RESOURCES_PER_MODULE
                          ? 'Limite de 20 ressources atteinte'
                          : 'Ajouter une ressource'}
                      </button>
                    </div>
                    {module.resources.map((resource, resourceIndex) => (
                      <div className={styles.resourceForm} key={`resource-${moduleIndex}-${resourceIndex}`}>
                        <label className={styles.field}>
                          <span>Titre</span>
                          <input required minLength={2} maxLength={120} value={resource.title} onChange={(event) => updateResource(moduleIndex, resourceIndex, 'title', event.target.value)} />
                        </label>
                        <label className={styles.field}>
                          <span>Type</span>
                          <select value={resource.type} onChange={(event) => updateResource(moduleIndex, resourceIndex, 'type', event.target.value)}>
                            <option value="link">Lien HTTPS</option>
                            <option value="text">Texte</option>
                          </select>
                        </label>
                        <label className={`${styles.field} ${styles.resourceValue}`}>
                          <span>{resource.type === 'link' ? 'Adresse HTTPS' : 'Contenu texte'}</span>
                          {resource.type === 'link' ? (
                            <input required type="url" maxLength={2048} placeholder="https://…" value={resource.value} onChange={(event) => updateResource(moduleIndex, resourceIndex, 'value', event.target.value)} />
                          ) : (
                            <textarea required maxLength={20000} rows={2} value={resource.value} onChange={(event) => updateResource(moduleIndex, resourceIndex, 'value', event.target.value)} />
                          )}
                        </label>
                        <button className={styles.removeButton} type="button" onClick={() => removeResource(moduleIndex, resourceIndex)} aria-label={`Retirer la ressource ${resource.title || resourceIndex + 1}`}>
                          Retirer
                        </button>
                      </div>
                    ))}
                    {modules.length > 1 && (
                      <button className={styles.removeButton} type="button" onClick={() => removeModule(moduleIndex)}>
                        Retirer ce module
                      </button>
                    )}
                  </fieldset>
                ))}

                <div className={styles.formActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={addModule}
                    disabled={modules.length >= MAX_MODULES}
                  >
                    {modules.length >= MAX_MODULES ? 'Limite de 50 modules atteinte' : 'Ajouter un module'}
                  </button>
                  {editingCourseId && <button className={styles.secondaryButton} type="button" onClick={cancelEdit}>Annuler</button>}
                  <button className={styles.primaryButton} type="submit" disabled={busyAction === 'create' || busyAction === 'edit' || !csrfToken}>
                    {busyAction === 'edit'
                      ? 'Enregistrement…'
                      : editingCourseId ? 'Enregistrer les changements' : busyAction === 'create' ? 'Création…' : 'Créer le brouillon'}
                  </button>
                </div>
              </form>
            </section>
          )}

          {canManageCourses && (
            <section className={styles.panel} aria-labelledby="managed-courses-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>{user.role === 'admin' ? 'Supervision' : 'Espace formateur'}</p>
                  <h2 id="managed-courses-title">{user.role === 'admin' ? 'Tous les cours' : 'Mes cours'}</h2>
                </div>
              </div>
              {managedCourses.length === 0 ? (
                <p className={styles.emptyState}>Aucun cours à afficher pour le moment.</p>
              ) : (
                <div className={styles.courseGrid}>
                  {managedCourses.map((course) => (
                    <CourseCard key={course.id} course={course} status={`${course.status} · ${course.moduleCount} module${course.moduleCount > 1 ? 's' : ''}`}>
                      {courseActions(course, true)}
                    </CourseCard>
                  ))}
                </div>
              )}
              {managedHasMore && (
                <button className={styles.loadMoreButton} type="button" onClick={() => loadMore('managed', loadManagedCourses, managedPage)} disabled={Boolean(isLoadingMore)}>
                  {isLoadingMore === 'managed' ? 'Chargement…' : 'Afficher plus de cours'}
                </button>
              )}
            </section>
          )}

          {selectedRoster && (
            <section className={styles.panel} aria-labelledby="roster-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>Inscriptions</p>
                  <h2 id="roster-title">Apprenants · {selectedRoster.course.title}</h2>
                </div>
                <button className={styles.secondaryButton} type="button" onClick={() => setSelectedRoster(null)}>Fermer la liste</button>
              </div>
              {selectedRoster.items.length === 0 ? (
                <p className={styles.emptyState}>Aucune inscription pour le moment.</p>
              ) : (
                <ul className={styles.rosterList}>
                  {selectedRoster.items.map((enrollment) => (
                    <li key={enrollment.id}>
                      <strong>{enrollment.learner?.displayName ?? 'Compte indisponible'}</strong>
                      <span>Inscrit le {new Date(enrollment.enrolledAt).toLocaleDateString('fr-FR')}</span>
                    </li>
                  ))}
                </ul>
              )}
              {rosterHasMore && (
                <button
                  className={styles.loadMoreButton}
                  type="button"
                  onClick={() => loadMore('roster', (page, append) => loadRoster(selectedRoster.course, page, append), rosterPage)}
                  disabled={Boolean(isLoadingMore)}
                >
                  {isLoadingMore === 'roster' ? 'Chargement…' : 'Afficher plus d’inscrits'}
                </button>
              )}
            </section>
          )}

          {isLearner && (
            <section className={styles.panel} aria-labelledby="enrollments-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>Votre apprentissage</p>
                  <h2 id="enrollments-title">Mes cours inscrits</h2>
                </div>
              </div>
              {enrollments.length === 0 ? (
                <p className={styles.emptyState}>Vous n’êtes inscrit à aucun cours. Parcourez le catalogue ci-dessous.</p>
              ) : (
                <div className={styles.courseGrid}>
                  {enrollments.map((enrollment) => enrollment.course && (
                    <CourseCard
                      key={enrollment.id}
                      course={enrollment.course}
                      status={enrollment.course.status === 'archived' ? 'archivé' : 'inscrit'}
                    >
                      {enrollment.course.status === 'published' ? (
                        <button className={styles.primaryButton} type="button" onClick={() => openCourse(enrollment.course.id)}>
                          Ouvrir le cours
                        </button>
                      ) : (
                        <span className={styles.mutedAction}>Contenu indisponible</span>
                      )}
                    </CourseCard>
                  ))}
                </div>
              )}
              {enrollmentsHaveMore && (
                <button className={styles.loadMoreButton} type="button" onClick={() => loadMore('enrollments', loadEnrollments, enrollmentPage)} disabled={Boolean(isLoadingMore)}>
                  {isLoadingMore === 'enrollments' ? 'Chargement…' : 'Afficher plus d’inscriptions'}
                </button>
              )}
            </section>
          )}

          <section className={styles.panel} aria-labelledby="catalog-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Découvrir</p>
                <h2 id="catalog-title">Catalogue des cours</h2>
              </div>
              <p className={styles.helper}>Les cours publiés sont visibles ici. Leur contenu est réservé aux personnes autorisées.</p>
            </div>
            {catalog.length === 0 ? (
              <p className={styles.emptyState}>Aucun cours publié pour le moment.</p>
            ) : (
              <div className={styles.courseGrid}>
                {catalog.map((course) => (
                  <CourseCard key={course.id} course={course}>
                    {courseActions(course)}
                  </CourseCard>
                ))}
              </div>
            )}
            {catalogHasMore && (
              <button className={styles.loadMoreButton} type="button" onClick={() => loadMore('catalog', loadCatalog, catalogPage)} disabled={Boolean(isLoadingMore)}>
                {isLoadingMore === 'catalog' ? 'Chargement…' : 'Afficher plus de cours'}
              </button>
            )}
          </section>
        </>
      )}

      {isLoadingContent && <p className={styles.loading} role="status">Chargement du contenu du cours…</p>}
      {selectedAssignmentsCourse && (
        <section className={styles.panel} aria-labelledby="assignments-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>{isLearner ? 'Travaux et évaluations' : 'Évaluations'}</p>
              <h2 id="assignments-title">Devoirs · {selectedAssignmentsCourse.title}</h2>
            </div>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setSelectedAssignmentsCourse(null);
                setSelectedAssignments([]);
                setSelectedAssignmentForReview(null);
                setReviewSubmissions([]);
              }}
              type="button"
            >
              Fermer
            </button>
          </div>

          {canManageCourses && selectedAssignmentsCourse.status !== 'archived' && (
            <form className={styles.courseForm} onSubmit={createAssignment}>
              <h3>Créer un devoir</h3>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Titre du devoir</span>
                  <input maxLength={160} minLength={3} onChange={(event) => setAssignmentTitle(event.target.value)} required value={assignmentTitle} />
                </label>
                <label className={styles.field}>
                  <span>Date limite</span>
                  <input
                    onChange={(event) => setAssignmentDeadline(event.target.value)}
                    required
                    type="datetime-local"
                    value={assignmentDeadline}
                  />
                </label>
                <label className={styles.field}>
                  <span>Note maximale</span>
                  <input max={1000} min={0} onChange={(event) => setAssignmentMaxScore(event.target.value)} required step="0.5" type="number" value={assignmentMaxScore} />
                </label>
                <label className={styles.field}>
                  <span>Consignes</span>
                  <textarea maxLength={12000} minLength={1} onChange={(event) => setAssignmentInstructions(event.target.value)} required rows={4} value={assignmentInstructions} />
                </label>
              </div>
              <div className={styles.formActions}>
                <button className={styles.primaryButton} disabled={busyAction === 'assignment-create'} type="submit">
                  {busyAction === 'assignment-create' ? 'Création…' : 'Créer le devoir'}
                </button>
              </div>
            </form>
          )}

          {selectedAssignments.length === 0 ? (
            <p className={styles.emptyState}>Aucun devoir n’a été publié pour ce cours.</p>
          ) : (
            <div className={styles.moduleList}>
              {selectedAssignments.map((assignment) => {
                const deadlinePassed = new Date(assignment.deadline) <= new Date();
                return (
                  <article className={styles.contentModule} key={assignment.id}>
                    <div className={styles.courseTitleRow}>
                      <h3>{assignment.title}</h3>
                      <span className={styles.statusBadge}>{assignment.maxScore} points</span>
                    </div>
                    <p className={styles.contentDescription}>{assignment.instructions}</p>
                    <p className={styles.byline}>Échéance : {new Date(assignment.deadline).toLocaleString('fr-FR')}</p>
                    {isLearner && (
                      <>
                        {assignment.submission?.graded && (
                          <div className={styles.notice} role="status">
                            Note : <strong>{assignment.submission.grade} / {assignment.maxScore}</strong>
                            {assignment.submission.feedback && <p>{assignment.submission.feedback}</p>}
                          </div>
                        )}
                        <label className={styles.field}>
                          <span>{assignment.submission ? 'Votre remise' : 'Votre réponse'} · texte uniquement</span>
                          <textarea
                            maxLength={20000}
                            onChange={(event) => setSubmissionDrafts((previous) => ({ ...previous, [assignment.id]: event.target.value }))}
                            readOnly={Boolean(assignment.submission?.graded)}
                            rows={6}
                            value={submissionDrafts[assignment.id] ?? assignment.submission?.content ?? ''}
                          />
                        </label>
                        <div className={styles.formActions}>
                          <span className={styles.helper}>
                            {assignment.submission
                              ? `Remis le ${new Date(assignment.submission.submittedAt).toLocaleString('fr-FR')}`
                              : deadlinePassed ? 'Échéance dépassée' : 'Aucune remise enregistrée'}
                          </span>
                          <button
                            className={styles.primaryButton}
                            disabled={deadlinePassed || Boolean(assignment.submission?.graded) || busyAction === `submission:${assignment.id}` || !String(submissionDrafts[assignment.id] ?? assignment.submission?.content ?? '').trim()}
                            onClick={() => submitAssignment(assignment)}
                            type="button"
                          >
                            {busyAction === `submission:${assignment.id}` ? 'Enregistrement…' : assignment.submission ? 'Modifier la remise' : 'Remettre le devoir'}
                          </button>
                        </div>
                      </>
                    )}
                    {!isLearner && (
                      <div className={styles.formActions}>
                        <button
                          className={styles.secondaryButton}
                          disabled={busyAction === `reviews:${assignment.id}`}
                          onClick={() => openReviewSubmissions(assignment)}
                          type="button"
                        >
                          {busyAction === `reviews:${assignment.id}` ? 'Chargement…' : 'Consulter les remises'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {assignmentsHasMore && (
            <button className={styles.loadMoreButton} disabled={Boolean(isLoadingMore)} onClick={loadMoreAssignments} type="button">
              {isLoadingMore === 'assignments' ? 'Chargement…' : 'Afficher plus de devoirs'}
            </button>
          )}
        </section>
      )}

      {selectedAssignmentForReview && (
        <section className={styles.panel} aria-labelledby="submission-review-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Correction et commentaires</p>
              <h2 id="submission-review-title">Remises · {selectedAssignmentForReview.title}</h2>
            </div>
          </div>
          {reviewSubmissions.length === 0 ? (
            <p className={styles.emptyState}>Aucune remise n’a été reçue.</p>
          ) : (
            <div className={styles.moduleList}>
              {reviewSubmissions.map((submission) => (
                <article className={styles.contentModule} key={submission.id}>
                  <h3>{submission.learner?.displayName ?? 'Compte indisponible'}</h3>
                  <p className={styles.byline}>Remis le {new Date(submission.submittedAt).toLocaleString('fr-FR')}</p>
                  <p className={styles.resourceText}>{submission.content}</p>
                  <form className={styles.courseForm} onSubmit={(event) => saveGrade(event, submission)}>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>Note sur {selectedAssignmentForReview.maxScore}</span>
                        <input
                          max={selectedAssignmentForReview.maxScore}
                          min={0}
                          onChange={(event) => setGradeDrafts((previous) => ({ ...previous, [submission.id]: event.target.value }))}
                          required
                          step="0.5"
                          type="number"
                          value={gradeDrafts[submission.id] ?? ''}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Commentaire</span>
                        <textarea
                          maxLength={6000}
                          onChange={(event) => setFeedbackDrafts((previous) => ({ ...previous, [submission.id]: event.target.value }))}
                          rows={3}
                          value={feedbackDrafts[submission.id] ?? ''}
                        />
                      </label>
                    </div>
                    <div className={styles.formActions}>
                      {submission.graded && <span className={styles.helper}>Dernière correction : {new Date(submission.gradedAt).toLocaleString('fr-FR')}</span>}
                      <button className={styles.primaryButton} disabled={busyAction === `grade:${submission.id}`} type="submit">
                        {busyAction === `grade:${submission.id}` ? 'Enregistrement…' : submission.graded ? 'Mettre à jour la note' : 'Enregistrer la note'}
                      </button>
                    </div>
                  </form>
                </article>
              ))}
            </div>
          )}
          {reviewHasMore && (
            <button
              className={styles.loadMoreButton}
              onClick={async () => {
                setIsLoadingMore('reviews');
                try { await loadReviewSubmissions(selectedAssignmentForReview, reviewPage + 1, true); }
                catch (error) { setPageError(error.message); }
                finally { setIsLoadingMore(''); }
              }}
              disabled={Boolean(isLoadingMore)}
              type="button"
            >
              {isLoadingMore === 'reviews' ? 'Chargement…' : 'Afficher plus de remises'}
            </button>
          )}
        </section>
      )}

      {selectedContent && (
        <section className={styles.panel} aria-labelledby="course-content-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Contenu pédagogique</p>
              <h2 id="course-content-title">{selectedContent.title}</h2>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={() => setSelectedContent(null)}>Fermer le cours</button>
          </div>
          {selectedContent.description && <p className={styles.contentDescription}>{selectedContent.description}</p>}
          {selectedContent.modules.length === 0 ? (
            <p className={styles.emptyState}>Ce cours ne contient pas encore de module.</p>
          ) : (
            <div className={styles.moduleList}>
              {selectedContent.modules.map((module) => (
                <article className={styles.contentModule} key={module.id}>
                  <div className={styles.courseTitleRow}>
                    <h3>{module.title}</h3>
                    {isLearner && (
                      <button
                        className={module.completed ? styles.secondaryButton : styles.primaryButton}
                        disabled={busyAction === `module:${module.id}`}
                        onClick={() => toggleModuleCompletion(module)}
                        type="button"
                      >
                        {busyAction === `module:${module.id}` ? 'Enregistrement…' : module.completed ? 'Marquer non terminé' : 'Marquer terminé'}
                      </button>
                    )}
                  </div>
                  {module.description && <p className={styles.contentDescription}>{module.description}</p>}
                  {module.resources.length > 0 && (
                    <ul className={styles.resourceList}>
                      {module.resources.map((resource) => (
                        <li key={resource.id}>
                          <strong>{resource.title}</strong>
                          {resource.type === 'link' ? (
                            <a href={resource.url} target="_blank" rel="noopener noreferrer">Ouvrir la ressource (nouvel onglet)</a>
                          ) : (
                            <p className={styles.resourceText}>{resource.body}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
