import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ThemeModeSwitch } from "./ThemeModeSwitch";
import styles from "./LegalPage.module.css";

/** The layout shared by the terms and privacy pages. */
export const LegalPage = ({ title, updated, children }: { title: string; updated: string; children: ReactNode }) => (
  <div className={styles.page}>
    <Helmet>
      <title>{`${title} - Spanleaf`}</title>
    </Helmet>
    <a href="#content" className={styles.skip}>
      Skip to content
    </a>
    <header className={styles.header}>
      <Link to="/" className={styles.wordmark}>
        Spanleaf
      </Link>
      <ThemeModeSwitch />
    </header>
    <main id="content" className={styles.main}>
      <h1>{title}</h1>
      <p className={styles.updated}>Last updated {updated}</p>
      {children}
    </main>
    <footer className={styles.footer}>
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/">Home</Link>
    </footer>
  </div>
);
