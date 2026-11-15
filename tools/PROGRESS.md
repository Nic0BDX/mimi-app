# MIMI — progression

- [x] 1. Fondations, comptes, profils, PWA et tests initiaux.
- [x] 2. Amis réels, blocages, notifications persistantes, présence multi-onglets.
- [x] 3. Salons, invitations, états persistés, reconnexion, chat et statistiques.
- [x] 4a. Morpion et Puissance 4.
- [x] 4b. Dames internationales.
- [ ] 4c. Carte Frénésie et informations cachées.
- [ ] 4d. Course des Écuries.
- [ ] 4e. Bombe à Mots et dictionnaire sous licence vérifiée.
- [ ] 5. Finitions, simulations, tests complets, documentation et publication GitHub.

Autorisation : poursuivre toutes les étapes sans nouvelle validation intermédiaire.
Projet actif : ce dépôt `mimi-app` uniquement ; ne jamais pousser le dépôt FORGE parent.
Hébergement public complet : nécessite un serveur Node persistant, PostgreSQL et SMTP.

Étape 2 : 7 tests d’intégration PostgreSQL et 2 parcours Playwright (mobile/bureau)
valides. Présence actuellement mono-instance ; aucune synchronisation Redis/horizontale revendiquée.

Étapes 3/4a : 9 tests d’intégration des parties, 6 tests de règles et 4 parcours
Playwright mobile/bureau valides. Captures consultées. Les parties survivent à une
nouvelle instance de service ; identifiants d’actions et versions testés.

Dames : 8 tests de règles, typage, compilation et 2 parcours Playwright valides.
Référence des règles : FMJD, Annexes 2024, annexe 1 (prises et nulles).
