# MIMI

Plateforme de jeux de société multijoueurs. React/TypeScript/Vite côté navigateur,
Fastify/Socket.IO côté serveur, PostgreSQL/Prisma, contrats Zod partagés.
Identité et dessins SVG originaux, sans assets commerciaux.

## État du projet

- [x] Étape 1 : fondations, inscription/connexion, récupération, profil et suppression.
- [ ] Étape 2 : amis, blocages, notifications et présence réels.
- [ ] Étape 3 : salons, infrastructure des parties, Morpion puis Puissance 4.
- [ ] Étape 4 : moteurs additionnels, un jeu à la fois, règles et simulations.
- [ ] Étape 5 : finitions multijoueurs, classement, audio et déploiement complet.

Les cartes de l’accueil sont une présentation du catalogue prévu. Elles sont
explicitement marquées « Bientôt » : aucun moteur ni ami fictif n’est présenté
comme fonctionnel. Les compteurs de profil viennent de PostgreSQL.

## Installation

Prérequis : Node.js 22.12+ (LTS recommandé), pnpm 10.34.9, Docker Compose.
Installer pnpm avec `npm install --global pnpm@10.34.9` s’il est absent.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Ouvrir **http://localhost:5173** (respecter ce nom d’hôte pour les cookies et CORS).
API : http://127.0.0.1:3001/api/health. Vite relaie `/api` vers le serveur.
Les ports PostgreSQL et Redis ne sont exposés que sur la boucle locale.

### Sans Docker, pour les tests ou le développement local

Un PostgreSQL natif optionnel est inclus comme dépendance de développement :

```sh
pnpm db:test:start
```

Il initialise uniquement `.local/postgres-test`, écoute sur 127.0.0.1:5433 et
conserve les bases entre deux lancements. Dans un deuxième terminal, configurer
`DATABASE_URL` dans `.env` avec le **port 5433** et la base **mimi**, puis lancer
`pnpm db:migrate` et `pnpm dev`. La base `mimi_test` est réservée aux tests.
Ne pas lancer simultanément ce serveur et le service Docker `postgres-test`.
Redis n’est pas utilisé à l’étape 1 ; il sera connecté pour la présence à l’étape 2.

## Vérifications

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:runtime
pnpm exec playwright install chromium
pnpm test:e2e
```

`TEST_DATABASE_URL` doit pointer sur une base dont le nom finit par `_test`.
Chaque suite crée un schéma aléatoire, applique les vraies migrations et supprime
uniquement ce schéma à la fin. Aucun nettoyage global d’une base existante.
Les tests refusent une base sans suffixe `_test`.

Playwright utilise la compilation de production et deux formats : 390×844 et
1920×1080, ce dernier avec réduction des animations. Si Chromium est déjà installé,
définir `PLAYWRIGHT_BROWSER` avec le chemin du navigateur. Les captures sont dans
`test-results/`. Les tests E2E démarrent leurs propres serveurs : arrêter `pnpm dev`
avant de les lancer pour libérer les ports 3001 et 5173.

## Test manuel avec deux navigateurs

1. Lancer PostgreSQL, appliquer les migrations, puis `pnpm dev`.
2. Dans Chrome, créer Alice avec une adresse de test et choisir un avatar.
3. Dans Firefox ou une fenêtre privée, créer Bob avec une autre adresse.
4. Modifier le pseudo et l’avatar d’Alice dans Paramètres ; recharger les deux
   navigateurs. Alice conserve son identité, Bob conserve son propre profil.
5. Déconnecter Alice puis la reconnecter. Tester un mauvais mot de passe.
6. Utiliser « Mot de passe oublié ». En développement, ouvrir le lien affiché dans
   le terminal serveur ; choisir un nouveau mot de passe. L’ancien ne fonctionne
   plus et les sessions précédentes sont révoquées.
7. Supprimer Alice avec confirmation du mot de passe. Vérifier que Bob existe
   toujours et que le compte Alice ne peut plus se connecter.
8. Basculer FR/EN, recharger ; essayer l’affichage hors connexion après une première
   visite. Le shell reste disponible, les opérations de compte exigent Internet.

Les demandes d’amis et parties à deux seront testables aux étapes 2 et 3.

## Architecture

```text
Navigateur React ── HTTPS + cookie httpOnly + CSRF ── Fastify
       │                                              │
       └── Socket.IO authentifié [handlers étape 2+] ──┤
                                                      ├── PostgreSQL : source durable
                                                      └── Redis : présence/rate limit [étape 2]

