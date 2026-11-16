export type EstateTile = {
  name: string;
  kind:
    | 'property'
    | 'plane'
    | 'service'
    | 'dalmatian'
    | 'golden'
    | 'tax'
    | 'start'
    | 'prison'
    | 'parking'
    | 'go-prison';
  price: number;
  group: number;
  icon?: string;
};
const property = (name: string, price: number, group: number): EstateTile => ({
  name,
  kind: 'property',
  price,
  group,
});
const tile = (name: string, kind: EstateTile['kind'], icon: string, price = 0): EstateTile => ({
  name,
  kind,
  price,
  group: -1,
  icon,
});
export const estateColors = [
  '#a54b20',
  '#8bd0e5',
  '#df3596',
  '#f7941d',
  '#e92e34',
  '#f7d537',
  '#39a55b',
  '#1884cd',
];
export const estateBoard: EstateTile[] = [
  tile('DÉPART', 'start', 'GO'),
  property('Le premier regard', 60, 0),
  tile('Carte Dalmatien', 'dalmatian', '🐾'),
  property('Le premier rendez-vous', 60, 0),
  tile('Budget du mariage', 'tax', '💌', 200),
  tile('Voyage à Paris', 'plane', '✈️', 200),
  property('Le café des amoureux', 100, 1),
  tile('Carte Golden', 'golden', '🐕'),
  property('La promenade au parc', 100, 1),
  property('Le nid douillet', 120, 1),
  tile('Simple visite / Prison', 'prison', '🔑'),
  property('La demande en mariage', 140, 2),
  tile('Kansas City Chiefs', 'service', '🏈', 150),
  property('Les alliances', 140, 2),
  property('La robe de mariée', 160, 2),
  tile('Voyage à Rome', 'plane', '✈️', 200),
  property('La salle de réception', 180, 3),
  tile('Carte Golden', 'golden', '🐕'),
  property('Le traiteur', 180, 3),
  property('La pièce montée', 200, 3),
  tile('Parking gratuit', 'parking', '🚗'),
  property('La cérémonie', 220, 4),
  tile('Carte Dalmatien', 'dalmatian', '🐾'),
  property('Le oui pour la vie', 220, 4),
  property('La première danse', 240, 4),
  tile('Voyage à New York', 'plane', '✈️', 200),
  property('Les photos souvenirs', 260, 5),
  property('La lune de miel', 260, 5),
  tile('Uber Eats', 'service', '🛵', 150),
  property('La plage dorée', 280, 5),
  tile('Allez en prison', 'go-prison', '🚔'),
  property('La maison du bonheur', 300, 6),
  property('Le jardin des chiens', 300, 6),
  tile('Carte Golden', 'golden', '🐕'),
  property('La villa des mariés', 320, 6),
  tile('Voyage à Tokyo', 'plane', '✈️', 200),
  tile('Carte Dalmatien', 'dalmatian', '🐾'),
  property('Le château des amoureux', 350, 7),
  tile('Frais de réception', 'tax', '💍', 100),
  property('Le domaine éternel', 400, 7),
];
export type EstateCard = {
  title: string;
  text: string;
  money?: number;
  move?: number;
  steps?: number;
  jail?: boolean;
  release?: boolean;
  repairs?: boolean;
  each?: number;
};
export const estateCards: Record<'dalmatian' | 'golden', EstateCard[]> = {
  dalmatian: [
    { title: 'Cadeau de mariage', text: 'Vos proches vous offrent 200 €.', money: 200 },
    { title: 'Visite chez le vétérinaire', text: 'Réglez la consultation : 50 €.', money: -50 },
    { title: 'Retour à la maison', text: 'Avancez à la case Départ et recevez 200 €.', move: 0 },
    { title: 'Chien bien dressé', text: 'Gagnez le concours canin : recevez 100 €.', money: 100 },
    {
      title: 'Petite bêtise',
      text: 'Votre dalmatien a déchiré le canapé : payez 100 €.',
      money: -100,
    },
    {
      title: 'Liberté retrouvée',
      text: 'Conservez cette carte pour sortir gratuitement de prison.',
      release: true,
    },
    {
      title: 'Oups, les alliances !',
      text: 'Allez directement en prison, sans toucher 200 €.',
      jail: true,
    },
    {
      title: 'Travaux dans le nid',
      text: 'Payez 25 € par maison et 100 € par hôtel.',
      repairs: true,
    },
    { title: 'Anniversaire de mariage', text: 'Chaque autre joueur vous offre 20 €.', each: 20 },
    { title: 'Une belle surprise', text: 'Votre cagnotte de mariage rapporte 50 €.', money: 50 },
    { title: 'Balade au parc', text: 'Avancez jusqu’à La promenade au parc.', move: 8 },
    {
      title: 'La famille s’agrandit',
      text: 'Achetez des accessoires pour le chiot : payez 40 €.',
      money: -40,
    },
  ],
  golden: [
    {
      title: 'Lune de miel',
      text: 'Avancez à La lune de miel. Touchez 200 € si vous passez par Départ.',
      move: 27,
    },
    { title: 'Voyage de noces', text: 'Avancez au Voyage à Paris.', move: 5 },
    { title: 'Un golden généreux', text: 'Recevez 150 €.', money: 150 },
    { title: 'Livraison pour deux', text: 'Le dîner des amoureux coûte 30 €.', money: -30 },
    {
      title: 'Reculer pour mieux sauter',
      text: 'Reculez de trois cases et appliquez la case d’arrivée.',
      steps: -3,
    },
    { title: 'Le grand départ', text: 'Avancez à Départ et recevez 200 €.', move: 0 },
    {
      title: 'Sortie avec le chien',
      text: 'Conservez cette carte pour sortir gratuitement de prison.',
      release: true,
    },
    {
      title: 'Faux pas sur la piste',
      text: 'Allez en prison, sans passer par Départ.',
      jail: true,
    },
    { title: 'Le bouquet porte bonheur', text: 'Recevez 75 €.', money: 75 },
    {
      title: 'Réparation du jardin',
      text: 'Payez 25 € par maison et 100 € par hôtel.',
      repairs: true,
    },
    { title: 'Direction le château', text: 'Avancez au Château des amoureux.', move: 37 },
    { title: 'Le photographe', text: 'Payez 100 € pour les souvenirs du mariage.', money: -100 },
  ],
};
export const housePrice = (index: number) => (Math.floor(estateBoard[index]!.group / 2) + 1) * 50;
export const estateRents: Record<number, number[]> = {
  1: [2, 10, 30, 90, 160, 250],
  3: [4, 20, 60, 180, 320, 450],
  6: [6, 30, 90, 270, 400, 550],
  8: [6, 30, 90, 270, 400, 550],
  9: [8, 40, 100, 300, 450, 600],
  11: [10, 50, 150, 450, 625, 750],
  13: [10, 50, 150, 450, 625, 750],
  14: [12, 60, 180, 500, 700, 900],
  16: [14, 70, 200, 550, 750, 950],
  18: [14, 70, 200, 550, 750, 950],
  19: [16, 80, 220, 600, 800, 1000],
  21: [18, 90, 250, 700, 875, 1050],
  23: [18, 90, 250, 700, 875, 1050],
  24: [20, 100, 300, 750, 925, 1100],
  26: [22, 110, 330, 800, 975, 1150],
  27: [22, 110, 330, 800, 975, 1150],
  29: [24, 120, 360, 850, 1025, 1200],
  31: [26, 130, 390, 900, 1100, 1275],
  32: [26, 130, 390, 900, 1100, 1275],
  34: [28, 150, 450, 1000, 1200, 1400],
  37: [35, 175, 500, 1100, 1300, 1500],
  39: [50, 200, 600, 1400, 1700, 2000],
};
