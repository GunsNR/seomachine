import { loginAction } from "../session-actions";
import { Notice } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-rail px-4 on-dark">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-ctl bg-accent text-sm font-bold text-rail">RL</span>
          <div>
            <p className="text-base font-semibold text-white">Rank Logic Growth OS</p>
            <p className="text-2xs text-rail-muted">Internal agency workspace and client portal</p>
          </div>
        </div>
        <form action={loginAction} className="rounded-panel bg-surface p-5">
          <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
          {error ? <div className="mb-3"><Notice tone="bad" title={error} /></div> : null}
          <label className="label" htmlFor="email">Email</label>
          <input className="field mb-3" id="email" name="email" type="email" autoComplete="email" required />
          <label className="label" htmlFor="password">Password</label>
          <input className="field mb-4" id="password" name="password" type="password" autoComplete="current-password" required />
          <button className="btn-primary w-full" type="submit">Sign in</button>
          <p className="mt-3 text-2xs text-ink-2">Forgot it? Ask the workspace owner to send a reset link from Settings → Members. Email delivery is not connected in this build, so links are shown to the owner to pass on.</p>
        </form>
      </div>
    </main>
  );
}
