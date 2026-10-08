import { Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Button } from "../components/Button";
import { ThemeModeSwitch } from "../components/ThemeModeSwitch";
import styles from "./_index.module.css";

const FEATURES = [
  { title: "One long canvas", body: "Lay out the whole carousel as a single wide picture, then export it slide by slide. A photo can run across a slide edge and comes out as two clean halves." },
  { title: "As many slides as you need", body: "Add, copy, delete and reorder slides whenever you like. Everything is free, with no plans and no limit on pages, up to 500 in a project." },
  { title: "Your own words", body: "Add text in four fonts, with your own colour and alignment, and line anything up with the edges or the middle of a slide." },
  { title: "Backgrounds that carry on", body: "Pick a colour, or a gradient that runs unbroken from the first slide to the last." },
  { title: "Undo that goes back far", body: "Every change can be undone and redone, including adding and deleting slides." },
  { title: "Plain exports", body: "Each slide is an ordinary PNG, 1080 pixels wide, with no watermark. Several slides download as one zip." },
];

const QUESTIONS = [
  { q: "What does it cost?", a: "Nothing. Every tool is free, with no plans, no trial and no limit on how many slides a project has." },
  { q: "Where are my photos kept?", a: "In this browser only. Nothing is uploaded to a server, so projects open on the device and browser where you made them." },
  { q: "How many slides can I make?", a: "Up to 500 in one project. Photos are shrunk to 2400 pixels on their longest side, which is more than a slide needs." },
  { q: "Is there a watermark?", a: "No. The slides you export are your pictures and nothing else." },
];

export default function HomePage() {
  return (
    <div className={styles.page}>
      <Helmet>
        <title>Spanleaf - free carousel maker</title>
        <meta name="description" content="Make a seamless photo carousel for Instagram: one long canvas, as many slides as you need, exported as plain PNGs. Free, with no account." />
      </Helmet>

      <header className={styles.header}>
        <a href="#main" className={styles.skip}>
          Skip to content
        </a>
        <span className={styles.wordmark}>Spanleaf</span>
        <div className={styles.headerActions}>
          <ThemeModeSwitch />
          <Button asChild variant="outline" size="sm">
            <Link to="/app">Open your projects</Link>
          </Button>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero}>
          <p className={styles.kicker}>Free carousel maker</p>
          <h1 className={styles.h1}>Seamless carousels, made at your desk.</h1>
          <p className={styles.lede}>
            For people who would rather edit on a computer than move files to a phone. Spread one picture across as many slides as you like, then export each slide at 1080 pixels wide.
          </p>
          <div className={styles.cta}>
            <Button asChild size="lg">
              <Link to="/app">Start a carousel</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="what" className={styles.section}>
          <h2 id="what" className={styles.h2}>
            What you get
          </h2>
          <ul className={styles.features}>
            {FEATURES.map((f) => (
              <li key={f.title}>
                <h3 className={styles.h3}>{f.title}</h3>
                <p>{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="faq" className={styles.section}>
          <h2 id="faq" className={styles.h2}>
            Questions
          </h2>
          <dl className={styles.faq}>
            {QUESTIONS.map((x) => (
              <div key={x.q}>
                <dt>{x.q}</dt>
                <dd>{x.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.closing}>
          <h2 className={styles.h2}>Make your first carousel.</h2>
          <Button asChild size="lg">
            <Link to="/app">Start a carousel</Link>
          </Button>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Spanleaf. Free, and your projects stay in your browser.</span>
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
