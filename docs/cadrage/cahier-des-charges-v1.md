# Cahier des charges v1 — EduCloud

**Statut :** périmètre des rôles et exigences transversales confirmé par l'étudiant ; synthèse v1 validée par l'encadrant selon confirmation de l'étudiant.  
**Durée de référence :** 12 semaines.  
**Établissement :** GOMYCODE.  
**Étudiant :** MBALLO Habibou.  
**Encadrant :** Mohamed Berkaoui (orthographe à confirmer : le plan contient aussi « MOhamed »).

## 1. Problématique

Comment concevoir, développer et déployer une plateforme Web basée sur le cloud permettant de centraliser les principales activités pédagogiques, tout en assurant la sécurité des données, la qualité logicielle et des performances adaptées à un usage éducatif ?

## 2. Objectif général

Concevoir, développer, tester et déployer une plateforme Web de gestion des cours, des inscriptions, des ressources pédagogiques, des devoirs et du suivi des apprentissages, en documentant les choix, les résultats observés et les limites.

## 3. Acteurs et besoins

Les rôles, responsabilités et exigences transversales de cette section ont été confirmés par l'étudiant le 2026-10-19. La règle d'attribution des rôles est décidée : auto-inscription apprenant uniquement ; compte administrateur initial provisionné hors inscription publique ; comptes formateur créés par un administrateur.

### Administrateur
- Gérer les comptes et les rôles.
- Superviser les cours et les inscriptions.
- Consulter des indicateurs généraux.

### Formateur
- Gérer ses propres cours selon ses autorisations.
- Organiser les contenus en modules et ajouter des ressources.
- Créer des devoirs.
- Consulter les soumissions, attribuer des notes et rédiger des commentaires.

### Apprenant
- Consulter les cours disponibles et s'y inscrire.
- Accéder aux modules et ressources auxquels il est autorisé.
- Soumettre des devoirs.
- Consulter ses notes et sa progression.

### Exigences transversales
- Inscription, connexion, déconnexion et gestion sécurisée de l'authentification.
- L'inscription publique crée uniquement un compte apprenant ; le premier administrateur est provisionné de façon contrôlée ; l'administrateur crée les comptes formateur et gère les rôles.
- Tableaux de bord par rôle.
- Validation côté serveur, erreurs cohérentes, prévention des inscriptions en double et pagination des listes pertinentes.
- Interface responsive et vérifications d'accessibilité.
- Secrets en variables d'environnement, CORS restreint, limitation adaptée des requêtes sensibles et journaux sans secrets.

Ces exigences transversales ont également été confirmées par l'étudiant le 2026-10-19.

## 4. Périmètre

Le MVP comprend les fonctions ci-dessus et les collections prévisionnelles `User`, `Course`, `Enrollment`, `Assignment` et `Submission`. Les modules, ressources et progressions doivent être spécifiés durant la conception.

Hors périmètre initial : visioconférence, paiement, messagerie instantanée, application mobile native et intelligence artificielle.

## 5. Exigences de qualité et preuves

- Les autorisations sont appliquées et vérifiées côté serveur, y compris la propriété des ressources.
- Les mots de passe sont hachés par une méthode éprouvée ; les entrées API sont validées.
- Les tests couvrent les parcours prioritaires et les refus d'accès.
- La latence p50/p95, le taux d'erreur, la couverture et les résultats d'accessibilité sont mesurés selon un protocole consigné.
- Aucun résultat n'est annoncé sans preuve observée.
- Le rapport documente les limites et menaces à la validité ; aucune affirmation de sécurité totale.

## 6. Exigences initiales vérifiables

| ID | Exigence | Critère d'acceptation initial |
|---|---|---|
| F-01 | Authentification | Un utilisateur autorisé peut se connecter et se déconnecter ; un utilisateur anonyme ne peut pas appeler une route protégée. |
| F-02 | Rôles | Les opérations interdites au rôle courant sont rejetées côté serveur. |
| F-03 | Propriété des cours | Un formateur peut gérer ses cours ; un autre formateur ne peut pas les modifier. |
| F-04 | Inscription | Un apprenant peut s'inscrire à un cours et une seconde inscription identique est empêchée. |
| F-05 | Devoirs | Un formateur crée un devoir ; un apprenant inscrit peut soumettre ; le formateur peut noter. |
| F-06 | Confidentialité | Un apprenant ne consulte que ses propres notes et soumissions, selon les règles définies. |
| F-07 | Progression | La progression est calculée selon une règle documentée et reproduite dans les tests. |
| NF-01 | Sécurité | Secrets absents du dépôt ; validation et autorisations testées ; journalisation sans identifiants secrets. |
| NF-02 | Qualité | Le pipeline exécute les contrôles et échoue si une vérification obligatoire échoue. |
| NF-03 | Accessibilité | Contrôles automatisés et manuels consignés, incluant clavier et responsive. |
| NF-04 | Performance | Un scénario et un protocole permettent de mesurer p50, p95 et taux d'erreur. |

## 7. Hypothèses et points à confirmer

- Entretiens exploratoires auprès de 5 à 8 personnes si l'accès aux participants le permet ; ne pas présenter les hypothèses comme des constats sans données.
- Les modalités de création des comptes et d'attribution des rôles sont décidées comme indiqué en section 3 ; le mécanisme de provisionnement initial est documenté par D-02 et la commande dédiée du dépôt.
- Stockage des fichiers, règles exactes de progression, échéances de soumission et critères chiffrés de performance à définir avant implémentation.
- Vérifier quotas, coûts, sauvegardes et conditions des offres cloud avant le déploiement.

## 8. Calendrier de référence — 12 semaines

| Semaine | Jalon et activités principales |
|---|---|
| 1 | Recherche documentaire, cadrage, analyse des besoins et création du dépôt. |
| 2 | Enquête exploratoire, cahier des charges et backlog priorisé. |
| 3 | Architecture, UML, modèle de données, maquettes et API initiale. |
| 4 | Socle full-stack, authentification, tests initiaux et première mise en ligne technique. |
| 5 | Cours et inscriptions. |
| 6 | Devoirs, soumissions et notation. |
| 7 | Progression, tableaux de bord et MVP. |
| 8 | Déploiement cloud consolidé et CI/CD. |
| 9 | Sécurité, stabilisation et OpenAPI/Swagger. |
| 10 | Évaluation fonctionnelle, sécurité, accessibilité et performance. |
| 11 | Rapport scientifique de 2 500 à 3 500 mots. |
| 12 | Corrections finales, livraison et démonstration enregistrée de 10 minutes. |

Le plan contient ailleurs une synthèse initiale sur six semaines. Elle est considérée comme une incohérence éditoriale ; le calendrier détaillé sur douze semaines fait foi, conformément à la demande de l'étudiant.

## 9. Critères de sortie du cadrage

- Les acteurs et fonctions du MVP sont confirmés.
- Chaque fonction prioritaire a un critère d'acceptation.
- Les décisions ouvertes et leurs échéances sont attribuées.
- Le calendrier de douze semaines est retenu.
- Les besoins issus des entretiens sont séparés des hypothèses documentaires.
