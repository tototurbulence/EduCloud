# Synthèse des besoins v1 — EduCloud

**Sources :** deux entretiens exploratoires consentis, F01 (formateur, 13 octobre 2026) et A01 (apprenant, 14 octobre 2026), tels que rapportés par l'étudiant.  
**Limite :** échantillon de deux personnes ; les résultats décrivent ces expériences et ne sont pas généralisables. Les besoins ci-dessous sont des exigences initiales à confronter à d'autres utilisateurs et aux contraintes du projet.

## 1. Besoins et traçabilité

| ID | Besoin formulé | Source | Réponse EduCloud envisagée | Priorité initiale |
|---|---|---|---|---|
| N-01 | Retrouver cours, consignes et ressources sans chercher dans plusieurs canaux. | F01, A01 | Cours et ressources regroupés dans le cours auquel l'apprenant est inscrit. | P0 |
| N-02 | Préparer, publier et suivre un devoir dans un même espace. | F01 | Devoir avec consigne et échéance ; liste des soumissions avec statut. | P0 |
| N-03 | Savoir qu'un devoir a été reçu, puis consulter note et commentaire. | F01, A01 | Confirmation de soumission horodatée ; retour de notation visible uniquement aux personnes autorisées. | P0 |
| N-04 | Connaître les devoirs à faire et leurs échéances. | A01, F01 | Vue des devoirs avec cours, date limite et statut. | P0 |
| N-05 | Consulter les cours, résultats et progression personnelle. | A01 | Tableau de bord apprenant limité à ses inscriptions, devoirs et résultats. | P0 |
| N-06 | Réduire les problèmes d'accès sur smartphone et réseau variable. | F01, A01 | Interface responsive, pages légères et ressources clairement accessibles. | P0 pour responsive ; mesure réseau à définir |
| N-07 | Protéger notes, travaux et données des autres apprenants. | F01, A01 | Contrôle côté serveur du rôle et de la propriété ; tests négatifs d'accès. | P0 |
| N-08 | Garder une interface simple et limiter les notifications superflues. | F01, A01 | Parcours prioritaires simples ; aucune notification additionnelle au MVP sans besoin validé. | P0 pour simplicité ; notifications hors scope initial |

Les priorités respectent le périmètre déjà approuvé. Elles ne traduisent pas une mesure de fréquence : elles servent à construire un MVP en douze semaines et devront être revues si de nouvelles données ou contraintes apparaissent.

## 2. User stories et critères d'acceptation initiaux

### US-01 — Accéder aux contenus d'un cours

En tant qu'apprenant inscrit, je veux retrouver les modules et ressources de mon cours afin de consulter les supports au même endroit.

- Étant connecté et inscrit à un cours, lorsque j'ouvre ce cours, je vois les modules et ressources publiés auxquels j'ai droit.
- Un apprenant non inscrit ou un utilisateur non autorisé ne peut pas récupérer ces ressources via l'API.

### US-02 — Publier un devoir et suivre les remises

En tant que formateur propriétaire d'un cours, je veux créer un devoir avec consigne et échéance, puis voir les remises afin de gérer le travail des apprenants.

- Le formateur autorisé peut créer le devoir avec les champs obligatoires validés côté serveur.
- Il peut voir, pour les apprenants inscrits, le statut de remise et l'horodatage de chaque soumission reçue.
- Un formateur non autorisé ne peut ni modifier le devoir ni consulter ses soumissions.

### US-03 — Remettre un devoir et obtenir confirmation

En tant qu'apprenant inscrit, je veux soumettre mon travail et voir une confirmation afin de savoir que la plateforme l'a reçu.

- Après acceptation de la soumission, l'apprenant voit le devoir concerné, la date de remise et un statut de confirmation.
- L'apprenant ne peut consulter ou remplacer que sa propre soumission, selon les règles de remise qui restent à définir.

### US-04 — Noter et consulter un travail

En tant que formateur autorisé, je veux attribuer une note et un commentaire à une soumission ; en tant qu'apprenant, je veux consulter le retour qui m'est destiné.

- Le formateur responsable peut enregistrer une note dans les limites définies et un commentaire.
- L'apprenant concerné peut consulter sa note et son commentaire après publication.
- Un autre apprenant ne peut accéder à ces informations, même en modifiant l'identifiant de la requête.

### US-05 — Organiser le travail à venir

En tant qu'apprenant, je veux voir mes devoirs à venir, leurs échéances et leur état afin de planifier mon travail.

- La liste ne contient que les devoirs des cours auxquels l'apprenant est inscrit.
- Chaque entrée affiche au minimum le titre du devoir, le cours, l'échéance et le statut de soumission.
- Les listes longues sont paginées selon la règle d'API qui sera définie.

### US-06 — Utiliser les parcours sur petit écran

En tant qu'apprenant ou formateur utilisant un smartphone, je veux consulter les parcours prioritaires sans défilement horizontal ni commande inaccessible.

- Les parcours cours, devoirs, soumission et consultation d'une note sont vérifiés sur un viewport mobile défini.
- Les contrôles sont accessibles au clavier et leurs libellés sont compréhensibles.
- Les dimensions d'écran et résultats de vérification sont consignés ; la cible de performance réseau reste à définir avant les mesures.

## 3. Décisions métier à fixer avant le développement concerné

- Formats et taille maximale des soumissions ; stockage et analyse de sécurité des fichiers.
- Politique des retards, du remplacement d'une soumission et des tentatives multiples.
- Échelle de notation, limites de note et moment de publication des retours.
- Règle de progression des modules ; ne pas inférer les compétences acquises à partir des seules notes sans modèle convenu.
- Sémantique du statut de ressource consultée : le MVP ne doit pas affirmer qu'un utilisateur a effectivement étudié un document à partir d'un simple affichage.

## 4. Traçabilité vers le backlog

- N-01 → B-04, B-06, B-08
- N-02 et N-03 → B-07
- N-04 et N-05 → B-08
- N-06 et N-08 → B-12
- N-07 → B-03, B-06, B-07 et B-10

Ces exigences v1 constituent le point de départ de la conception ; l'architecture, les modèles et les endpoints seront formalisés au jalon de la semaine 3.
