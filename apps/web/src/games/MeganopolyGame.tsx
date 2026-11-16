import { useState, type CSSProperties } from 'react';
import {
  estateBoard,
  estateCards,
  estateColors,
  estateRents,
  housePrice,
  type Room,
} from '@mimi/shared';

const playerColors = ['#e8344f', '#267bd8', '#edb624', '#30a26f', '#a657dd', '#ec7b26'];
const currency = (n: number) => `${n.toLocaleString('fr-FR')} €`;
const actionNames: Record<string, string> = {
  roll: 'Lancer les dés',
  buy: 'Acheter cette propriété',
  auction: 'Mettre aux enchères',
  pass: 'Se retirer de l’enchère',
  bid: 'Enchérir de 10 €',
  end: 'Continuer',
  'pay-jail': 'Sortir de prison — 50 €',
  'jail-card': 'Utiliser une carte de sortie',
  'pay-debt': 'Régler la dette',
  bankrupt: 'Déclarer la faillite',
  'accept-trade': 'Accepter l’échange',
  'reject-trade': 'Refuser l’échange',
  build: 'Construire',
  'sell-house': 'Vendre un bâtiment',
  mortgage: 'Hypothéquer',
  redeem: 'Lever l’hypothèque',
};
function location(index: number): { row: number; column: number; side: string } {
  if (index <= 10) return { row: 11, column: 11 - index, side: 'bottom' };
  if (index <= 20) return { row: 21 - index, column: 1, side: 'left' };
  if (index <= 30) return { row: 1, column: index - 19, side: 'top' };
  return { row: index - 29, column: 11, side: 'right' };
}
export function MeganopolyGame({
  view,
  name,
  onAction,
  disabled,
}: {
  view: NonNullable<Room['view']>;
  name: (id: string) => string;
  onAction: (action: unknown) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState(0),
    [zoom, setZoom] = useState(false),
    [deck, setDeck] = useState<'dalmatian' | 'golden' | null>(null),
    [tradeTarget, setTradeTarget] = useState(-1);
  const s = view.estate;
  if (!s) return null;
  const actions = view.legalActions as { type: string; property?: number }[];
  const tile = estateBoard[selected]!,
    owner = s.owners[selected]!,
    card = s.lastCard ? estateCards[s.lastCard.deck][s.lastCard.index]! : null;
  const current = view.players.indexOf(view.turn ?? '');
  const target =
    tradeTarget >= 0 && tradeTarget !== current && !s.eliminated.includes(tradeTarget)
      ? tradeTarget
      : view.players.findIndex((_, i) => i !== current && !s.eliminated.includes(i));
  const tradable = (seat: number) =>
    estateBoard.flatMap((p, i) =>
      s.owners[i] === seat &&
      !s.mortgaged[i] &&
      s.houses[i] === 0 &&
      !estateBoard.some((other, j) => p.group >= 0 && other.group === p.group && s.houses[j]! > 0)
        ? [i]
        : [],
    );
  const send = (a: { type: string; property?: number }) => {
    if (
      a.type === 'bankrupt' &&
      !window.confirm('Confirmer la faillite ? Vous quittez définitivement cette partie.')
    )
      return;
    onAction(a);
  };
  return (
    <div className="meganopoly-game" lang="fr">
      <div className="estate-bankrolls" aria-label="Finances des joueurs">
        {view.players.map((id, i) => (
          <div
            key={id}
            className={`estate-bankroll ${s.eliminated.includes(i) ? 'eliminated' : ''}`}
            style={{ '--player-color': playerColors[i] } as CSSProperties}
          >
            <span className="estate-token" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <strong>{name(id)}</strong>
              <b>{currency(s.money[i]!)}</b>
              <small>
                {s.eliminated.includes(i)
                  ? 'En faillite'
                  : s.jail[i]! >= 0
                    ? 'En prison'
                    : `Patrimoine : ${currency(view.scores?.[i] ?? 0)}`}
              </small>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button subtle estate-zoom"
        aria-pressed={zoom}
        onClick={() => setZoom(!zoom)}
      >
        {zoom ? 'Voir le plateau entier' : 'Agrandir le plateau'}
      </button>
      <div className="estate-table" tabIndex={0} aria-label="Plateau défilant en vue agrandie">
        <div
          className={`estate-board ${zoom ? 'zoomed' : ''}`}
          aria-label="Plateau MÉGANOPOLY, 40 cases"
        >
          <div className="estate-center">
            <svg
              className="estate-board-art"
              viewBox="300 280 640 635"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <image href="/art/meganopoly-reference.png" width="1254" height="1254" />
            </svg>
            <span className="estate-round">
              Tour de table {s.round} / {s.roundLimit}
            </span>
            <h2 className="sr-only">MÉGANOPOLY — Les mariés et leurs chiens</h2>
            <button
              type="button"
              className="estate-deck dalmatian"
              onClick={() => setDeck(deck === 'dalmatian' ? null : 'dalmatian')}
              aria-label="Consulter les cartes Dalmatien"
            >
              <span className="sr-only">DALMATIEN</span>
            </button>
            <button
              type="button"
              className="estate-deck golden"
              onClick={() => setDeck(deck === 'golden' ? null : 'golden')}
              aria-label="Consulter les cartes Golden"
            >
              <span className="sr-only">GOLDEN</span>
            </button>
          </div>
          {estateBoard.map((p, i) => {
            const position = location(i),
              occupants = s.positions.flatMap((pos, seat) =>
                pos === i && !s.eliminated.includes(seat) ? [seat] : [],
              );
            return (
              <button
                type="button"
                key={i}
                className={`estate-tile ${position.side} ${selected === i ? 'selected' : ''} ${s.mortgaged[i] ? 'mortgaged' : ''}`}
                style={
                  {
                    gridRow: position.row,
                    gridColumn: position.column,
                    '--estate-color': p.group >= 0 ? estateColors[p.group] : 'transparent',
                    '--owner-color': s.owners[i]! >= 0 ? playerColors[s.owners[i]!] : 'transparent',
                  } as CSSProperties
                }
                onClick={() => setSelected(i)}
                aria-pressed={selected === i}
                aria-label={`${i}. ${p.name}${p.price ? `, ${currency(p.price)}` : ''}${s.owners[i]! >= 0 ? `, propriété de ${name(view.players[s.owners[i]!]!)}` : ''}`}
              >
                <span className="estate-color-band" />
                <span className="estate-tile-name">{p.name}</span>
                {p.icon && (
                  <span className="estate-tile-icon" aria-hidden="true">
                    {p.icon}
                  </span>
                )}
                {p.price > 0 && <span className="estate-tile-price">{p.price} €</span>}
                {s.houses[i]! > 0 && (
                  <span
                    className="estate-buildings"
                    aria-label={s.houses[i] === 5 ? 'Hôtel' : `${s.houses[i]} maisons`}
                  >
                    {s.houses[i] === 5 ? '🏨' : '⌂'.repeat(s.houses[i]!)}
                  </span>
                )}
                <span className="estate-occupants">
                  {occupants.map((seat) => (
                    <span
                      key={seat}
                      className="estate-token"
                      style={{ background: playerColors[seat] }}
                      title={name(view.players[seat]!)}
                    >
                      {seat + 1}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <section className="estate-controls" aria-label="Actions MÉGANOPOLY">
        <div className="estate-dice" aria-label={`Dés : ${s.dice.join(' et ')}`}>
          <span>{['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][s.dice[0]!]}</span>
          <span>{['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][s.dice[1]!]}</span>
        </div>
        <div className="estate-situation" aria-live="polite">
          {s.phase === 'offer' && (
            <strong>
              {estateBoard[s.positions[current]!]!.name} —{' '}
              {currency(estateBoard[s.positions[current]!]!.price)}
            </strong>
          )}
          {s.phase === 'auction' && s.auction && (
            <strong>
              Enchères : {estateBoard[s.auction.property]!.name} · {currency(s.auction.price)}
              {s.auction.bidder !== null
                ? ` · ${name(view.players[s.auction.bidder]!)}`
                : ' · aucune offre'}
            </strong>
          )}
          {s.phase === 'debt' && (
            <strong>À régler : {currency(s.debt)}. Gérez vos propriétés ci-dessous.</strong>
          )}
          {s.trade && (
            <strong>
              {name(view.players[s.trade.from]!)} propose : donner{' '}
              {s.trade.give >= 0 ? estateBoard[s.trade.give]!.name : 'aucune propriété'}, recevoir{' '}
              {s.trade.take >= 0 ? estateBoard[s.trade.take]!.name : 'aucune propriété'} et{' '}
              {s.trade.cash >= 0
                ? `vous verser ${currency(s.trade.cash)}`
                : `recevoir ${currency(-s.trade.cash)}`}
              .
            </strong>
          )}
          <p>{view.notice}</p>
        </div>
        <div className="estate-action-buttons">
          {actions
            .filter((a) => a.property === undefined && a.type !== 'propose-trade')
            .map((a) => (
              <button
                type="button"
                key={a.type}
                className={`button ${['roll', 'buy', 'bid', 'pay-debt'].includes(a.type) ? 'primary' : 'secondary'}`}
                disabled={disabled}
                onClick={() => send(a)}
              >
                {a.type === 'end'
                  ? s.dice[0] === s.dice[1] && s.jail[current]! < 0
                    ? 'Continuer le tour'
                    : 'Terminer le tour'
                  : actionNames[a.type]}
              </button>
            ))}
          {actions.length === 0 && (
            <p>En attente de {view.turn ? name(view.turn) : 'la fin de partie'}…</p>
          )}
        </div>
      </section>
      {card && (
        <article className={`estate-drawn-card ${s.lastCard!.deck}`}>
          <span aria-hidden="true">{s.lastCard!.deck === 'dalmatian' ? '🐾' : '🐕'}</span>
          <div>
            <small>CARTE {s.lastCard!.deck.toUpperCase()}</small>
            <h3>{card.title}</h3>
            <p>{card.text}</p>
          </div>
        </article>
      )}
      <div className="estate-management">
        <section
          className="estate-property"
          aria-label="Fiche de la case sélectionnée"
          style={
            {
              '--estate-color': tile.group >= 0 ? estateColors[tile.group] : '#176d4a',
            } as CSSProperties
          }
        >
          <h3>
            {tile.icon} {tile.name}
          </h3>
          {tile.price > 0 ? (
            <>
              <p>
                Prix : <strong>{currency(tile.price)}</strong> ·{' '}
                {owner >= 0 ? name(view.players[owner]!) : 'Banque'}
              </p>
              {tile.kind !== 'tax' && (
                <>
                  <p>
                    {s.mortgaged[selected]
                      ? 'Propriété hypothéquée : aucun loyer.'
                      : tile.kind === 'plane'
                        ? 'Loyer : 25 / 50 / 100 / 200 € selon le nombre de voyages possédés.'
                        : tile.kind === 'service'
                          ? 'Loyer : 4 × les dés, ou 10 × si les deux services sont possédés.'
                          : `Loyer de base : ${estateRents[selected]![0]} €. Doublé pour un groupe complet sans bâtiment.`}
                  </p>
                  {tile.kind === 'property' && (
                    <p>
                      Maison : {currency(housePrice(selected))} · 5e bâtiment : hôtel.
                      <br />
                      Loyers 1 / 2 / 3 / 4 maisons / hôtel :{' '}
                      {estateRents[selected]!.slice(1).map(currency).join(' / ')}.
                    </p>
                  )}
                  <p>
                    Hypothèque : {currency(Math.floor(tile.price / 2))} · Rachat :{' '}
                    {currency(Math.ceil((tile.price * 55) / 100))}.
                  </p>
                </>
              )}
            </>
          ) : (
            <p>
              {tile.kind === 'start'
                ? 'Recevez 200 € en passant par Départ.'
                : tile.kind === 'prison'
                  ? 'Visite libre. En prison : double, carte de sortie ou paiement de 50 €. Paiement obligatoire au troisième échec.'
                  : tile.kind === 'parking'
                    ? 'Reposez-vous ! Aucun paiement, aucune cagnotte.'
                    : tile.kind === 'go-prison'
                      ? 'Allez directement en prison. Aucun bonus de départ.'
                      : 'Piochez une carte et appliquez son effet.'}
            </p>
          )}
          <div className="button-row">
            {actions
              .filter((a) => a.property === selected)
              .map((a) => (
                <button
                  type="button"
                  key={a.type}
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => send(a)}
                >
                  {actionNames[a.type]}
                </button>
              ))}
          </div>
        </section>
        <details className="estate-holdings">
          <summary>Propriétés et hypothèques</summary>
          {view.players.map((id, seat) => (
            <div key={id}>
              <h4>
                {name(id)} · {s.jailCards[seat]} carte(s) de sortie
              </h4>
              {estateBoard.flatMap((p, i) =>
                s.owners[i] === seat
                  ? [
                      <button type="button" key={i} onClick={() => setSelected(i)}>
                        {p.name}
                        {s.mortgaged[i]
                          ? ' · hypothéquée'
                          : s.houses[i]! > 0
                            ? ` · ${s.houses[i] === 5 ? 'hôtel' : `${s.houses[i]} maison(s)`}`
                            : ''}
                      </button>,
                    ]
                  : [],
              )}
            </div>
          ))}
        </details>
      </div>
      {actions.some((a) => ['propose-trade', 'roll', 'end'].includes(a.type)) && (
        <details className="estate-history">
          <summary>Proposer un échange</summary>
          <form
            className="estate-trade-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              onAction({
                type: 'propose-trade',
                target,
                give: Number(data.get('give')),
                take: Number(data.get('take')),
                cash: Number(data.get('cash')),
              });
            }}
          >
            <label>
              Avec qui ?
              <select value={target} onChange={(e) => setTradeTarget(Number(e.target.value))}>
                {view.players.flatMap((id, i) =>
                  i !== current && !s.eliminated.includes(i)
                    ? [
                        <option key={id} value={i}>
                          {name(id)}
                        </option>,
                      ]
                    : [],
                )}
              </select>
            </label>
            <label>
              Votre propriété offerte
              <select name="give">
                <option value="-1">Aucune</option>
                {tradable(current).map((i) => (
                  <option key={i} value={i}>
                    {estateBoard[i]!.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Propriété demandée
              <select name="take" key={target}>
                <option value="-1">Aucune</option>
                {tradable(target).map((i) => (
                  <option key={i} value={i}>
                    {estateBoard[i]!.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Somme versée (négative pour demander de l’argent)
              <input
                name="cash"
                type="number"
                min={-s.money[target]!}
                max={s.money[current]!}
                defaultValue="0"
                required
              />
            </label>
            <p>
              Uniquement les propriétés sans hypothèque et sans bâtiment dans leur groupe. L’autre
              joueur doit accepter.
            </p>
            <button type="submit" className="button secondary" disabled={disabled}>
              Envoyer la proposition
            </button>
          </form>
        </details>
      )}
      {deck && (
        <section className="estate-card-list" aria-label={`Cartes ${deck}`}>
          <h3>{deck === 'dalmatian' ? '🐾 Cartes Dalmatien' : '🐕 Cartes Golden'}</h3>
          <button className="button subtle" type="button" onClick={() => setDeck(null)}>
            Fermer les cartes
          </button>
          {estateCards[deck].map((c) => (
            <article key={c.title}>
              <h4>{c.title}</h4>
              <p>{c.text}</p>
            </article>
          ))}
        </section>
      )}
      <details className="estate-history">
        <summary>Journal de la partie</summary>
        <ol>
          {s.log.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
