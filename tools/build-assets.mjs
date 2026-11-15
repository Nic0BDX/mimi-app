import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../apps/web/public');
for (const folder of ['icons', 'avatars', 'illustrations'])
  await fs.mkdir(path.join(root, folder), { recursive: true });
const svg = (body, w = 400, h = 260) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const defs = `<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#6753a0"/><stop offset="1" stop-color="#25244e"/></linearGradient><linearGradient id="wood" x2="0" y2="1"><stop stop-color="#ffd68e"/><stop offset="1" stop-color="#cf7f51"/></linearGradient><linearGradient id="gold" x2=".5" y2="1"><stop stop-color="#fff3ab"/><stop offset="1" stop-color="#ffb52e"/></linearGradient><linearGradient id="pink" x2=".5" y2="1"><stop stop-color="#ff9ac7"/><stop offset="1" stop-color="#dd478c"/></linearGradient><linearGradient id="blue" x2=".5" y2="1"><stop stop-color="#96e4ff"/><stop offset="1" stop-color="#3f7cd9"/></linearGradient><linearGradient id="purple" x2=".5" y2="1"><stop stop-color="#d5b2ff"/><stop offset="1" stop-color="#8355d9"/></linearGradient></defs>`;
const dots = `<g fill="#ffe8a2" opacity=".8"><path d="m48 35 3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="m345 55 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><circle cx="307" cy="28" r="2"/><circle cx="84" cy="204" r="2"/><circle cx="335" cy="193" r="2"/></g>`;
const back = `<rect width="400" height="260" fill="url(#bg)"/><ellipse cx="203" cy="214" rx="145" ry="23" fill="#14132d" opacity=".25"/>${dots}`;
const write = (folder, name, content) => fs.writeFile(path.join(root, folder, name), content);
const die = `<g transform="translate(130 72) rotate(-13 55 55)"><rect y="9" width="108" height="108" rx="24" fill="#d28d8a"/><rect width="108" height="108" rx="24" fill="#fff1d7" stroke="#fff8ef" stroke-width="3"/><g fill="#554068"><circle cx="28" cy="29" r="8"/><circle cx="79" cy="29" r="8"/><circle cx="54" cy="54" r="8"/><circle cx="28" cy="80" r="8"/><circle cx="79" cy="80" r="8"/></g></g>`;
const pawn = (x, y, color, scale = 1) =>
  `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="71" rx="28" ry="9" fill="#17142d" opacity=".2"/><path d="M-26 64Q-14 38-11 12H11Q14 38 26 64Q20 80-20 76Z" fill="url(#${color})" stroke="#ffffff55" stroke-width="2"/><ellipse cy="66" rx="27" ry="10" fill="url(#${color})"/><circle cy="0" r="17" fill="url(#${color})" stroke="#ffffff55" stroke-width="2"/><ellipse cx="-5" cy="-7" rx="5" ry="3" fill="#ffffff66"/></g>`;
const star = `<path d="m0-29 9 19 21 3-15 15 4 21L0 19l-19 10 4-21-15-15 21-3z" fill="url(#gold)" stroke="#fff0b0" stroke-width="2"/>`;
const logo = svg(
  `${defs}<rect width="512" height="512" rx="120" fill="#302252"/><g transform="translate(256 238) rotate(-12)"><path d="M-132-65 0-136 132-65 132 79 0 153-132 79Z" fill="url(#purple)" stroke="#e5c9ff" stroke-width="8"/><path d="M-132-65 0 7 132-65M0 7V153" fill="none" stroke="#e5c9ff" stroke-width="6"/><path d="M-132-65 0-136 132-65 0 7Z" fill="#fff0c9"/><g fill="#61347e"><ellipse cx="0" cy="-65" rx="15" ry="10"/><ellipse cx="-63" cy="-65" rx="13" ry="9"/><ellipse cx="63" cy="-65" rx="13" ry="9"/></g><g fill="#fff0c9"><ellipse cx="-67" cy="22" rx="13" ry="18" transform="rotate(-27 -67 22)"/><ellipse cx="-67" cy="79" rx="13" ry="18" transform="rotate(-27 -67 79)"/><ellipse cx="64" cy="26" rx="13" ry="18" transform="rotate(27 64 26)"/></g></g><path d="m410 83 9 23 24 8-24 8-9 24-8-24-24-8 24-8z" fill="#ffdc73"/>`,
  512,
  512,
);
await write('icons', 'icon.svg', logo);
for (const size of [192, 512])
  await sharp(Buffer.from(logo))
    .resize(size, size)
    .png()
    .toFile(path.join(root, `icons/icon-${size}.png`));
