# MIMI — progression

- [x] 1. Fondations, comptes, profils, PWA et tests initiaux.
- [x] 2. Amis réels, blocages, notifications persistantes, présence multi-onglets.
- [x] 3. Salons, invitations, états persistés, reconnexion, chat et statistiques.
- [x] 4a. Morpion et Puissance 4.
- [x] 4b. Dames internationales.
- [x] 4c. Carte Frénésie et informations cachées.
- [x] 4d. Course des Écuries.
- [x] 4e. Bombe à Mots et dictionnaire sous licence vérifiée.
- [x] 5. Finitions, simulations, tests complets, documentation et publication GitHub.

Autorisation : poursuivre toutes les étapes sans nouvelle validation intermédiaire.
Projet actif : ce dépôt `mimi-app` uniquement ; ne jamais pousser le dépôt FORGE parent.

Reprise du 16 novembre 2026 : le suivi principal est désormais `../PROGRESS.md`.
Les six jeux, finitions et vérifications locales sont terminés ; le code a été
publié sur GitHub, branche `main`, commit fonctionnel `92e71b2`.
Résultats détaillés : `../RAPPORT_FINAL.md`.
Hébergement public complet : nécessite un serveur Node persistant, PostgreSQL et SMTP.

Étape 2 : 7 tests d’intégration PostgreSQL et 2 parcours Playwright (mobile/bureau)
valides. Présence actuellement mono-instance ; aucune synchronisation Redis/horizontale revendiquée.

Étapes 3/4a : 9 tests d’intégration des parties, 6 tests de règles et 4 parcours
Playwright mobile/bureau valides. Captures consultées. Les parties survivent à une
nouvelle instance de service ; identifiants d’actions et versions testés.

Dames : 8 tests de règles, typage, compilation et 2 parcours Playwright valides.
Référence des règles : FMJD, Annexes 2024, annexe 1 (prises et nulles).

Carte Frénésie : 12 tests de règles et 2 parcours à deux comptes valides ; mains
disjointes et absence de pioche/état brut dans les réponses vérifiées. Le mode défi
du +4 autorise le bluff, contrôlé par le serveur au défi ; sinon la restriction est stricte.
Simulations 1 000 parties et seuils de couverture : contrôle final encore à exécuter.

## Priorité du 15 novembre : rendu visuel livré avant les jeux

À la demande de l’utilisateur, la suite des jeux est mise de côté. Course des
Écuries conserve son avancement : moteur, 9 tests unitaires valides, plateau SVG et
typage valide ; le parcours navigateur de ce jeu reste à vérifier.

Rendu d’accueil finalisé : 1920×1080 sans défilement vertical nécessaire et 390×844
sans débordement horizontal. Captures réelles dans `docs/previews/`. Aucune erreur
JavaScript/console constatée sur l’accueil. Lint et compilation web valides.
Sur ce PC : `pnpm dev`, puis http://localhost:5173 ; `.env` reste local et ignoré.
Le serveur de développement et PostgreSQL local étaient actifs à la livraison.
Pas de déploiement public du serveur effectué. Simulations globales, couverture
90 %, Bombe à Mots et finitions métier restent ouverts pour la reprise.
