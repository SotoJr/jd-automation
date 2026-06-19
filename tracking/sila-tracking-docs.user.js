// ==UserScript==
// @name         SILA Tracking + Docs
// @namespace    JDFlow
// @version      2.2
// @description  Tracking, hover ODC y descarga de documentos en SILA
// @match        *://*/MainSila/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/SotoJr/jd-automation/main/tracking/sila-tracking-docs.user.js
// @downloadURL  https://raw.githubusercontent.com/SotoJr/jd-automation/main/tracking/sila-tracking-docs.user.js
// ==/UserScript==

console.log("🚀 SILA Tools iniciado");

(function () {
  "use strict";

  if (!window.location.href.includes("/MainSila/EntradasAlmacen")) {
    console.log("SILA Tools no se carga fuera de Almacén");
    return;
  }

  if (window.__SILA_TOOLS_INTERVAL__) {
    clearInterval(window.__SILA_TOOLS_INTERVAL__);
  }

  const CONFIG = {
    SUPABASE_URL: "https://oejjdtsvgzxjdabgvvbl.supabase.co/rest/v1/tracking_records",
    SUPABASE_KEY: "sb_publishable_NnGQ-7eDHVNeNIgrVQg7UQ_kUiMy1ET",
    STORAGE_KEYS: {
      top: "silaButtonsTop",
      left: "silaButtonsLeft"
    },
    carriers: [
      "UPS",
      "FedEx",
      "FedEx Freight",
      "DHL",
      "USPS",
      "TForce Freight",
      "Estes",
      "ABF Freight",
      "XPO Logistics",
      "Old Dominion",
      "R+L Carriers",
      "Saia",
      "Daylight Transport",
      "Roadrunner",
      "Oak Harbor"
    ]
  };

  const STATE = {
    trackingRunning: false,
    odcCache: {},
    transportistasCache: {}
  };

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function esPantallaAlmacen() {
    return window.location.href.includes("/MainSila/EntradasAlmacen");
  }

  function apiHeaders(extra = {}) {
    return {
      apikey: CONFIG.SUPABASE_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
      ...extra
    };
  }

  function descargarBlob(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = nombreArchivo;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function getTrackingUrl(carrier, tracking) {
    const c = (carrier || "").toUpperCase().trim();
    const t = encodeURIComponent(tracking || "");

    if (c.includes("UPS")) return `https://www.ups.com/track?tracknum=${t}`;
    if (c.includes("FEDEX FREIGHT")) return `https://www.fedexfreight.com/en-us/tracking?trknbr=${t}`;
    if (c.includes("FEDEX")) return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
    if (c.includes("DHL")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`;
    if (c.includes("USPS")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
    if (c.includes("TFORCE")) return `https://www.tforcefreight.com/ltl/apps/Tracking?trackNumber=${t}`;
    if (c.includes("ESTES")) return `https://www.estes-express.com/myestes/shipment-tracking`;
    if (c.includes("ABF")) return `https://arcb.com/tools/tracking`;
    if (c.includes("XPO")) return `https://www.xpo.com/track/`;
    if (c.includes("OLD DOMINION")) return `https://www.odfl.com/us/en/tools/trace-track-shipments.html`;
    if (c.includes("R+L") || c.includes("RL CARRIERS")) return `https://www.rlcarriers.com/freight/shipping/shipment-tracing`;
    if (c.includes("SAIA")) return `https://www.saia.com/tracking`;
    if (c.includes("DAYLIGHT")) return `https://www.dylt.com/tools/shipment-tracing`;
    if (c.includes("ROADRUNNER")) return `https://www.rrts.com/tools/shipment-tracing`;
    if (c.includes("OAK HARBOR")) return `https://www.oakh.com/trace/`;

    return `https://www.google.com/search?q=${encodeURIComponent(carrier + " tracking " + tracking)}`;
  }

  function obtenerTextoCeldaPorColumna(fila, nombreColumna) {
    const celdas = Array.from(fila.querySelectorAll('[role="gridcell"]'));

    const celda = celdas.find(c => {
      const aria = c.getAttribute("aria-label") || "";
      return aria.toLowerCase().includes(nombreColumna.toLowerCase());
    });

    return celda ? celda.innerText.trim() : "";
  }

  function obtenerDatosFilaSeleccionada() {
    const filas = Array.from(document.querySelectorAll('[role="row"]'));

    function extraerOT(texto) {
      const match = String(texto || "").match(/\b\d{7}\b/);
      return match ? match[0] : null;
    }

    function extraerODC(texto) {
      const match = String(texto || "").match(/\b\d{6}\b/);
      return match ? match[0] : null;
    }

    function obtenerPorColumnas(fila, columnas) {
      for (const columna of columnas) {
        const valor = obtenerTextoCeldaPorColumna(fila, columna);
        if (valor) return valor;
      }
      return "";
    }

    for (const fila of filas) {
      const seleccionada =
        fila.className.includes("dx-selection") ||
        fila.className.includes("dx-row-focused") ||
        fila.getAttribute("aria-selected") === "true" ||
        fila.querySelector(".dx-checkbox-checked") ||
        fila.querySelector('[aria-checked="true"]');

      if (!seleccionada) continue;

      const textoOT = obtenerPorColumnas(fila, ["Orden Trabajo", "Orden de Trabajo"]);
      const textoODC = obtenerPorColumnas(fila, ["Orden Carga", "Orden de Carga"]);

      const ot = extraerOT(textoOT);
      const odc = extraerODC(textoODC);

      if (ot || odc) {
        console.log("✅ Fila seleccionada detectada:", { ot, odc });
        return { ot, odc };
      }
    }

    const filasConDatos = filas
      .map(fila => {
        const textoOT = obtenerPorColumnas(fila, ["Orden Trabajo", "Orden de Trabajo"]);
        const textoODC = obtenerPorColumnas(fila, ["Orden Carga", "Orden de Carga"]);

        return {
          ot: extraerOT(textoOT),
          odc: extraerODC(textoODC)
        };
      })
      .filter(x => x.ot || x.odc);

    if (filasConDatos.length === 1) {
      return {
        ot: filasConDatos[0].ot,
        odc: filasConDatos[0].odc
      };
    }

    return { ot: null, odc: null };
  }

  function obtenerOTSeleccionada() {
    return obtenerDatosFilaSeleccionada().ot;
  }

  function obtenerContenedorBotonesSila() {
    let contenedor = document.getElementById("sila-custom-buttons-container");

    if (contenedor) return contenedor;

    contenedor = document.createElement("div");
    contenedor.id = "sila-custom-buttons-container";

    contenedor.style.position = "fixed";
    contenedor.style.top = localStorage.getItem(CONFIG.STORAGE_KEYS.top) || "85px";
    contenedor.style.left = localStorage.getItem(CONFIG.STORAGE_KEYS.left) || "260px";
    contenedor.style.zIndex = "999999";
    contenedor.style.display = "flex";
    contenedor.style.alignItems = "center";
    contenedor.style.gap = "8px";
    contenedor.style.padding = "6px";
    contenedor.style.background = "rgba(255,255,255,0.90)";
    contenedor.style.border = "1px solid #ddd";
    contenedor.style.borderRadius = "10px";
    contenedor.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    contenedor.style.cursor = "move";

    hacerArrastrable(contenedor);
    document.body.appendChild(contenedor);

    return contenedor;
  }

  function hacerArrastrable(elemento) {
    let offsetX = 0;
    let offsetY = 0;
    let arrastrando = false;

    elemento.addEventListener("mousedown", function (e) {
      if (e.target.tagName === "BUTTON") return;

      arrastrando = true;
      offsetX = e.clientX - elemento.offsetLeft;
      offsetY = e.clientY - elemento.offsetTop;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", function (e) {
      if (!arrastrando) return;

      elemento.style.left = `${e.clientX - offsetX}px`;
      elemento.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener("mouseup", function () {
      if (!arrastrando) return;

      arrastrando = false;
      document.body.style.userSelect = "";

      localStorage.setItem(CONFIG.STORAGE_KEYS.left, elemento.style.left);
      localStorage.setItem(CONFIG.STORAGE_KEYS.top, elemento.style.top);
    });
  }

  function estiloBotonSuperior(btn) {
    btn.style.position = "static";
    btn.style.zIndex = "999999";
    btn.style.border = "none";
    btn.style.borderRadius = "8px";
    btn.style.padding = "10px 14px";
    btn.style.fontWeight = "bold";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    btn.style.whiteSpace = "nowrap";
  }

  async function obtenerTrackings() {
    const response = await fetch(`${CONFIG.SUPABASE_URL}?select=*`, {
      headers: apiHeaders()
    });

    const records = await response.json();

    if (!Array.isArray(records)) {
      console.error("❌ Supabase devolvió error:", records);
      return [];
    }

    return records;
  }

  function limpiarTrackingsVisuales() {
    document.querySelectorAll(".sila-tracking-link").forEach(el => el.remove());
  }

  async function cargarTrackings() {
    if (STATE.trackingRunning) return;

    STATE.trackingRunning = true;

    try {
      const records = await obtenerTrackings();
      const celdas = Array.from(document.querySelectorAll('[role="gridcell"]'));

      records.forEach(record => {
        const ot = String(record.orden_trabajo || "").trim();
        const tracking = String(record.tracking || "").trim();
        const carrier = String(record.carrier || "").trim();

        if (!ot || !tracking) return;

        const celdaOT = celdas.find(celda =>
          celda.innerText && celda.innerText.includes(ot)
        );

        if (!celdaOT) return;

        if (celdaOT.innerHTML.includes(`data-tracking-id="${record.id}"`)) return;

        const trackingUrl = getTrackingUrl(carrier, tracking);

        celdaOT.insertAdjacentHTML("beforeend", `
          <br class="sila-tracking-link" data-tracking-id="${record.id}">
          <a
            class="sila-tracking-link"
            data-tracking-id="${record.id}"
            href="${trackingUrl}"
            target="_blank"
            style="color:green;font-weight:bold;font-size:11px;text-decoration:none;"
          >
            📦 ${carrier}: ${tracking}
          </a>
        `);
      });
    } catch (error) {
      console.error("🔥 Error en SILA Tracking:", error);
    } finally {
      STATE.trackingRunning = false;
    }
  }

  function crearBotonTracking() {
    if (document.getElementById("sila-tracking-btn")) return;

    const btn = document.createElement("button");
    btn.id = "sila-tracking-btn";
    btn.innerText = "📦 Tracking";

    estiloBotonSuperior(btn);

    btn.style.background = "#0b4f6c";
    btn.style.color = "white";
    btn.onclick = abrirFormularioTracking;

    obtenerContenedorBotonesSila().appendChild(btn);
  }

  async function buscarTrackingPorOT(ordenTrabajo) {
    const ot = String(ordenTrabajo || "").trim();

    if (!ot) return null;

    const response = await fetch(
      `${CONFIG.SUPABASE_URL}?orden_trabajo=eq.${encodeURIComponent(ot)}&select=*`,
      { headers: apiHeaders() }
    );

    const records = await response.json();

    if (!Array.isArray(records)) {
      console.error("❌ Error buscando OT:", records);
      return null;
    }

    return records[0] || null;
  }

  function inicializarCarrierDropdown() {
    const search = document.getElementById("sila-carrier-search");
    const hidden = document.getElementById("sila-carrier");
    const options = document.getElementById("sila-carrier-options");

    if (!search || !hidden || !options) return;

    function renderOptions(filter = "") {
      const filtro = filter.toUpperCase().trim();

      const carriersFiltrados = CONFIG.carriers.filter(carrier =>
        carrier.toUpperCase().includes(filtro)
      );

      options.innerHTML = carriersFiltrados.map(carrier => `
        <div
          class="sila-carrier-option"
          data-carrier="${carrier}"
          style="padding:6px;cursor:pointer;border-bottom:1px solid #eee;"
        >
          ${carrier}
        </div>
      `).join("");

      options.style.display = carriersFiltrados.length ? "block" : "none";

      document.querySelectorAll(".sila-carrier-option").forEach(option => {
        option.onclick = () => {
          const carrier = option.getAttribute("data-carrier");
          search.value = carrier;
          hidden.value = carrier;
          options.style.display = "none";
        };

        option.onmouseenter = () => option.style.background = "#eef6fa";
        option.onmouseleave = () => option.style.background = "white";
      });
    }

    search.onfocus = () => renderOptions(search.value);

    search.oninput = () => {
      hidden.value = "";
      renderOptions(search.value);
    };

    search.onblur = () => {
      setTimeout(() => {
        const typed = search.value.trim();

        const exactMatch = CONFIG.carriers.find(c =>
          c.toUpperCase() === typed.toUpperCase()
        );

        if (exactMatch) {
          search.value = exactMatch;
          hidden.value = exactMatch;
        } else {
          search.value = "";
          hidden.value = "";
        }

        options.style.display = "none";
      }, 200);
    };
  }

  function setCarrierValue(carrier) {
    const value = carrier || "UPS";

    const search = document.getElementById("sila-carrier-search");
    const hidden = document.getElementById("sila-carrier");

    if (search) search.value = value;
    if (hidden) hidden.value = value;
  }

  function abrirFormularioTracking() {
    if (document.getElementById("sila-tracking-modal")) return;

    const modal = document.createElement("div");
    modal.id = "sila-tracking-modal";

    modal.innerHTML = `
      <div style="
        position: fixed;
        right: 20px;
        bottom: 80px;
        width: 330px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 10px;
        padding: 16px;
        z-index: 999999;
        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        font-family: Arial, sans-serif;
      ">
        <h3 style="margin-top:0; color:#0b4f6c;">📦 Tracking</h3>

        <label>Orden de Trabajo</label>
        <input id="sila-ot" type="text" style="width:100%; margin-bottom:8px; padding:6px;">

        <button id="sila-search-tracking" style="
          background:#444;color:white;border:none;border-radius:6px;
          padding:7px 10px;cursor:pointer;margin-bottom:10px;
        ">Buscar OT</button>

        <hr>

        <input id="sila-record-id" type="hidden">

        <label>Carrier</label>
        <input
          id="sila-carrier-search"
          type="text"
          placeholder="Buscar carrier..."
          autocomplete="off"
          style="width:100%; margin-bottom:4px; padding:6px;"
        >

        <div
          id="sila-carrier-options"
          style="
            display:none;
            max-height:140px;
            overflow-y:auto;
            border:1px solid #ccc;
            background:white;
            margin-bottom:8px;
            font-size:12px;
          "
        ></div>

        <input id="sila-carrier" type="hidden">

        <label>Tracking</label>
        <input id="sila-tracking" type="text" style="width:100%; margin-bottom:12px; padding:6px;">

        <button id="sila-save-tracking" style="
          background:#0b4f6c;color:white;border:none;border-radius:6px;
          padding:8px 12px;cursor:pointer;font-weight:bold;
        ">Guardar / Actualizar</button>

        <button id="sila-delete-tracking" style="
          margin-left:6px;background:#b00020;color:white;border:none;
          border-radius:6px;padding:8px 12px;cursor:pointer;
        ">Eliminar</button>

        <button id="sila-close-tracking" style="
          margin-left:6px;background:#999;color:white;border:none;
          border-radius:6px;padding:8px 12px;cursor:pointer;
        ">Cerrar</button>

        <div id="sila-tracking-msg" style="margin-top:10px; font-size:12px;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    inicializarCarrierDropdown();
    setCarrierValue("UPS");

    const otSeleccionada = obtenerOTSeleccionada();

    if (otSeleccionada) {
      document.getElementById("sila-ot").value = otSeleccionada;
      cargarTrackingEnFormulario();
    }

    document.getElementById("sila-search-tracking").onclick = cargarTrackingEnFormulario;
    document.getElementById("sila-save-tracking").onclick = guardarOActualizarTracking;
    document.getElementById("sila-delete-tracking").onclick = eliminarTracking;
    document.getElementById("sila-close-tracking").onclick = () => modal.remove();
  }

  async function cargarTrackingEnFormulario() {
    const ordenTrabajo = document.getElementById("sila-ot").value.trim();
    const msg = document.getElementById("sila-tracking-msg");

    if (!ordenTrabajo) {
      msg.style.color = "red";
      msg.innerText = "Captura una Orden de Trabajo.";
      return;
    }

    msg.style.color = "#333";
    msg.innerText = "Buscando...";

    const record = await buscarTrackingPorOT(ordenTrabajo);

    if (!record) {
      document.getElementById("sila-record-id").value = "";
      setCarrierValue("UPS");
      document.getElementById("sila-tracking").value = "";

      msg.style.color = "#b36b00";
      msg.innerText = "No existe tracking para esta OT. Puedes crear uno nuevo.";
      return;
    }

    document.getElementById("sila-record-id").value = record.id;
    setCarrierValue(record.carrier || "UPS");
    document.getElementById("sila-tracking").value = record.tracking || "";

    msg.style.color = "green";
    msg.innerText = "✅ Tracking encontrado. Puedes editarlo o eliminarlo.";
  }

  async function guardarOActualizarTracking() {
    const id = document.getElementById("sila-record-id").value.trim();
    const ordenTrabajo = document.getElementById("sila-ot").value.trim();
    const carrier = document.getElementById("sila-carrier").value.trim();
    const tracking = document.getElementById("sila-tracking").value.trim();
    const msg = document.getElementById("sila-tracking-msg");

    if (!ordenTrabajo || !tracking) {
      msg.style.color = "red";
      msg.innerText = "Falta Orden de Trabajo o Tracking.";
      return;
    }

    msg.style.color = "#333";
    msg.innerText = id ? "Actualizando..." : "Guardando...";

    try {
      const response = await fetch(id ? `${CONFIG.SUPABASE_URL}?id=eq.${id}` : CONFIG.SUPABASE_URL, {
        method: id ? "PATCH" : "POST",
        headers: apiHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }),
        body: JSON.stringify({
          orden_trabajo: ordenTrabajo,
          carrier,
          tracking,
          status: "Pending",
          created_by: "Miguel"
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Error guardando/actualizando:", result);
        msg.style.color = "red";
        msg.innerText = "Error al guardar/actualizar. Revisa consola.";
        return;
      }

      if (result[0]?.id) {
        document.getElementById("sila-record-id").value = result[0].id;
      }

      msg.style.color = "green";
      msg.innerText = id
        ? "✅ Tracking actualizado correctamente."
        : "✅ Tracking guardado correctamente.";

      limpiarTrackingsVisuales();
      await cargarTrackings();

    } catch (error) {
      console.error("🔥 Error guardando/actualizando tracking:", error);
      msg.style.color = "red";
      msg.innerText = "Error inesperado.";
    }
  }

  async function eliminarTracking() {
    const ordenTrabajo = document.getElementById("sila-ot").value.trim();
    const msg = document.getElementById("sila-tracking-msg");
    let id = document.getElementById("sila-record-id").value.trim();

    if (!id) {
      const record = await buscarTrackingPorOT(ordenTrabajo);

      if (!record) {
        msg.style.color = "red";
        msg.innerText = "No hay tracking encontrado para eliminar.";
        return;
      }

      id = record.id;
      document.getElementById("sila-record-id").value = id;
    }

    if (!confirm("¿Seguro que deseas eliminar este tracking?")) return;

    msg.style.color = "#333";
    msg.innerText = "Eliminando...";

    try {
      const response = await fetch(`${CONFIG.SUPABASE_URL}?id=eq.${id}`, {
        method: "DELETE",
        headers: apiHeaders()
      });

      if (!response.ok) {
        const result = await response.json();
        console.error("Error eliminando:", result);
        msg.style.color = "red";
        msg.innerText = "Error al eliminar. Revisa consola.";
        return;
      }

      msg.style.color = "green";
      msg.innerText = "✅ Tracking eliminado correctamente.";

      document.getElementById("sila-record-id").value = "";
      document.getElementById("sila-tracking").value = "";

      limpiarTrackingsVisuales();
      await cargarTrackings();

    } catch (error) {
      console.error("🔥 Error eliminando tracking:", error);
      msg.style.color = "red";
      msg.innerText = "Error inesperado.";
    }
  }

  async function obtenerInfoOrdenCarga(ordenCarga) {
    const odc = String(ordenCarga || "").trim();

    if (!odc) return null;

    if (STATE.odcCache[odc]) return STATE.odcCache[odc];

    try {
      const response = await fetch(
        `/MainSila/WorkOrder/CargarInformacionODCMaster?ODCMaster=${encodeURIComponent(odc)}`
      );

      const data = await response.json();

      if (data.error) {
        console.warn("❌ Error obteniendo ODC:", data.mensaje);
        return null;
      }

      STATE.odcCache[odc] = data;
      return data;

    } catch (error) {
      console.error("🔥 Error consultando Orden de Carga:", error);
      return null;
    }
  }

  async function obtenerNombreTransportista(idCliente, idTransportista) {
    if (!idCliente || !idTransportista) return "N/A";

    const cacheKey = String(idCliente);

    if (!STATE.transportistasCache[cacheKey]) {
      try {
        const response = await fetch(
          `/MainSila/WorkOrder/ObtenerTransportistas?idCliente=${encodeURIComponent(idCliente)}`
        );

        const data = await response.json();

        STATE.transportistasCache[cacheKey] = Array.isArray(data)
          ? data
          : data.Data || data.data || data.transportistas || [];

      } catch (error) {
        console.error("Error obteniendo transportistas:", error);
        return `ID ${idTransportista}`;
      }
    }

    const transportista = STATE.transportistasCache[cacheKey].find(t => {
      const id = t.idTransportista || t.IdTransportista || t.IDTransportista || t.id || t.Id;
      return String(id) === String(idTransportista);
    });

    if (!transportista) return `ID ${idTransportista}`;

    return (
      transportista.Transportista ||
      transportista.Nombre ||
      transportista.NombreTransportista ||
      transportista.text ||
      transportista.Text ||
      `ID ${idTransportista}`
    );
  }

  function crearTooltipODC() {
    if (document.getElementById("sila-odc-tooltip")) return;

    const tooltip = document.createElement("div");
    tooltip.id = "sila-odc-tooltip";

    tooltip.style.position = "fixed";
    tooltip.style.zIndex = "999999";
    tooltip.style.background = "white";
    tooltip.style.border = "1px solid #ccc";
    tooltip.style.borderRadius = "8px";
    tooltip.style.padding = "10px";
    tooltip.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
    tooltip.style.fontSize = "12px";
    tooltip.style.fontFamily = "Arial, sans-serif";
    tooltip.style.display = "none";
    tooltip.style.maxWidth = "340px";
    tooltip.style.lineHeight = "1.4";

    document.body.appendChild(tooltip);
  }

  function posicionarTooltipODC(event) {
    const tooltip = document.getElementById("sila-odc-tooltip");
    if (!tooltip) return;

    tooltip.style.left = event.clientX + 15 + "px";
    tooltip.style.top = event.clientY + 15 + "px";
  }

  function obtenerOrdenCargaDesdeCelda(celda) {
    const texto = celda.innerText || "";
    const match = texto.match(/\b\d{6}\b/);
    return match ? match[0] : null;
  }

  function formatearLista(lista) {
    if (!lista || !lista.length) return "N/A";
    return lista.join(", ");
  }

  function calcularTarimasPorOrdenCarga(ordenCarga) {
    const filas = Array.from(document.querySelectorAll('[role="row"]'));

    let totalTarimas = 0;
    let filasEncontradas = 0;

    filas.forEach(fila => {
      const oc = obtenerTextoCeldaPorColumna(fila, "Orden Carga");

      if (!oc || !oc.includes(ordenCarga)) return;

      filasEncontradas++;

      const bulto = obtenerTextoCeldaPorColumna(fila, "Bulto").toUpperCase();

      const cantidadTexto =
        obtenerTextoCeldaPorColumna(fila, "Cant.") ||
        obtenerTextoCeldaPorColumna(fila, "Cantidad") ||
        obtenerTextoCeldaPorColumna(fila, "Bultos") ||
        obtenerTextoCeldaPorColumna(fila, "Qty");

      const cantidad = Number(String(cantidadTexto).replace(/[^\d.-]/g, "")) || 0;

      if (
        bulto.includes("TARIMA") ||
        bulto.includes("TARIMAS") ||
        bulto.includes("PALLET") ||
        bulto.includes("PALLETS")
      ) {
        totalTarimas += cantidad;
      }
    });

    return { totalTarimas, filasEncontradas };
  }

  async function mostrarTooltipODC(event, celda) {
    const tooltip = document.getElementById("sila-odc-tooltip");
    if (!tooltip) return;

    const ordenCarga = obtenerOrdenCargaDesdeCelda(celda);
    if (!ordenCarga) return;

    posicionarTooltipODC(event);

    tooltip.innerHTML = `
      <strong style="color:#0b4f6c;">🚚 Orden de Carga ${ordenCarga}</strong>
      <br><br>
      Cargando información...
    `;

    tooltip.style.display = "block";

    const data = await obtenerInfoOrdenCarga(ordenCarga);

    if (!data || !data.ODCMaster) {
      tooltip.innerHTML = `
        <strong style="color:#0b4f6c;">🚚 Orden de Carga ${ordenCarga}</strong>
        <br><br>
        No se pudo obtener información.
      `;
      return;
    }

    const master = data.ODCMaster;
    const ots = data.Detalle || [];
    const nombreTransportista = await obtenerNombreTransportista(
      master.idCuentaInventario,
      master.idTransportista
    );

    const resumenTarimas = calcularTarimasPorOrdenCarga(ordenCarga);

    tooltip.innerHTML = `
      <strong style="color:#0b4f6c;">🚚 Orden de Carga ${master.MasterODC || ordenCarga}</strong>
      <br><br>
      <strong>Fecha:</strong> ${master.Fecha || "N/A"}<br>
      <strong>Transportista:</strong> ${nombreTransportista}<br>
      <strong>No. Económico:</strong> ${master.NoEconomico || "N/A"}<br>
      <strong>Placas:</strong> ${master.Placas || "N/A"} / ${master.OrigenPlacas || "N/A"}<br>
      <strong>Factura:</strong> ${master.Factura || "N/A"}<br>
      <strong>Embarque:</strong> ${master.Embarque || "N/A"}<br>
      <strong>Referencia:</strong> ${master.Referencia || "N/A"}<br>
      <strong>Sellos:</strong> ${master.Sello || "N/A"}<br>
      <strong>Cantidad sellos:</strong> ${master.CantidadSellos ?? "N/A"}<br>
      <strong>Total tarimas visibles:</strong> ${
        resumenTarimas.filasEncontradas ? resumenTarimas.totalTarimas : "N/A"
      }<br>
      <strong>OTs:</strong> ${formatearLista(ots)}
    `;
  }

  function activarHoverOrdenCarga() {
    crearTooltipODC();

    const tooltip = document.getElementById("sila-odc-tooltip");

    const celdasOrdenCarga = Array.from(document.querySelectorAll('[role="gridcell"]'))
      .filter(celda => {
        const aria = celda.getAttribute("aria-label") || "";
        return aria.toLowerCase().includes("orden carga");
      });

    celdasOrdenCarga.forEach(celda => {
      if (celda.dataset.silaOdcHover === "true") return;

      celda.dataset.silaOdcHover = "true";

      celda.addEventListener("mouseenter", event => mostrarTooltipODC(event, celda));
      celda.addEventListener("mousemove", event => posicionarTooltipODC(event));
      celda.addEventListener("mouseleave", () => {
        if (tooltip) tooltip.style.display = "none";
      });
    });
  }

  async function descargarPDFOrdenTrabajo(ot) {
    const response = await fetch("/MainSila/EntradasAlmacen/ReporteOrdenCarga", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify({
        lstOrdenTrabajo: [String(ot)]
      })
    });

    const data = await response.json();

    if (data.error || !data.nombre) {
      throw new Error("No se pudo generar PDF OT");
    }

    const pdf = await fetch(`/MainSila/DescargarDocumentos/${data.nombre}`);
    const blob = await pdf.blob();

    descargarBlob(blob, `OT_${ot}.pdf`);
  }

  async function descargarPDFOrdenCarga(odc) {
    const response = await fetch("/MainSila/EntradasAlmacen/ReporteOrdenCargaMaster", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify({
        lstOrdenCarga: [String(odc)]
      })
    });

    const data = await response.json();

    if (data.error || !data.nombre) {
      throw new Error("No se pudo generar PDF ODC");
    }

    const pdf = await fetch(`/MainSila/DescargarDocumentos/${data.nombre}`);
    const blob = await pdf.blob();

    descargarBlob(blob, `ODC_${odc}.pdf`);
  }

  async function descargarAnexoPorId(idDocumentoDigital, nombreArchivoOriginal) {
    const response = await fetch(
      `/MainSila/WorkOrder/DescargarDocumento?idDocumentoDigital=${encodeURIComponent(idDocumentoDigital)}`
    );

    const data = await response.json();

    if (data.error || !data.nombre) {
      console.error("Error preparando anexo:", data);
      return;
    }

    const archivoResponse = await fetch(
      `/MainSila/DescargarDocumentos/${encodeURIComponent(data.nombre)}`
    );

    const blob = await archivoResponse.blob();

    descargarBlob(blob, nombreArchivoOriginal || data.nombre);
  }

  async function obtenerInfoOrdenTrabajo(ot) {
    const response = await fetch(
      `/MainSila/WorkOrder/CargarInformacionODC?ODC=${encodeURIComponent(ot)}`
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.mensaje || "No se pudo obtener información de la OT");
    }

    return data;
  }

  async function obtenerInfoOrdenCargaCompleta(odc) {
    const response = await fetch(
      `/MainSila/WorkOrder/CargarInformacionODCMaster?ODCMaster=${encodeURIComponent(odc)}`
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.mensaje || "No se pudo obtener información de la ODC");
    }

    return data;
  }

  async function descargarAnexosOrdenTrabajo(ot) {
    const data = await obtenerInfoOrdenTrabajo(ot);
    const anexos = data.Anexos || [];

    console.log("📎 Anexos encontrados para OT:", ot, anexos);

    for (const anexo of anexos) {
      await descargarAnexoPorId(anexo.idDocumentoDigital, anexo.archivo);
      await sleep(200);
    }
  }

  async function descargarAnexosOrdenCarga(odc) {
    const data = await obtenerInfoOrdenCargaCompleta(odc);

    const anexos =
      data.Anexos ||
      data.Documentos ||
      data.DocumentosDigitales ||
      [];

    console.log("📎 Anexos encontrados para ODC:", odc, anexos);

    for (const anexo of anexos) {
      const idDocumentoDigital =
        anexo.idDocumentoDigital ||
        anexo.IdDocumentoDigital;

      const archivo =
        anexo.archivo ||
        anexo.Archivo ||
        `Anexo_ODC_${odc}`;

      if (!idDocumentoDigital) continue;

      await descargarAnexoPorId(idDocumentoDigital, archivo);
      await sleep(200);
    }
  }

  function crearBotonDescargarDocs() {
    if (document.getElementById("sila-docs-btn")) return;

    const btn = document.createElement("button");
    btn.id = "sila-docs-btn";
    btn.innerText = "📄 Docs";

    estiloBotonSuperior(btn);

    btn.style.background = "#198754";
    btn.style.color = "white";
    btn.onclick = descargarPaqueteSeleccionado;

    obtenerContenedorBotonesSila().appendChild(btn);
  }

  async function descargarPaqueteSeleccionado() {
    const datos = obtenerDatosFilaSeleccionada();

    if (!datos.ot) {
      alert("Selecciona una línea con Orden de Trabajo.");
      return;
    }

    const odc =
      datos.odc ||
      prompt("No detecté Orden de Carga. Captúrala manualmente:");

    if (!odc) return;

    try {
      console.log("📄 Descargando paquete:", datos);

      await descargarPDFOrdenTrabajo(datos.ot);
      await sleep(250);

      await descargarPDFOrdenCarga(odc);
      await sleep(250);

      await descargarAnexosOrdenTrabajo(datos.ot);
      await sleep(300);

      await descargarAnexosOrdenCarga(odc);

      alert("✅ Descarga iniciada.");
    } catch (error) {
      console.error("Error descargando paquete:", error);
      alert("Error descargando documentos. Revisa consola.");
    }
  }

  function init() {
    if (!esPantallaAlmacen()) return;

    crearBotonTracking();
    crearBotonDescargarDocs();
    cargarTrackings();
    activarHoverOrdenCarga();

    window.__SILA_TOOLS_INTERVAL__ = setInterval(() => {
      cargarTrackings();
      activarHoverOrdenCarga();
    }, 5000);
  }

  init();
})();
