-- Assign static logo paths for additional school teams.
-- Safe to re-run: updates only matching team names.

update public.teams set logo_url = '/team-logos/brandwag.png'
where lower(btrim(name)) in ('brandwag', 'hoërskool brandwag', 'hoerskool brandwag');

update public.teams set logo_url = '/team-logos/goudveld.png'
where lower(btrim(name)) in ('goudveld', 'hoërskool goudveld', 'hoerskool goudveld');

update public.teams set logo_url = '/team-logos/graeme-college.png'
where lower(btrim(name)) in ('graeme college', 'graeme');

update public.teams set logo_url = '/team-logos/hentie-cilliers.png'
where lower(btrim(name)) in ('hentie cilliers', 'hoërskool hentie cilliers', 'hoerskool hentie cilliers');

update public.teams set logo_url = '/team-logos/hugenote.png'
where lower(btrim(name)) in ('hugenote', 'hoërskool hugenote', 'hoerskool hugenote');

update public.teams set logo_url = '/team-logos/hugenote-welkom.png'
where lower(btrim(name)) in (
  'hugenote welkom',
  'hoërskool hugenote welkom',
  'hoerskool hugenote welkom'
);

update public.teams set logo_url = '/team-logos/jim-fouche.png'
where lower(btrim(name)) in (
  'jim fouche',
  'jim fouché',
  'hoërskool jim fouché',
  'hoerskool jim fouche'
);

update public.teams set logo_url = '/team-logos/landboudal.png'
where lower(btrim(name)) in ('landboudal', 'hoër landbouskool dalmas', 'hoer landbouskool dalmas');

update public.teams set logo_url = '/team-logos/louis-botha.png'
where lower(btrim(name)) in ('louis botha', 'hoërskool louis botha', 'hoerskool louis botha');

update public.teams set logo_url = '/team-logos/witteberg.png'
where lower(btrim(name)) in ('witteberg', 'hoërskool witteberg', 'hoerskool witteberg');
