const CANAL = (() => {
  try { return new BroadcastChannel('hnal_sistema'); } catch { return null; }
})();

let cache = {};
let conectado = true;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const clamp = (valor, min, max) => Math.min(Math.max(valor, min), max);

const minutosDesde = (isoString) => (Date.now() - new Date(isoString).getTime()) / 60000;

const formatoHora = (fecha = new Date()) =>
  new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(fecha);

const formatoFechaLarga = (fecha = new Date()) =>
  new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(fecha);

function actualizarIndicadorConexion() {
  let el = document.getElementById('hnal-estado-conexion');
  if (!el && document.body) {
    el = document.createElement('div');
    el.id = 'hnal-estado-conexion';
    el.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:3000;padding:4px 12px;'
      + 'border-radius:999px;font:600 11px system-ui,sans-serif;color:#fff;opacity:.9;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;';
    document.body.appendChild(el);
  }
  if (!el) return;
  el.textContent = conectado ? 'Servidor conectado' : 'Sin conexión con el servidor';
  el.style.background = conectado ? '#1e8e5a' : '#c0392b';
}

function leer(clave, porDefecto) {
  return clave in cache ? cache[clave] : porDefecto;
}

function escribir(clave, valor) {
  cache[clave] = valor;
  CANAL?.postMessage({ clave, ts: Date.now() });
  window.dispatchEvent(new CustomEvent('hnal:cambio', { detail: { clave } }));
  fetch(`/api/estado/${encodeURIComponent(clave)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valor),
  }).then(() => { conectado = true; actualizarIndicadorConexion(); })
    .catch(() => { conectado = false; actualizarIndicadorConexion(); });
}

async function obtenerEstadoRemoto() {
  const resp = await fetch('/api/estado', { cache: 'no-store' });
  if (!resp.ok) throw new Error('Respuesta no válida del servidor');
  return resp.json();
}

async function sincronizarConServidor() {
  try {
    const remoto = await obtenerEstadoRemoto();
    cache = { ...cache, ...remoto };
    conectado = true;
    actualizarIndicadorConexion();
    window.dispatchEvent(new CustomEvent('hnal:cambio', { detail: { clave: '*' } }));
  } catch {
    conectado = false;
    actualizarIndicadorConexion();
  }
}

function semillas() {
  if (!leer('inicializado', false)) {
    escribir('usuarios', [
      { usuario: 'modulo1', clave: '1234', rol: 'modulo', nombre: 'Personal Módulo 1' },
      { usuario: 'modulo2', clave: '1234', rol: 'modulo', nombre: 'Personal Módulo 2' },
      { usuario: 'modulo3', clave: '1234', rol: 'modulo', nombre: 'Personal Módulo 3' },
      { usuario: 'supervisor', clave: 'admin123', rol: 'supervisor', nombre: 'Supervisor de Área' },
    ]);
    escribir('modulos', [1, 2, 3].map((n) => ({
      numero: n, estado: 'disponible', turnoActivoId: null, sesionActiva: false,
      atendidosHoy: 0, sumaTiempos: 0,
    })));
    escribir('turnos', []);
    escribir('incidencias', []);
    escribir('reportes', []);
    escribir('jornada', { estado: 'activa', abiertaDesde: new Date().toISOString() });
    escribir('secuencia', { G: 0, P: 0, fecha: new Date().toDateString() });
    escribir('inicializado', true);
  }
}

const Store = {
  usuarios: () => leer('usuarios', []),
  modulos: () => leer('modulos', []),
  turnos: () => leer('turnos', []),
  incidencias: () => leer('incidencias', []),
  reportes: () => leer('reportes', []),
  jornada: () => leer('jornada', { estado: 'activa' }),

  onCambio(callback) {
    window.addEventListener('hnal:cambio', callback);
    if (CANAL) CANAL.onmessage = callback;
  },

  siguienteCodigo(tipo) {
    const seq = leer('secuencia', { G: 0, P: 0, fecha: new Date().toDateString() });
    if (seq.fecha !== new Date().toDateString()) { seq.G = 0; seq.P = 0; seq.fecha = new Date().toDateString(); }
    const letra = tipo === 'preferencial' ? 'P' : 'G';
    seq[letra] += 1;
    escribir('secuencia', seq);
    return `${letra}-${String(seq[letra]).padStart(3, '0')}`;
  },

  tiempoPromedioSistema() {
    const mods = this.modulos();
    const { totalAt, totalTiempo } = mods.reduce(
      (acc, m) => ({ totalAt: acc.totalAt + m.atendidosHoy, totalTiempo: acc.totalTiempo + m.sumaTiempos }),
      { totalAt: 0, totalTiempo: 0 }
    );
    return totalAt > 0 ? totalTiempo / totalAt : 7;
  },

  bonoPreferencial() {
    return clamp(2 * this.tiempoPromedioSistema(), 4, 15);
  },

  registrarTurno({ tipoDocumento, numeroDocumento, telefono, atencion }) {
    if (this.jornada().estado !== 'activa') throw new Error('El kiosko no está aceptando solicitudes (jornada cerrada).');
    const turno = {
      id: uid(),
      codigo: this.siguienteCodigo(atencion),
      tipo: atencion,
      tipoDocumento, numeroDocumento, telefono: telefono || null,
      estado: 'en_espera',
      horaRegistro: new Date().toISOString(),
      horaLlamado: null,
      moduloAsignado: null,
    };
    const turnos = [...this.turnos(), turno];
    escribir('turnos', turnos);
    return turno;
  },

  calcularUrgencia(turno) {
    const espera = minutosDesde(turno.horaRegistro);
    const bono = turno.tipo === 'preferencial' ? this.bonoPreferencial() : 0;
    return { urgencia: espera + bono, espera, bono };
  },

  colaEnEspera() {
    return this.turnos()
      .filter((t) => t.estado === 'en_espera')
      .map((t) => ({ ...t, ...this.calcularUrgencia(t) }))
      .sort((a, b) => b.urgencia - a.urgencia || new Date(a.horaRegistro) - new Date(b.horaRegistro));
  },

  buscarTurnoActivoPorDocumento(numeroDocumento) {
    const activo = this.turnos().find(
      (t) => t.numeroDocumento === numeroDocumento && ['en_espera', 'llamado'].includes(t.estado)
    );
    if (!activo) return null;
    const cola = this.colaEnEspera();
    const posicion = cola.findIndex((t) => t.id === activo.id) + 1;
    return { ...activo, posicion: posicion || null };
  },

  llamarSiguiente(numeroModulo) {
    const modulos = this.modulos();
    const modulo = modulos.find((m) => m.numero === numeroModulo);
    if (!modulo || modulo.turnoActivoId) return null;

    const cola = this.colaEnEspera();
    if (cola.length === 0) return null;
    const elegido = cola[0];

    const turnos = this.turnos().map((t) =>
      t.id === elegido.id ? { ...t, estado: 'llamado', horaLlamado: new Date().toISOString(), moduloAsignado: numeroModulo } : t
    );
    escribir('turnos', turnos);
    escribir('modulos', modulos.map((m) => (m.numero === numeroModulo ? { ...m, turnoActivoId: elegido.id } : m)));
    return elegido;
  },

  completarAtencion(numeroModulo) {
    const modulos = this.modulos();
    const modulo = modulos.find((m) => m.numero === numeroModulo);
    if (!modulo?.turnoActivoId) return;
    const turno = this.turnos().find((t) => t.id === modulo.turnoActivoId);
    const duracion = turno ? minutosDesde(turno.horaLlamado) : 0;

    escribir('turnos', this.turnos().map((t) => (t.id === modulo.turnoActivoId ? { ...t, estado: 'atendido' } : t)));
    escribir('modulos', modulos.map((m) =>
      m.numero === numeroModulo
        ? { ...m, turnoActivoId: null, atendidosHoy: m.atendidosHoy + 1, sumaTiempos: m.sumaTiempos + duracion }
        : m
    ));
  },

  marcarAusente(numeroModulo) {
    const modulos = this.modulos();
    const modulo = modulos.find((m) => m.numero === numeroModulo);
    if (!modulo?.turnoActivoId) return;
    escribir('turnos', this.turnos().map((t) => (t.id === modulo.turnoActivoId ? { ...t, estado: 'ausente' } : t)));
    escribir('modulos', modulos.map((m) => (m.numero === numeroModulo ? { ...m, turnoActivoId: null } : m)));
  },

  turnoActivoDeModulo(numeroModulo) {
    const modulo = this.modulos().find((m) => m.numero === numeroModulo);
    if (!modulo?.turnoActivoId) return null;
    return this.turnos().find((t) => t.id === modulo.turnoActivoId) || null;
  },

  ultimosLlamados(n = 5) {
    return this.turnos()
      .filter((t) => t.horaLlamado)
      .sort((a, b) => new Date(b.horaLlamado) - new Date(a.horaLlamado))
      .slice(0, n);
  },

  tomarSesionModulo(numeroModulo) {
    const modulos = this.modulos();
    const modulo = modulos.find((m) => m.numero === numeroModulo);
    if (!modulo || modulo.sesionActiva) return false;
    escribir('modulos', modulos.map((m) => (m.numero === numeroModulo ? { ...m, sesionActiva: true, estado: 'disponible' } : m)));
    return true;
  },
  liberarSesionModulo(numeroModulo) {
    const modulos = this.modulos();
    escribir('modulos', modulos.map((m) => (m.numero === numeroModulo ? { ...m, sesionActiva: false, estado: 'pausado' } : m)));
  },
  pausarModulo(numeroModulo, pausado = true) {
    escribir('modulos', this.modulos().map((m) => (m.numero === numeroModulo ? { ...m, estado: pausado ? 'pausado' : 'disponible' } : m)));
  },

  reportarIncidencia({ tipo, descripcion, modulo }) {
    const incidencia = {
      id: uid(), tipo, descripcion: descripcion || '', modulo,
      estado: 'pendiente', hora: new Date().toISOString(),
    };
    escribir('incidencias', [...this.incidencias(), incidencia]);
    return incidencia;
  },
  resolverIncidencia(id) {
    escribir('incidencias', this.incidencias().map((i) => (i.id === id ? { ...i, estado: 'resuelta' } : i)));
  },

  generarReporte(tipo = 'parcial') {
    const mods = this.modulos();
    const atendidos = this.turnos().filter((t) => t.estado === 'atendido');
    const reporte = {
      id: uid(), tipo, hora: new Date().toISOString(),
      totalAtendidos: atendidos.length,
      generales: atendidos.filter((t) => t.tipo === 'general').length,
      preferenciales: atendidos.filter((t) => t.tipo === 'preferencial').length,
      tiempoPromedio: Math.round(this.tiempoPromedioSistema()),
      incidencias: this.incidencias().length,
    };
    escribir('reportes', [reporte, ...this.reportes()]);
    return reporte;
  },

  cerrarJornada() {
    escribir('turnos', this.turnos().map((t) => (t.estado === 'llamado' ? { ...t, estado: 'ausente' } : t)));
    const reporte = this.generarReporte('cierre');
    escribir('modulos', this.modulos().map((m) => ({ ...m, sesionActiva: false, turnoActivoId: null, estado: 'pausado' })));
    escribir('jornada', { estado: 'cerrada', cerradaEl: new Date().toISOString() });
    return reporte;
  },

  reabrirJornada() {
    escribir('jornada', { estado: 'activa', abiertaDesde: new Date().toISOString() });
    escribir('modulos', this.modulos().map((m) => ({ ...m, estado: 'disponible' })));
  },

  agregarModulo() {
    const modulos = this.modulos();
    const siguienteNumero = modulos.length ? Math.max(...modulos.map((m) => m.numero)) + 1 : 1;
    escribir('modulos', [...modulos, {
      numero: siguienteNumero, estado: 'disponible', turnoActivoId: null, sesionActiva: false,
      atendidosHoy: 0, sumaTiempos: 0,
    }]);
    return siguienteNumero;
  },

  puedeEliminarModulo(numeroModulo) {
    const modulo = this.modulos().find((m) => m.numero === numeroModulo);
    return !!modulo && !modulo.sesionActiva && !modulo.turnoActivoId;
  },

  eliminarModulo(numeroModulo) {
    if (!this.puedeEliminarModulo(numeroModulo)) {
      throw new Error('No se puede eliminar un módulo con sesión activa o un turno en atención.');
    }
    escribir('modulos', this.modulos().filter((m) => m.numero !== numeroModulo));
  },

  autenticar(usuario, clave) {
    return this.usuarios().find((u) => u.usuario === usuario && u.clave === clave) || null;
  },
  crearUsuario(datos) {
    if (this.usuarios().some((u) => u.usuario === datos.usuario)) throw new Error('Ese usuario ya existe.');
    escribir('usuarios', [...this.usuarios(), datos]);
  },
  eliminarUsuario(usuario) {
    escribir('usuarios', this.usuarios().filter((u) => u.usuario !== usuario));
  },
};

window.Store = Store;
window.HnalUtils = { formatoHora, formatoFechaLarga, minutosDesde, clamp };

window.HnalDocumentos = {
  'DNI': { min: 8, max: 8, mensaje: 'El DNI debe tener 8 dígitos.' },
  'Carnet de Extranjería': { min: 9, max: 12, mensaje: 'El Carnet de Extranjería debe tener entre 9 y 12 dígitos.' },
  'Pasaporte': { min: 6, max: 12, mensaje: 'El Pasaporte debe tener entre 6 y 12 dígitos.' },
};

Store.pronto = (async () => {
  try {
    cache = await obtenerEstadoRemoto();
    conectado = true;
  } catch {
    cache = {};
    conectado = false;
  }
  actualizarIndicadorConexion();
  semillas();
})();

setInterval(sincronizarConServidor, 1500);
