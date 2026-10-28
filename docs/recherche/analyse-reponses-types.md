# Analyse des entretiens exploratoires — profils F01 et A01

**Statut :** analyse de deux entretiens réels selon la clarification de l'étudiant du 2026-10-19 : F01 (formateur) et A01 (apprenant). F01 a été interrogé le 13 octobre 2026 et A01 le 14 octobre 2026. L'étudiant confirme que les deux participants avaient donné leur accord. Le texte source contient des libellés contradictoires (« réponse proposée », « exemple fictif » et « hypothèses ») ; la clarification de l'étudiant prévaut pour l'analyse.

## 1. Thèmes ressortant des deux entretiens

| Thème observé dans ces réponses | Réponse du profil F01 | Réponse du profil A01 | Piste pour EduCloud |
|---|---|---|---|
| Information dispersée | Supports et échanges répartis entre fichiers, e-mail et WhatsApp. | Consignes et documents à rechercher dans plusieurs outils. | Rassembler cours, ressources, devoirs et notes dans des espaces liés aux cours. |
| Remise et correction | Vérification manuelle des remises et notes dans des documents séparés. | Attente d'une confirmation et recherche de notes/commentaires dans les messages. | Donner un statut de soumission et centraliser la notation et les commentaires. |
| Échéances et progression | Besoin de voir retards, notes et difficultés récurrentes. | Besoin de voir activités à faire, dates et résultats. | Lister les devoirs et échéances ; définir une règle explicite de progression avant de la calculer. |
| Utilisation sur mobile / connexion variable | Utilise ordinateur et smartphone ; réseau parfois instable. | Utilise surtout un smartphone ; les fichiers lourds et pages lentes gênent l'accès. | Concevoir une interface responsive et limiter le poids des pages ; mesurer les performances sur un scénario défini. |
| Confidentialité et simplicité | Notes et travaux limités aux personnes autorisées ; éviter les notifications excessives. | Notes privées et notifications utiles, sans complexité. | Autorisations côté serveur, minimisation des notifications et interface simple. |

Ces thèmes résument les propos de deux participants réels, un formateur et un apprenant. Ils constituent des observations qualitatives initiales, mais ne permettent pas d'estimer la fréquence des difficultés ni de généraliser à l'ensemble des formateurs et apprenants.

## 2. Exigences candidates à valider

Les réponses soutiennent ces besoins candidats. Il reste à compléter l'enquête si possible, vérifier leur adéquation avec le périmètre et transformer les critères en scénarios testables. Les critères chiffrés ne sont pas encore fixés.

| ID candidat | Formulation vérifiable proposée | Validation à préparer |
|---|---|---|
| RC-01 | Un apprenant inscrit peut retrouver depuis son espace les cours, ressources, devoirs et résultats auxquels il a accès. | Test de parcours avec utilisateurs ; définir un protocole de repérage et mesurer le résultat sans seuil arbitraire. |
| RC-02 | Après un dépôt accepté, l'apprenant voit une confirmation avec le devoir concerné et la date de remise. | Test d'intégration et test d'utilisabilité du parcours de soumission. |
| RC-03 | Un formateur peut voir l'état des remises, noter une soumission et laisser un commentaire ; l'apprenant concerné peut consulter le résultat. | Tests par rôle, propriété et parcours de bout en bout. |
| RC-04 | L'apprenant peut voir les devoirs à venir et leur date limite pour les cours auxquels il est inscrit. | Test fonctionnel avec devoirs à dates différentes et contrôle d'accès. |
| RC-05 | Les fonctions prioritaires restent utilisables sur écran mobile et avec une connexion de test documentée. | Vérifications responsive/clavier et mesure de performance selon un protocole à définir. |
| RC-06 | Un apprenant ne peut pas consulter ou modifier les notes et soumissions d'un autre apprenant. | Tests négatifs API avec utilisateurs distincts. |
| RC-07 | Le formateur ne peut modifier que les cours et notes qu'il est autorisé à gérer. | Tests négatifs API avec deux formateurs distincts. |

Le seuil « retrouver une ressource en moins de 30 secondes » présent dans le texte fourni est conservé comme exemple de critère possible, mais **n'est pas retenu comme seuil validé** : il devrait être justifié par un protocole de test et une observation réelle.

## 3. Pistes hors périmètre à ne pas ajouter automatiquement

- Rappels et notifications : décider après validation du besoin ; tenir compte de la demande de limiter les messages inutiles.
- Téléchargement hors ligne : le texte de l'apprenant le suggère, mais l'application mobile native est hors périmètre initial. Un accès ponctuel à des ressources téléchargées sur le Web demanderait une décision de portée et de sécurité.
- Messagerie directe formateur-apprenant : la messagerie instantanée est explicitement hors périmètre initial. Les canaux de contact existants peuvent être indiqués sans créer un système de chat.
- Suivi de compétences et difficultés récurrentes : nécessite des critères pédagogiques explicités ; ne pas calculer ou inférer ces mesures sans règle et données appropriées.

## 4. Conclusion méthodologique

Ces deux entretiens peuvent être présentés comme une collecte exploratoire initiale, en précisant le nombre de participants, leurs rôles, les dates, le consentement donné et les limites de l'échantillon. Les mentions fictives du document source ne doivent pas être reprises sans correction, puisqu'elles contredisent la clarification de l'étudiant.
