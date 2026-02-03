import React, { Suspense } from "react";
import { TranscriptProvider } from "@/app/contexts/TranscriptContext";

import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TooltipProvider>
        <TranscriptProvider>
          
          <App />
          
        </TranscriptProvider>
      </TooltipProvider>
    </Suspense>
  );
}
