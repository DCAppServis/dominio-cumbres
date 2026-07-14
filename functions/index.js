const functions = require("firebase-functions");
const admin     = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// ── Helpers internos ──────────────────────────────────────────────────────────

async function obtenerAdminDoc(uid) {
  const snap = await db.collection("usuarios").doc(uid).get();
  if (!snap.exists) return null;
  return { uid, ...snap.data() };
}

async function verificarMaestroActivo(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "No autenticado.");
  }
  const datos = await obtenerAdminDoc(context.auth.uid);
  if (!datos) {
    throw new functions.https.HttpsError("permission-denied", "Cuenta no encontrada.");
  }
  const rolNorm = datos.rol === "premium" ? "senior" : datos.rol;
  if (rolNorm !== "maestro") {
    throw new functions.https.HttpsError("permission-denied", "Solo el Maestro puede realizar esta acción.");
  }
  if (datos.activo === false) {
    throw new functions.https.HttpsError("permission-denied", "Cuenta de Maestro suspendida.");
  }
  return datos;
}

async function verificarAdminObjetivo(uid) {
  const datos = await obtenerAdminDoc(uid);
  if (!datos || datos.esAdmin !== true) {
    throw new functions.https.HttpsError("not-found", "Administrador no encontrado.");
  }
  return datos;
}

// ── adminCambiarPassword ──────────────────────────────────────────────────────
// Cambia la contraseña de un administrador en Firebase Authentication.
// Solo el Maestro activo puede invocarla.
exports.adminCambiarPassword = functions.https.onCall(async (data, context) => {
  await verificarMaestroActivo(context);

  const { uidObjetivo, nuevaPassword } = data;
  if (!uidObjetivo || typeof nuevaPassword !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Faltan datos requeridos.");
  }
  if (nuevaPassword.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "La contraseña debe tener mínimo 6 caracteres.");
  }

  // Verificar que el objetivo es administrador (puede ser el propio Maestro sobre sí mismo)
  await verificarAdminObjetivo(uidObjetivo);

  await admin.auth().updateUser(uidObjetivo, { password: nuevaPassword });
  return { ok: true };
});

