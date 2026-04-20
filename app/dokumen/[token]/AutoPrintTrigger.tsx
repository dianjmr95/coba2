"use client";

import { useEffect, useRef } from "react";

type AutoPrintTriggerProps = {
  enabled: boolean;
};

export default function AutoPrintTrigger({ enabled }: AutoPrintTriggerProps) {
  const printedRef = useRef(false);

  useEffect(() => {
    if (!enabled || printedRef.current) return;
    printedRef.current = true;
    const timer = window.setTimeout(() => {
      window.print();
    }, 150);
    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled]);

  return null;
}
