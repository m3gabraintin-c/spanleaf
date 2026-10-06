"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { data } from "@/data";
import { AppShell, useRequireUser } from "@/components/AppChrome";
import { Button, Dialog, TextField } from "@/ui";

/** Who is signed in, signing out, and deleting the account. */
export default function AccountPage() {
  const me = useRequireUser();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!me) return <div className="min-h-dvh" aria-busy="true" />;

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await data.deleteAccount();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The account couldn't be deleted. Try again.");
      setBusy(false);
    }
  };

  return (
    <AppShell me={me}>
      <main className="mx-auto flex max-w-lg flex-col gap-8 px-4 py-8">
        <h1 className="text-xl font-bold">Account</h1>
        <section aria-labelledby="who" className="flex flex-col gap-1">
          <h2 id="who" className="text-base font-semibold">
            Signed in as
          </h2>
          <p className="text-sm text-muted">{me.email}</p>
          <p className="text-sm text-muted">Everything here is free. There are no plans to buy.</p>
        </section>
        <section aria-labelledby="delete" className="flex flex-col gap-3 rounded-lg border border-line p-5">
          <h2 id="delete" className="text-base font-semibold">
            Delete account
          </h2>
          <p className="text-sm text-muted">This removes your projects and photos for good. It can&apos;t be undone.</p>
          <div>
            <Button variant="secondary" onClick={() => setAsking(true)}>
              Delete my account
            </Button>
          </div>
        </section>
      </main>
      <Dialog
        open={asking}
        onOpenChange={(open) => {
          setAsking(open);
          if (!open) setTyped("");
        }}
        title="Delete your account?"
        description="Your projects and photos will be removed. Type DELETE to confirm."
        actions={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={typed !== "DELETE"} onClick={() => void remove()}>
              Delete account
            </Button>
          </>
        }
      >
        <TextField label="Type DELETE" value={typed} onChange={(e) => setTyped(e.target.value)} />
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </AppShell>
  );
}
