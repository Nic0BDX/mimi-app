# MIMI — suivi autonome

Suivi repris de `tools/PROGRESS.md`, sans considérer les acquis comme une nouvelle certification globale.

- [x] Fondations, comptes et profils.
- [x] Amis, blocages, notifications et présence.
- [x] Salons, invitations, persistance et reconnexion.
- [x] Morpion et Puissance 4.
- [x] Dames internationales.
- [x] Carte Frénésie et vues filtrées.
- [x] Course des Écuries : scénario en ligne, simulation de 1 000 parties et vérifications complètes.
- [x] Bombe à Mots : dictionnaire sous licence, moteur, serveur, interface et tests.
- [x] Fidélité visuelle de tous les écrans et captures comparatives mobile/bureau.
- [x] Finitions, accessibilité, PWA et i18n.
- [x] Simulations de tous les moteurs, couverture et parcours critiques à deux utilisateurs.
- [x] Documentation de lancement, architecture et RAPPORT_FINAL.md.
- [ ] Publication des modifications vérifiées sur la branche GitHub du projet.

Branche : `autonomous-night`. Décisions : `DECISIONS.md`.

Vérifié le 16 novembre 2026 : 98 tests Vitest, 26 parcours Playwright complets
et deux parcours ciblés de connexion locale/récupération après panne, 6 000 simulations. Couverture partagée : instructions
95,41 %, branches 90,40 %, fonctions 93,71 %, lignes 96,73 %.
ESLint, formatage, typage, compilation web/PWA et démarrage du serveur compilé
avec PostgreSQL valides. Accueils 1920×1080 et 390×844 sans débordement.
Audio activable et persistant, navigation clavier et shell hors connexion testés.
Visuels issus de la référence : comparaison des 12 cadrages, écart moyen maximal
1,76 % ; 38 références d’écrans versionnées pour la régression visuelle.
Commandes standard de compilation et test du serveur compilé confirmées lors de
la reprise, avec les autorisations natives Windows. Lanceur nuit réparé et quatre
scénarios dédiés validés. Limites documentées dans `RAPPORT_FINAL.md`.
Publication GitHub en cours ; aucun hébergement public complet certifié.
