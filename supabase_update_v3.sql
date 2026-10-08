-- EllencoCheck - ATUALIZAÇÃO v3 (checklist da empresa: máquinas, caminhões, ônibus, pipa, comboio, veículos)
-- Execute no SQL Editor do Supabase. É seguro rodar mais de uma vez: não apaga nem altera
-- nenhum dado existente, só cria o que ainda não existe (confere por nome).
--
-- O que faz:
--   1. Adiciona o campo "prefixo" em equipamentos (a planilha da empresa identifica o veículo
--      por PLACA e PREFIXO, ex.: CBH032).
--   2. Cria os tipos de equipamento da planilha.
--   3. Cadastra, em cada tipo, os 16 "ITENS PARA CHECAR" (período diário) e os 7 EPIs de uso obrigatório.
--   4. Cadastra o veículo de exemplo da planilha: Caminhão Basculante, prefixo CBH032.
--
-- Itens que só valem para um tipo (substituem o "N/A - não se aplica" do papel):
--   Tacógrafo ............... caminhões e ônibus
--   Trava da caçamba ........ Caminhão Basculante
--   Vibroacabadora (...) .... Vibroacabadora
--   Trator (...) ............ Trator
-- Os demais itens e os EPIs valem para todos os tipos abaixo.

-- 1) Campo prefixo
alter table public.equipamentos add column if not exists prefixo text;
create index if not exists idx_equipamentos_prefixo on public.equipamentos(prefixo);

-- evita conflito de ID caso algum cadastro anterior tenha sido feito com ID manual
select setval(pg_get_serial_sequence('public.tipos_equipamentos','id'),
              greatest(coalesce((select max(id) from public.tipos_equipamentos),1),1), true);
select setval(pg_get_serial_sequence('public.itens_inspecao','id'),
              greatest(coalesce((select max(id) from public.itens_inspecao),1),1), true);
select setval(pg_get_serial_sequence('public.equipamentos','id'),
              greatest(coalesce((select max(id) from public.equipamentos),1),1), true);

-- 2) Tipos de equipamento
insert into public.tipos_equipamentos (nome, descricao, ativo) values
('Caminhão Basculante', 'Checklist diário de máquinas, caminhões, ônibus, pipa, comboio e veículos', true),
('Caminhão Pipa',       'Checklist diário de máquinas, caminhões, ônibus, pipa, comboio e veículos', true),
('Caminhão Comboio',    'Checklist diário de máquinas, caminhões, ônibus, pipa, comboio e veículos', true),
('Ônibus',              'Checklist diário de máquinas, caminhões, ônibus, pipa, comboio e veículos', true),
('Veículo Leve',        'Checklist diário de máquinas, caminhões, ônibus, pipa, comboio e veículos', true),
('Trator',              'Checklist diário de máquinas, caminhões, ônibus, pipa, comboio e veículos', true),
('Vibroacabadora',      'Checklist diário de máquinas, caminhões, ônibus, pipa, comboio e veículos', true)
on conflict (nome) do nothing;

-- 3) Itens do checklist (EPIs primeiro, depois os 16 itens na ordem do papel)
with tipos as (
    select id, nome from public.tipos_equipamentos
    where nome in ('Caminhão Basculante','Caminhão Pipa','Caminhão Comboio','Ônibus',
                   'Veículo Leve','Trator','Vibroacabadora')
),
itens (ordem, categoria, nome, descricao, aplica) as (
    values
    -- EPIs de uso obrigatório
    (1,  'EPIs de uso obrigatório', 'Capacete de segurança', 'EPI de uso obrigatório: conferir se está sendo utilizado.', null::text[]),
    (2,  'EPIs de uso obrigatório', 'Protetor auricular',    'EPI de uso obrigatório: conferir se está sendo utilizado.', null),
    (3,  'EPIs de uso obrigatório', 'Óculos de segurança',   'EPI de uso obrigatório: conferir se está sendo utilizado.', null),
    (4,  'EPIs de uso obrigatório', 'Calçado de segurança',  'EPI de uso obrigatório: conferir se está sendo utilizado.', null),
    (5,  'EPIs de uso obrigatório', 'Luva de segurança',     'EPI de uso obrigatório: conferir se está sendo utilizado.', null),
    (6,  'EPIs de uso obrigatório', 'Colete e uniformes',    'EPI de uso obrigatório: conferir se está sendo utilizado.', null),
    (7,  'EPIs de uso obrigatório', 'Máscara',               'EPI de uso obrigatório: conferir se está sendo utilizado.', null),
    -- Itens para checar (período: diário)
    (8,  'Itens para checar', 'Iluminação (faróis, ré, pisca-alerta, lanterna, freio, etc.)', 'Verificação diária.', null),
    (9,  'Itens para checar', 'Buzina e alarme sonoro de ré',                'Verificação diária.', null),
    (10, 'Itens para checar', 'Possíveis vazamentos no motor',               'Verificação diária.', null),
    (11, 'Itens para checar', 'Condições dos pneus (desgaste, pressão) e estepe', 'Verificação diária.', null),
    (12, 'Itens para checar', 'Câmera ou sensor de ré',                      'Verificação diária.', null),
    (13, 'Itens para checar', 'Condições do para-brisa',                     'Verificação diária.', null),
    (14, 'Itens para checar', 'Circuito elétrico em boas condições',         'Verificação diária.', null),
    (15, 'Itens para checar', 'Extintor de incêndio (carga e validade)',     'Verificação diária.', null),
    (16, 'Itens para checar', 'Cinto de segurança',                          'Verificação diária.', null),
    (17, 'Itens para checar', 'Tacógrafo',                                   'Verificação diária.',
         array['Caminhão Basculante','Caminhão Pipa','Caminhão Comboio','Ônibus']),
    (18, 'Itens para checar', 'Limpador de para-brisa',                      'Verificação diária.', null),
    (19, 'Itens para checar', 'Verificar freios de roda e estacionamento',   'Verificação diária.', null),
    (20, 'Itens para checar', 'Trava da caçamba',                            'Verificação diária.', array['Caminhão Basculante']),
    (21, 'Itens para checar', 'Vibroacabadora (extintor, GLP, válvula, bico, mangueira)', 'Verificação diária.', array['Vibroacabadora']),
    (22, 'Itens para checar', 'Trator (proteções laterais, protetor de cardã)', 'Verificação diária.', array['Trator']),
    (23, 'Itens para checar', 'Outros (calço de rodas, triângulo, chave de roda, trava da caçamba)', 'Verificação diária.', null)
)
insert into public.itens_inspecao (tipo_id, nome, descricao, categoria, ordem, obrigatorio, ativo)
select t.id, i.nome, i.descricao, i.categoria, i.ordem, true, true
from itens i
join tipos t on (i.aplica is null or t.nome = any(i.aplica))
where not exists (
    select 1 from public.itens_inspecao x
    where x.tipo_id = t.id and x.nome = i.nome
);

-- 4) Veículo de exemplo da planilha (Caminhão Basculante, prefixo CBH032; placa não informada)
insert into public.equipamentos (tipo_id, nome, prefixo, status, ativo)
select t.id, 'Caminhão Basculante', 'CBH032', 'ATIVO', true
from public.tipos_equipamentos t
where t.nome = 'Caminhão Basculante'
  and not exists (
      select 1 from public.equipamentos e
      where e.prefixo = 'CBH032' or e.patrimonio = 'CBH032'
  );