await sharp(Buffer.from(logo))
  .resize(180, 180)
  .png()
  .toFile(path.join(root, 'icons/apple-touch-icon.png'));
await sharp(Buffer.from(logo))
  .resize(384, 384)
  .extend({ top: 64, bottom: 64, left: 64, right: 64, background: '#302252' })
  .png()
  .toFile(path.join(root, 'icons/icon-maskable-512.png'));
const names = [
  'comet',
  'fox',
  'owl',
  'frog',
  'cat',
  'bear',
  'rabbit',
  'panda',
  'robot',
  'whale',
  'dragon',
  'sun',
];
const palette = [
  '#6855ad',
  '#db8b57',
  '#7e68ac',
  '#549b80',
  '#b277ad',
  '#a78665',
  '#ac93c0',
  '#659c9c',
  '#6985bb',
  '#508cad',
  '#84874e',
  '#b38b42',
];
const ears = {
  fox: '<path d="m26 40 2-28 24 19M74 40 72 12 48 31" fill="#f3ab61" stroke="#713f43" stroke-width="3"/>',
  owl: '<path d="m25 38-4-22 26 13M75 38l4-22-26 13" fill="#c8b0e5"/>',
  cat: '<path d="m26 41-1-25 24 17M74 41l1-25-24 17" fill="#eed4e8" stroke="#925a8d" stroke-width="3"/>',
  bear: '<circle cx="28" cy="30" r="13" fill="#ddbb8a"/><circle cx="72" cy="30" r="13" fill="#ddbb8a"/>',
  rabbit:
    '<ellipse cx="36" cy="24" rx="9" ry="23" fill="#f3e4f5"/><ellipse cx="64" cy="24" rx="9" ry="23" fill="#f3e4f5"/>',
  panda:
    '<circle cx="28" cy="28" r="13" fill="#343950"/><circle cx="72" cy="28" r="13" fill="#343950"/>',
  frog: '<circle cx="32" cy="31" r="14" fill="#97d397"/><circle cx="68" cy="31" r="14" fill="#97d397"/>',
  robot:
    '<path d="M50 28V12" stroke="#d9e9ff" stroke-width="4"/><circle cx="50" cy="11" r="5" fill="#ffdb76"/><rect x="17" y="47" width="9" height="19" rx="3" fill="#a5c8e3"/><rect x="74" y="47" width="9" height="19" rx="3" fill="#a5c8e3"/>',
  dragon: '<path d="m30 34 2-21 13 15M70 34l-2-21-13 15" fill="#ffcf79"/>',
  whale: '<path d="M23 62Q5 39 15 33L36 48M77 62Q95 39 85 33L64 48" fill="#96d5ec"/>',
};
for (let i = 0; i < names.length; i++) {
  const name = names[i],
    color = palette[i];
  const faces = {
    fox: '#f2bc80',
    owl: '#ddc8ee',
    frog: '#a6dfa2',
    cat: '#f0d6e9',
    bear: '#e9cba4',
    rabbit: '#f6e9f5',
    panda: '#f2f3ef',
    robot: '#c1ddf0',
    whale: '#b4e6f1',
    dragon: '#c4dda2',
  };
  let body;
  if (name === 'comet')
    body = `<path d="M18 74Q34 24 76 17L65 56Z" fill="#ffacb5"/><circle cx="55" cy="51" r="24" fill="#ffe3a3"/><path d="m75 17 4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill="#fff3cc"/>`;
  else if (name === 'sun')
    body = `<g stroke="#ffe18a" stroke-width="6" stroke-linecap="round"><path d="M50 12v8M50 80v8M12 50h8M80 50h8M23 23l6 6M71 71l6 6M23 77l6-6M71 29l6-6"/></g><circle cx="50" cy="50" r="27" fill="#ffe3a0"/>`;
  else
    body = `${ears[name] ?? ''}<${name === 'robot' ? 'rect x="24" y="30" width="52" height="48" rx="13"' : 'ellipse cx="50" cy="55" rx="29" ry="27"'} fill="${faces[name]}"/>${name === 'owl' ? '<ellipse cx="37" cy="49" rx="13" ry="16" fill="#f8ecfa"/><ellipse cx="63" cy="49" rx="13" ry="16" fill="#f8ecfa"/>' : ''}${name === 'panda' ? '<ellipse cx="37" cy="49" rx="9" ry="12" fill="#404457"/><ellipse cx="63" cy="49" rx="9" ry="12" fill="#404457"/>' : ''}`;
  await write(
    'avatars',
    `${name}.svg`,
    svg(
      `<rect width="100" height="100" rx="50" fill="${color}"/><circle cx="50" cy="94" r="45" fill="#ffffff0c"/>${body}<g fill="${name === 'panda' ? '#fff3da' : '#424058'}"><ellipse cx="39" cy="51" rx="3.2" ry="4.4"/><ellipse cx="61" cy="51" rx="3.2" ry="4.4"/></g><path d="M43 64Q50 70 57 64" stroke="#64506a" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="31" cy="61" rx="5" ry="3" fill="#e88e9a77"/><ellipse cx="69" cy="61" rx="5" ry="3" fill="#e88e9a77"/>`,
      100,
      100,
    ),
  );
}
let grid = '';
for (let x = 0; x < 3; x++)
  for (let y = 0; y < 3; y++) {
    const cx = 126 + x * 74,
      cy = 58 + y * 58;
    grid += `<rect x="${cx - 31}" y="${cy - 23}" width="63" height="47" rx="7" fill="#a46562" stroke="#e9b181" stroke-width="2"/>`;
    if ((x + y) % 3 === 0)
      grid += `<path d="m${cx - 12} ${cy - 11} 24 22m0-22-24 22" stroke="#ffda73" stroke-width="9" stroke-linecap="round"/>`;
    if ((x + y) % 3 === 1)
      grid += `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="#ffc07a" stroke-width="9"/>`;
  }
