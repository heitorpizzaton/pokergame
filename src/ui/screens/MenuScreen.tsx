import { strings } from '../../i18n/index.ts';
import styles from './Screens.module.css';

interface Props {
  readonly onNewGame: () => void;
  readonly onContinue: (() => void) | null;
  readonly onHistory: (() => void) | null;
  readonly onSettings: () => void;
}

export function MenuScreen({ onNewGame, onContinue, onHistory, onSettings }: Props) {
  return (
    <main className={styles.screen} data-testid="menu-screen">
      <section className={styles.panel} aria-labelledby="app-title">
        <img className={styles.logo} src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
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
        </div>
        <p className={styles.legal}>{strings.legal.entertainment}</p>
      </section>
    </main>
  );
}
