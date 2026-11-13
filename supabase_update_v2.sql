-- EllencoCheck - ATUALIZAÇÃO v2 (PDF das inspeções + correções)
-- Para quem JÁ executou o supabase_schema.sql antes.
-- Execute no SQL Editor do Supabase. É seguro rodar mais de uma vez e NÃO mexe nos seus dados
-- (não recria os dados iniciais de equipamentos/itens).
--
-- O que faz:
--   1. Corrige o gatilho que impedia "UPDATE profiles SET role='admin'" no SQL Editor.
--   2. Adiciona a coluna respostas_checklist.foto_path e índices.
--   3. Ajusta a leitura de equipamentos/itens/tipos para o histórico e o PDF não perderem nomes.
--   4. Cria os perfis que faltarem e o bucket privado "inspecao-fotos" (fotos das avarias) com políticas.

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- auth.uid() é nulo no SQL Editor e com a service_role: nesses casos a alteração é liberada.
    if auth.uid() is not null and not public.is_admin() then
        if new.role <> old.role
           or new.ativo <> old.ativo
           or new.id <> old.id
           or new.email <> old.email then
            raise exception 'Somente administradores podem alterar função, e-mail ou status do usuário.';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists protect_profile_fields_trigger on public.profiles;
create trigger protect_profile_fields_trigger
before update on public.profiles
for each row execute procedure public.protect_profile_fields();


alter table public.respostas_checklist add column if not exists foto_path text;

create index if not exists idx_respostas_checklist on public.respostas_checklist(checklist_id);
create index if not exists idx_checklists_realizado on public.checklists(realizado_em desc);
create index if not exists idx_checklists_equipamento on public.checklists(equipamento_id);
create index if not exists idx_checklists_usuario on public.checklists(usuario_id);
create index if not exists idx_itens_tipo on public.itens_inspecao(tipo_id);


-- Leitura: itens/equipamentos desativados continuam visíveis para quem já os usou em uma
-- inspeção (senão o histórico e o PDF perderiam o nome do equipamento/item).
drop policy if exists tipos_select on public.tipos_equipamentos;
create policy tipos_select on public.tipos_equipamentos
for select to authenticated using (
    ativo = true or public.is_admin()
    or exists (
        select 1 from public.equipamentos e
        join public.checklists c on c.equipamento_id = e.id
        where e.tipo_id = tipos_equipamentos.id and c.usuario_id = auth.uid()
    )
);

drop policy if exists equipamentos_select on public.equipamentos;
create policy equipamentos_select on public.equipamentos
for select to authenticated using (
    ativo = true or public.is_admin()
    or exists (
        select 1 from public.checklists c
        where c.equipamento_id = equipamentos.id and c.usuario_id = auth.uid()
    )
);

drop policy if exists itens_select on public.itens_inspecao;
create policy itens_select on public.itens_inspecao
for select to authenticated using (
    ativo = true or public.is_admin()
    or exists (
        select 1 from public.respostas_checklist r
        join public.checklists c on c.id = r.checklist_id
        where r.item_inspecao_id = itens_inspecao.id and c.usuario_id = auth.uid()
    )
);


-- Perfis de usuários que já existiam antes do trigger (evita erro "perfil não encontrado")
insert into public.profiles (id, nome, email)
select u.id,
       coalesce(nullif(u.raw_user_meta_data->>'nome',''), split_part(u.email,'@',1)),
       lower(u.email)
from auth.users u
on conflict (id) do nothing;

-- Fotos das avarias (Storage privado). Caminho: <id do usuário>/<arquivo>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspecao-fotos', 'inspecao-fotos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inspecao_fotos_insert" on storage.objects;
create policy "inspecao_fotos_insert" on storage.objects
for insert to authenticated
with check (
    bucket_id = 'inspecao-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "inspecao_fotos_select" on storage.objects;
create policy "inspecao_fotos_select" on storage.objects
for select to authenticated
using (
    bucket_id = 'inspecao-fotos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "inspecao_fotos_delete" on storage.objects;
create policy "inspecao_fotos_delete" on storage.objects
for delete to authenticated
using (
    bucket_id = 'inspecao-fotos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

