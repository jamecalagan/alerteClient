-- Dépôts de matériel pour test avant reprise (un bon peut contenir plusieurs appareils).
-- À exécuter UNE FOIS dans Supabase : Dashboard > SQL Editor > New query > Run.
--
-- Utilisée par pages/RepriseDepotListPage.js et pages/RepriseDepotEditPage.js.
-- Chaque appareil est un élément du tableau "items" :
--   { key, device_type, brand, model, condition, accessories,
--     status: 'en_test' | 'accepte' | 'refuse', reprise_id, returned }

create table if not exists public.reprise_depots (
  id uuid primary key default gen_random_uuid(),
  -- Numéro affiché "DEP-000001", attribué par la base (jamais en double)
  numero bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  -- Client (lié à la fiche client quand elle existe)
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  client_phone text,
  client_email text,

  -- Appareils déposés et résultat des tests
  items jsonb not null default '[]'::jsonb,
  notes text,

  -- Signature au dépôt, puis à la restitution du matériel refusé
  deposit_signature text,
  deposit_signed_at timestamptz,
  return_signature text,
  returned_at timestamptz,

  deleted boolean not null default false
);

-- Accès réservé aux utilisateurs connectés de l'application.
alter table public.reprise_depots enable row level security;

create policy "reprise_depots_authenticated_all"
  on public.reprise_depots
  for all
  to authenticated
  using (true)
  with check (true);

-- Nécessaire pour les nouvelles tables (accès via l'API Supabase).
grant select, insert, update, delete on public.reprise_depots to authenticated;
