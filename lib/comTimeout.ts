/**
 * Cinto de segurança para operações que podem pendurar.
 *
 * Motivação: no ambiente serverless da Vercel, uma chamada ao Firestore
 * pode ficar presa por até ~182s ("Waiting for LB pick" de um canal gRPC
 * morto sendo reaproveitado) antes de estourar o deadline. Enquanto isso,
 * a resposta do /api/painel fica pendurada e a tela congela.
 *
 * `comTimeout` corre a tarefa contra um relógio: se o relógio vencer
 * primeiro, rejeita com TimeoutError e o chamador segue (nos nossos casos,
 * o catch já loga e devolve fallback). O `preferRest` em lib/firebase.ts
 * ataca a causa raiz; este helper é a rede de segurança para o caso de
 * qualquer outra operação travar.
 *
 * Nota técnica: Promise.race não CANCELA a tarefa perdedora — ela continua
 * rodando em segundo plano e morre quando a instância serverless congela.
 * Isso é aceitável e esperado neste ambiente.
 *
 * Puro (sem dependências server-only): pode ser usado tanto no servidor
 * quanto no cliente (ex.: leitura do Eyenote no navegador da TV).
 */

export class TimeoutError extends Error {
  constructor(rotulo: string, ms: number) {
    super(`Operação "${rotulo}" excedeu ${ms}ms e foi abortada.`);
    this.name = "TimeoutError";
  }
}

export function comTimeout<T>(
  tarefa: Promise<T>,
  ms: number,
  rotulo: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      reject(new TimeoutError(rotulo, ms));
    }, ms);

    tarefa.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(timer);
        reject(erro);
      },
    );
  });
}
