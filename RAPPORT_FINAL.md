# NIMIMI — rapport de vérification du 16 novembre 2026

## Livraison du projet

Six jeux sont enregistrés, créables et jouables avec le serveur autoritaire :

| Identifiant stable | Nom affiché      | Vérification                                                      |
| ------------------ | ---------------- | ----------------------------------------------------------------- |
| morpion            | Morpion+         | Partie à deux jusqu’aux résultats, chat, reconnexion, revanche    |
| puissance-quatre   | Puissance 4+     | Partie à deux jusqu’aux résultats et reconnexion ; bot serveur    |
| dames              | Dames+           | Plateau international 10×10 et déplacements légaux serveur        |
| carte-frenesie     | Carte Étoile     | Mains privées distinctes, cartes jouées à deux                    |
| course-ecuries     | Course des Pions | Dé, déplacements légaux, état persisté après reconnexion          |
| bombe-mots         | Mot Mystère      | Dictionnaire, refus des mots invalides, alternance et reconnexion |

Les modifications locales antérieures sont conservées. L’historique n’a pas été
réécrit et le dépôt FORGE parent n’a pas été modifié.

## Moteurs et persistance

Les 6 000 parties déterministes ont terminé sans blocage :

| Moteur           | Parties | Plus longue partie, en actions |
| ---------------- | ------: | -----------------------------: |
| Morpion          |   1 000 |                              9 |
| Puissance 4      |   1 000 |                             42 |
| Dames            |   1 000 |                            162 |
| Carte Étoile     |   1 000 |                            323 |
| Course des Pions |   1 000 |                            600 |
| Mot Mystère      |   1 000 |                             60 |

Chaque action simulée contrôle la non-mutation de l’entrée, la validité de l’état,
la projection de tous les joueurs et l’absence de doublons dans le classement.
Ces simulations ne constituent pas une preuve exhaustive de toutes les règles.

Les tests PostgreSQL couvrent versions, déduplication, permissions, invitations,
chat, forfaits, revanche et reprise du générateur aléatoire. Un test supplémentaire
de Mot Mystère reconstruit le service, retrouve les mots joués, expire le tour et
vérifie qu’une seconde exécution du traitement ne retire pas une seconde vie.

Les tests de règles supplémentaires couvrent le plafond de vies, les sièges
éliminés et les bots sans mot disponible, ainsi que les forfaits pendant un défi
de cartes et la distribution des manches suivantes aux seuls joueurs actifs.

## Qualité et interface

- ESLint sans avertissement, Prettier et typage des trois packages vérifiés.
- 98 tests Vitest valides, avec une vraie base PostgreSQL isolée pour les tests serveur.
- 26 parcours Playwright complets valides : 13 scénarios en mobile et les mêmes en bureau,
  dont six jeux, comptes, présence multi-onglets, clavier, langue, PWA et audio.
- Couverture du code partagé : instructions **95,41 %**, branches **90,40 %**,
  fonctions **93,71 %**, lignes **96,73 %**. Seuil global de 90 % imposé pour chaque
  mesure ; le serveur et les composants React ne sont pas inclus dans ce périmètre.
- Compilation TypeScript du partagé, compilation web/PWA et bundle serveur SSR
  vérifiés. Le serveur compilé démarre et réalise session et inscription avec PostgreSQL.
- Clés FR/EN concordantes, changement de langue persistant, shell disponible hors
  connexion, API exclue du cache du service worker.
- Focus initial corrigé pour rendre le lien d’accès au contenu atteignable au
  premier Tab ; le focus rejoint le contenu lors d’une navigation interne.
- Préférences audio reliées à Web Audio : activation explicite, pause, volume,
  sons au clic et reprise après retour sur l’onglet. Musique limitée aux écrans
  d’accueil et de compte. Les vibrations dépendent de l’appareil.
- Suppression de compte : notifications contenant le profil de l’acteur retirées
  aussi chez leurs destinataires, actions de journal expurgées, messages supprimés.
  Les états de jeu conservent les coups nécessaires à la continuité des parties.

## Comparaison visuelle

La référence locale `.local/nimimi-reference.png` a été inspectée. La composition
reprend la barre latérale, la palette nuit/violet/or, le paysage, les six cartes,
les panneaux sociaux et l’accueil mobile avec ses trois actions et sa navigation.
Le logo, les six couvertures et les éléments de décor utilisent maintenant les
pixels de l’image fournie, affichés par des fenêtres SVG. Les textes, boutons,
formulaires et jeux restent de vrais composants interactifs.
Les listes sociales restent fondées sur les données réelles, donc vides sans amis.

Deux contrôles visuels sont reproductibles :

- Les 12 cadrages des six illustrations en mobile et bureau sont comparés aux
  pixels source. L’erreur absolue moyenne normalisée maximale mesurée est **1,76 %**
  (seuil **3,14 %**), sur la zone utile hors arrondis et fondu. Mesures détaillées :
  [mobile](docs/previews/comparison/mobile.json) et [bureau](docs/previews/comparison/desktop.json).
