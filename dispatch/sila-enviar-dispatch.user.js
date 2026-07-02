// ==UserScript==
// @name         SILA - Enviar a Dispatch
// @namespace    JDFlow
// @version      1.8
// @description  Enviar órdenes SILA a JD Flow Dispatch Board
// @match        *://*/MainSila/*
// @grant        GM_xmlhttpRequest
// @connect      oejjdtsvgzxjdabgvvbl.supabase.co
// @updateURL    https://raw.githubusercontent.com/SotoJr/jd-automation/main/dispatch/sila-enviar-dispatch.user.js
// @downloadURL  https://raw.githubusercontent.com/SotoJr/jd-automation/main/dispatch/sila-enviar-dispatch.user.js
// ==/UserScript==

(function () {
  'use strict';

  const SUPABASE_URL = 'https://oejjdtsvgzxjdabgvvbl.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_NnGQ-7eDHVNeNIgrVQg7UQ_kUiMy1ET';

  function crearBotonDispatch() {
    if (!window.location.href.includes('/MainSila/EntradasAlmacen')) return;
    if (document.getElementById('dispatch-button-container')) return;

    const container = document.createElement('div');
    container.id = 'dispatch-button-container';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '10px';
    container.style.marginLeft = '20px';

    const info = document.createElement('span');
    info.id = 'dispatch-selected-info';
    info.innerText = 'Selecciona una fila';
    info.style.fontSize = '12px';
    info.style.fontWeight = '600';
    info.style.color = '#555';

    const btn = document.createElement('button');
    btn.id = 'btn-enviar-dispatch';
    btn.innerText = 'Enviar a Dispatch';
    btn.disabled = true;

    btn.style.background = '#9ca3af';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.padding = '10px 14px';
    btn.style.fontWeight = 'bold';
    btn.style.cursor = 'not-allowed';

    btn.onclick = enviarADispatch;

    container.appendChild(info);
    container.appendChild(btn);

    const almacenSelect =
      document.querySelector('select[name*="Almacen"], select[id*="Almacen"]');

    const radioEnBodega = Array.from(document.querySelectorAll('label, span, div'))
      .find(el => el.textContent?.includes('En Bodega'));

    if (almacenSelect && almacenSelect.parentElement) {
      almacenSelect.parentElement.appendChild(container);
    } else if (radioEnBodega && radioEnBodega.parentElement) {
      radioEnBodega.parentElement.insertBefore(container, radioEnBodega);
    } else {
      container.style.position = 'fixed';
      container.style.top = '85px';
      container.style.right = '230px';
      container.style.zIndex = '99999';
      document.body.appendChild(container);
    }

    updateDispatchButtonState();
  }

  function getValueFromRow(row, columnName) {
    const cells = row.querySelectorAll('td');

    for (const cell of cells) {
      const aria = cell.getAttribute('aria-label') || '';

      if (aria.includes(`Column ${columnName}, Value`)) {
        return aria.split('Value')[1]?.trim() || cell.innerText.trim();
      }
    }

    return '';
  }

  function obtenerFilaSeleccionada() {
    const filaSeleccionada =
      document.querySelector('.dx-row.dx-data-row.dx-selection') ||
      document.querySelector('.dx-row.dx-data-row input[type="checkbox"]:checked')?.closest('.dx-row.dx-data-row') ||
      document.querySelector('.dx-row.dx-data-row.dx-state-hover');

    if (filaSeleccionada) return filaSeleccionada;

    const filas = document.querySelectorAll('.dx-row.dx-data-row');

    if (filas.length === 1) return filas[0];

    return null;
  }

  function updateDispatchButtonState() {
    const btn = document.getElementById('btn-enviar-dispatch');
    const info = document.getElementById('dispatch-selected-info');

    if (!btn || !info) return;

    const fila = obtenerFilaSeleccionada();

    if (!fila) {
      btn.disabled = true;
      btn.style.background = '#9ca3af';
      btn.style.cursor = 'not-allowed';
      info.innerText = 'Selecciona una fila';
      return;
    }

    const ordenTrabajo = getValueFromRow(fila, 'Orden Trabajo');
    const ordenCarga = getValueFromRow(fila, 'Orden Carga');

    if (!ordenTrabajo || !ordenCarga) {
      btn.disabled = true;
      btn.style.background = '#9ca3af';
      btn.style.cursor = 'not-allowed';
      info.innerText = 'OT/ODC no detectada';
      return;
    }

    btn.disabled = false;
    btn.style.background = '#2563eb';
    btn.style.cursor = 'pointer';

    info.innerText = `OT: ${ordenTrabajo} | ODC: ${ordenCarga}`;
  }

  function buscarOrdenExistente(ordenTrabajo, ordenCarga, callback) {
    const url =
      `${SUPABASE_URL}/rest/v1/dispatch_orders` +
      `?orden_trabajo=eq.${encodeURIComponent(ordenTrabajo)}` +
      `&orden_carga=eq.${encodeURIComponent(ordenCarga)}` +
      `&select=id,orden_trabajo,orden_carga,status`;

    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      onload: function (response) {
        if (response.status >= 200 && response.status < 300) {
          const data = JSON.parse(response.responseText || '[]');
          callback(null, data);
        } else {
          callback(new Error(response.responseText), null);
        }
      },
      onerror: function (error) {
        callback(error, null);
      }
    });
  }

  function insertarOrden(nuevaOrden) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${SUPABASE_URL}/rest/v1/dispatch_orders`,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      data: JSON.stringify(nuevaOrden),
      onload: function (response) {
        console.log('STATUS:', response.status);
        console.log('RESPONSE:', response.responseText);

        if (response.status >= 200 && response.status < 300) {
          alert('Orden enviada a Dispatch correctamente');
        } else {
          alert('Error al enviar a Dispatch: ' + response.status);
        }
      },
      onerror: function (error) {
        alert('Error de conexión con Supabase');
        console.error('GM ERROR:', error);
      }
    });
  }

    function extraerTrackingDesdeOrdenTrabajo(row) {
  const cells = row.querySelectorAll('td');

  for (const cell of cells) {
    const aria = cell.getAttribute('aria-label') || '';

    if (aria.includes('Column Orden Trabajo, Value')) {
      const texto = cell.innerText || '';

      // Remover la OT de 7 dígitos
      const sinOT = texto.replace(/\b\d{7}\b/, '').trim();

      // Buscar tracking después de carrier
      const carrierMatch = sinOT.match(/(?:FedEx|UPS|DHL|USPS|TForce|Estes|ABF|XPO|Old Dominion|Saia)?\s*:?\s*([A-Z0-9\-\/]{8,})/i);

      if (carrierMatch && carrierMatch[1]) {
        return carrierMatch[1].trim();
      }

      return '';
    }
  }

  return '';
}

  function enviarADispatch() {
  const fila = obtenerFilaSeleccionada();

  if (!fila) {
    alert('Selecciona una fila antes de enviar a Dispatch.');
    return;
  }

  const cliente = getValueFromRow(fila, 'Cliente');
  const ordenTrabajo = getValueFromRow(fila, 'Orden Trabajo');
  const ordenCarga = getValueFromRow(fila, 'Orden Carga');
  const tracking = extraerTrackingDesdeOrdenTrabajo(fila);
  const tarimas = Number(getValueFromRow(fila, 'Cant.')) || 0;
  const almacen = getValueFromRow(fila, 'Almacen');
  const transportista = '';
  const referencia1 = getValueFromRow(fila, 'Referencia #1');
  const referencia2 = getValueFromRow(fila, 'Referencia #2');
  const referencia3 = getValueFromRow(fila, 'Referencia #3');
  const observaciones = getValueFromRow(fila, 'Observaciones');

  const jdUser =
    sessionStorage.getItem('username') ||
    sessionStorage.getItem('user') ||
    'SILA';

  const nuevaOrden = {
    cliente: cliente,
    orden_trabajo: ordenTrabajo,
    orden_carga: ordenCarga,
    almacen: almacen,
    transportista: transportista,
    referencia_1: referencia1,
    referencia_2: referencia2,
    referencia_3: referencia3,
    observaciones: observaciones,
    tracking: tracking,
    tarimas: tarimas,
    comentarios: 'Orden enviada automáticamente desde SILA',
    status: 'GENERADO',
    procesado_por: jdUser,
    revisado_por_sd: '',
    paquete_url: '',
    created_by: jdUser,
    generated_at: new Date().toISOString()
  };

  console.log('Usuario JD detectado:', jdUser);
  console.log('Orden detectada:', nuevaOrden);

  if (!cliente || !ordenTrabajo || !ordenCarga) {
    alert('Faltan datos obligatorios: cliente, OT u ODC. Revisa la fila seleccionada.');
    return;
  }

  buscarOrdenExistente(ordenTrabajo, ordenCarga, function (error, existentes) {
    if (error) {
      alert('No se pudo validar si la orden ya existe.');
      console.error('Error validando duplicado:', error);
      return;
    }

    if (existentes && existentes.length > 0) {
      const existente = existentes[0];

      alert(
        `Esta orden ya fue enviada a Dispatch.\n\n` +
        `OT: ${existente.orden_trabajo}\n` +
        `ODC: ${existente.orden_carga}\n` +
        `Status actual: ${existente.status}`
      );

      return;
    }

    insertarOrden(nuevaOrden);
  });
}

  setInterval(crearBotonDispatch, 2000);
  setInterval(updateDispatchButtonState, 1000);

  document.addEventListener('click', function () {
    setTimeout(updateDispatchButtonState, 300);
  });
})();
