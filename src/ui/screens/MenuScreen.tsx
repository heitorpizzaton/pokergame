import { strings } from '../../i18n/index.ts';
import styles from './Screens.module.css';

export function MenuScreen({ onNewGame }: { readonly onNewGame: () => void }) {
  return (
    <main className={styles.screen} data-testid="menu-screen">
      <section className={styles.panel} aria-labelledby="app-title">
        <img className={styles.logo} src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <h1 id="app-title" className={styles.title}>
          {strings.app.name}
        </h1>
        <p className={styles.hint}>{strings.app.tagline}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} onClick={onNewGame}>
            {strings.menu.newGame}
          </button>
        </div>
        <p className={styles.legal}>{strings.legal.entertainment}</p>
      </section>
    </main>
  );
}
