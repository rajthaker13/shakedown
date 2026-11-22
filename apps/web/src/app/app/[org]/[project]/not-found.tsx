import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 px-6 py-24">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-[13px] text-fg-secondary">
        This page does not exist, or you do not have access to it.
      </p>
      <div>
        <LinkButton href="/app" variant="secondary">
          Back to your projects
        </LinkButton>
      </div>
    </div>
  );
}
