/**
 * Tipos do domínio do Painel Oftalmocenter.
 *
 * Refletem (a) as respostas relevantes da API ProDoctor (subset usado pelo painel)
 * e (b) os tipos derivados que o painel expõe ao frontend já classificados.
 *
 * As respostas reais da ProDoctor têm muitos campos opcionais; aqui ficam apenas
 * os que o painel realmente usa. Para o swagger completo, ver docs/swagger.json.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Os 7 estágios derivados das checkboxes do ProDoctor.
// Ordem das chaves não importa; cada estágio tem semântica única definida em
// classificador.ts conforme tabela mestre da seção 2.3 do PLANEJAMENTO.md.
// ─────────────────────────────────────────────────────────────────────────────
export type EstagioPaciente =
  | "AGENDADO"
  | "FALTOU"
  | "RECEPCAO"
  | "SALA_EXAMES"
  | "PRONTO_MEDICO"
  | "DILATACAO"
  | "ATENDIDO";

// ─────────────────────────────────────────────────────────────────────────────
// Subset dos tipos da API ProDoctor que o painel realmente consome.
// ─────────────────────────────────────────────────────────────────────────────

export interface MedicoProDoctor {
  codigo: number;
  nome: string;
}

export interface PacienteIdentificacao {
  codigo: number | null;
  nome: string | null;
}

export interface ConvenioIdentificacao {
  codigo: number | null;
  nome: string | null;
}

export interface LocalProDoctorIdentificacao {
  codigo: number | null;
  nome: string | null;
}

export interface EstadoAgendaConsulta {
  horaCompareceu: string | null;
  horaAtendimento: string | null;
  horaAtendido: string | null;
  compareceu: boolean;
  atendimento: boolean;
  atrasado: boolean;
  exameSituacao: boolean;
  atendido: boolean;
  faltou: boolean;
}

export interface AgendamentoProDoctor {
  localProDoctor: LocalProDoctorIdentificacao | null;
  usuario: MedicoProDoctor | null;
  data: string | null;
  hora: string | null;
  paciente: PacienteIdentificacao | null;
  complemento: string | null;
  estadoAgendaConsulta: EstadoAgendaConsulta | null;
  convenio: ConvenioIdentificacao | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resposta interna do painel: Agendamento já classificado em estágio,
// pronto para o frontend desenhar cards. Inclui idade quando disponível.
// ─────────────────────────────────────────────────────────────────────────────

export interface CardPaciente {
  agendamentoId: string;
  estagio: EstagioPaciente;
  paciente: {
    codigo: number | null;
    nome: string;
    idade: number | null;
  };
  medico: {
    codigo: number | null;
    nome: string;
  };
  horarioAgendamento: string | null;
  convenio: string | null;
  complemento: string | null;
  flags: EstadoAgendaConsulta;
  horaCompareceu: string | null;
  horaAtendimento: string | null;
  horaAtendido: string | null;
}

export interface RespostaPainel {
  cards: CardPaciente[];
  atualizadoEm: string;
  fonteOnline: boolean;
  ultimoErro: string | null;
}

export interface RespostaMedicos {
  medicos: MedicoProDoctor[];
  fonteOnline: boolean;
  ultimoErro: string | null;
}
