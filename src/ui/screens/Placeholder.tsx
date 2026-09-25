import { strings } from '../../i18n/index.ts';
import styles from './Placeholder.module.css';

/** Phase 0 landing page. Replaced by the Menu screen in Phase 4. */
export function Placeholder() {
  return (
    <main className={styles.screen}>
      <section className={styles.panel} aria-labelledby="app-title">
        <img className={styles.logo} src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <h1 id="app-title" className={styles.title}>
          {strings.app.name}
        </h1>
        <p className={styles.tagline}>{strings.app.tagline}</p>
        <span className={styles.status}>{strings.placeholder.status}</span>
        <p className={styles.body}>{strings.placeholder.body}</p>
        <p className={styles.legal}>{strings.legal.entertainment}</p>
      </section>
    </main>
  );
}