await write(
  'illustrations',
  'morpion.svg',
  svg(
    `${defs}${back}<g transform="rotate(-12 200 130)"><rect x="78" y="23" width="245" height="201" rx="18" fill="url(#wood)" stroke="#ffe0a4" stroke-width="3"/>${grid}</g>`,
  ),
);
let tokens = '';
for (let x = 0; x < 7; x++)
  for (let y = 0; y < 5; y++)
    tokens += `<circle cx="${93 + x * 35}" cy="${57 + y * 34}" r="13" fill="${y < 2 && x % 2 ? '#24325e' : (x + y) % 2 ? 'url(#pink)' : 'url(#gold)'}" stroke="#404485" stroke-width="3"/>`;
await write(
  'illustrations',
  'puissance-quatre.svg',
  svg(
    `${defs}${back}<g transform="rotate(7 200 130)"><rect x="61" y="25" width="278" height="198" rx="20" fill="url(#blue)" stroke="#b0e4ff" stroke-width="3"/><rect x="75" y="38" width="250" height="177" rx="10" fill="#46499f"/>${tokens}<path d="M64 222h272" stroke="#75acff" stroke-width="14" stroke-linecap="round"/></g>`,
  ),
);
let board = '';
for (let x = 0; x < 6; x++)
  for (let y = 0; y < 5; y++)
    board += `<rect x="${65 + x * 45}" y="${25 + y * 38}" width="45" height="38" fill="${(x + y) % 2 ? '#b87960' : '#f0c78e'}"/>`;
let pieces = '';
for (const [x, y, c] of [
  [109, 164, 'gold'],
  [241, 86, 'purple'],
  [285, 160, 'purple'],
  [153, 87, 'gold'],
])
  pieces += `<ellipse cx="${x}" cy="${y + 6}" rx="29" ry="15" fill="#6c4859"/><ellipse cx="${x}" cy="${y}" rx="29" ry="15" fill="url(#${c})" stroke="#fff2c777" stroke-width="2"/><ellipse cx="${x}" cy="${y}" rx="21" ry="10" fill="none" stroke="#fff2c777" stroke-width="2"/>`;
