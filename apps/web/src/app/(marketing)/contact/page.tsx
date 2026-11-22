import type { Metadata } from "next";

import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Talk to the people building Shakedown about testing your robot policy.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
      <div>
        <p className="eyebrow text-accent">Contact</p>
        <h1 className="mt-4 text-[40px] font-semibold leading-[1.1] tracking-[-0.03em]">
          Tell us how you test a checkpoint today.
        </h1>
        <p className="mt-5 max-w-md text-base leading-[26px] text-fg-secondary">
          Shakedown is in early access. We are working closely with a small number of teams that
          deploy learned manipulation policies, and we read every message.
        </p>
        <ul className="mt-8 flex max-w-md flex-col gap-3 text-[15px] text-fg-secondary">
          <li>Help setting up a suite for your own scene and robot.</li>
          <li>Running on your own infrastructure.</li>
          <li>Validating simulated results against your real arm.</li>
        </ul>
      </div>
      <div className="rounded-lg border border-line bg-surface p-6">
        <ContactForm />
      </div>
    </div>
  );
}
