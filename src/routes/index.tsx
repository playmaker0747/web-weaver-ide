import { createFileRoute } from "@tanstack/react-router";
import { IDELayout } from "@/components/ide/IDELayout";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <IDELayout />;
}