packages/shared : schémas Zod + types + moteurs purs [étapes 3/4]
```

Voir [ARCHITECTURE.md](ARCHITECTURE.md) pour les flux et garanties.

## Ajouter un jeu — contrat prévu

Créer `packages/shared/src/games/<id>` avec moteur pur, schémas d’actions/options,
projection privée, bot, règles et tests, puis enregistrer le module. Créer son
composant dans `apps/web/src/games/<id>`. L’interface GameEngine et le registre
seront implémentés à l’étape 3 ; aucun moteur vide n’est fourni pour simuler un jeu.
Le futur `pnpm simulate <jeu>` exécutera 1 000 parties seedées avec limite de coups
et contrôle des invariants.

## Déploiement

### Serveur Node et PostgreSQL

Utiliser un service Node persistant (Railway/Fly.io ou équivalent), Node 22 LTS,
PostgreSQL managé et, à partir de l’étape 2, Redis managé. Depuis la racine :

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @mimi/server build
pnpm db:migrate
pnpm --filter @mimi/server start
```

Variables obligatoires en production : `NODE_ENV=production`, `HOST=0.0.0.0`,
`PORT` fourni par l’hébergeur, `DATABASE_URL`, `WEB_ORIGIN` exact en HTTPS,
`COOKIE_SECURE=true`, `MAIL_TRANSPORT=smtp` et configuration SMTP complète.
Définir `TRUST_PROXY=true` seulement derrière un proxy de confiance maîtrisé.
Le serveur refuse de démarrer en production avec courrier simulé ou cookies non
sécurisés. Le mode console expose les liens de récupération uniquement en dev.

### Frontend Vercel/Netlify

Racine du projet : ce monorepo `mimi-app`, commande de build
`pnpm --filter @mimi/web build`, sortie `apps/web/dist`.
Configurer `VITE_API_ORIGIN` avant compilation, et le `WEB_ORIGIN` correspondant
côté serveur. Utiliser deux sous-domaines HTTPS d’un même domaine contrôlé
(par exemple `app.example.org` et `api.example.org`) pour les cookies SameSite=Lax,
ou un reverse proxy HTTPS sous la même origine. Des domaines Vercel et Railway
indépendants ne conviennent pas à cette politique de cookies sans proxy.
Le serveur WebSocket ne peut pas être remplacé par un hébergement statique.
Configurer la réécriture des routes SPA et les headers fournis dans `vercel.json`.
La production complète nécessite encore les services et domaines de l’éditeur.

Avant ouverture publique : compléter les modèles légaux, choisir les durées de
conservation et vérifier l’envoi SMTP réel, les sauvegardes et la restauration.

## Décisions

- FR par défaut ; dictionnaires FR/EN complets et clés vérifiées par test.
- Aucun mot de passe ni session dans localStorage : uniquement préférences locales.
- Avatars prédessinés originaux ; aucun téléversement de photo à l’étape 1.
- Email normalisé, pseudo unique sans distinction de casse, nom affiché conservé.
- Mot de passe 8–128 caractères ; Argon2id 64 Mio, 3 passes, parallélisme 1.
- Sessions opaques de 7 jours, jetons stockés hachés, cookie httpOnly/SameSite=Lax,
  préfixe `__Host-` en production. Toutes les mutations exigent origine exacte et CSRF.
- Réinitialisation valable 30 minutes, usage unique, révocation de toutes les sessions.
- PWA : seuls les fichiers statiques sont mis en cache. Les réponses API et données
  de compte ne le sont jamais. Mise à jour proposée, sans rechargement imposé.
- Les fichiers du projet FORGE voisin sont indépendants et ne sont pas importés.
- Dames : cible internationale 10×10 ; toute réduction de variante sera annoncée
  et validée à l’étape du jeu. Dictionnaire français : licence à vérifier avant inclusion.
- Limitations actuelles : pas encore de moteur, présence, ami ou partie temps réel.

## Sources techniques

- [Prisma 6 : migrations de déploiement](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-migrations-from-a-local-environment)
- [Fastify : validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Vite PWA : stratégies de mise à jour](https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors)

Les versions exactes sont verrouillées dans les manifests et `pnpm-lock.yaml`.
