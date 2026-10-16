const sesionAdmin = JSON.parse(sessionStorage.getItem('hnal_sesion') || 'null');
if (!sesionAdmin || sesionAdmin.rol !== 'supervisor') window.location.href = 'login.html';

const Admin = {
  tabActual: 'resumen',

  init() {
    this.render();
    Store.onCambio(() => this.render());
  },

  tab(nombre) {
    this.tabActual = nombre;
    document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === nombre));
    ['resumen', 'incidencias', 'reporte', 'usuarios'].forEach((t) =>
      document.getElementById(`tab-${t}`).classList.toggle('d-none', t !== nombre)
    );
    this.render();
  },

  render() {
    this.renderBadgeJornada();
    if (this.tabActual === 'resumen') this.renderResumen();
    if (this.tabActual === 'incidencias') this.renderIncidencias();
    if (this.tabActual === 'reporte') this.renderReportes();
    if (this.tabActual === 'usuarios') { this.renderUsuarios(); this.renderGestionModulos(); }
  },

  renderBadgeJornada() {
    const jornada = Store.jornada();
    const activa = jornada.estado === 'activa';
    const badge = document.getElementById('badge-jornada');
    badge.innerHTML = `<i class="bi bi-circle-fill"></i> ${activa ? 'Sistema activo' : 'Jornada cerrada'}`;
    badge.className = `badge ${activa ? 'bg-success' : 'bg-secondary'}`;

    const btn = document.getElementById('btn-jornada');
    if (btn) {
      btn.innerHTML = activa
        ? '<i class="bi bi-lock"></i> Emitir cierre de jornada'
        : '<i class="bi bi-unlock"></i> Abrir jornada';
      btn.style.background = activa ? '#0a2b32' : '#1e8e5a';
    }
  },

  renderResumen() {
    const cola = Store.colaEnEspera();
    const generales = cola.filter((t) => t.tipo === 'general');
    const preferenciales = cola.filter((t) => t.tipo === 'preferencial');
    const modulos = Store.modulos();
    const disponibles = modulos.filter((m) => m.estado === 'disponible' && m.sesionActiva).length;
    const pendientes = Store.incidencias().filter((i) => i.estado === 'pendiente').length;
    const atendidosHoy = modulos.reduce((acc, m) => acc + m.atendidosHoy, 0);

    document.getElementById('m-general').textContent = generales.length;
    document.getElementById('m-preferencial').textContent = preferenciales.length;
    document.getElementById('m-modulos').textContent = `${disponibles}/${modulos.length}`;
    document.getElementById('m-incidencias').textContent = pendientes;

    document.getElementById('p-promedio').textContent = `${Math.round(Store.tiempoPromedioSistema())} min`;
    document.getElementById('p-bono').textContent = `+${Store.bonoPreferencial().toFixed(1)} min`;
    document.getElementById('p-atendidos').textContent = atendidosHoy;
    const mayor = cola[0];
    document.getElementById('p-mayor-urgencia').textContent = mayor ? `${mayor.codigo} (${mayor.urgencia.toFixed(1)})` : '-';

    document.getElementById('p-chips').innerHTML = cola.slice(0, 8)
      .map((t, i) => `<span class="chip ${i === 0 ? 'urgente' : ''}">${t.codigo} · ${t.urgencia.toFixed(1)}</span>`)
      .join('') || '<span class="text-muted small">Sin turnos en espera.</span>';

    document.getElementById('tabla-modulos').innerHTML = modulos.map((m) => {
      const turno = Store.turnoActivoDeModulo(m.numero);
      const prom = m.atendidosHoy ? Math.round(m.sumaTiempos / m.atendidosHoy) : 0;
      return `<tr>
        <td>Módulo ${m.numero}</td>
        <td><span class="badge ${m.estado === 'disponible' ? 'bg-success' : 'bg-danger'}">${m.estado === 'disponible' ? 'Disponible' : 'Pausado'}</span></td>
        <td>${turno ? turno.codigo : '—'}</td>
        <td>${m.atendidosHoy}</td>
        <td>${prom} min</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="text-muted">No hay módulos habilitados. Agregue uno desde "Usuarios y módulos".</td></tr>';
  },

  renderIncidencias() {
    const incidencias = [...Store.incidencias()].sort((a, b) => new Date(b.hora) - new Date(a.hora));
    document.getElementById('badge-pendientes').textContent = `${incidencias.filter((i) => i.estado === 'pendiente').length} pendientes`;
    document.getElementById('lista-incidencias').innerHTML = incidencias.map((i) => `
      <div class="hnal-card mb-2 ${i.estado === 'pendiente' ? 'border border-warning' : ''}">
        <div class="hnal-flex-between">
          <div>
            <span class="fw-bold">${i.tipo}</span>
            <span class="badge ${i.estado === 'pendiente' ? 'bg-warning text-dark' : 'bg-success'} ms-2">${i.estado === 'pendiente' ? 'Pendiente' : 'Resuelta'}</span>
            <p class="mb-0 small text-muted">${i.descripcion || '(sin descripción)'}</p>
            <small class="text-muted"><i class="bi bi-display"></i> ${i.modulo} &middot; <i class="bi bi-clock"></i> ${HnalUtils.formatoHora(new Date(i.hora))}</small>
          </div>
          ${i.estado === 'pendiente' ? `<button class="btn btn-sm btn-outline-success" onclick="Admin.resolver('${i.id}')">Marcar resuelta</button>` : ''}
        </div>
      </div>`).join('') || '<p class="text-muted">No hay incidencias registradas.</p>';
  },

  resolver(id) { Store.resolverIncidencia(id); this.render(); },

  renderReportes() {
    const reportes = Store.reportes();
    document.getElementById('total-reportes').textContent = reportes.length;
    document.getElementById('tabla-reportes').innerHTML = reportes.map((r, i) => `
      <tr>
        <td>${reportes.length - i}</td>
        <td><span class="badge ${r.tipo === 'cierre' ? 'bg-dark' : 'bg-info text-dark'}">${r.tipo === 'cierre' ? 'Cierre' : 'Parcial'}</span></td>
        <td>${HnalUtils.formatoHora(new Date(r.hora))}</td>
        <td class="fw-bold">${r.totalAtendidos}</td>
        <td>${r.generales}</td>
        <td>${r.preferenciales}</td>
        <td>${r.tiempoPromedio} min</td>
        <td>${r.incidencias}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="text-muted">Sin reportes generados aún.</td></tr>';
  },

  reporteParcial() { Store.generarReporte('parcial'); this.render(); },

  toggleJornada() {
    if (Store.jornada().estado === 'activa') {
      if (!confirm('¿Emitir cierre de jornada? Se bloqueará el kiosko, se marcarán ausencias pendientes y se generará el reporte diario.')) return;
      Store.cerrarJornada();
      alert('Jornada cerrada. Reporte diario generado y sesiones de módulo cerradas.');
    } else {
      if (!confirm('¿Abrir una nueva jornada? El kiosko, la TV y los módulos volverán a estar disponibles.')) return;
      Store.reabrirJornada();
      alert('Jornada abierta. El kiosko y los módulos ya pueden operar.');
    }
    this.render();
  },

  renderGestionModulos() {
    document.getElementById('tabla-gestion-modulos').innerHTML = Store.modulos().map((m) => {
      const puedeEliminar = Store.puedeEliminarModulo(m.numero);
      return `<tr>
        <td>Módulo ${m.numero}</td>
        <td><span class="badge ${m.estado === 'disponible' ? 'bg-success' : 'bg-danger'}">${m.estado === 'disponible' ? 'Disponible' : 'Pausado'}</span></td>
        <td>${m.sesionActiva ? '<span class="badge bg-warning text-dark">En uso</span>' : '<span class="badge bg-light text-dark">Libre</span>'}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" ${puedeEliminar ? '' : 'disabled title="No se puede quitar: tiene sesión o turno activo"'} onclick="Admin.eliminarModulo(${m.numero})">
            <i class="bi bi-trash"></i> Quitar
          </button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" class="text-muted">No hay módulos registrados.</td></tr>';
  },

  agregarModulo() {
    const numero = Store.agregarModulo();
    this.render();
    alert(`Módulo ${numero} habilitado. Ya aparece disponible en el kiosko y en el login del personal.`);
  },

  eliminarModulo(numero) {
    if (!confirm(`¿Quitar el Módulo ${numero}?`)) return;
    try { Store.eliminarModulo(numero); this.render(); }
    catch (err) { alert(err.message); }
  },

  renderUsuarios() {
    document.getElementById('tabla-usuarios').innerHTML = Store.usuarios().map((u) => `
      <tr>
        <td>${u.usuario}</td><td>${u.nombre || '-'}</td>
        <td><span class="badge bg-secondary">${u.rol === 'supervisor' ? 'Supervisor' : 'Personal de módulo'}</span></td>
        <td>${u.usuario !== sesionAdmin.usuario ? `<button class="btn btn-sm btn-outline-danger" onclick="Admin.eliminarUsuario('${u.usuario}')"><i class="bi bi-trash"></i></button>` : ''}</td>
      </tr>`).join('');
  },

  crearUsuario() {
    const usuario = document.getElementById('nu-usuario').value.trim();
    const clave = document.getElementById('nu-clave').value.trim();
    const nombre = document.getElementById('nu-nombre').value.trim();
    const rol = document.getElementById('nu-rol').value;
    if (!usuario || !clave) { alert('Usuario y contraseña son obligatorios.'); return; }
    try {
      Store.crearUsuario({ usuario, clave, nombre, rol });
      ['nu-usuario', 'nu-clave', 'nu-nombre'].forEach((id) => (document.getElementById(id).value = ''));
      this.render();
    } catch (err) { alert(err.message); }
  },

  eliminarUsuario(usuario) {
    if (!confirm(`¿Eliminar al usuario ${usuario}?`)) return;
    Store.eliminarUsuario(usuario);
    this.render();
  },

  cerrarSesion() {
    sessionStorage.removeItem('hnal_sesion');
    window.location.href = 'login.html';
  },
};

Store.pronto.then(() => Admin.init());
