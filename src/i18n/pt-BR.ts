/** Every user-facing string lives here (AGENTS.md §2.7, §11.6). */
export const ptBR = {
  app: {
    name: 'Mesa Viva',
    tagline: "Texas Hold'em contra oponentes controlados pelo computador",
  },
  placeholder: {
    status: 'Em construção',
    body: 'A mesa está sendo preparada. Em breve você poderá jogar aqui.',
  },
  legal: {
    entertainment: 'Jogo de entretenimento. As fichas não têm valor real.',
  },
} as const;

export type Strings = typeof ptBR;
