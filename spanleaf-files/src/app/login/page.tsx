"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { data, DataError } from "@/data";
import { safeReturnTo } from "@/lib/redirect";
import { APP_NAME } from "@/lib/brand";
import { Button, TextField } from "@/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // Read from the address after the page has loaded. Reading it while rendering makes the server's
  // page and the browser's page differ, which React reports as a hydration error.
  const [linkFailed, setLinkFailed] = useState(false);
  const [next, setNext] = useState("/app");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const dest = safeReturnTo(q.get("next"));
    setLinkFailed(q.get("error") === "link");
    setNext(dest);
    void data.getMe().then((me) => me && router.replace(dest));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const r = await data.signIn(email, next);
      if (r.status === "signed_in") router.push(next);
      else {
        setSent(true);
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof DataError ? err.message : "Couldn't sign in. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <Link href="/" prefetch={false} className="text-lg font-semibold text-ink">
        {APP_NAME}
      </Link>
      <h1 className="text-xl font-bold">{sent ? "Check your email" : "Sign in"}</h1>
      {sent ? (
        <div className="flex flex-col gap-4">
          <p className="text-base text-muted">
            We sent a sign-in link to <span className="font-medium text-ink">{email.trim()}</span>. Open it in this same browser to finish signing in.
          </p>
          <Button variant="secondary" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      ) : (
      <>
      {linkFailed ? (
        <p role="alert" className="text-sm text-danger">
          That sign-in link didn&apos;t work. It may have expired, or been opened in a different browser. Request a new one.
        </p>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          hint={data.capabilities.billing ? "We'll email you a sign-in link. There's no password to remember." : "This build doesn't send email. Signing in is simulated on this device."}
        />
        <Button type="submit" loading={busy}>
          Continue
        </Button>
      </form>
      {data.capabilities.google && data.signInWithGoogle ? (
        <Button variant="secondary" onClick={() => void data.signInWithGoogle?.()}>
          Continue with Google
        </Button>
      ) : null}
      </>
      )}
    </main>
  );
}
