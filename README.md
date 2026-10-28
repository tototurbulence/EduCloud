# EduCloud

Plateforme Web cloud-native pour la gestion et le suivi des apprentissages.

## État du projet

Développement du socle — projet planifié sur douze semaines. Le cadrage, l'authentification, la gestion des comptes, la MFA administrateur, le catalogue, les cours, les devoirs, les remises, la correction et les premiers tableaux de bord sont intégrés. Les parcours métier restent à vérifier avec une base MongoDB configurée. Aucun déploiement cloud n'a été réalisé.

## Périmètre MVP

- Trois rôles : administrateur, formateur et apprenant.
- Authentification et autorisations contrôlées côté serveur.
- Cours, inscriptions, ressources pédagogiques, devoirs, soumissions, notes et progression.
- Tableaux de bord adaptés aux rôles.
- Tests reproductibles, documentation API, CI/CD et déploiement cloud.

La visioconférence, les paiements, la messagerie instantanée, l'application mobile native et l'IA sont hors périmètre initial.

## Technologies envisagées

React + Vite, Node.js + Express, MongoDB Atlas + Mongoose, Vitest, Supertest et React Testing Library, Vercel, Render et GitHub Actions. Les versions, coûts, quotas et options de sauvegarde restent à vérifier avant configuration.

## Documentation

- [Cahier des charges v1](docs/cadrage/cahier-des-charges-v1.md)
- [Synthèse des besoins v1 et user stories](docs/cadrage/synthese-besoins-v1.md)
- [Checklist de la semaine 1](docs/cadrage/checklist-semaine-1.md)
- [Backlog initial](docs/cadrage/backlog-initial.md)
- [Bibliographie annotée](docs/recherche/bibliographie-annotee.md)
- [Comparaison exploratoire de LMS](docs/recherche/comparaison-lms.md)
- [Guide d'entretien exploratoire](docs/recherche/guide-entretien-exploratoire.md)
- [Analyse des entretiens exploratoires](docs/recherche/analyse-reponses-types.md)
- [Conception v1 : architecture, données et API](docs/architecture/conception-v1.md)
- [Décisions ouvertes](docs/decisions/decisions-ouvertes.md)
- [Conventions de travail](docs/decisions/conventions.md)
- [Stratégie de tests](docs/evaluation/strategie-de-tests.md)
- [Journal technique](docs/journal-technique.md)

## Prérequis vérifiés

- Git 2.55.0.windows.5
- Node.js v24.20.0
- npm 11.19.0

Ces outils ont été déclarés disponibles par l'étudiant. La compatibilité du socle avec Node.js 24 a été vérifiée par les tests et le build ; les versions résolues sont documentées ci-dessous.

Après installation, le lockfile a résolu Express 5.3.0, React 19.3.1, Vite 7.3.7 et Vitest 5.0.5. `npm audit` a terminé sans vulnérabilités connues lors de la vérification du 2026-10-19. Garder `package-lock.json` versionné pour reproduire ces résolutions.

## Démarrage local

Depuis la racine du dépôt :

```powershell
npm install
Copy-Item apps\api\.env.example apps\api\.env
$env:NODE_ENV = 'development'
$env:CLIENT_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
npm run dev:api
```

Ces variables PowerShell forcent le mode local pour ce terminal si `NODE_ENV=production` a été défini à l'échelle de Windows. Ne réutiliser aucune URI MongoDB de production : configurer `MONGODB_URI` avec une base locale ou de développement. Sans base configurée, la route de santé reste disponible et toute opération nécessitant un compte répond `503` après le contrôle CSRF. Remplacer la valeur vide de `SESSION_SECRET` par une valeur aléatoire ; en production, le secret doit être injecté par le gestionnaire de secrets et faire au moins 32 caractères. Définir `CLIENT_ORIGINS` avec les origines exactes autorisées, sans chemin. Pour configurer la MFA d'un compte administrateur en local, générer `MFA_ENCRYPTION_KEY` avec `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` et conserver la même clé entre les redémarrages. Ce secret séparé ne doit jamais être commité.

Dans un second terminal, depuis la racine du dépôt :

```powershell
npm run dev:web
```

Ouvrir l'URL Vite affichée dans le terminal. Le frontend appelle `/api/v1/health/live` via le proxy Vite. Les identifiants de session sont conservés côté serveur dans MongoDB en production. Le navigateur reçoit un cookie HttpOnly, et toutes les mutations API doivent envoyer le jeton récupéré par `GET /api/v1/auth/csrf` dans l'en-tête `X-CSRF-Token`.

L'administrateur peut créer un formateur depuis son espace. L'API génère un mot de passe temporaire aléatoire, l'affiche une seule fois et exige son remplacement à la première connexion. Transmettre ce secret par un canal privé ; il n'est pas envoyé par courriel. Les réinitialisations invalident les sessions existantes et imposent également un nouveau changement de mot de passe. Le rôle, l'état et le mot de passe des comptes administrateur sont protégés depuis l'interface ; un autre administrateur peut réinitialiser la MFA d'un collègue, ce qui invalide ses sessions et l'oblige à enrôler de nouveau son application.

### Provisionner le premier administrateur

La route d'inscription publique ne crée que des apprenants. Pour provisionner le premier administrateur, injecter temporairement `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` et `BOOTSTRAP_ADMIN_PASSWORD` dans l'environnement d'exécution, puis lancer :

```powershell
npm run provision:admin --workspace @educloud/api
```

La commande ne journalise aucun secret et refuse de créer un second administrateur. Ne pas passer le mot de passe comme argument de ligne de commande, ne pas le committer dans un fichier et supprimer les variables temporaires après l'opération.

En production, conserver un proxy HTTPS same-origin entre l'interface et `/api`, définir `NODE_ENV=production`, un `SESSION_SECRET` aléatoire, une `MFA_ENCRYPTION_KEY` de 32 octets en hexadécimal, une URI MongoDB utilisant TLS, des origines publiques HTTPS et `TRUST_PROXY_HOPS` selon l'ingress réellement utilisé. Injecter ces secrets depuis le gestionnaire de secrets, avec des valeurs stables entre déploiements. L'API refuse de démarrer si MongoDB, ces clés ou les paramètres sécurisés manquent. À la première connexion, chaque administrateur doit enrôler une application TOTP et enregistrer ses codes de secours avant d'accéder aux fonctions privilégiées.

Les devoirs utilisent pour le MVP des remises textuelles (20 000 caractères maximum), sans pièce jointe. Une seule remise est conservée par apprenant et devoir ; elle peut être remplacée avant l'échéance tant qu'elle n'a pas été corrigée. Les remises tardives et les modifications après correction sont refusées. La progression est déclarative : l'apprenant marque les modules terminés ; le tableau de bord calcule le pourcentage à partir des modules des cours publiés auxquels il est inscrit.

## Vérifications locales

```powershell
npm run test
npm run build
```

La suite comprend actuellement 15 tests : socle HTTP (santé, CORS, route inconnue), authentification en mémoire (CSRF, inscription apprenant, refus d'élévation de rôle, connexion et contrôle d'accès), permissions de base sur les cours, primitives MFA, validation de configuration de production et affichage initial de l'état API. Elle ne couvre pas encore les parcours persistants avec MongoDB, la gestion administrative complète, les inscriptions, les devoirs, les notes ni la progression.