// ── adminCambiarCorreo ────────────────────────────────────────────────────────
// Cambia el correo de un administrador en Auth y Firestore.
// Si Auth falla, Firestore no se toca.
// Si Firestore falla, revierte Auth.
exports.adminCambiarCorreo = functions.https.onCall(async (data, context) => {
  const LOG = (paso, extra) => console.log(JSON.stringify({ fn: "adminCambiarCorreo", paso, ...extra }));

  LOG("inicio", { callerUid: context.auth && context.auth.uid, data: { uidObjetivo: data && data.uidObjetivo, nuevoCorreo: data && data.nuevoCorreo } });

  try {
    await verificarMaestroActivo(context);
  } catch (e) {
    LOG("error-verificarMaestro", { code: e.code, message: e.message });
    throw e;
  }

  const { uidObjetivo, nuevoCorreo } = data;
  if (!uidObjetivo || !nuevoCorreo) {
    LOG("error-argFaltante", { uidObjetivo, nuevoCorreo });
    throw new functions.https.HttpsError("invalid-argument", "Faltan datos requeridos.");
  }
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(nuevoCorreo)) {
    LOG("error-formatoCorreo", { nuevoCorreo });
    throw new functions.https.HttpsError("invalid-argument", "Formato de correo inválido.");
  }

  let objetivoDatos;
  try {
    objetivoDatos = await verificarAdminObjetivo(uidObjetivo);
  } catch (e) {
    LOG("error-verificarObjetivo", { uidObjetivo, code: e.code, message: e.message });
    throw e;
  }
  const correoAnterior = objetivoDatos.correo || objetivoDatos.email || "";
  LOG("objetivo-ok", { uidObjetivo, correoAnterior });

  // Verificar que el correo no esté en uso — flag evita instanceof issue en v5
  let _emailTomado = false;
  try {
    const existente = await admin.auth().getUserByEmail(nuevoCorreo);
    LOG("getUserByEmail-ok", { encontradoUid: existente.uid, uidObjetivo });
    if (existente.uid !== uidObjetivo) _emailTomado = true;
  } catch (lookupErr) {
    LOG("getUserByEmail-error", { code: lookupErr.code, message: lookupErr.message });
    // auth/user-not-found → correo libre
  }
  if (_emailTomado) {
    LOG("correo-tomado", { nuevoCorreo });
    throw new functions.https.HttpsError("already-exists", "Ese correo ya está registrado.");
  }
  LOG("correo-libre", { nuevoCorreo });

  // 1. Actualizar Authentication
  try {
    await admin.auth().updateUser(uidObjetivo, { email: nuevoCorreo });
    LOG("auth-actualizado", { uidObjetivo, nuevoCorreo });
  } catch (authErr) {
    const _c = authErr.code || (authErr.errorInfo && authErr.errorInfo.code) || "";
    LOG("auth-error", { code: _c, message: authErr.message, errorInfo: authErr.errorInfo });
    if (_c === "auth/email-already-exists" || _c === "auth/email-already-in-use") {
      throw new functions.https.HttpsError("already-exists", "Ese correo ya está registrado.");
    }
    throw new functions.https.HttpsError("internal", "Error al actualizar correo: " + authErr.message);
  }

  // 2. Actualizar Firestore
  try {
    await db.collection("usuarios").doc(uidObjetivo).update({ correo: nuevoCorreo });
    LOG("firestore-actualizado", { uidObjetivo, nuevoCorreo });
  } catch (fsErr) {
    LOG("firestore-error", { code: fsErr.code, message: fsErr.message });
    if (correoAnterior) {
      await admin.auth().updateUser(uidObjetivo, { email: correoAnterior }).catch((revertErr) => {
        LOG("auth-revert-error", { message: revertErr.message });
      });
      LOG("auth-revertido", { correoAnterior });
    }
    throw new functions.https.HttpsError("internal", "Error al actualizar base de datos: " + fsErr.message);
  }

  LOG("exito", { uidObjetivo, nuevoCorreo });
  return { ok: true };
});

// ── adminEliminarCuenta ───────────────────────────────────────────────────────
// Elimina un administrador de Firebase Authentication y Firestore.
// Protege al último Maestro activo y al Maestro conectado.
exports.adminEliminarCuenta = functions.https.onCall(async (data, context) => {
  await verificarMaestroActivo(context);

  const { uidObjetivo } = data;
  if (!uidObjetivo) {
    throw new functions.https.HttpsError("invalid-argument", "Falta el UID del administrador.");
  }
  if (uidObjetivo === context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "No puedes eliminar tu propia cuenta de Maestro.");
  }

  const objetivoDatos = await verificarAdminObjetivo(uidObjetivo);
  const rolNorm = objetivoDatos.rol === "premium" ? "senior" : objetivoDatos.rol;

  if (rolNorm === "maestro") {
    // Verificar que no sea el último maestro activo
    const maestrosSnap = await db.collection("usuarios")
      .where("esAdmin", "==", true)
      .where("rol", "in", ["maestro"])
      .where("activo", "!=", false)
      .get();
    if (maestrosSnap.size <= 1) {
      throw new functions.https.HttpsError("permission-denied", "No se puede eliminar al último Maestro activo.");
    }
  }

  // 1. Eliminar de Firebase Authentication
  await admin.auth().deleteUser(uidObjetivo);

  // 2. Eliminar de Firestore
  await db.collection("usuarios").doc(uidObjetivo).delete();

  return { ok: true };
});

