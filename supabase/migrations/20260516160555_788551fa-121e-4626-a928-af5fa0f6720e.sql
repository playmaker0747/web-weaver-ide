-- =============== profiles ===============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =============== projects ===============
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  share_token text unique default encode(gen_random_bytes(16), 'hex'),
  collab_token text unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_idx on public.projects(owner_id);
create index projects_share_token_idx on public.projects(share_token);
create index projects_collab_token_idx on public.projects(collab_token);

alter table public.projects enable row level security;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

-- =============== project_collaborators ===============
create type public.collab_role as enum ('editor', 'viewer');

create table public.project_collaborators (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.collab_role not null default 'editor',
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_collaborators_user_idx on public.project_collaborators(user_id);

alter table public.project_collaborators enable row level security;

-- security-definer helper to avoid recursive RLS between projects/collaborators
create or replace function public.is_project_member(_project_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p where p.id = _project_id and p.owner_id = _user_id
  ) or exists (
    select 1 from public.project_collaborators c where c.project_id = _project_id and c.user_id = _user_id
  );
$$;

create or replace function public.is_project_owner(_project_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.projects p where p.id = _project_id and p.owner_id = _user_id);
$$;

-- projects policies
create policy "Owners and members can view their projects"
  on public.projects for select
  to authenticated
  using (owner_id = auth.uid() or public.is_project_member(id, auth.uid()) or is_public = true);

create policy "Public projects readable by anyone"
  on public.projects for select
  to anon
  using (is_public = true);

create policy "Users can create their own projects"
  on public.projects for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Owners can update their projects"
  on public.projects for update
  to authenticated
  using (owner_id = auth.uid());

create policy "Owners can delete their projects"
  on public.projects for delete
  to authenticated
  using (owner_id = auth.uid());

-- collaborator policies
create policy "Members can view collaborators of their projects"
  on public.project_collaborators for select
  to authenticated
  using (public.is_project_member(project_id, auth.uid()));

create policy "Owners manage collaborators (insert)"
  on public.project_collaborators for insert
  to authenticated
  with check (public.is_project_owner(project_id, auth.uid()));

create policy "Owners manage collaborators (delete)"
  on public.project_collaborators for delete
  to authenticated
  using (public.is_project_owner(project_id, auth.uid()) or user_id = auth.uid());

-- =============== project_files ===============
create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null,
  parent_path text not null default '/',
  name text not null,
  type text not null check (type in ('file','folder')),
  content text,
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);

create index project_files_project_idx on public.project_files(project_id);

alter table public.project_files enable row level security;

create trigger project_files_set_updated_at
before update on public.project_files
for each row execute function public.set_updated_at();

create policy "Members can view files"
  on public.project_files for select
  to authenticated
  using (public.is_project_member(project_id, auth.uid()) or exists (select 1 from public.projects p where p.id = project_id and p.is_public));

create policy "Anonymous can view files of public projects"
  on public.project_files for select
  to anon
  using (exists (select 1 from public.projects p where p.id = project_id and p.is_public));

create policy "Members can insert files"
  on public.project_files for insert
  to authenticated
  with check (public.is_project_member(project_id, auth.uid()));

create policy "Members can update files"
  on public.project_files for update
  to authenticated
  using (public.is_project_member(project_id, auth.uid()));

create policy "Members can delete files"
  on public.project_files for delete
  to authenticated
  using (public.is_project_member(project_id, auth.uid()));
