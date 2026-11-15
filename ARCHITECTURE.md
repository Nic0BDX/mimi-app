# Architecture MIMI

## Périmètre actuel

Étape 1 implémentée. Les tables des étapes suivantes sont migrées, mais leurs
routes et événements métier ne sont pas encore activés. L’accueil ne simule
ni joueurs en ligne, ni invitations, ni résultats de parties.

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
puis le hash CSRF de la session lorsqu’elle existe. CORS n’autorise qu’une origine.
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
Avant activation du chat et de Bombe à Mots, la suppression devra également
expurger les contenus personnels des JSON d’événements et de notifications :
aucun contenu personnel dans les journaux de jeu n’est autorisé à l’étape 1.

## Amis et présence — étape 2

Transactions et contraintes SQL imposent l’unicité des demandes actives dans
les deux sens et l’ordre canonique des amitiés. Demande inverse = acceptation
atomique. Blocage = suppression de l’amitié et annulation des demandes/invitations.
Chaque action vérifie l’identité, le destinataire, le statut et les blocages.
Redis suivra les connexions par utilisateur avec TTL et délai de déconnexion,
sans laisser un onglet fermé déclarer hors ligne un autre onglet actif.
Seuls les amis autorisés recevront les changements de présence.

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
secrets RNG et la durée secrète de la bombe ne font pas partie des DTO publics.
Le générateur déterministe serveur utilisera un secret cryptographique chiffré
au repos et un compteur persisté pour permettre la reprise et les simulations.
Chaque partie conserve une version de moteur afin de traiter les évolutions.

Au redémarrage, charger les parties actives et les échéances persistées, puis
traiter les timeouts échus. Une déconnexion conserve une fenêtre de retour de
60 secondes ; le serveur décide ensuite du bot ou forfait selon l’option du salon.
L’interface de jeu n’applique jamais de règle faisant autorité.

## PWA et réseau

Le service worker précache uniquement le shell et les assets originaux. Les
API et transports Socket.IO sont exclus du fallback SPA et du cache. Hors ligne,
l’accueil reste accessible, les actions de compte renvoient une erreur claire.
Le stockage navigateur ne contient que langue et préférences audio/vibrations.
Les améliorations WebSocket de reconnexion seront ajoutées avec la boucle de jeu.

## Tests et exploitation

Vitest vérifie les contrats et l’égalité des clés FR/EN. Supertest exerce les vraies
routes contre PostgreSQL migré, dans des schémas jetables isolés. Playwright utilise
la version compilée avec service worker, deux contextes indépendants et deux tailles.
Les vérifications CI utilisent une base PostgreSQL dédiée, jamais une base production.
Pino ne journalise ni corps de requête ni cookies ni tokens. Les erreurs internes
exposent un code générique et un identifiant de requête côté logs.
