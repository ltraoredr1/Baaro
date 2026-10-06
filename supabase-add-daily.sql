alter table public.debate_rooms
  add column if not exists daily_room_name text;
notify pgrst, 'reload schema';
