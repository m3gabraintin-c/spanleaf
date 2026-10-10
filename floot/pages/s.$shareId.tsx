import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { Skeleton } from "../components/Skeleton";
import { getShareGet, OutputType, ShareComment } from "../endpoints/share-get_GET.schema";
import { postShareComment } from "../endpoints/share-comment_POST.schema";
import styles from "./s.$shareId.module.css";

const NAME_KEY = "spanleaf:comment-name";

/** A shared carousel: swipe through the slides and leave comments, no account needed. */
export default function SharePage() {
  const { shareId = "" } = useParams();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: OutputType }>({ status: "loading" });
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [body, setBody] = useState("");
  const [aboutSlide, setAboutSlide] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    getShareGet({ shareId }).then(
      (data) => alive && setState({ status: "ready", data }),
      (e) => alive && setState({ status: "error", message: e instanceof Error ? e.message : "This link couldn't be opened." }),
    );
    return () => {
      alive = false;
    };
  }, [shareId]);

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  };

  if (state.status === "loading") {
    return (
      <main className={styles.page} aria-busy="true">
        <Skeleton style={{ height: 32, width: "50%" }} />
        <Skeleton style={{ height: "60vh" }} />
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className={styles.page}>
        <Helmet>
          <title>Link unavailable - Spanleaf</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <h1 className={styles.title}>This carousel isn't here</h1>
        <p className={styles.note}>{state.message}</p>
        <Button asChild>
          <Link to="/">Make your own carousel</Link>
        </Button>
      </main>
    );
  }

  const { data } = state;
  const count = data.slides.length;
  const comments = data.comments;
  const onThis = comments.filter((c) => c.slide === index).length;

  const post = async () => {
    if (!name.trim() || !body.trim()) return setError("Add your name and a comment.");
    setPosting(true);
    setError(null);
    try {
      const c = await postShareComment({ shareId, name: name.trim(), body: body.trim(), slide: aboutSlide ? index : null });
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* not remembered, that's fine */
      }
      setState({ status: "ready", data: { ...data, comments: [...comments, c] } });
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your comment couldn't be posted.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <main className={styles.page}>
      <Helmet>
        <title>{`${data.title} - shared on Spanleaf`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <header className={styles.head}>
        <h1 className={styles.title}>{data.title}</h1>
        <p className={styles.note}>
          A carousel shared for feedback. Swipe through it and leave a comment. This link works until {new Date(data.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long" })}.
        </p>
      </header>

      <section className={styles.viewer} aria-label="Slides">
        <div className={styles.frame} style={{ aspectRatio: String(data.aspect) }}>
          <div
            ref={track}
            className={styles.track}
            tabIndex={0}
            aria-label={`Slide ${index + 1} of ${count}`}
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
              if (i !== index && i >= 0 && i < count) setIndex(i);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") goTo(Math.min(count - 1, index + 1));
              if (e.key === "ArrowLeft") goTo(Math.max(0, index - 1));
            }}
          >
            {data.slides.map((src, i) => (
              <div key={src} className={styles.cell}>
                <img src={src} alt={`Slide ${i + 1}`} loading={i < 3 ? "eager" : "lazy"} draggable={false} />
              </div>
            ))}
          </div>
          <span className={styles.counter}>
            {index + 1}/{count}
          </span>
        </div>
        <div className={styles.controls}>
          <Button variant="outline" size="icon-sm" aria-label="Previous slide" disabled={index <= 0} onClick={() => goTo(index - 1)}>
            <ChevronLeft size={16} />
          </Button>
          <span className={styles.note}>{onThis ? `${onThis} ${onThis === 1 ? "comment" : "comments"} on this slide` : "No comments on this slide yet"}</span>
          <Button variant="outline" size="icon-sm" aria-label="Next slide" disabled={index >= count - 1} onClick={() => goTo(index + 1)}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </section>

      <section className={styles.comments} aria-labelledby="comments-h">
        <h2 id="comments-h" className={styles.subhead}>
          Comments ({comments.length})
        </h2>
        {comments.length === 0 ? <p className={styles.note}>No comments yet. Be the first.</p> : <CommentList comments={comments} onSlide={goTo} />}
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <label className={styles.field}>
            <span>Your name</span>
            <Input value={name} maxLength={40} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Comment</span>
            <Textarea value={body} maxLength={1000} rows={3} onChange={(e) => setBody(e.target.value)} />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={aboutSlide} onChange={(e) => setAboutSlide(e.target.checked)} />
            <span>About slide {index + 1} (untick for the whole carousel)</span>
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={posting}>
            {posting ? "Posting…" : "Post comment"}
          </Button>
          <p className={styles.note}>Anyone with this link can read comments. Don't post anything private.</p>
        </form>
      </section>
      <p className={styles.note}>
        Made with <Link to="/">Spanleaf</Link>, a free carousel maker.
      </p>
    </main>
  );
}

const CommentList = ({ comments, onSlide }: { comments: ShareComment[]; onSlide: (i: number) => void }) => (
  <ol className={styles.list}>
    {comments.map((c) => (
      <li key={c.id} className={styles.comment}>
        <div className={styles.meta}>
          <strong>{c.name}</strong>
          {c.slide !== null ? (
            <button type="button" className={styles.chip} onClick={() => onSlide(c.slide!)}>
              Slide {c.slide + 1}
            </button>
          ) : (
            <span className={styles.chipQuiet}>Whole carousel</span>
          )}
          <time dateTime={new Date(c.createdAt).toISOString()}>{new Date(c.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</time>
        </div>
        <p>{c.body}</p>
      </li>
    ))}
  </ol>
);