import { useId } from 'react';

export const referenceFrames = {
  logo: '127 86 77 74',
  wordmark: '86 143 165 52',
  morpion: '298 360 178 87',
  'puissance-quatre': '498 361 174 87',
  dames: '694 365 168 84',
  'carte-frenesie': '298 549 178 81',
  'course-ecuries': '498 550 175 82',
  'bombe-mots': '695 551 168 80',
  resume: '299 207 174 96',
  mobile: '1231 324 140 90',
  'mobile-landscape': '1154 638 228 76',
  landscape: '735 110 232 50',
  trees: '276 95 62 89',
  clouds: '1178 255 45 77',
} as const;

export function ReferenceArtwork({
  art,
  className,
}: {
  art: keyof typeof referenceFrames;
  className?: string;
}) {
  const id = useId().replaceAll(':', '');
  const shape =
    art === 'logo'
      ? 'M136 105 L164 91 L194 105 L194 133 L164 145 L136 133 Z'
      : art === 'mobile'
        ? 'M1259 363 L1288 350 L1316 363 L1315 397 L1285 413 L1259 400 Z M1341 356 L1346 367 L1357 366 L1355 372 L1358 377 L1348 382 L1343 390 L1338 386 L1327 389 L1328 380 L1321 377 L1327 370 L1332 369 L1337 358 Z'
        : null;
  return (
    <svg
      className={`reference-art ${className ?? ''}`}
      viewBox={referenceFrames[art]}
      preserveAspectRatio={
        art === 'logo' ||
        art === 'wordmark' ||
        art === 'mobile' ||
        art === 'resume' ||
        art === 'mobile-landscape'
          ? 'xMidYMid meet'
          : 'xMidYMid slice'
      }
      aria-hidden="true"
      focusable="false"
    >
      {art === 'mobile' && (
        <path
          d="M1288 331v12 M1254 339l8 13 M1241 353l11 9 M1234 374l16 4 M1238 400l16-6 M1313 338l-9 14 M1326 352l-10 8 M1337 399l-15-7"
          stroke="#ffdd3e"
          strokeWidth="3"
        />
      )}
      <defs>
        {shape && (
          <clipPath id={`${id}-clip`}>
            <path d={shape} />
          </clipPath>
        )}
        {art === 'wordmark' && (
          <filter id={`${id}-alpha`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 2 1 0 0 -0.9" />
          </filter>
        )}
      </defs>
      <image
        href="/art/nimimi-reference.png"
        width="1448"
        height="1086"
        clipPath={shape ? `url(#${id}-clip)` : undefined}
        filter={art === 'wordmark' ? `url(#${id}-alpha)` : undefined}
      />
    </svg>
  );
}
