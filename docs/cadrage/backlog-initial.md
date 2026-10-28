# Backlog initial EduCloud

Priorités : **P0** = indispensable au MVP ; **P1** = attendu si le temps le permet après P0.

| ID | Priorité | Epic / besoin | Critère d'acceptation | Dépendances |
|---|---|---|---|---|
| B-01 | P0 | Cadrage et recherche | Besoins, sources et hypothèses tracés ; exigences testables documentées. | — |
| B-02 | P0 | Comptes et authentification | Inscription publique crée uniquement un apprenant ; connexion/déconnexion vérifiables ; premier administrateur provisionné de façon contrôlée ; secrets et mots de passe gérés correctement. | Décision auth |
| B-03 | P0 | Rôles et propriété | L'administrateur consulte les comptes, crée les formateurs avec changement obligatoire du secret temporaire, attribue les rôles et désactive/réactive les comptes non administrateurs ; chaque opération protégée vérifie rôle et propriétaire côté serveur. | B-02 |
| B-04 | P0 | Cours et modules | Formateur crée, consulte, modifie et archive ses cours ; catalogue public limité aux cours publiés et à leurs métadonnées ; apprenant inscrit accède aux modules. La publication exige au moins un module. | B-03, modèle de données |
| B-05 | P0 | Inscriptions | Apprenant s'inscrit à un cours publié ; contrainte unique empêche le doublon même sous requêtes simultanées ; l'apprenant consulte ses inscriptions et seul le propriétaire/admin voit le roster. | B-04 |
| B-06 | P0 | Ressources | Apprenant inscrit retrouve le texte et les liens HTTPS du cours ; API refuse l'accès aux utilisateurs non autorisés. Pas de téléversement dans cette première tranche. | B-05 |
| B-07 | P0 | Devoirs et soumissions | Formateur crée un devoir avec consigne/échéance, voit statuts de remise, note et commente ; apprenant soumet, voit confirmation horodatée et consulte son retour sans accéder à celui d'autrui. | B-05, décisions échéance et stockage |
| B-08 | P0 | Tableau de bord minimal | Apprenant voit ses cours, devoirs à venir, échéances, statuts et résultats ; formateur voit ses cours et remises à corriger. | B-04 à B-07 |
| B-09 | P0 | Déploiement anticipé | Première version accessible en ligne au plus tard semaine 4. | B-02, comptes cloud |
| B-10 | P0 | Tests et CI | Pipeline exécute lint et tests ; les échecs bloquent la validation. | B-02+ |
| B-11 | P1 | Progression | Règle explicite implémentée et couverte par des tests. | Décision progression |
| B-12 | P0 | Accessibilité et performance | Parcours prioritaires vérifiés en responsive et au clavier ; protocole et mesures de performance consignés sans seuil annoncé avant qu'il soit fixé. | MVP stabilisé |
| B-13 | P0 | Livrables académiques | Rapport, preuves, documentation et vidéo de 10 min livrés en semaine 12. | Résultats observés |

Les critères détaillés des parcours sont dans [Synthèse des besoins v1](synthese-besoins-v1.md). Les priorités tirées des deux entretiens restent initiales et exploratoires.
