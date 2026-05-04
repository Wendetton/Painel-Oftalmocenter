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

/**
 * Tipo do agendamento conforme marcações no ProDoctor (são flags
 * combináveis — um agendamento pode ser, por exemplo, consulta + exame).
 *
 * O painel usa essas flags para escolher o ícone do card
 * (PLANEJAMENTO ajustado em conversa com Fernando):
 *   - retorno → emoji "R"
 *   - exame   → emoji "frasco"
 *   - consulta sem retorno nem exame → emoji "carinha"
 *   - múltiplos → mostra todos os ícones aplicáveis.
 */
export interface TipoAgendamento {
  consulta: boolean;
  retorno: boolean;
  exame: boolean;
  cirurgia: boolean;
  compromisso: boolean;
  teleconsulta: boolean;
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
  tipoAgendamento: TipoAgendamento | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resposta interna do painel: Agendamento já classificado em estágio,
// pronto para o frontend desenhar cards. Inclui idade quando disponível.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identificação completa de um agendamento no ProDoctor.
 * Necessária para chamar PATCH /api/v1/Agenda/AlterarStatus (modo edição).
 * O painel envia este objeto de volta ao backend ao executar uma transição
 * de estado, evitando que o servidor precise reconstruir os campos.
 */
export interface ChaveAgendamento {
  localCodigo: number;
  usuarioCodigo: number;
  /** "DD/MM/YYYY" — formato exigido pela API ProDoctor. */
  data: string;
  /** "HH:mm" — formato exigido pela API ProDoctor. */
  hora: string;
}

export interface CardPaciente {
  agendamentoId: string;
  estagio: EstagioPaciente;
  /**
   * Timestamp ISO de quando o paciente entrou no estágio atual.
   * Usado pelo cronômetro do card. Reseta toda vez que o paciente
   * troca de estágio. Pode ser null para AGENDADO/FALTOU.
   */
  estagioDesdeEm: string | null;
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
  tipoAgendamento: TipoAgendamento | null;
  /**
   * Chave para mutações no ProDoctor. Ausente quando faltam dados (ex.:
   * agendamento sem código de local), o que torna o card não-editável.
   */
  chaveAgendamento: ChaveAgendamento | null;
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
