-- Covering index for the student_rates.tutor_id foreign key (Supabase performance advisor 0001).
create index if not exists student_rates_tutor_idx on app.student_rates (tutor_id);