await write(
  'illustrations',
  'dames.svg',
  svg(
    `${defs}${back}<g transform="rotate(-9 200 130)"><rect x="54" y="16" width="292" height="212" rx="15" fill="url(#wood)"/>${board}${pieces}</g>`,
  ),
);
let cards = '';
for (let i = 0; i < 4; i++)
  cards += `<g transform="translate(${92 + i * 48} ${47 + (i % 2) * 4}) rotate(${i * 15 - 22} 45 80)"><rect y="5" width="89" height="152" rx="13" fill="#673977"/><rect width="89" height="152" rx="13" fill="${['#58b9b3', '#65a3ee', '#bc77e4', '#ef7e9b'][i]}" stroke="#ffdcfa" stroke-width="3"/><path d="M12 20h13m-13 7h8" stroke="white" stroke-width="3" stroke-linecap="round"/><g transform="translate(45 82) scale(.8)">${star}</g></g>`;
await write('illustrations', 'carte-frenesie.svg', svg(`${defs}${back}${cards}`));
let tiles = '';
for (let i = 0; i < 5; i++)
  tiles += `<rect x="${70 + i * 54}" y="${142 - i * 9}" width="51" height="47" rx="9" fill="${i % 2 ? '#cfbaef' : '#f6d59d'}" stroke="#fff4d0" stroke-width="2"/>`;
await write(
  'illustrations',
  'course-ecuries.svg',
  svg(
    `${defs}${back}<path d="m0 160 80-77 77 60 79-91 164 100v108H0" fill="#7a99a1" opacity=".5"/><path d="m0 201 131-46 118 25 151-35v115H0" fill="#a6b8a0" opacity=".5"/>${tiles}${pawn(121, 99, 'pink', 0.85)}${pawn(203, 100, 'gold', 0.85)}${pawn(280, 83, 'blue', 0.85)}`,
  ),
);
await write(
  'illustrations',
  'bombe-mots.svg',
  svg(
    `${defs}${back}<g transform="rotate(-10 200 130)"><circle cx="202" cy="141" r="66" fill="#1b2546" stroke="#9f87cb" stroke-width="3"/><ellipse cx="181" cy="118" rx="16" ry="25" fill="#ffffff15" transform="rotate(35 181 118)"/><rect x="188" y="65" width="30" height="20" rx="7" fill="url(#gold)"/><path d="M203 66q-8-30 18-29t18-20" fill="none" stroke="#ffd06f" stroke-width="5"/><g transform="translate(239 17) scale(.45)">${star}</g><text x="203" y="159" text-anchor="middle" fill="#ffe3a5" font-size="43" font-family="sans-serif" font-weight="bold">Aa</text><g transform="translate(70 92) rotate(-12)"><rect width="50" height="62" rx="10" fill="url(#wood)"/><text x="25" y="43" fill="#754d69" text-anchor="middle" font-size="36" font-family="sans-serif" font-weight="bold">M</text></g><g transform="translate(292 111) rotate(16)"><rect width="50" height="62" rx="10" fill="url(#wood)"/><text x="25" y="43" fill="#754d69" text-anchor="middle" font-size="36" font-family="sans-serif" font-weight="bold">O</text></g></g>`,
  ),
);
await write(
  'illustrations',
  'hero.svg',
  svg(
    `${defs}<ellipse cx="202" cy="224" rx="150" ry="19" fill="#34226844"/><path d="M38 177 179 104 355 173 213 247Z" fill="#d1a0ec" opacity=".4"/>${dots}${pawn(284, 111, 'gold', 1.1)}${pawn(94, 149, 'pink', 0.7)}${die}<g transform="translate(287 201) rotate(10) scale(.65)">${star}</g><path d="m83 62 4 11 12 4-12 4-4 12-4-12-12-4 12-4z" fill="#ffe08a"/>`,
  ),
);
console.info('12 original avatars, 6 game covers, hero and PWA icons generated.');
