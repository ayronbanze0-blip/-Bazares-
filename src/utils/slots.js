/**
 * Motor de geração de horários disponíveis.
 *
 * Recebe o horário de funcionamento do dia, a duração do serviço,
 * os agendamentos já existentes e os bloqueios manuais, e devolve
 * a lista de horários (HH:mm) que ainda podem ser reservados.
 */
const { paraMinutos, paraHHmm, intervalosSeSobrepoe } = require('./date');

/**
 * @param {Object} params
 * @param {{abre: string, fecha: string, pausas?: {inicio:string, fim:string}[]}} params.expediente
 * @param {number} params.duracaoServico - em minutos
 * @param {{inicio:string, fim:string}[]} params.ocupados - agendamentos confirmados/pendentes + bloqueios, já em HH:mm
 * @param {number} [params.intervaloEntreSlots] - granularidade da agenda em minutos (padrão 15)
 * @param {string} [params.agora] - HH:mm do momento atual, para não sugerir horários passados no dia de hoje
 * @param {boolean} [params.ehHoje]
 * @returns {string[]} lista de horários HH:mm disponíveis
 */
function gerarHorariosDisponiveis({
  expediente,
  duracaoServico,
  ocupados = [],
  intervaloEntreSlots = 15,
  agora = null,
  ehHoje = false,
}) {
  if (!expediente || !expediente.abre || !expediente.fecha) return [];

  const abre = paraMinutos(expediente.abre);
  const fecha = paraMinutos(expediente.fecha);
  const pausas = expediente.pausas || [];
  const disponiveis = [];

  const limiteInferior = ehHoje && agora ? paraMinutos(agora) : -Infinity;

  for (let inicio = abre; inicio + duracaoServico <= fecha; inicio += intervaloEntreSlots) {
    const fim = inicio + duracaoServico;
    if (inicio < limiteInferior) continue;

    const dentroDePausa = pausas.some((p) =>
      intervalosSeSobrepoe(inicio, fim, paraMinutos(p.inicio), paraMinutos(p.fim))
    );
    if (dentroDePausa) continue;

    const conflita = ocupados.some((o) =>
      intervalosSeSobrepoe(inicio, fim, paraMinutos(o.inicio), paraMinutos(o.fim))
    );
    if (conflita) continue;

    disponiveis.push(paraHHmm(inicio));
  }

  return disponiveis;
}

module.exports = { gerarHorariosDisponiveis };
