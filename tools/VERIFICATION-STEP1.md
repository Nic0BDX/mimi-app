# Vérification de l’étape 1 — 15 novembre 2026

## Exécuté localement

- Windows, Node 26.13.1, pnpm 10.34.9 ; PostgreSQL natif 18.6 fourni par la dépendance de développement.
- `pnpm lint` : ESLint sans erreur/avertissement et format Prettier valide.
- `pnpm typecheck` : trois paquets TypeScript strict valides.
- `pnpm test` : 29 tests valides, dont routes Supertest sur une vraie base PostgreSQL migrée.
- `pnpm build` : compilation des trois paquets, manifest et service worker générés.
- `pnpm test:runtime` : serveur compilé lancé par Node sans chargeur TypeScript ; santé,
  session et inscription vérifiées contre PostgreSQL isolé.
- `pnpm test:e2e` : quatre parcours valides dans Chrome headless, 390×844 et 1920×1080.
- Captures des deux formats consultées ; aucun débordement horizontal détecté.
- Compte Alice et compte Bob dans deux contextes navigateur indépendants : inscription,
  modifications de pseudo/avatar, conservation après rechargement et suppression isolée.
- Récupération de mot de passe via transport de test, ancien mot de passe invalidé,
  lien à usage unique et révocation des sessions vérifiés.
- FR/EN persistants, accueil après rechargement hors connexion, cache PWA et préférences vérifiés.
- Aucune erreur JavaScript de page pendant les parcours. Aucune erreur console dans le
  parcours en ligne inscription/profil/suppression ; les échecs réseau intentionnels hors ligne
  ne sont pas comptés comme des régressions de console.
- Audit des dépendances de production : aucune vulnérabilité connue au moment du contrôle.
  L’audit complet conserve une alerte basse sur `deepmerge`, dépendance de développement
  transitive sans version corrigée indiquée ; aucune alerte haute ou critique restante.

## Non vérifié dans cet environnement

- Démarrage Docker Compose et construction de l’image Docker : Docker absent du PC.
- Livraison SMTP réelle : aucun service/configuration mail de production fourni.
- Installation native sur Android/iPhone, Safari physique, vibration et restrictions iOS.
- Domaine HTTPS, reverse proxy, cookies déployés et hébergement public : services non provisionnés.
- Exécution du workflow GitHub Actions sur Linux/Node 22 : sa configuration est fournie,
  les vérifications ci-dessus décrivent les commandes locales réellement exécutées.
- Amis et jeux en réseau : fonctionnalités des étapes suivantes, pas encore implémentées.

## Refaire les tests manuels

Voir README, sections « Installation » et « Test manuel avec deux navigateurs ».
Sans Docker : `pnpm db:test:start`, puis, dans un autre terminal, créer `.env` à partir
de `.env.example`, mettre `DATABASE_URL` sur la base `mimi` au port 5433, lancer
`pnpm db:migrate` puis `pnpm dev`. Ouvrir http://localhost:5173 dans deux contextes séparés.
