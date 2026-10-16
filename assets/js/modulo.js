const sesion = JSON.parse(sessionStorage.getItem('hnal_sesion') || 'null');
if (!sesion || sesion.rol !== 'modulo') window.location.href = 'login.html';

const Modulo = {
  numero: Number(sessionStorage.getItem('hnal_modulo_num')) || null,

  init() {
    if (this.numero) return this.entrarPanel();
    this.renderSelectorModulo();
    Store.onCambio(() => { if (!this.numero) this.renderSelectorModulo(); });
  },

  renderSelectorModulo() {
    const cont = document.getElementById('opciones-modulo');
    cont.innerHTML = '';
    const modulos = Store.modulos();
    if (modulos.length === 0) {
      cont.innerHTML = '<p class="text-muted">El supervisor aún no ha habilitado módulos de atención.</p>';
      return;
    }
    modulos.forEach((m) => {
      const card = document.createElement('div');
      card.className = `modulo-select-card ${m.sesionActiva ? 'ocupado' : ''}`;
      card.innerHTML = `
        <i class="bi bi-display"></i>
        <div class="numero">Módulo ${m.numero}</div>
        <span class="estado-chip">${m.sesionActiva ? 'En uso' : 'Disponible'}</span>`;
      if (!m.sesionActiva) {
        card.onclick = () => {
          if (Store.tomarSesionModulo(m.numero)) {
            this.numero = m.numero;
            sessionStorage.setItem('hnal_modulo_num', m.numero);
            this.entrarPanel();
          }
        };
      }
      cont.appendChild(card);
    });
  },

  entrarPanel() {
    document.getElementById('selector-modulo').classList.add('d-none');
    document.getElementById('panel-principal').classList.remove('d-none');
    document.getElementById('numero-modulo').textContent = this.numero;
    this.render();
    Store.onCambio(() => this.render());
    window.addEventListener('beforeunload', () => Store.liberarSesionModulo(this.numero));
  },

  render() {
    const jornadaCerrada = Store.jornada().estado !== 'activa';
    document.getElementById('overlay-cerrado').classList.toggle('d-none', !jornadaCerrada);

    const modulo = Store.modulos().find((m) => m.numero === this.numero);
    if (!modulo) return;

    const pausado = modulo.estado === 'pausado';
    document.getElementById('punto-estado').style.color = pausado ? '#c0392b' : '#1e8e5a';
    document.getElementById('texto-estado').textContent = pausado ? 'Pausado' : 'Disponible';
    document.getElementById('btn-pausar').textContent = pausado ? 'Reanudar módulo' : 'Pausar módulo';
    document.getElementById('atendidos-hoy').textContent = modulo.atendidosHoy;
    document.getElementById('tiempo-prom').textContent = modulo.atendidosHoy
      ? Math.round(modulo.sumaTiempos / modulo.atendidosHoy) : '-';

    const turno = Store.turnoActivoDeModulo(this.numero);
    document.getElementById('sin-turno').classList.toggle('d-none', !!turno);
    document.getElementById('con-turno').classList.toggle('d-none', !turno);
    if (turno) {
      document.getElementById('codigo-turno-activo').textContent = turno.codigo;
      document.getElementById('hora-llamado').textContent = HnalUtils.formatoHora(new Date(turno.horaLlamado));
      const badge = document.getElementById('badge-tipo-turno');
      badge.textContent = turno.tipo === 'preferencial' ? 'Preferencial' : 'General';
      badge.className = `badge mb-2 ${turno.tipo === 'preferencial' ? 'bg-warning text-dark' : 'bg-info text-dark'}`;
    }
    document.getElementById('btn-llamar').disabled = !!turno || pausado || jornadaCerrada;
    document.getElementById('btn-completar').disabled = !turno || jornadaCerrada;
    document.getElementById('btn-ausente').disabled = !turno || jornadaCerrada;

    const cola = Store.colaEnEspera();
    document.getElementById('total-en-cola').textContent = cola.length;
    document.getElementById('bono-actual').textContent = Store.bonoPreferencial().toFixed(1);
    const lista = document.getElementById('lista-cola');
    lista.innerHTML = cola.slice(0, 5).map((t, i) => `
      <div class="cola-item ${i === 0 ? 'top' : ''}">
        <div class="d-flex align-items-center gap-2">
          <span class="badge-pos">${i + 1}</span>
          <span class="fw-bold">${t.codigo}</span>
          ${t.tipo === 'preferencial' ? '<i class="bi bi-universal-access-circle" title="Preferencial"></i>' : '<i class="bi bi-person" title="General"></i>'}
        </div>
        <div class="text-end small text-muted">
          ${t.espera.toFixed(1)} min
          <span class="ms-2 fw-bold text-warning">${t.urgencia.toFixed(1)}</span>
        </div>
      </div>`).join('') || '<p class="text-muted small mb-0">Sin turnos en espera.</p>';
  },

  llamarSiguiente() {
    const turno = Store.llamarSiguiente(this.numero);
    if (!turno) alert('No hay turnos en espera o ya tiene un turno activo.');
    this.render();
  },

  completarAtencion() { Store.completarAtencion(this.numero); this.render(); },

  marcarAusente() {
    if (!confirm('¿Marcar este turno como ausente? El usuario deberá volver a solicitar un turno.')) return;
    Store.marcarAusente(this.numero);
    this.render();
  },

  togglePausa() {
    const modulo = Store.modulos().find((m) => m.numero === this.numero);
    Store.pausarModulo(this.numero, modulo.estado !== 'pausado');
    this.render();
  },

  reportarIncidencia() {
    const tipo = document.getElementById('tipo-incidencia').value;
    const descripcion = document.getElementById('desc-incidencia').value;
    Store.reportarIncidencia({ tipo, descripcion, modulo: `Módulo ${this.numero}` });
    if (tipo === 'Pausa por incidente') Store.pausarModulo(this.numero, true);
    document.getElementById('desc-incidencia').value = '';
    alert('Incidencia registrada. El supervisor la revisará en el Panel de Admin.');
    this.render();
  },

  cerrarSesion() {
    if (this.numero) Store.liberarSesionModulo(this.numero);
    sessionStorage.removeItem('hnal_modulo_num');
    sessionStorage.removeItem('hnal_sesion');
    window.location.href = 'login.html';
  },
};

Store.pronto.then(() => Modulo.init());
