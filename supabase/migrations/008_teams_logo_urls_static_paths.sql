-- Point teams.logo_url at Next.js public assets (/team-logos/*.png) when names match.
-- Safe no-op for rows that do not match. Re-run after adding crests to public/team-logos.

update public.teams set logo_url = '/team-logos/afrikaans-hoe_r-seuns.png'
where lower(btrim(name)) in ('afrikaans hoër seuns', 'afrikaans hoer seuns', 'affies');

update public.teams set logo_url = '/team-logos/bishops.png'
where lower(btrim(name)) in ('bishops', 'diocesan college', 'bishops diocesan college');

update public.teams set logo_url = '/team-logos/boland-landbou.png'
where lower(btrim(name)) in (
  'hoër landbouskool boland',
  'hoer landbouskool boland',
  'boland landbou',
  'landbouskool boland'
);

update public.teams set logo_url = '/team-logos/brackenfell.png'
where lower(btrim(name)) in ('brackenfell', 'hoërskool brackenfell');

update public.teams set logo_url = '/team-logos/diamantveld.png'
where lower(btrim(name)) in ('diamantveld', 'hoërskool diamantveld');

update public.teams set logo_url = '/team-logos/duineveld.png' where lower(btrim(name)) = 'duineveld';

update public.teams set logo_url = '/team-logos/durban-high.png'
where lower(btrim(name)) in ('durban high', 'durban high school', 'dhs');

update public.teams set logo_url = '/team-logos/durbanville.png'
where lower(btrim(name)) in ('durbanville', 'hoërskool durbanville');

update public.teams set logo_url = '/team-logos/eg-jansen.png'
where lower(btrim(name)) in ('eg jansen', 'e g jansen', 'e.g. jansen', 'hoërskool eg jansen');

update public.teams set logo_url = '/team-logos/eldoraigne.png'
where lower(btrim(name)) in ('eldoraigne', 'hoërskool eldoraigne');

update public.teams set logo_url = '/team-logos/fichardtpark.png'
where lower(btrim(name)) in ('fichardtpark', 'fichardt park', 'hoërskool fichardtpark');

update public.teams set logo_url = '/team-logos/frikkie-meyer.png'
where lower(btrim(name)) in ('frikkie meyer', 'hoërskool frikkie meyer');

update public.teams set logo_url = '/team-logos/garsfontein.png'
where lower(btrim(name)) in ('garsfontein', 'hoërskool garsfontein', 'hoerskool garsfontein');

update public.teams set logo_url = '/team-logos/glenwood.png'
where lower(btrim(name)) in ('glenwood', 'glenwood high school');

update public.teams set logo_url = '/team-logos/grey-college.png'
where lower(btrim(name)) in ('grey college', 'grey college bloemfontein');

update public.teams set logo_url = '/team-logos/grey-high.png'
where lower(btrim(name)) in ('grey high school', 'grey high', 'grey hs');

update public.teams set logo_url = '/team-logos/grey-pe.png'
where lower(btrim(name)) in ('grey pe', 'grey high pe', 'grey high school pe');

update public.teams set logo_url = '/team-logos/helpmekaar.png'
where lower(btrim(name)) in ('helpmekaar', 'hoërskool helpmekaar');

update public.teams set logo_url = '/team-logos/hilton.png'
where lower(btrim(name)) in ('hilton college', 'hilton');

update public.teams set logo_url = '/team-logos/hts-belville.png'
where lower(btrim(name)) in ('hts bellville', 'bellville hts', 'hoërskool bellville');

update public.teams set logo_url = '/team-logos/hts-drostdy.png'
where lower(btrim(name)) in ('hts drostdy', 'hoërskool drostdy');

update public.teams set logo_url = '/team-logos/hts-middelburg.png'
where lower(btrim(name)) in ('hts middelburg', 'hoërskool middelburg');

update public.teams set logo_url = '/team-logos/hudson-park.png'
where lower(btrim(name)) in ('hudson park', 'hudson park high');

update public.teams set logo_url = '/team-logos/jeppe.png'
where lower(btrim(name)) in ('jeppe', 'jeppe high school for boys', 'jeppe high');

update public.teams set logo_url = '/team-logos/kemptonpark.png'
where lower(btrim(name)) in ('kempton park', 'kemptonpark', 'hoërskool kemptonpark');

update public.teams set logo_url = '/team-logos/kes.png'
where lower(btrim(name)) in ('kes', 'king edward vii school', 'king edward vii');

update public.teams set logo_url = '/team-logos/ligbron.png'
where lower(btrim(name)) in ('ligbron', 'hoërskool ligbron');

update public.teams set logo_url = '/team-logos/maritzburg-college.png'
where lower(btrim(name)) in ('maritzburg college', 'maritzburg');

update public.teams set logo_url = '/team-logos/menlopark.png'
where lower(btrim(name)) in (
  'menlo park',
  'menlopark',
  'hoërskool menlo park',
  'hoërskool menlopark'
);

update public.teams set logo_url = '/team-logos/michealhouse.png'
where lower(btrim(name)) in ('michaelhouse', 'michealhouse');

update public.teams set logo_url = '/team-logos/milnerton.png'
where lower(btrim(name)) in ('milnerton', 'hoërskool milnerton');

update public.teams set logo_url = '/team-logos/monument.png'
where lower(btrim(name)) in ('monument', 'hoërskool monument', 'monnas');

update public.teams set logo_url = '/team-logos/nelspruit.png'
where lower(btrim(name)) in ('nelspruit', 'hoërskool nelspruit', 'nelspruit hoër');

update public.teams set logo_url = '/team-logos/nothwood.png'
where lower(btrim(name)) in ('northwood', 'northwood boys', 'northwood boys high school');

update public.teams set logo_url = '/team-logos/noordheuwel.png'
where lower(btrim(name)) in ('noordheuwel', 'hoërskool noordheuwel');

update public.teams set logo_url = '/team-logos/oakdale.png'
where lower(btrim(name)) in ('oakdale', 'oakdale landbou');

update public.teams set logo_url = '/team-logos/outeniqua.png'
where lower(btrim(name)) in ('outeniqua', 'hoërskool outeniqua');

update public.teams set logo_url = '/team-logos/paarl-boys.png'
where lower(btrim(name)) in ('paarl boys high', 'paarl boys');

update public.teams set logo_url = '/team-logos/paarl-gim.png'
where lower(btrim(name)) in ('paarl gimnasium', 'paarl gim');

update public.teams set logo_url = '/team-logos/paul-roos.png'
where lower(btrim(name)) in ('paul roos gymnasium', 'paul roos', 'prg');

update public.teams set logo_url = '/team-logos/potch-gim.png'
where lower(btrim(name)) in ('potchefstroom gimnasium', 'potch gim', 'potchefstroom gim');

update public.teams set logo_url = '/team-logos/rondebosch.png'
where lower(btrim(name)) in ('rondebosch', 'rondebosch boys', 'rondebosch boys high school');

update public.teams set logo_url = '/team-logos/rustenburg.png'
where lower(btrim(name)) in ('rustenburg', 'hoërskool rustenburg');

update public.teams set logo_url = '/team-logos/sacs.png'
where lower(btrim(name)) in ('sacs', 'south african college schools');

update public.teams set logo_url = '/team-logos/stellenberg.png'
where lower(btrim(name)) in ('stellenberg', 'hoërskool stellenberg');

update public.teams set logo_url = '/team-logos/strand.png'
where lower(btrim(name)) in ('strand', 'hoërskool strand');

update public.teams set logo_url = '/team-logos/swartland.png'
where lower(btrim(name)) in ('swartland', 'hoërskool swartland');

update public.teams set logo_url = '/team-logos/trio.png' where lower(btrim(name)) = 'trio';

update public.teams set logo_url = '/team-logos/tygerberg.png'
where lower(btrim(name)) in ('tygerberg', 'hoërskool tygerberg');

update public.teams set logo_url = '/team-logos/voortrekker.png'
where lower(btrim(name)) in ('voortrekker', 'hoërskool voortrekker');

update public.teams set logo_url = '/team-logos/wagpos.png'
where lower(btrim(name)) in ('wagpos', 'die hoërskool wagpos', 'hoërskool wagpos');

update public.teams set logo_url = '/team-logos/waterkloof.png'
where lower(btrim(name)) in ('waterkloof', 'hoërskool waterkloof');

update public.teams set logo_url = '/team-logos/welkom-gim.png'
where lower(btrim(name)) in ('welkom gimnasium', 'welkom-gimnasium', 'welkom gim');

update public.teams set logo_url = '/team-logos/westville.png'
where lower(btrim(name)) in ('westville', 'westville boys high', 'westville boys');

update public.teams set logo_url = '/team-logos/worcester-gim.png'
where lower(btrim(name)) in (
  'worcester gimnasium',
  'worcester gim',
  'hoërskool worcester gimnasium'
);

update public.teams set logo_url = '/team-logos/wynberg.png'
where lower(btrim(name)) in ('wynberg', 'wynberg boys high', 'wynberg boys');

update public.teams set logo_url = '/team-logos/zwartkop.png'
where lower(btrim(name)) in ('zwartkop', 'hoërskool zwartkop');
