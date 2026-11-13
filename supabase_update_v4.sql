-- EllencoCheck - ATUALIZAÇÃO v4 (horímetro inicial/final + itens obrigatórios)
-- Execute no SQL Editor do Supabase, DEPOIS do v2 e do v3. É seguro rodar mais de uma vez
-- e não apaga nem altera dados existentes.
--
-- O que faz:
--   1. Horímetro inicial e final por inspeção, com cálculo das horas utilizadas.
--      Inspeções antigas (que tinham um único horímetro) passam a ter esse valor como "inicial".
--   2. Função registrar_horimetro_final(): permite informar o horímetro final DEPOIS da inspeção
--      (ao encerrar o uso do equipamento), só pelo dono da inspeção ou por administrador.
--   3. Mantém o horímetro do equipamento atualizado com o último valor final registrado
--      (é ele que vem preenchido como horímetro inicial da próxima inspeção).
--   4. Itens obrigatórios: coluna itens_inspecao.obrigatorio (já existia).
--        obrigatorio = true  -> problema neste item REPROVA a inspeção (equipamento não liberado)
--        obrigatorio = false -> problema vira "aprovado com observação"
--      Todos os itens atuais já são obrigatórios; veja o modelo no final para mudar/adicionar itens.

-- 1) Campos de horímetro
alter table public.checklists add column if not exists horimetro_inicial numeric(10,2);
alter table public.checklists add column if not exists horimetro_final numeric(10,2);
alter table public.checklists add column if not exists horimetro_final_em timestamptz;

update public.checklists
   set horimetro_inicial = horimetro
 where horimetro_inicial is null;

-- Horas de uso calculadas pelo banco (útil para relatórios/consultas no Supabase)
alter table public.checklists add column if not exists horas_utilizadas numeric(10,2)
    generated always as (horimetro_final - horimetro_inicial) stored;

alter table public.checklists drop constraint if exists checklists_horimetro_final_check;
alter table public.checklists add constraint checklists_horimetro_final_check
    check (horimetro_final is null or horimetro_inicial is null or horimetro_final >= horimetro_inicial);

-- 2) Registrar o horímetro final depois da inspeção
create or replace function public.registrar_horimetro_final(p_checklist_id bigint, p_horimetro_final numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_inicial numeric;
    v_usuario uuid;
begin
    select coalesce(horimetro_inicial, horimetro), usuario_id
      into v_inicial, v_usuario
      from public.checklists
     where id = p_checklist_id;

    if not found then
        raise exception 'Inspeção não encontrada.';
    end if;

    if auth.uid() is null or (v_usuario <> auth.uid() and not public.is_admin()) then
        raise exception 'Sem permissão para alterar esta inspeção.';
    end if;

    if p_horimetro_final is null or p_horimetro_final < v_inicial then
        raise exception 'O horímetro final não pode ser menor que o inicial (%).', v_inicial;
    end if;

    update public.checklists
       set horimetro_final = p_horimetro_final,
           horimetro_final_em = now()
     where id = p_checklist_id;
end;
$$;

revoke all on function public.registrar_horimetro_final(bigint, numeric) from public;
grant execute on function public.registrar_horimetro_final(bigint, numeric) to authenticated;

-- 3) Atualiza o horímetro do equipamento quando há horímetro final
create or replace function public.sincronizar_horimetro_equipamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.horimetro_final is not null then
        update public.equipamentos
           set horimetro = greatest(horimetro, new.horimetro_final)
         where id = new.equipamento_id;
    end if;
    return new;
end;
$$;

drop trigger if exists checklists_sync_horimetro on public.checklists;
create trigger checklists_sync_horimetro
after insert or update of horimetro_final on public.checklists
for each row execute procedure public.sincronizar_horimetro_equipamento();

-- 4) ITENS OBRIGATÓRIOS -------------------------------------------------------------
-- Exemplo: deixar de ser impeditivo (problema vira só observação):
--   update public.itens_inspecao set obrigatorio = false
--    where nome in ('Câmera ou sensor de ré', 'Limpador de para-brisa');
--
-- Exemplo: adicionar um item obrigatório a todos os caminhões (ajuste nome/categoria/ordem):
--   insert into public.itens_inspecao (tipo_id, nome, descricao, categoria, ordem, obrigatorio, ativo)
--   select t.id, 'Nível de óleo do motor', 'Verificação diária.', 'Itens para checar', 30, true, true
--     from public.tipos_equipamentos t
--    where t.nome in ('Caminhão Basculante','Caminhão Pipa','Caminhão Comboio')
--      and not exists (select 1 from public.itens_inspecao x
--                       where x.tipo_id = t.id and x.nome = 'Nível de óleo do motor');
