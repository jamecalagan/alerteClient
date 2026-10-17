-- Fiche de prise en charge : état de l'appareil au dépôt, puis test après réparation.
-- À exécuter UNE FOIS dans Supabase : Dashboard > SQL Editor > New query > Run.
-- À lancer AVANT d'utiliser la version de l'appli qui affiche le bloc « État à la réception ».
--
-- intake_check (utilisée par AddInterventionPage, EditInterventionPage, SignatureClient, ClientPreviewPage) :
--   { powers_on: true | false | null,
--     functions: { ecran: 'ok' | 'panne' | 'nt', clavier: ..., ... },   -- nt = non testable
--     physical: ['rayures', 'coque', ...],
--     autre_label: 'texte libre pour la fonction « Autre »' }
--
-- repair_check (prévue pour le test après réparation, étape suivante) :
--   { functions: {...}, other_defects, client_notified_at, notify_method, quote, quote_accepted }
--
-- Les interventions existantes ne sont pas modifiées : ces colonnes restent simplement vides (null).

alter table public.interventions add column if not exists intake_check jsonb;
alter table public.interventions add column if not exists repair_check jsonb;
