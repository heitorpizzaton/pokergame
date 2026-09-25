import type { CSSProperties } from 'react';
import { parseCards } from '../../core/cards/index.ts';
import { strings } from '../../i18n/index.ts';
import { PlayingCard } from '../table/PlayingCard.tsx';
import styles from './Screens.module.css';

interface Props {
  readonly onNewGame: () => void;
  readonly onContinue: (() => void) | null;
  readonly onHistory: (() => void) | null;
  readonly onSettings: () => void;
  readonly onGuide: () => void;
}

/** A royal flush fanned above the title. */
const FAN = parseCards('TsJsQsKsAs');
const LIFT = [10, 3, 0, 3, 10];

export function MenuScreen({ onNewGame, onContinue, onHistory, onSettings, onGuide }: Props) {
  return (
    <main className={styles.screen} data-testid="menu-screen">
      <section className={styles.panel} aria-labelledby="app-title">
        <div className={styles.fan} aria-hidden="true">
          {FAN.map((card, i) => (
            <PlayingCard
              key={card}
              card={card}
              size="large"
              motion={{ '--i': i, '--lift': LIFT[i] ?? 0 } as CSSProperties}
            />
          ))}
        </div>
        <h1 id="app-title" className={styles.title}>
          {strings.app.name}
        </h1>
        <p className={styles.hint}>{strings.app.tagline}</p>
        <div className={styles.buttons}>
          {onContinue && (
            <button type="button" className={styles.primary} onClick={onContinue}>
              {strings.menu.continueGame}
            </button>
          )}
          <button
            type="button"
            className={onContinue ? styles.secondary : styles.primary}
            onClick={onNewGame}
          >
            {strings.menu.newGame}
          </button>
          {onHistory && (
            <button type="button" className={styles.secondary} onClick={onHistory}>
              {strings.menu.history}
            </button>
          )}
          <button type="button" className={styles.secondary} onClick={onSettings}>
            {strings.menu.settings}
          </button>
          <button type="button" className={styles.secondary} onClick={onGuide}>
            {strings.menu.guide}
          </button>
        </div>
        <p className={styles.legal}>{strings.legal.entertainment}</p>
      </section>
    </main>
  );
}
