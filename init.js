  window.VERSION_APP = "1.0.0";
  // EmailJS public key: riesgo aceptado. Las public keys de EmailJS son
  // por diseño client-side. Seguridad adicional: configurar dominios
  // permitidos en el dashboard de EmailJS (emailjs.com → Account → Security).

  window.abrirProveedor = function(uid, p) {
    window._proveedorActual = {uid, ...p};
    const nombre = document.querySelector('#v-serv-det [style*="font-size:18px"]');
    if(nombre) nombre.textContent = p.nombre || 'Proveedor';
    go('v-serv-det','right');
    setTimeout(function(){ window.dcProvRatingCargar && window.dcProvRatingCargar(uid); }, 200);
  };

  // ── CONFIGURACIÓN EMAILJS ────────────────────────────────
  // INSTRUCCIONES PARA ACTIVAR:
  // 1. Crea cuenta gratis en https://www.emailjs.com
  // 2. Crea un "Email Service" (Gmail recomendado) y copia el Service ID
  // 3. Crea un "Email Template" con estas variables: {{tipo}}, {{nombre}}, {{correo}}, {{telefono}}, {{fecha}}
  //    Pon tu correo como destinatario fijo en el template
  // 4. Copia tu Public Key (Account → API Keys)
  // 5. Reemplaza los valores de abajo:
  const EMAILJS_PUBLIC_KEY    = 'D8IYC6Jyyp6u3FOfg';      // ← reemplaza
  const EMAILJS_SERVICE_ID    = 'DCAppServis';      // ← reemplaza
  const EMAILJS_TEMPLATE_ID   = 'template_3gpxjvc';     // ← template: aviso al admin cuando alguien se registra
  const EMAILJS_TEMPLATE_APROBADO    = 'template_3gpxjvc';    // ← template: aviso al usuario cuando es aprobado
  const EMAILJS_TEMPLATE_BIENVENIDO  = 'template_3gpxjvc';  // ← template: bienvenida al registrarse
  // Variables del template APROBADO:   {{nombre}}, {{correo}}, {{fecha}}
  // Variables del template BIENVENIDO: {{nombre}}, {{correo}}, {{tipo}}, {{fecha}}
  // En ambos templates, el "To Email" debe ser {{correo}}

  function notificarAdmin(tipo, nombre, correo, telefono) {
    // Desactivado para ahorrar los 200 correos mensuales
    // Solo se envía correo cuando el admin aprueba al usuario
    return;
  }

  // Correo de bienvenida desactivado para ahorrar los 200 correos mensuales
  // Solo se envía correo cuando el admin aprueba al usuario
  function notificarBienvenido(nombre, correo, tipo) {
    return;
  }

  // Notifica al proveedor/transportista/negocio que fue aprobado
  function notificarAprobado(nombre, correo) {
    if (!EMAILJS_PUBLIC_KEY || EMAILJS_PUBLIC_KEY === 'TU_PUBLIC_KEY_AQUI') return;
    emailjs.init(EMAILJS_PUBLIC_KEY);
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_APROBADO, {
      nombre: nombre || 'Usuario',
      email: correo,
      correo: correo,
      fecha: new Date().toLocaleString('es-MX')
    }).then(() => {
    }).catch((err) => {
      console.error('Error EmailJS:', err);
    });
  }
