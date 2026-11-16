# Décisions autonomes

- Périmètre final demandé : accueil, connexion, correction de connexion puis mise à jour GitHub ; aucun nouveau travail sur les règles des jeux.
- Connexion locale : accepter uniquement les alias de boucle locale du même port/protocole hors production, avec contrôles CORS, CSRF et Socket.IO cohérents. En production, conserver l’origine configurée exacte.
- API indisponible : borner les requêtes à 10 secondes, reconnaître un repli HTML et permettre de réessayer sans perdre les champs du formulaire.
- Accueil mobile : rendre le bouton de déconnexion existant accessible après connexion ; il était masqué par la feuille de style générale.

- Reprise finale : remplacer les illustrations approximatives par des fenêtres SVG sur les visuels fournis, avec une interface HTML interactive ; mesurer la fidélité des illustrations et la stabilité des écrans séparément des données réelles et de la perspective photographique.
- Publier uniquement le dépôt `mimi-app` sur sa branche `autonomous-night`, sans fusion forcée ni modification du dépôt FORGE parent ; vérifier les contrôles GitHub après publication.

- Carte Étoile sur mobile : contraindre la colonne de jeu avec `minmax(0, 1fr)` et `min-width: 0` ; le défilement horizontal appartient à la main, jamais à toute la page. Vérification avant tout clic dans le parcours à deux joueurs.

- Captures de contrôle conservées dans `docs/previews/screens/` en fin de parcours Playwright : `test-results/` est temporaire et vidé à chaque relance, cause des images introuvables dans l’agent de nuit.

- Vérification visuelle ciblée : imposer la largeur des couvertures pour éviter leur rétrécissement avec `aspect-ratio` et `max-height` ; contrôler l’absence de bande vide dans les parcours navigateur et conserver les invitations réelles.

- Reprise du lanceur nuit : les diagnostics stderr restent journalisés ; seul le code de sortie arrête une exécution. Le statut suit les événements et confirme la présence du rapport final avant de déclarer la fin.

- Session nuit sous Windows : `tools/nuit.ps1` remplace tmux/systemd-inhibit absents. Codex 0.169.0 utilise `-a never -s workspace-write` ; chaque reprise cible l'identifiant de la session créée. Arrêt après achèvement vérifié, erreur d'exécution ou 30 reprises.
- Référence demandée : NIMIMI, accueil ordinateur/mobile, connexion, nom et icônes comme la maquette ; conserver les données réelles. Image locale : `.local/nimimi-reference.png`.
- Économie de tokens pour toute la session : localiser avec rg, lire uniquement les lignes utiles, appliquer des patchs ciblés ; jamais de fichier existant réécrit entièrement. Ne pas renvoyer de code ; réponses de 1 à 3 lignes, sans introduction ni conclusion. Éviter recherches inutiles et analyses répétées. Décider seul et noter les choix ici.

- Branche de travail : `autonomous-night`. Conserver les modifications existantes, sans réinitialisation des données ni réécriture de l’historique.
- Reprendre le premier élément inachevé de `tools/PROGRESS.md` : Course des Écuries, puis Bombe à Mots, puis finitions et vérifications globales.
- `PROGRESS.md` à la racine devient le suivi principal ; les acquis du suivi précédent sont conservés. Aucune case supplémentaire ne sera cochée sans vérification.
- La référence visuelle guide la composition, avec une identité et des illustrations originales MIMI. Le rendu Vercel seul ne constitue pas un déploiement du serveur multijoueur.
- Exécuter lint, typage, tests et compilation avant chaque commit de fonctionnalité. Consigner les limites réelles dans le rapport final.

- Vérification du 16 novembre 2026 : conserver ce monorepo et ses modifications locales ; aucune inscription Sites, publication ou réécriture de l’historique pour cette reprise locale.
- Seuil de couverture global du code partagé : 90 % pour instructions, branches, fonctions et lignes, désormais imposé par Vitest et exécuté en CI avec les 6 000 simulations.
- Mot Mystère conserve le dictionnaire français sous MIT (`words/an-array-of-french-words`, licence originale vérifiée le 16 novembre 2026). L’interface FR/EN ne change pas la langue des mots ; échéances serveur publiques de 15 s/10 s.
- Environnement actuel : pnpm absent du PATH et chargement esbuild des configurations bloqué par les droits de lecture des répertoires parents. Vérifications avec les binaires locaux, Vitest `--configLoader native`, Vite `--configLoader runner`, et chargeur TypeScript local existant. Compilation serveur SSR Vite vérifiée par démarrage réel, sans modifier la compilation tsup standard du projet.
- Playwright sous ce bac à sable Windows conserve ses processus serveur à la fermeture : lancer le serveur de test isolé séparément et utiliser une configuration locale sans `webServer`, puis arrêter uniquement les processus créés pour la vérification. Ne jamais interrompre PostgreSQL ou un serveur utilisateur.