// ── adminEliminarUsuario ──────────────────────────────────────────────────────
// Elimina un vecino o proveedor de Firebase Authentication y Firestore.
// Solo el Maestro activo puede invocarla.
exports.adminEliminarUsuario = functions.https.onCall(async (data, context) => {
  const LOG = (paso, extra) => console.log(JSON.stringify({ fn: "adminEliminarUsuario", paso, ...extra }));

  LOG("inicio", { callerUid: context.auth && context.auth.uid, data: { uidObjetivo: data && data.uidObjetivo } });

  try {
    await verificarMaestroActivo(context);
  } catch (e) {
    LOG("error-verificarMaestro", { code: e.code, message: e.message });
    throw e;
  }

  const { uidObjetivo } = data;
  if (!uidObjetivo) {
    LOG("error-argFaltante");
    throw new functions.https.HttpsError("invalid-argument", "Falta el UID del usuario.");
  }
  if (uidObjetivo === context.auth.uid) {
    LOG("error-autoEliminacion", { uidObjetivo });
    throw new functions.https.HttpsError("permission-denied", "No puedes eliminar tu propia cuenta.");
  }

  // Eliminar de Firebase Authentication (tolerar si ya no existe)
  try {
    await admin.auth().deleteUser(uidObjetivo);
    LOG("auth-eliminado", { uidObjetivo });
  } catch (e) {
    LOG("auth-error", { code: e.code, message: e.message });
    if (e.code !== "auth/user-not-found") {
      throw new functions.https.HttpsError("internal", "Error al eliminar de Authentication: " + e.message);
    }
    LOG("auth-noEncontrado-ignorado", { uidObjetivo });
  }

  // Eliminar de Firestore
  try {
    await db.collection("usuarios").doc(uidObjetivo).delete();
    LOG("firestore-eliminado", { uidObjetivo });
  } catch (fsErr) {
    LOG("firestore-error", { code: fsErr.code, message: fsErr.message });
    throw new functions.https.HttpsError("internal", "Error al eliminar de Firestore: " + fsErr.message);
  }

  LOG("exito", { uidObjetivo });
  return { ok: true };
});

// ── impulsaVerificarVencimientos ──────────────────────────────────────────────
// Cron diario: degrada Impulsa expirado a Básico y envía Push de aviso previo.
// Horario: cada día a las 8:00 AM (hora del servidor / UTC-6 ajustado).
exports.impulsaVerificarVencimientos = functions.pubsub
  .schedule("0 14 * * *")   // 14:00 UTC = 8:00 AM hora Ciudad de México
  .timeZone("America/Mexico_City")
  .onRun(async () => {
    const LOG = (paso, extra) => console.log(JSON.stringify({ fn: "impulsaVerificarVencimientos", paso, ...extra }));
    const ahora     = admin.firestore.Timestamp.now();
    const ahoraMs   = ahora.toMillis();
    const DIA_MS    = 86400000;
    const AVISOS    = [15, 7, 1];   // días antes de vencer en que se notifica

    try {
      const snap = await db.collection("usuarios")
        .where("plan", "==", "impulsa")
        .get();

      LOG("total-impulsa", { count: snap.size });

      const batch = db.batch();
      let degradados = 0;
      let notificaciones = 0;

      for (const doc of snap.docs) {
        const d   = doc.data();
        const ref = doc.ref;

        if (!d.planVence) continue;
        const venceMs = d.planVence.toMillis();
        const diasRestantes = Math.ceil((venceMs - ahoraMs) / DIA_MS);

        // ── Expirado: degradar a Básico ──────────────────────────────────────
        if (venceMs <= ahoraMs) {
          batch.update(ref, {
            plan:       "basico",
            planTipo:   admin.firestore.FieldValue.delete(),
            planInicio: admin.firestore.FieldValue.delete(),
            planVence:  admin.firestore.FieldValue.delete(),
          });
          // Notificación dentro de la app
          await db.collection("notificaciones").add({
            uid:      doc.id,
            tipo:     "membresia",
            modulo:   "planes",
            titulo:   "Plan Impulsa vencido",
            mensaje:  "Tu Plan Impulsa ha vencido. Tu cuenta regresó al Plan Básico. ¡Renueva para seguir con todos los beneficios!",
            leida:    false,
            eliminada:false,
            prioridad:"alta",
            fecha:    admin.firestore.FieldValue.serverTimestamp(),
          });
          degradados++;
          LOG("degradado", { uid: doc.id });
          continue;
        }

        // ── Próximo a vencer: aviso en días definidos ────────────────────────
        if (AVISOS.includes(diasRestantes)) {
          const msg = diasRestantes === 1
            ? "Tu Plan Impulsa vence mañana. ¡Renueva hoy para no perder tus beneficios!"
            : `Tu Plan Impulsa vence en ${diasRestantes} días. Renueva pronto para seguir destacando.`;
          await db.collection("notificaciones").add({
            uid:      doc.id,
            tipo:     "membresia",
            modulo:   "planes",
            titulo:   `Plan Impulsa — ${diasRestantes} día${diasRestantes > 1 ? 's' : ''} para vencer`,
            mensaje:  msg,
            leida:    false,
            eliminada:false,
            prioridad: diasRestantes === 1 ? "alta" : "normal",
            fecha:    admin.firestore.FieldValue.serverTimestamp(),
          });
          notificaciones++;
          LOG("aviso-enviado", { uid: doc.id, diasRestantes });
        }
      }

      await batch.commit();
      LOG("fin", { degradados, notificaciones });
    } catch (e) {
      LOG("error", { message: e.message });
      throw e;
    }

    return null;
  });

