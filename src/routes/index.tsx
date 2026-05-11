import { createFileRoute } from "@tanstack/react-router";
import { IDELayout } from "@/components/ide/IDELayout";
import { ResponsiveIDE } from "@/components/ide/MobileLayout";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <ResponsiveIDE Desktop={IDELayout} />;
}
