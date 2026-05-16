import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { acceptCollabInvite } from "@/lib/projects.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/join/$token")({
  component: JoinPage,
  head: () => ({ meta: [{ title: "Join project — CodeForge" }] }),
});

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptCollabInvite);
  const [status, setStatus] = useState("Checking invite…");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        sessionStorage.setItem("codeforge_pending_invite", token);
        navigate({ to: "/login" });
        return;
      }
      try {
        setStatus("Joining project…");
        const res = await accept({ data: { token } });
        toast.success(`Joined "${res.name}"`);
        sessionStorage.setItem("codeforge_open_project", res.projectId);
        navigate({ to: "/" });
      } catch (e: any) {
        setStatus(e.message ?? "Invite invalid");
      }
    })();
  }, [accept, navigate, token]);

  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
