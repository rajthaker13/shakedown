import { CodeBlock } from "@/components/code/code-block";
import { LinkButton } from "@/components/ui/button";
import { brand, siteUrl } from "@/lib/brand";

/** Shown in place of results until a project has its first run. */
export function FirstRun({ settingsHref, canWrite }: { settingsHref: string; canWrite: boolean }) {
  const code = [
    `export SHAKEDOWN_URL=${siteUrl}`,
    `export SHAKEDOWN_API_KEY=${brand.keyPrefix}…   # from Settings, API keys`,
    "",
    `${brand.cli} init scenarios`,
    `${brand.cli} run scenarios --policy lerobot:<checkpoint> --label v1 --upload`,
  ].join("\n");
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12 lg:px-6">
      <div>
        <h2 className="text-base font-semibold">No runs yet</h2>
        <p className="mt-1 text-[13px] text-fg-secondary">
          Results appear here as soon as the CLI uploads them. Each policy version becomes a
          column, each condition a row.
        </p>
      </div>
      <CodeBlock code={code} lang="bash" />
      <div className="flex gap-2">
        {canWrite ? (
          <>
            <LinkButton href={settingsHref.replace(/\/settings$/, "/runs/new")} variant="primary">
              Run one in the cloud
            </LinkButton>
            <LinkButton href={settingsHref} variant="secondary">
              Create an API key
            </LinkButton>
          </>
        ) : null}
        <LinkButton href="/docs/quickstart" variant="secondary">
          Read the quickstart
        </LinkButton>
      </div>
    </div>
  );
}
