const Kiosko = (() => {
  const estado = { tipoDocumento: null, documento: '', telefono: '', telefonoOmitido: false, ultimoTurno: null };
  let temporizadorRetorno = null;
  let docReimpresionSeleccionado = null;

  const mostrar = (idPaso) => {
    document.querySelectorAll('.paso').forEach((el) => el.classList.add('d-none'));
    document.getElementById(idPaso).classList.remove('d-none');
  };

  const construirTeclado = (contenedorId, onDigito, onBorrar, onLimpiar) => {
    const cont = document.getElementById(contenedorId);
    cont.innerHTML = '';
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement('button');
      b.textContent = n;
      b.type = 'button';
      b.onclick = () => onDigito(n);
      cont.appendChild(b);
    }
    const bc = document.createElement('button'); bc.textContent = 'C'; bc.type = 'button'; bc.className = 'tecla-c'; bc.onclick = onLimpiar; cont.appendChild(bc);
    const b0 = document.createElement('button'); b0.textContent = '0'; b0.type = 'button'; b0.onclick = () => onDigito(0); cont.appendChild(b0);
    const bb = document.createElement('button'); bb.type = 'button'; bb.innerHTML = '<i class="bi bi-backspace"></i>'; bb.onclick = onBorrar; cont.appendChild(bb);
  };

  const reglaDocumento = () => window.HnalDocumentos[estado.tipoDocumento] || { min: 6, max: 12 };

  let campoActivo = 'documento';
  const refrescarCampos = () => {
    document.getElementById('input-documento').value = estado.documento;
    document.getElementById('input-telefono').value = estado.telefono;
    document.getElementById('estado-telefono').textContent = estado.telefonoOmitido
      ? 'Sin teléfono registrado (omitido por el usuario).' : '';
    validarDocumentoEnVivo();
  };

  const validarDocumentoEnVivo = () => {
    const regla = reglaDocumento();
    const err = document.getElementById('error-documento');
    if (estado.documento.length > 0 && estado.documento.length < regla.min) {
      err.textContent = regla.mensaje;
    } else {
      err.textContent = '';
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    Store.pronto.then(() => {
      verificarJornada();
      Store.onCambio(verificarJornada);
    });

    document.getElementById('input-documento').addEventListener('click', () => (campoActivo = 'documento'));
    document.getElementById('input-telefono').addEventListener('click', () => (campoActivo = 'telefono'));

    construirTeclado('keypad',
      (n) => {
        const regla = reglaDocumento();
        if (campoActivo === 'documento') {
          if (estado.documento.length >= regla.max) return;
          estado.documento += n;
        } else {
          estado.telefonoOmitido = false;
          estado.telefono = (estado.telefono + n).slice(0, 9);
        }
        refrescarCampos();
      },
      () => { estado[campoActivo] = estado[campoActivo].slice(0, -1); refrescarCampos(); },
      () => { estado[campoActivo] = ''; refrescarCampos(); }
    );

    construirTeclado('keypad-reimpresion',
      (n) => { docReimpresionSeleccionado = ((docReimpresionSeleccionado || '') + n).slice(0, 12); document.getElementById('input-doc-reimpresion').value = docReimpresionSeleccionado; },
      () => { docReimpresionSeleccionado = (docReimpresionSeleccionado || '').slice(0, -1); document.getElementById('input-doc-reimpresion').value = docReimpresionSeleccionado; },
      () => { docReimpresionSeleccionado = ''; document.getElementById('input-doc-reimpresion').value = ''; }
    );
  });

  const resetReimpresion = () => {
    docReimpresionSeleccionado = '';
    const input = document.getElementById('input-doc-reimpresion');
    const resultado = document.getElementById('resultado-reimpresion');
    if (input) input.value = '';
    if (resultado) resultado.innerHTML = '';
  };

  const verificarJornada = () => {
    const cerrada = Store.jornada().estado !== 'activa';
    document.getElementById('overlay-cerrado').classList.toggle('d-none', !cerrada);
  };

  const mostrarResultadoReimpresion = (turno) => {
    const box = document.getElementById('resultado-reimpresion');
    if (!turno) {
      box.innerHTML = `<p class="text-warning small mb-0"><i class="bi bi-exclamation-circle"></i> No se encontró un turno activo con ese documento.</p>`;
      return;
    }
    box.innerHTML = `
      <div class="ticket-box p-3 text-center">
        <div class="fw-bold mb-1">${turno.codigo}</div>
        <div class="small text-muted mb-2">Posición en cola: #${turno.posicion ?? '-'}</div>
        <button class="btn btn-warning w-100" onclick="Kiosko.imprimirReimpreso('${turno.id}')"><i class="bi bi-printer"></i> Imprimir ticket</button>
      </div>`;
  };

  const imprimirTicketGenerico = ({ codigo, tipo, hora, posicion }) => {
    document.getElementById('imp-codigo').textContent = codigo;
    document.getElementById('imp-tipo').textContent = tipo === 'preferencial' ? 'Atención preferencial' : 'Atención general';
    document.getElementById('imp-hora').textContent = hora;
    document.getElementById('imp-posicion').textContent = `#${posicion ?? '-'}`;
    window.print();
  };

  return {
    ir(paso) {
      clearInterval(temporizadorRetorno);
      if (paso === 'paso-reimpresion') resetReimpresion();
      mostrar(paso);
    },

    elegirDocumento(tipo) {
      estado.tipoDocumento = tipo;
      estado.documento = ''; estado.telefono = ''; estado.telefonoOmitido = false;
      document.getElementById('doc-tipo-actual').textContent = tipo;
      refrescarCampos();
      mostrar('paso-datos');
    },

    omitirTelefono() {
      if (!confirm('¿Desea registrar su turno sin número de teléfono? No recibirá notificaciones por SMS/llamada.')) return;
      estado.telefono = '';
      estado.telefonoOmitido = true;
      refrescarCampos();
    },

    avanzarADatos() {
      const regla = reglaDocumento();
      if (estado.documento.length < regla.min || estado.documento.length > regla.max) {
        alert(regla.mensaje);
        return;
      }
      if (!estado.telefono && !estado.telefonoOmitido) {
        alert('Ingrese un teléfono de contacto o presione "Omitir teléfono" si no desea registrarlo.');
        return;
      }
      mostrar('paso-atencion');
    },

    registrar(tipoAtencion) {
      try {
        const turno = Store.registrarTurno({
          tipoDocumento: estado.tipoDocumento,
          numeroDocumento: estado.documento,
          telefono: estado.telefono,
          atencion: tipoAtencion,
        });
        estado.ultimoTurno = turno;
        this.mostrarTicket(turno);
      } catch (err) {
        alert(err.message);
        mostrar('paso-inicio');
      }
    },

    mostrarTicket(turno) {
      const cabecera = document.getElementById('ticket-header');
      cabecera.className = `ticket-header ${turno.tipo}`;
      document.getElementById('ticket-tipo').textContent = turno.tipo === 'preferencial' ? 'Preferencial' : 'General';
      document.getElementById('ticket-hora').textContent = HnalUtils.formatoHora();
      document.getElementById('ticket-codigo').textContent = turno.codigo;

      const cola = Store.colaEnEspera();
      const posicion = cola.findIndex((t) => t.id === turno.id) + 1;
      document.getElementById('ticket-posicion').textContent = `#${posicion}`;
      document.getElementById('ticket-nota').textContent = turno.telefono
        ? `Recibirá una notificación por llamada y SMS al número ${turno.telefono} cuando su turno esté próximo.`
        : 'No registró teléfono: siga la pantalla de TV para conocer cuándo será llamado.';

      mostrar('paso-ticket');

      let segundos = 15;
      const spanCuenta = document.getElementById('cuenta-regresiva');
      spanCuenta.textContent = `(${segundos})`;
      clearInterval(temporizadorRetorno);
      temporizadorRetorno = setInterval(() => {
        segundos -= 1;
        spanCuenta.textContent = segundos > 0 ? `(${segundos})` : '';
        if (segundos <= 0) { clearInterval(temporizadorRetorno); mostrar('paso-inicio'); }
      }, 1000);
    },

    imprimir() {
      const hayPapel = Math.random() > 0.15;
      if (!hayPapel) {
        Store.reportarIncidencia({ tipo: 'Problema técnico', descripcion: 'Kiosko sin papel para impresión de tickets.', modulo: 'Kiosko' });
        alert('No hay papel disponible en la impresora. Se ha notificado al Panel de Administración. Puede seguir su turno desde la pantalla de TV.');
        return;
      }
      const turno = estado.ultimoTurno;
      const cola = Store.colaEnEspera();
      const posicion = cola.findIndex((t) => t.id === turno.id) + 1;
      imprimirTicketGenerico({ codigo: turno.codigo, tipo: turno.tipo, hora: HnalUtils.formatoHora(), posicion });
    },

    buscarReimpresion() {
      const resultado = Store.buscarTurnoActivoPorDocumento(docReimpresionSeleccionado || '');
      mostrarResultadoReimpresion(resultado);
    },

    imprimirReimpreso(idTurno) {
      const turno = Store.turnos().find((t) => t.id === idTurno);
      if (!turno) return;
      const cola = Store.colaEnEspera();
      const posicion = cola.findIndex((t) => t.id === turno.id) + 1;
      imprimirTicketGenerico({ codigo: turno.codigo, tipo: turno.tipo, hora: HnalUtils.formatoHora(), posicion });
      resetReimpresion();
      mostrar('paso-inicio');
    },
  };
})();
