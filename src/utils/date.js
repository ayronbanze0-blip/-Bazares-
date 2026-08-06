/**
 * Utilitários de data/hora usados pelo motor de agenda.
 * Convenção: datas no formato 'YYYY-MM-DD', horas no formato 'HH:mm' (24h).
 */

const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function diaDaSemana(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return DIAS_SEMANA[d.getUTCDay()];
}

function paraMinutos(horaHHmm) {
  const [h, m] = horaHHmm.split(':').map(Number);
  return h * 60 + m;
}

function paraHHmm(minutos) {
  const h = Math.floor(minutos / 60).toString().padStart(2, '0');
  const m = (minutos % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function intervalosSeSobrepoe(inicioA, fimA, inicioB, fimB) {
  return inicioA < fimB && inicioB < fimA;
}

function dataHoraParaTimestamp(dataISO, horaHHmm) {
  return new Date(`${dataISO}T${horaHHmm}:00`).getTime();
}

function inicioFimDoMes(ano, mes) {
  // mes: 1-12
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0));
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

function inicioFimDaSemana(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  const diaSemana = d.getUTCDay(); // 0 = domingo
  const inicio = new Date(d);
  inicio.setUTCDate(d.getUTCDate() - diaSemana);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

module.exports = {
  DIAS_SEMANA,
  hojeISO,
  diaDaSemana,
  paraMinutos,
  paraHHmm,
  intervalosSeSobrepoe,
  dataHoraParaTimestamp,
  inicioFimDoMes,
  inicioFimDaSemana,
};
