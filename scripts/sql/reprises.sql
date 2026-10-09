-- Table des reprises de matériel (rachat ou valeur déduite d'un achat/réparation).
-- À exécuter UNE FOIS dans Supabase : Dashboard > SQL Editor > New query > Run.
--
-- Utilisée par pages/RepriseListPage.js et pages/RepriseEditPage.js.
-- Les photos (matériel + pièce d'identité) sont stockées dans le bucket
-- existant "images", dossier "reprises/<id>/".

create table if not exists public.reprises (
  id uuid primary key default gen_random_uuid(),
  -- Numéro affiché "REP-000001", attribué par la base (jamais en double)
  numero bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  -- Vendeur (lié à la fiche client quand elle existe)
  client_id uuid references public.clients(id) on delete set null,
  seller_name text not null,
  seller_phone text,
  seller_email text,
  seller_address text,
  seller_postal_code text,
  seller_city text,

  -- Pièce d'identité du vendeur
  id_type text,
  id_number text,
  id_issue_date text,
  id_issuer text,
  id_photo text,

  -- Matériel repris
  device_type text,
  brand text,
  model text,
  serial_number text,
  condition text,
  accessories text,
  notes text,
  photos jsonb not null default '[]'::jsonb,

  -- Contrôles avant reprise
  check_account_removed boolean not null default false,
  check_data_erased boolean not null default false,
  check_not_blocked boolean not null default false,

  -- Reprise : rachat payé au vendeur, ou valeur déduite d'un achat/réparation
  reprise_type text not null default 'rachat'
    check (reprise_type in ('rachat', 'deduction')),
  price numeric(10, 2),
  payment_method text,
  deduction_note text,

  -- Attestation signée par le vendeur sur la tablette
  signature text,
  signed_at timestamptz,

  -- Suivi de revente
  resale_status text not null default 'en_stock'
    check (resale_status in ('en_stock', 'revendu')),
  resale_price numeric(10, 2),
  resale_date text,

  deleted boolean not null default false
);

-- Accès réservé aux utilisateurs connectés de l'application.
alter table public.reprises enable row level security;

create policy "reprises_authenticated_all"
  on public.reprises
  for all
  to authenticated
  using (true)
  with check (true);

-- Nécessaire pour les nouvelles tables (accès via l'API Supabase).
grant select, insert, update, delete on public.reprises to authenticated;
