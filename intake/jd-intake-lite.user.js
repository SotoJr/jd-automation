// ==UserScript==
// @name         JD Intake Lite - Truck Log Importer
// @namespace    JDFlow
// @version      1.2
// @description  Importar partidas de Truck Log Excel a SILA Pre Entrada
// @match        *://*/MainSila/*
// @match        *://*/PreEntrada*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js

// @updateURL    https://raw.githubusercontent.com/SotoJr/jd-automation/main/intake/jd-intake-lite.user.js
// @downloadURL  https://raw.githubusercontent.com/SotoJr/jd-automation/main/intake/jd-intake-lite.user.js
// ==/UserScript==

(function () {
    'use strict';

    const TEST_LIMIT = null;

    const DELAY_CAMPO = 70;
    const DELAY_REFERENCIA = 30;
    const DELAY_AGREGAR = 250;
    const DELAY_CHECKLIST = 900;

    function isPreEntradaPage() {
        return document.body.innerText.includes('Pre Entrada') &&
            document.getElementById('txtCantidad') &&
            document.getElementById('btnAgregarDetalle');
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function setValue(id, value) {
        const el = $('#' + id);
        if (!el.length) {
            alert(`No se encontró el campo: ${id}`);
            return false;
        }

        el.val(value ?? '');
        el.trigger('input');
        el.trigger('change');
        el.trigger('blur');
        return true;
    }

    function setSelectValue(id, value) {
        const el = $('#' + id);
        if (!el.length) {
            alert(`No se encontró el select: ${id}`);
            return false;
        }

        el.val(value);
        el.trigger('change');
        el.trigger('blur');
        return true;
    }

    function desbloquearSILA() {
        try {
            document.body.inert = false;

            $('body')
                .removeAttr('inert')
                .removeClass('modal-open swal2-shown swal2-height-auto')
                .css({
                    'pointer-events': 'auto',
                    'overflow': '',
                    'padding-right': ''
                });

            $('html').css('overflow', '');

            $('.modal-backdrop').remove();
            $('.swal-overlay').remove();
            $('.swal-modal').remove();
            $('.swal2-container').remove();

            $('[inert]').removeAttr('inert');
            $('[style*="pointer-events: none"]').css('pointer-events', 'auto');

            if (document.activeElement) {
                document.activeElement.blur();
            }

            console.log('JD Intake: SILA desbloqueado');
        } catch (e) {
            console.error('JD Intake: Error desbloqueando SILA', e);
        }
    }

    function iniciarDesbloqueoTemporal() {
        let intentos = 0;

        const intervalo = setInterval(() => {
            desbloquearSILA();
            intentos++;

            if (intentos >= 12) {
                clearInterval(intervalo);
                console.log('JD Intake: desbloqueo temporal terminado');
            }
        }, 500);
    }

    function separarReferencias(valor) {
  if (valor == null) return ["", "", ""];

  return String(valor)
    .split("/")
    .map(x => x.trim())
    .filter(x => x !== "")
    .slice(0, 3)
    .concat(["", "", ""])
    .slice(0, 3);
}

    async function clickContinuarChecklist() {
        for (let i = 0; i < 35; i++) {
            const continuarBtn =
                document.querySelector('button.swal2-cancel') ||
                Array.from(document.querySelectorAll('button')).find(btn =>
                    btn.innerText.trim().toLowerCase() === 'continuar'
                );

            if (continuarBtn) {
                continuarBtn.click();
                console.log('JD Intake: Continuar checklist presionado');
                return true;
            }

            await sleep(200);
        }

        return false;
    }

    function clickAgregarSeguro() {
        const btnAgregar = document.getElementById('btnAgregarDetalle');

        if (!btnAgregar) {
            alert('No se encontró el botón Agregar.');
            return false;
        }

        btnAgregar.click();
        return true;
    }

    function mostrarMensajeJD(texto, color = '#198754') {
        const oldMsg = document.getElementById('jd-intake-msg');
        if (oldMsg) oldMsg.remove();

        const msg = document.createElement('div');
        msg.id = 'jd-intake-msg';
        msg.innerText = texto;

        msg.style.position = 'fixed';
        msg.style.top = '170px';
        msg.style.left = '20px';
        msg.style.zIndex = '99999';
        msg.style.background = color;
        msg.style.color = 'white';
        msg.style.padding = '12px 16px';
        msg.style.borderRadius = '6px';
        msg.style.fontWeight = 'bold';
        msg.style.boxShadow = '0 3px 8px rgba(0,0,0,0.25)';

        document.body.appendChild(msg);

        setTimeout(() => msg.remove(), 6000);
    }

    async function capturarPartida(partida, index, total) {
        if ((index + 1) % 25 === 0) {
            console.log(`JD Intake: ${index + 1}/${total}`);
        }

        setValue('txtCantidad', partida.cantidad);
        await sleep(DELAY_CAMPO);

        setSelectValue('cmbTipoBulto', partida.tipoBulto);
        await sleep(DELAY_CAMPO);

        setSelectValue('cmbUbicacion', '1883');
        await sleep(DELAY_CAMPO);

        setValue('txtDescripcion', partida.descripcion || '');
        await sleep(DELAY_CAMPO);

        setSelectValue('cmbTipoMercancia', '10');
        await sleep(DELAY_CAMPO);

        setValue('txtReferencia1', partida.ref1);
        await sleep(DELAY_REFERENCIA);

        setValue('txtReferencia2', partida.ref2);
        await sleep(DELAY_REFERENCIA);

        setValue('txtReferencia3', partida.ref3);
        await sleep(DELAY_AGREGAR);

        const clicked = clickAgregarSeguro();
        if (!clicked) return false;

        if (index === 0) {
            await clickContinuarChecklist();
            await sleep(DELAY_CHECKLIST);
        }

        if (index % 10 === 0) {
            desbloquearSILA();
        }

        await sleep(DELAY_AGREGAR);

        return true;
    }

    function parseNumero(valor) {
        if (valor === null || valor === undefined) return 0;

        const limpio = String(valor)
            .replace(/,/g, '')
            .replace(/[^\d.]/g, '')
            .trim();

        return Number(limpio || 0);
    }

    function unirRefs(...valores) {
        return valores
            .map(v => String(v || '').trim())
            .filter(Boolean)
            .join(' / ');
    }

    function anexarLineaAPartida(partida, row) {
        const descripcion = String(row[1] || '').trim();
        const ref1 = String(row[2] || '').trim();
        const ref2 = String(row[3] || '').trim();
        const ref3 = String(row[4] || '').trim();

        if (descripcion) partida.descripcion = unirRefs(partida.descripcion, descripcion);
        if (ref1) partida.ref1 = unirRefs(partida.ref1, ref1);
        if (ref2) partida.ref2 = unirRefs(partida.ref2, ref2);
        if (ref3) partida.ref3 = unirRefs(partida.ref3, ref3);
    }

 function parseTruckLog(rows) {
    const partidas = [];

    function norm(txt) {
        return String(txt || '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getIndex(headers, palabras) {
        return headers.findIndex(h =>
            palabras.every(p => h.includes(p))
        );
    }

    function limpiar(valor) {
        return String(valor || '').trim();
    }

    function unirRefs(...valores) {
        return valores
            .map(v => limpiar(v))
            .filter(Boolean)
            .join(' / ');
    }

    const headerIndex = rows.findIndex(row => {
        const normalized = row.map(norm);
        return normalized.some(c => c.includes('DESCRIPTION')) &&
               normalized.some(c => c.includes('REFERENCE # 1'));
    });

    if (headerIndex === -1) {
        console.warn('JD Intake: No se encontró encabezado del Truck Log');
        return [];
    }

    const headers = rows[headerIndex].map(norm);

    const idxDescripcion = getIndex(headers, ['DESCRIPTION']);
    const idxRef1 = getIndex(headers, ['REFERENCE', '# 1']);
    const idxRef2 = getIndex(headers, ['REFERENCE', '# 2']);
    const idxRef3 = getIndex(headers, ['REFERENCE', '# 3']);
    const idxBoxes = getIndex(headers, ['BOXES']);
    const idxPallets = getIndex(headers, ['PALLETS']);

    console.log('JD Intake: Columnas detectadas:', {
        idxDescripcion,
        idxRef1,
        idxRef2,
        idxRef3,
        idxBoxes,
        idxPallets
    });

    const dataRows = rows.slice(headerIndex + 1);

    let ultimaPartida = null;

    for (const row of dataRows) {
        const descripcion = idxDescripcion >= 0 ? limpiar(row[idxDescripcion]) : '';
        const ref1 = idxRef1 >= 0 ? limpiar(row[idxRef1]) : '';
        const ref2 = idxRef2 >= 0 ? limpiar(row[idxRef2]) : '';
        const ref3 = idxRef3 >= 0 ? limpiar(row[idxRef3]) : '';

        const boxes = idxBoxes >= 0 ? parseNumero(row[idxBoxes]) : 0;
        const pallets = idxPallets >= 0 ? parseNumero(row[idxPallets]) : 0;

        const tieneDatos = descripcion || ref1 || ref2 || ref3;
        const tieneCantidad = boxes > 0 || pallets > 0;

        if (!tieneDatos) continue;

        // Fila normal con cantidad: crea nueva partida
        if (tieneCantidad) {
            if (pallets > 0) {
                ultimaPartida = {
                    cantidad: pallets,
                    tipoBulto: '7',
                    descripcion: descripcion || '',
                    ref1: ref1 || '',
                    ref2: ref2 || '',
                    ref3: ref3 || ''
                };

                partidas.push(ultimaPartida);
            }

            if (boxes > 0) {
                ultimaPartida = {
                    cantidad: boxes,
                    tipoBulto: '8',
                    descripcion: descripcion || '',
                    ref1: ref1 || '',
                    ref2: ref2 || '',
                    ref3: ref3 || ''
                };

                partidas.push(ultimaPartida);
            }

            continue;
        }

        // Fila sin cantidad: se considera continuación del pallet/caja anterior
        if (!tieneCantidad && ultimaPartida) {
            if (descripcion) {
                ultimaPartida.descripcion = unirRefs(ultimaPartida.descripcion, descripcion);
            }

            if (ref1) {
                ultimaPartida.ref1 = unirRefs(ultimaPartida.ref1, ref1);
            }

            if (ref2) {
                ultimaPartida.ref2 = unirRefs(ultimaPartida.ref2, ref2);
            }

            if (ref3) {
                ultimaPartida.ref3 = unirRefs(ultimaPartida.ref3, ref3);
            }
        }
    }

    console.log('JD Intake: Partidas detectadas:', partidas);
    console.table(partidas);

    return partidas;
}

    function createUnlockButton() {
        if (!isPreEntradaPage()) return;
        if (document.getElementById('jd-unlock-btn')) return;

        const btn = document.createElement('button');

        btn.id = 'jd-unlock-btn';
        btn.innerHTML = '🔓';
        btn.title = 'Desbloquear SILA';

        btn.style.cssText = `
            position: fixed;
            top: 82px;
            left: 225px;
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 50%;
            background: #10b981;
            color: white;
            font-size: 14px;
            cursor: pointer;
            z-index: 999999;
            box-shadow: 0 2px 6px rgba(0,0,0,.20);
            opacity: .75;
            transition: all .2s ease;
        `;

        btn.onmouseenter = () => {
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1.08)';
        };

        btn.onmouseleave = () => {
            btn.style.opacity = '.75';
            btn.style.transform = 'scale(1)';
        };

        btn.onclick = () => {
            desbloquearSILA();
            iniciarDesbloqueoTemporal();
            mostrarMensajeJD('SILA desbloqueado', '#10b981');
        };

        document.body.appendChild(btn);
    }

    function createButton() {
        if (!isPreEntradaPage()) return;
        if (document.getElementById('jd-intake-import-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'jd-intake-import-btn';
        btn.innerText = '📦 Importar Truck Log';

        btn.style.position = 'fixed';
        btn.style.top = '90px';
        btn.style.left = '20px';
        btn.style.zIndex = '99999';
        btn.style.background = '#0b4f6c';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '6px';
        btn.style.padding = '10px 14px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 3px 8px rgba(0,0,0,0.25)';

        btn.onclick = function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.xls';

            input.onchange = async function (e) {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    mostrarMensajeJD('Leyendo Truck Log...', '#0b4f6c');

                    const partidasExistentes = $('img[title="Borrar Detalle"]').length;

                    if (partidasExistentes > 0) {
                        alert(
                            `Esta Pre Entrada ya tiene ${partidasExistentes} partidas.\n\n` +
                            `Para que la secuencia inicie en 1, usa una Pre Entrada nueva antes de importar.`
                        );
                        return;
                    }

                    const data = await file.arrayBuffer();
                    const workbook = XLSX.read(data);
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];

                    const rows = XLSX.utils.sheet_to_json(sheet, {
                        header: 1,
                        defval: ''
                    });

                    const partidas = parseTruckLog(rows);

                    if (!partidas.length) {
                        alert('No se detectaron partidas válidas en el Truck Log.');
                        return;
                    }

                    const limite = TEST_LIMIT
                        ? Math.min(TEST_LIMIT, partidas.length)
                        : partidas.length;

                    const totalCantidad = partidas
                        .slice(0, limite)
                        .reduce((sum, p) => sum + Number(p.cantidad), 0);

                    const confirmar = confirm(
                        `Truck Log leído correctamente\n\n` +
                        `Partidas detectadas: ${partidas.length}\n` +
                        `Partidas a capturar: ${limite}\n` +
                        `Cantidad total a capturar: ${totalCantidad}\n\n` +
                        `¿Continuar?`
                    );

                    if (!confirmar) return;

                    mostrarMensajeJD(`Importando ${limite} partidas...`, '#0b4f6c');

                    for (let i = 0; i < limite; i++) {
                        const ok = await capturarPartida(partidas[i], i, limite);

                        if (!ok) {
                            desbloquearSILA();
                            mostrarMensajeJD(`Se detuvo en la partida ${i + 1}`, '#dc3545');
                            return;
                        }
                    }

                    desbloquearSILA();
                    iniciarDesbloqueoTemporal();

                    mostrarMensajeJD(
                        `Importación terminada. Partidas capturadas: ${limite}.`,
                        '#198754'
                    );

                    console.log('JD Intake: Importación completada sin reload');

                } catch (error) {
                    console.error('JD Intake: Error en importación', error);
                    desbloquearSILA();
                    mostrarMensajeJD('Error durante la importación. Revisar consola.', '#dc3545');
                }
            };

            input.click();
        };

        document.body.appendChild(btn);
    }

    setInterval(() => {
        createButton();
        createUnlockButton();
    }, 1000);

})();