- Les 38 captures d’écrans ont leurs références versionnées dans
  `tests/e2e/__screenshots__/`. Playwright vérifie leur stabilité avec une tolérance
  maximale de 1 % de pixels différents, animations suspendues et données de compte
  masquées. Les pages absentes de la photographie suivent le même habillage.

Le périmètre de la mesure source couvre les illustrations ; les appareils inclinés,
le mobilier photographié et les données fictives de la maquette sont hors de ce périmètre.

- [Accueil bureau 1920×1080](docs/previews/nimimi-desktop.png)
- [Accueil mobile 390×844](docs/previews/nimimi-mobile.png)

Ces deux accueils ont exactement la largeur et la hauteur de leur fenêtre, sans
débordement horizontal ni défilement vertical nécessaire. Les parcours navigateur
capturent aussi connexion, inscription, récupération, catalogue, profil, paramètres,
amis, salons, parties, classements, pages légales et les six créations de salon.
Les captures détaillées de ces écrans sont générées dans `test-results/` puis
conservées dans `docs/previews/screens/` à la fin des parcours. Une exécution
partielle ultérieure ne supprime plus les captures des autres écrans.
Le dernier passage complet a réussi ses 26 parcours et conservé 52 captures.
Deux parcours de connexion supplémentaires passent sur mobile et bureau :
inscription via `127.0.0.1`, déconnexion, API temporairement indisponible,
nouvelle tentative sans perte des champs et session persistante après recharge.

La cause locale de connexion est corrigée : hors production, les alias de boucle
locale du même protocole et du même port sont acceptés par CORS, CSRF et Socket.IO.
La production garde l’origine configurée exacte. Les requêtes sont bornées à
10 secondes et un repli HTML de l’hébergeur affiche une indisponibilité du service.
Le bouton existant de déconnexion est accessible depuis l’accueil mobile.

## Reproduction

Sur un environnement standard avec pnpm, PostgreSQL et Chromium installés :

```sh
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm simulate
pnpm build
pnpm test:runtime
pnpm test:e2e
```

Installation et lancement : voir [README.md](README.md). Les tests emploient des
schémas aléatoires dans une base dont le nom finit par `_test` ; ils ne réinitialisent
pas la base de développement. La CI exécute maintenant couverture et simulations.
La CI distante elle-même n’a pas été exécutée pendant cette session locale.

Dans ce bac à sable Windows, pnpm est absent du PATH et esbuild ne peut pas lire
les répertoires parents de l’espace autorisé. La première vérification utilisait
des chargeurs locaux alternatifs. La reprise a confirmé les commandes standard
avec `npm.cmd exec --yes --package=pnpm@10.34.9 -- pnpm` et l’autorisation native
d’exécution hors bac à sable : compilation TypeScript du partagé, bundle serveur
tsup, compilation web/PWA et `test:runtime` réussis. Le serveur compilé a effectué
une session et une inscription réelles dans PostgreSQL.

Le lanceur Windows `tools/nuit.ps1` a été réparé : un diagnostic stderr récupérable
ne devient plus une exception fatale ; le code de sortie reste contrôlé. Son
statut est actualisé pendant l’exécution et la fin exige le rapport final.
Les quatre scénarios de `tools/test-nuit.ps1` passent sans appel à Codex.
Carte Étoile a en plus été vérifiée trois fois sur mobile et trois fois sur
bureau après le correctif de largeur : six parcours consécutifs réussis.
Les liens des captures du README ont été corrigés. Les illustrations des cartes
occupent désormais toute leur largeur, vérifiée dans les parcours d’interface ;
les invitations réelles ont une présentation cohérente avec les panneaux sociaux.
La colonne du plateau est contrainte sur mobile : le défilement des cartes reste
dans la main, les cartes jouables demeurent accessibles sans déplacer la page.
Les e-mails de récupération utilisent aussi le nom NIMIMI.

## Licences et limites d’exploitation

Le dictionnaire français est fourni par
[an-array-of-french-words](https://github.com/words/an-array-of-french-words).
La [licence MIT originale](https://raw.githubusercontent.com/words/an-array-of-french-words/master/license)
a été vérifiée et l’attribution est conservée dans `bombe-mots/WORDS-LICENSE`.
Le dictionnaire reste français en interface anglaise.

Le fonctionnement multijoueur nécessite Node persistant, PostgreSQL et une seule
instance serveur. La présence n’est pas synchronisée entre instances. En production,
HTTPS, SMTP et une clé `GAME_ENCRYPTION_KEY` stable sont requis. Le mode Vercel
`showcase` est un aperçu graphique et ne fournit pas le serveur multijoueur.
Aucun hébergement complet, envoi SMTP public ou essai sur appareil physique
n’est revendiqué. Les textes légaux et la politique de conservation doivent être
adaptés par l’éditeur avant une ouverture publique.
