"use client";

import { useActionState } from "react";

import { CodeBlock } from "@/components/code/code-block";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/form";

import { createApiKey, revokeApiKey } from "../../../actions";

type Key = {
  id: string;
  name: string;
  prefix: string;
  revoked: boolean;
  created: string;
  lastUsed: string;
};

function Revoke({ projectId, path, apiKey }: { projectId: string; path: string; apiKey: Key }) {
  const [state, run, pending] = useActionState(revokeApiKey, null);
  return (
    <form
      action={run}
      onSubmit={(event) => {
        const typed = window.prompt(
          `Anything using “${apiKey.name}” will stop uploading. Type the key's name to revoke it.`,
        );
        if (typed !== apiKey.name) event.preventDefault();
      }}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="key_id" value={apiKey.id} />
      <input type="hidden" name="path" value={path} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      {state?.error ? <span className="ml-2 text-xs text-fail">{state.error}</span> : null}
    </form>
  );
}

export function ApiKeys({
  projectId,
  path,
  keys,
  siteUrl,
}: {
  projectId: string;
  path: string;
  keys: Key[];
  siteUrl: string;
}) {
  const [state, create, pending] = useActionState(createApiKey, null);
  const active = keys.filter((k) => !k.revoked);
  const revoked = keys.filter((k) => k.revoked);

  const snippet = [
    "# .github/workflows/shakedown.yml",
    "env:",
    `  SHAKEDOWN_URL: ${siteUrl}`,
    "  SHAKEDOWN_API_KEY: ${{ secrets.SHAKEDOWN_API_KEY }}",
  ].join("\n");

  return (
    <div className="flex flex-col">
      {state?.secret ? (
        <div role="status" className="border-b border-line-subtle bg-accent-subtle px-4 py-3">
          <p className="text-[13px] font-medium text-fg">
            Key “{state.message}” created. Copy it now: it will not be shown again.
          </p>
          <div className="mt-2 flex items-center gap-1 rounded-sm border border-accent-line bg-inset pl-3 pr-1">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-2 font-mono text-xs text-fg">
              {state.secret}
            </code>
            <CopyButton value={state.secret} label="Copy API key" />
          </div>
        </div>
      ) : null}

      {active.length === 0 && !state?.secret ? (
        <p className="px-4 py-4 text-[13px] text-fg-secondary">
          No keys yet. The CLI needs one to upload results to this project. A key can write runs
          to this project and nothing else.
        </p>
      ) : null}

      {keys.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="label-caps h-8 pl-4 pr-3 font-medium">Name</th>
                <th scope="col" className="label-caps px-3 font-medium">Key</th>
                <th scope="col" className="label-caps px-3 font-medium">Created</th>
                <th scope="col" className="label-caps px-3 font-medium">Last used</th>
                <th scope="col" className="px-3 pr-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...active, ...revoked].map((k) => (
                <tr key={k.id} className="border-b border-line-subtle last:border-0">
                  <td className={k.revoked ? "h-10 pl-4 pr-3 text-fg-tertiary line-through" : "h-10 pl-4 pr-3 text-fg"}>
                    {k.name}
                  </td>
                  <td className="px-3 font-mono text-xs text-fg-secondary">{k.prefix}…</td>
                  <td className="px-3 text-fg-secondary">{k.created}</td>
                  <td className="px-3 text-fg-secondary">{k.lastUsed}</td>
                  <td className="px-3 pr-4 text-right">
                    {k.revoked ? null : <Revoke projectId={projectId} path={path} apiKey={k} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form action={create} className="flex flex-wrap items-end gap-3 border-t border-line-subtle px-4 py-3">
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="path" value={path} />
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="key-name" className="text-[13px] font-medium">
            New key
          </label>
          <Input id="key-name" name="name" placeholder="Where will it be used? e.g. GitHub Actions" maxLength={80} required />
        </div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
        {state?.error ? (
          <p role="alert" className="w-full text-xs text-fail">
            {state.error}
          </p>
        ) : null}
      </form>

      <div className="border-t border-line-subtle px-4 py-3">
        <p className="mb-2 text-xs text-fg-tertiary">
          Store the key as a secret in your CI system and pass it to the CLI through the
          environment.
        </p>
        <CodeBlock code={snippet} lang="yaml" />
      </div>
    </div>
  );
}
