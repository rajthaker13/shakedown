"use client";

import { useState } from "react";

import { Matrix } from "@/components/matrix/matrix";
import type { MatrixData, Mode } from "@/components/matrix/types";

/** The product's own matrix, holding its state locally instead of in the URL. */
export function EmbeddedMatrix({
  data,
  initial,
}: {
  data: MatrixData;
  initial: { mode: Mode; base: string; cell: string | null; only: boolean };
}) {
  const [state, setState] = useState(initial);
  return (
    <Matrix
      data={data}
      syncUrl={false}
      initial={{ ...state, cell: state.cell ?? undefined }}
      onState={setState}
      className="h-[620px] max-h-[80vh]"
    />
  );
}
