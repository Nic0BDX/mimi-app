# MÉGANOPOLY

Jeu en français pour 2 à 6 participants, humains ou robots. Disponible dans le
catalogue et sur `/games/new?type=meganopoly`.

## Image et éléments repérés

L’image fournie est conservée sans retouche dans
`apps/web/public/art/meganopoly-reference.png`. Le portrait des mariés, le logo
MÉGANOPOLY et les dessins des deux paquets proviennent de cette image.

| Élément visible                   | Fonction dans le jeu                              |
| --------------------------------- | ------------------------------------------------- |
| Dalmatien sur fond orange         | 12 cartes Dalmatien                               |
| Golden retriever sur fond bleu    | 12 cartes Golden                                  |
| Quatre avions                     | Quatre voyages à acheter, loyers croissants       |
| Uber Eats et Chiefs               | Deux services, loyers calculés avec les dés       |
| Huit couleurs de propriétés       | 22 propriétés et constructions par groupe         |
| Billets avec les mariés           | Soldes individuels en euros et banque automatique |
| Départ, prison, parking et police | Quatre cases d’angle                              |

Les petits caractères de l’image ne permettent pas une transcription fidèle.
Les propriétés et les effets des cartes sont donc adaptés en français autour du
mariage, des chiens et des voyages. Les cartes sont consultables en cliquant sur
les deux paquets ; la prochaine pioche reste cachée côté serveur.

## Règles jouables

- Chaque joueur commence avec 1 500 €. Passer par Départ rapporte 200 €.
- Deux dés, doubles donnant un nouveau lancer, prison après trois doubles.
- Achat des cases libres ou enchères, par incréments de 10 €, accessibles à tous
  les joueurs solvables. Seul le gagnant paie.
- Loyers, monopoles, quatre voyages, deux services et deux taxes.
- Groupes complets : construction uniforme, quatre maisons puis un hôtel.
  Banque limitée à 32 maisons et 12 hôtels.
- Vente des bâtiments à moitié prix, hypothèque à 50 % du prix et rachat à 55 %.
- Échanges de propriétés sans bâtiment ni hypothèque, avec complément d’argent
  positif ou négatif. Aucun transfert sans acceptation explicite du destinataire.
- Prison : double, carte conservée ou paiement de 50 €. Après trois échecs, le
  paiement est obligatoire ; les actifs peuvent être liquidés en cas de dette.
- Les cartes de sortie détenues sont retirées du paquet puis remises en jeu
  après utilisation. Les autres effets comprennent déplacements, gains, dépenses,
  réparations et anniversaire. Pour ce dernier, un joueur ne verse que son solde
  disponible ; aucune dette n’est imposée hors de son tour.
- Faillite : liquidation des bâtiments et transfert des actifs au créancier, ou
  retour à la banque. Le dernier joueur solvable gagne.
- Partie limitée par défaut à 40 tours de table, réglable de 10 à 100. À la limite,
  classement par patrimoine. Parking gratuit sans cagnotte.

Les décisions, dés, dettes et transactions sont validés sur le serveur et
enregistrés dans PostgreSQL. Les robots et délais du déploiement HTTP avancent
lorsqu’un participant consulte la partie ; l’état est repris après rechargement.
