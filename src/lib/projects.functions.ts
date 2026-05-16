import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FileSchema = z.object({
  path: z.string().min(1).max(512),
  parent_path: z.string().min(1).max(512),
  name: z.string().min(1).max(255),
  type: z.enum(["file", "folder"]),
  content: z.string().max(2_000_000).nullable().optional(),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: owned }, { data: shared }] = await Promise.all([
      supabase.from("projects").select("*").eq("owner_id", userId).order("updated_at", { ascending: false }),
      supabase.from("project_collaborators").select("project_id, role, projects(*)").eq("user_id", userId),
    ]);
    const sharedProjects = (shared ?? [])
      .map((r: any) => r.projects)
      .filter(Boolean);
    return { owned: owned ?? [], shared: sharedProjects };
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid().nullable(),
      name: z.string().min(1).max(120),
      files: z.array(FileSchema).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let projectId = data.projectId;

    if (!projectId) {
      const { data: created, error } = await supabase
        .from("projects")
        .insert({ name: data.name, owner_id: userId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      projectId = created.id;
    } else {
      const { error } = await supabase
        .from("projects")
        .update({ name: data.name, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (error) throw new Error(error.message);
    }

    // Replace files (simple full sync)
    await supabase.from("project_files").delete().eq("project_id", projectId);
    if (data.files.length > 0) {
      const rows = data.files.map((f) => ({ ...f, project_id: projectId }));
      const { error } = await supabase.from("project_files").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { projectId };
  });

export const loadProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error: pErr } = await supabase
      .from("projects").select("*").eq("id", data.projectId).single();
    if (pErr) throw new Error(pErr.message);
    const { data: files, error: fErr } = await supabase
      .from("project_files").select("*").eq("project_id", data.projectId);
    if (fErr) throw new Error(fErr.message);
    return { project, files: files ?? [] };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("projects").delete().eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setProjectVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid(), isPublic: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("projects").update({ is_public: data.isPublic }).eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public, anonymous-friendly: load a project by share token
export const loadPublicProject = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { data: project, error } = await supabaseAdmin
      .from("projects")
      .select("id, name, description, owner_id, share_token, is_public, updated_at")
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Share link not found");
    const { data: files } = await supabaseAdmin
      .from("project_files").select("path, parent_path, name, type, content").eq("project_id", project.id);
    return { project, files: files ?? [] };
  });

// Authenticated: accept a collab invite token → add caller as editor
export const acceptCollabInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: project, error } = await supabaseAdmin
      .from("projects").select("id, owner_id, name").eq("collab_token", data.token).maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Invite link invalid or expired");
    if (project.owner_id !== userId) {
      const { error: insErr } = await supabaseAdmin
        .from("project_collaborators")
        .upsert({ project_id: project.id, user_id: userId, role: "editor" });
      if (insErr) throw new Error(insErr.message);
    }
    return { projectId: project.id, name: project.name };
  });

export const rotateProjectTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      projectId: z.string().uuid(),
      rotateShare: z.boolean().default(false),
      rotateCollab: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, string> = {};
    const rnd = () =>
      Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
    if (data.rotateShare) patch.share_token = rnd();
    if (data.rotateCollab) patch.collab_token = rnd();
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("projects").update(patch).eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
