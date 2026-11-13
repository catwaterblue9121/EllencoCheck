-- EllencoCheck - ATUALIZAÇÃO v5 (painel de administração + foto de perfil)
-- Execute no SQL Editor do Supabase, depois do v2, v3 e v4. Seguro rodar mais de uma vez.
--   1. Administradores podem cadastrar e editar veículos (equipamentos).
--   2. Foto de perfil: coluna profiles.avatar_path + bucket público "avatares".
--      Cada usuário troca a própria foto; administradores trocam a de qualquer um.

-- 1) Veículos: escrita só para administradores (não há exclusão: use "Inativo")
drop policy if exists equipamentos_insert_admin on public.equipamentos;
create policy equipamentos_insert_admin on public.equipamentos
for insert to authenticated with check (public.is_admin());

drop policy if exists equipamentos_update_admin on public.equipamentos;
create policy equipamentos_update_admin on public.equipamentos
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) Foto de perfil
alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
    public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatares_select on storage.objects;
create policy avatares_select on storage.objects
for select to authenticated using (bucket_id = 'avatares');

drop policy if exists avatares_insert on storage.objects;
create policy avatares_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'avatares'
            and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists avatares_delete on storage.objects;
create policy avatares_delete on storage.objects
for delete to authenticated
using (bucket_id = 'avatares'
       and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
