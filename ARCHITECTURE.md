# Architecture MIMI

## Périmètre actuel

Comptes, relations sociales, salons, invitations, chat et six moteurs sont activés.
L’accueil NIMIMI utilise les profils, présences et parties réellement persistés.
Les identifiants de moteurs restent stables malgré les noms affichés :
`morpion`, `puissance-quatre`, `dames`, `carte-frenesie`, `course-ecuries`, `bombe-mots`.

## Authentification

```text
GET /api/auth/session → cookie CSRF + jeton CSRF, profil public ou null
POST register/login + Origin exacte + X-CSRF-Token
  → Zod strict → limitation de débit → Argon2id → session PostgreSQL
  → nouveau cookie de session httpOnly + nouveau CSRF → profil public
```

Le token de session est aléatoire sur 256 bits, seul son SHA-256 est persisté.
La réponse ne contient ni email ni passwordHash. Une connexion échouée renvoie
la même erreur pour une adresse absente et un mauvais mot de passe ; un hash
Argon2 de remplacement évite de sauter le coût de vérification.
La déconnexion détruit la session serveur. L’expiration est vérifiée à chaque
requête. Les sessions persistent après redémarrage grâce à PostgreSQL.

Les requêtes mutantes vérifient l’origine, le cookie CSRF et le header correspondant,
puis le hash CSRF de la session lorsqu’elle existe. En production, CORS et CSRF
n’autorisent que l’origine configurée exacte. En développement, les alias de boucle
locale du même protocole et du même port sont acceptés de manière cohérente avec Socket.IO.
Les cookies de production sont Secure/httpOnly/SameSite=Lax, préfixés `__Host-`.
Le déploiement doit être même site HTTPS ou passer par un reverse proxy même origine.

## Récupération

L’API répond toujours 202 à une adresse syntaxiquement valide. Pour un compte
existant, un token aléatoire haché est enregistré pour 30 minutes. L’envoi est
asynchrone. Le lien transporte le token dans le fragment, supprimé de la barre
d’adresse au chargement de la page. Le token n’entre pas dans les access logs.
La consommation est atomique ; la modification révoque toutes les sessions.
SMTP est obligatoire en production. Le transport console est un simulateur dev
explicitement séparé des logs structurés du serveur.

## Profil et suppression

`PATCH /api/me` ne peut modifier que pseudo et avatar prédéfini. L’identifiant
provient exclusivement de la session. Aucun identifiant fourni par le client ne
permet de cibler un autre utilisateur.
`DELETE /api/me` exige le mot de passe et supprime réellement l’utilisateur, ses
sessions, tokens, amitiés, demandes, blocages, notifications et statistiques par
cascades PostgreSQL. Les messages sont supprimés explicitement. Les références
de sièges/hôte/événements sont anonymisées via SetNull.
La suppression retire aussi les notifications contenant le profil de cet acteur
chez d’autres utilisateurs et remplace ses actions de journal par `redacted`.
Les snapshots de jeu gardent les coups et mots validés par le dictionnaire pour
assurer la continuité des parties ; le profil du siège est anonymisé par SetNull.

## Amis et présence — étape 2

Transactions et contraintes SQL imposent l’unicité des demandes actives dans
les deux sens et l’ordre canonique des amitiés. Demande inverse = acceptation
atomique. Blocage = suppression de l’amitié et annulation des demandes/invitations.
Chaque action vérifie l’identité, le destinataire, le statut et les blocages.
Le hub Socket.IO compte les connexions par utilisateur en mémoire, avec délai
de déconnexion, sans laisser un onglet fermé déclarer hors ligne un autre onglet.
Seuls les amis autorisés reçoivent les changements de présence. Une seule instance
Node est supportée ; Redis n’est pas intégré.

## Salons, boucle et reconnexion — étape 3

```text
Intention client + UUID d’action + version attendue
  → identité socket + Zod + rate limit + autorisation
  → transaction avec verrou de partie
  → déduplication du journal / rejet de version périmée
  → moteur pur + hasard serveur
  → état, version, compteur RNG, échéance et événement persistés ensemble
  → getPlayerView distinct pour chaque destinataire
```

Le journal et les snapshots sont internes. Les mains adverses, la pioche, les
secrets RNG ne font pas partie des DTO publics. Mot Mystère utilise une échéance
publique de 15 secondes (facile) ou 10 secondes (difficile), validée par le serveur.
Le générateur déterministe serveur utilise un secret cryptographique chiffré
au repos et un compteur persisté pour permettre la reprise et les simulations.
Chaque partie conserve une version de moteur afin de traiter les évolutions.

Au redémarrage, charger les parties actives et les échéances persistées, puis
traiter les timeouts échus. Une déconnexion conserve une fenêtre de retour de
60 secondes ; le serveur décide ensuite du bot ou forfait selon l’option du salon.
L’interface de jeu n’applique jamais de règle faisant autorité.

## PWA et réseau

Le service worker précache uniquement le shell et les assets statiques. Les
API et transports Socket.IO sont exclus du fallback SPA et du cache. Hors ligne,
l’accueil reste accessible, les actions de compte renvoient une erreur claire.
Le stockage navigateur ne contient que langue et préférences audio/vibrations.
La reconnexion Socket.IO recharge les vues depuis le serveur avec leur version.

## Tests et exploitation

`ReferenceArtwork` affiche les zones de l’image fournie dans des fenêtres SVG ;
seuls les visuels sont réutilisés, les écrans et actions restent des composants React.
Playwright compare les six couvertures aux pixels source et vérifie 38 captures
de régression, avec masquage des données de compte et animations suspendues.
Les captures de contrôle sont conservées dans `docs/previews/` après chaque suite.

Vitest vérifie les contrats et l’égalité des clés FR/EN. Supertest exerce les vraies
routes contre PostgreSQL migré, dans des schémas jetables isolés. Playwright utilise
la version compilée avec service worker, deux contextes indépendants et deux tailles.
Les vérifications CI utilisent une base PostgreSQL dédiée, jamais une base production.
Pino ne journalise ni corps de requête ni cookies ni tokens. Les erreurs internes
exposent un code générique et un identifiant de requête côté logs.
