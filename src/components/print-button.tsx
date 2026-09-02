"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useRouter } from "next/navigation";

export function PrintButton() {
  const router = useRouter();
  return (
    <div className="print-controls">
      <button className="button button-secondary" type="button" onClick={() => router.back()}><ArrowLeft size={17} /> Back</button>
      <button className="button button-primary" type="button" onClick={() => window.print()}><Printer size={17} /> Print label</button>
    </div>
  );
}

