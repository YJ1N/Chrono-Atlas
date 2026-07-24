import { Atlas } from "@/components/atlas/Atlas";
import { HISTORY_DOMAIN, HISTORY_ITEMS } from "@/domains/history/manifest";

export default function Home() {
  return (
    <main className="h-dvh">
      <Atlas domain={HISTORY_DOMAIN} items={HISTORY_ITEMS} />
    </main>
  );
}
