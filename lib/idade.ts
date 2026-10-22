/**
 * Cálculo de idade a partir da data de nascimento que a ProDoctor devolve
 * junto com cada agendamento (campo `paciente.dataNascimento`, formato
 * "DD/MM/YYYY").
 *
 * Motivação: antes, o painel fazia uma chamada GET /Pacientes/Detalhar
 * por paciente para descobrir a idade — dezenas de chamadas por dia que
 * disputavam o limite de 120 req/min com a consulta principal da agenda.
 * Como a agenda já traz a data de nascimento, a idade sai de graça.
 *
 * Puro (sem dependências de servidor); fácil de testar.
 */

interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

/**
 * Aceita "DD/MM/YYYY" (formato documentado) e, por tolerância, "YYYY-MM-DD"
 * com ou sem hora. Devolve null para qualquer outra coisa.
 */
export function parseDataNascimento(valor: string | null | undefined): DataCivil | null {
  if (typeof valor !== "string") return null;
  const s = valor.trim();

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) {
    return validar({ dia: Number(br[1]), mes: Number(br[2]), ano: Number(br[3]) });
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    return validar({ ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) });
  }

  return null;
}

function validar(d: DataCivil): DataCivil | null {
  if (d.mes < 1 || d.mes > 12) return null;
  if (d.dia < 1 || d.dia > 31) return null;
  if (d.ano < 1900 || d.ano > 2200) return null;
  return d;
}

/**
 * Data civil de hoje no fuso de São Paulo (a clínica fica no Brasil; o
 * servidor pode estar em qualquer fuso).
 */
export function hojeBrasil(referencia: Date = new Date()): DataCivil {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referencia);
  const ler = (tipo: "year" | "month" | "day"): number =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  return { ano: ler("year"), mes: ler("month"), dia: ler("day") };
}

/**
 * Idade completa em anos, ou null se a data for inválida/ausente ou
 * estiver no futuro.
 */
export function idadeDeDataNascimento(
  dataNascimento: string | null | undefined,
  referencia: Date = new Date(),
): number | null {
  const nasc = parseDataNascimento(dataNascimento);
  if (!nasc) return null;

  const hoje = hojeBrasil(referencia);
  let idade = hoje.ano - nasc.ano;
  const aindaNaoFezAniversario =
    hoje.mes < nasc.mes || (hoje.mes === nasc.mes && hoje.dia < nasc.dia);
  if (aindaNaoFezAniversario) idade -= 1;

  if (idade < 0 || idade > 130) return null;
  return idade;
}
