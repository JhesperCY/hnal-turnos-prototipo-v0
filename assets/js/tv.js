const TV = {
  render() {
    document.getElementById('overlay-cerrado').classList.toggle('d-none', Store.jornada().estado === 'activa');
    const cola = Store.colaEnEspera();
    const generales = cola.filter((t) => t.tipo === 'general');
    const preferenciales = cola.filter((t) => t.tipo === 'preferencial');
    const ultimos = Store.ultimosLlamados(3);

    document.getElementById('total-general').textContent = generales.length;
    document.getElementById('total-preferencial').textContent = preferenciales.length;
    document.getElementById('lista-general').innerHTML = generales.slice(0, 3)
      .map((t, i) => `<div>#${i + 1} ${t.codigo}</div>`).join('') || '<div class="text-white-50">Sin turnos</div>';
    document.getElementById('lista-preferencial').innerHTML = preferenciales.slice(0, 3)
      .map((t, i) => `<div>#${i + 1} ${t.codigo}</div>`).join('') || '<div class="text-white-50">Sin turnos</div>';

    document.getElementById('lista-llamados').innerHTML = ultimos
      .map((t) => `<div class="hnal-flex-between border-top border-light pt-1 mt-1"><span>${t.codigo}</span><small class="text-white-50">Mód. ${t.moduloAsignado ?? '-'}</small></div>`)
      .join('') || '<div class="text-white-50">Aún no hay llamados</div>';

    const [ultimoLlamado] = ultimos;
    if (ultimoLlamado && ultimoLlamado.estado !== 'atendido') {
      document.getElementById('llamado-tipo').textContent =
        ultimoLlamado.tipo === 'preferencial' ? 'Atención preferencial · Diríjase al módulo' : 'Atención general · Diríjase al módulo';
      document.getElementById('llamado-codigo').textContent = ultimoLlamado.codigo;
      document.getElementById('llamado-modulo').innerHTML = `<span class="fs-5">Módulo ${ultimoLlamado.moduloAsignado}</span>`;
    } else {
      document.getElementById('llamado-tipo').textContent = 'Esperando turnos...';
      document.getElementById('llamado-codigo').textContent = '—';
      document.getElementById('llamado-modulo').innerHTML = '';
    }
  },

  reloj() {
    const ahora = new Date();
    document.getElementById('reloj').textContent = HnalUtils.formatoHora(ahora);
    document.getElementById('fecha').textContent = HnalUtils.formatoFechaLarga(ahora);
  },
};

Store.pronto.then(() => {
  TV.render();
  TV.reloj();
  setInterval(() => TV.reloj(), 1000);
  Store.onCambio(() => TV.render());
});