// ── mpActivarImpulsa ──────────────────────────────────────────────────────────
// Procesa el pago de Plan Impulsa via MercadoPago y activa el plan en Firestore.
// Llamado desde el Payment Brick con el formData del usuario.
// Credenciales TEST — cambiar a producción cuando esté listo.
const https = require("https");
const MP_ACCESS_TOKEN = "TEST-2837337824054515-071320-5944edb7b9cbf858f4c81c5f8b62c2ca-3539621175";
const MP_MONTOS = { mensual: 199, anual: 1999 };

exports.mpActivarImpulsa = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "No autenticado.");
  }

  const uid = context.auth.uid;
  const { formData, planTipo, email } = data;

  const monto = MP_MONTOS[planTipo];
  if (!monto) {
    throw new functions.https.HttpsError("invalid-argument", "Plan inválido.");
  }

  // Construir body del pago
  const payerEmail = email || context.auth.token.email || "pago@dominiocumbres.mx";
  const paymentBody = {
    transaction_amount: monto,
    token:              formData.token,
    description:        `Plan Impulsa ${planTipo === "mensual" ? "Mensual" : "Anual"} - Dominio Cumbres`,
    installments:       formData.installments || 1,
    payment_method_id:  formData.payment_method_id,
    payer: {
      email: payerEmail,
      identification: (formData.payer && formData.payer.identification) || undefined,
    },
  };

  // Llamar API de MercadoPago
  const mpResult = await new Promise((resolve, reject) => {
    const body = JSON.stringify(paymentBody);
    const options = {
      hostname: "api.mercadopago.com",
      port: 443,
      path: "/v1/payments",
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "Authorization":  `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error("Respuesta inválida de MercadoPago")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  if (mpResult.status !== "approved") {
    const detail = mpResult.status_detail || mpResult.status || "Pago no aprobado";
    throw new functions.https.HttpsError("aborted", detail);
  }

  // Pago aprobado — activar plan en Firestore
  const ahora = admin.firestore.Timestamp.now();
  const fin = new Date();
  fin.setMonth(fin.getMonth() + (planTipo === "anual" ? 12 : 1));
  const planVence = admin.firestore.Timestamp.fromDate(fin);

  await db.collection("usuarios").doc(uid).update({
    plan:            "impulsa",
    planTipo:        planTipo,
    planInicio:      ahora,
    planVence:       planVence,
    planPagoId:      String(mpResult.id),
    planUltimoMonto: monto,
  });

  // Notificación al usuario
  await db.collection("notificaciones").add({
    uid,
    tipo:      "impulsa",
    modulo:    "impulsa",
    titulo:    "⭐ Plan Impulsa activado",
    mensaje:   `Tu plan ${planTipo} está activo hasta el ${fin.toLocaleDateString("es-MX")}`,
    leida:     false,
    eliminada: false,
    prioridad: "high",
    fecha:     ahora,
    expiresAt: fin,
  });

  return { ok: true, planVence: fin.toISOString() };
});
