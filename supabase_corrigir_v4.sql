-- EllencoCheck - REPARO DA ATUALIZACAO v4 (horimetro inicial/final)
-- Execute no Supabase > SQL Editor se a tela disser que o banco precisa do v4
-- ou se o salvamento falhar por falta de horimetro_inicial/horimetro_final.
-- Pode ser executado mais de uma vez. Nao apaga inspeções nem equipamentos.
-- Requer a estrutura base do EllencoCheck (schema + atualizacoes v2/v3).
-- Corrige também o gatilho definir_horimetro_checklist: horímetro final pode ser informado depois.

begin;

-- 1) Garante os campos enviados pelo formulario.
alter table public.checklists
    add column if not exists horimetro_inicial numeric(10,2);

alter table public.checklists
    add column if not exists horimetro_final numeric(10,2);

alter table public.checklists
    add column if not exists horimetro_final_em timestamptz;

-- Inspeções antigas tinham apenas `horimetro`; preserva essa leitura como inicial.
-- Corrige o gatilho antigo que exigia horímetro inicial E final ao mesmo tempo.
-- O horímetro final pode ficar vazio na abertura da inspeção e ser informado depois
-- pelo Histórico, quando o equipamento encerrar o uso.
create or replace function public.definir_horimetro_checklist()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_horimetro_inicial numeric;
begin
    -- Compatibilidade: versões antigas enviavam somente a coluna `horimetro`.
    if tg_op = 'UPDATE' then
        v_horimetro_inicial := coalesce(
            new.horimetro_inicial,
            new.horimetro,
            old.horimetro_inicial,
            old.horimetro
        );
    else
        v_horimetro_inicial := coalesce(new.horimetro_inicial, new.horimetro);
    end if;

    -- Na criação de uma inspeção, a leitura inicial é obrigatória.
    -- Em atualizações de registros antigos, não bloqueia mudanças por falta de leitura.
    if v_horimetro_inicial is null and tg_op = 'INSERT' then
        raise exception 'Informe o horímetro inicial.';
    end if;

    if v_horimetro_inicial is not null and v_horimetro_inicial < 0 then
        raise exception 'O horímetro inicial não pode ser negativo.';
    end if;

    if v_horimetro_inicial is not null then
        new.horimetro_inicial := v_horimetro_inicial;
        -- Mantém a coluna antiga para compatibilidade com telas/relatórios anteriores.
        new.horimetro := v_horimetro_inicial;
    end if;

    -- A leitura final é opcional ao salvar. Quando informada, valida a sequência.
    if new.horimetro_final is not null then
        if new.horimetro_inicial is null then
            raise exception 'Informe o horímetro inicial antes do horímetro final.';
        end if;
        if new.horimetro_final < new.horimetro_inicial then
            raise exception 'O horímetro final não pode ser menor que o inicial.';
        end if;
    end if;

    return new;
end;
$$;

update public.checklists
   set horimetro_inicial = horimetro
 where horimetro_inicial is null;

-- Coluna calculada para consultas e relatórios no banco. A tela também calcula no navegador.
do $$
begin
    if not exists (
        select 1
          from information_schema.columns
         where table_schema = 'public'
           and table_name = 'checklists'
           and column_name = 'horas_utilizadas'
    ) then
        alter table public.checklists
            add column horas_utilizadas numeric(10,2)
            generated always as (horimetro_final - horimetro_inicial) stored;
    end if;
end $$;

-- Impede leituras finais menores que as iniciais nas novas alterações.
do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.checklists'::regclass
           and conname = 'checklists_horimetro_final_check'
    ) then
        alter table public.checklists
            add constraint checklists_horimetro_final_check
            check (horimetro_final is null or horimetro_inicial is null or horimetro_final >= horimetro_inicial)
            not valid;
    end if;
end $$;

-- 2) Permite registrar o horimetro final posteriormente pelo histórico.
create or replace function public.registrar_horimetro_final(
    p_checklist_id bigint,
    p_horimetro_final numeric
)
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
     where id = p_checklist_id
     for update;

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

-- 3) Mantém o horímetro atual do equipamento sincronizado com a última leitura final.
create or replace function public.sincronizar_horimetro_equipamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.horimetro_final is not null then
        update public.equipamentos
           set horimetro = greatest(coalesce(horimetro, 0), new.horimetro_final)
         where id = new.equipamento_id;
    end if;
    return new;
end;
$$;

drop trigger if exists checklists_sync_horimetro on public.checklists;
create trigger checklists_sync_horimetro
after insert or update of horimetro_final on public.checklists
for each row execute function public.sincronizar_horimetro_equipamento();

-- Faz a API do Supabase atualizar o cache das colunas após a migração.
notify pgrst, 'reload schema';

commit;
