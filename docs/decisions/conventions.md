# Conventions de travail

## Code
- Privilégier des noms explicites et une seule langue cohérente dans le code.
- Garder les règles métier dans les services ; les contrôleurs adaptent HTTP ; les routes déclarent les chemins et middlewares.
- Valider les entrées côté serveur même si le frontend les valide aussi.
- Toute opération sur une ressource vérifie le rôle et la propriété nécessaires.
- Ajouter des tests pour les comportements nominaux et les refus d'accès.
- Ne jamais enregistrer de secret, mot de passe ou jeton dans les logs.

## Git
- `main` reste la branche stable.
- Branches courtes : `feat/nom`, `fix/nom`, `docs/nom`, `test/nom`.
- Commits petits, cohérents, au présent et descriptifs (ex. `docs: cadrer les rôles du MVP`).
- Chaque changement logique doit pouvoir être relu et validé avant fusion.
- Ne pas committer `.env`, identifiants ou données personnelles.

## Documentation et décisions
- Mettre à jour le README quand les étapes d'installation ou d'exécution changent.
- Consigner les décisions structurantes avec contexte, choix et conséquences.
- Dater les mesures et distinguer résultats observés, hypothèses et objectifs.
