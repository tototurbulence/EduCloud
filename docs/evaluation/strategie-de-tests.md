# Stratégie de tests initiale

La suite Vitest contient actuellement 15 tests répartis entre le socle HTTP, quelques parcours d'authentification et permissions de cours exécutés avec des modèles en mémoire, les primitives MFA, la validation de configuration et l'affichage initial de l'interface. Cette couverture ne valide pas encore la persistance MongoDB ni les parcours métier complets. Les cas ci-dessous restent requis avant de considérer le MVP validé.

| Niveau | Cible | Exemples de vérifications |
|---|---|---|
| Unitaire backend | Services et règles | Validation, TOTP et anti-rejeu, codes de secours, doublons d'inscription/soumission, progression, échéances et note maximale. |
| Intégration backend | API et base de test | Codes HTTP, schémas, pagination, erreurs, persistance et concurrence à la frontière d'une remise/notation. |
| Sécurité / autorisations | Toutes routes protégées | Non connecté, rôle insuffisant, autre propriétaire, accès aux données d'autrui, admin sans MFA, défi MFA et session après changement de rôle. |
| Frontend | Composants et parcours | Affichage par rôle, enrôlement/challenge MFA, formulaires de remise/correction, erreurs, navigation clavier et sauvegarde des codes de secours. |
| Système / E2E | Parcours MVP | Inscription au cours, devoir, notation, consultation de progression. |
| CI | Vérifications de dépôt | Installation reproductible, lint, tests et signalement d'échec. |
| Évaluation | Version candidate | Protocole documenté pour p50/p95, taux d'erreur, couverture et accessibilité. |

Utiliser des données synthétiques et une base de test distincte. Les seuils de performance seront fixés avant la mesure. Les résultats devront inclure environnement, version, protocole, résultats attendus et observés, anomalies et limites.
