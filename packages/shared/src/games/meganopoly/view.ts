import { z } from 'zod';
export const estateViewSchema = z.object({
  positions: z.array(z.number()),
  money: z.array(z.number()),
  owners: z.array(z.number()),
  houses: z.array(z.number()),
  mortgaged: z.array(z.boolean()),
  jail: z.array(z.number()),
  jailCards: z.array(z.number()),
  phase: z.enum(['roll', 'offer', 'end', 'debt', 'auction', 'trade']),
  dice: z.array(z.number()),
  eliminated: z.array(z.number()),
  debt: z.number(),
  trade: z
    .object({
      from: z.number(),
      to: z.number(),
      give: z.number(),
      take: z.number(),
      cash: z.number(),
      resume: z.enum(['roll', 'end']),
    })
    .nullable(),
  auction: z
    .object({
      property: z.number(),
      price: z.number(),
      bidder: z.number().nullable(),
      eligible: z.array(z.number()),
      resume: z.number(),
    })
    .nullable(),
  lastCard: z.object({ deck: z.enum(['dalmatian', 'golden']), index: z.number() }).nullable(),
  log: z.array(z.string()),
  round: z.number(),
  roundLimit: z.number(),
});
export type EstateView = z.infer<typeof estateViewSchema>;
