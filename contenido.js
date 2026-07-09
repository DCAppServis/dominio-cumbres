// CENTRO DE CONTENIDO — Admin Module
(function(){ 'use strict';

var _FBFS = "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

var COL_NOTICIAS  = 'noticias';
var COL_PROYECTOS = 'proyectos';
var COL_REPORTES  = 'reportesCiudadanos';
var COL_EVENTOS   = 'eventos';
var COL_EMERG     = 'emergencias';

var _cntSec      = 'noticia';
var _cntFiltro   = 'todas';
var _cntItems    = [];
var _cntEditing  = null;
var _cntEmerg    = [];
var _cntEmergEdit= null;
var _cntEvFiltro = 'todas';
var _cntEvItems  = [];

function get(id){ return document.getElementById(id); }

function _nav(id, dir){
  try{ history.pushState({viewId:id},'',''); }catch(_){}
  if(window._goCore) window._goCore(id, dir||'right');
  else if(window.go) window.go(id, dir||'right');
}

function _fmt(ts){
  if(!ts) return '—';
  var d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'});
}

function _estadoBadge(e){
  var map = {
    publicado:   'background:#1FC26A22;color:#1FC26A',
    programado:  'background:#F5C51822;color:#c8940a',
    borrador:    'background:rgba(255,255,255,.08);color:rgba(255,255,255,.5)',
    rechazado:   'background:#D63A2A22;color:#D63A2A',
    pendiente:   'background:#F5C51822;color:#c8940a',
    revision:    'background:#1A7AB522;color:#1A7AB5',
    en_revision: 'background:#1A7AB522;color:#1A7AB5',
    finalizado:  'background:rgba(255,255,255,.06);color:rgba(255,255,255,.4)',
  };
  var labelMap = { en_revision: 'En revisión' };
  var s = map[e] || 'background:rgba(255,255,255,.08);color:rgba(255,255,255,.5)';
  var label = labelMap[e] || (e||'—');
  return '<span style="'+s+';border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">'+label+'</span>';
}

function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Firestore query con fallback ─────────────────────────────────────────────
async function _cargarCol(col, filtro){
  var db = window._fbDb;
  if(!db) return { err:'Sin conexión a Firebase (_fbDb no disponible)' };
  try {
    var F = await import(_FBFS);
    var snap;
    try {
      var q;
      if(filtro){
        q = F.query(F.collection(db,col), F.where('estado','==',filtro), F.orderBy('creadoEn','desc'), F.limit(80));
      } else {
        q = F.query(F.collection(db,col), F.orderBy('creadoEn','desc'), F.limit(80));
      }
      snap = await F.getDocs(q);
    } catch(e1){
      // Fallback sin orderBy (sin índice compuesto)
      var q2 = F.query(F.collection(db,col), F.limit(80));
      snap = await F.getDocs(q2);
    }
    return snap.docs.map(function(d){ return Object.assign({_id:d.id}, d.data()); });
  } catch(e){
    return { err: e.message || 'Error Firestore' };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HUB
// ══════════════════════════════════════════════════════════════════════════════
window.cntIrInforma     = function(){ _nav('v-cnt-informa'); };
window.cntIrEventos     = function(){ _nav('v-cnt-eventos'); window.cntCargarEventos&&window.cntCargarEventos(); };
window.cntIrEmergencias = function(){ _nav('v-cnt-emergencias'); window.cntCargarEmergencias&&window.cntCargarEmergencias(); };

// ══════════════════════════════════════════════════════════════════════════════
// INFORMA — navegación a listas
// ══════════════════════════════════════════════════════════════════════════════
var _secMeta = {
  noticia:  { label:'Noticias',  icon:'📰', col: COL_NOTICIAS,  sub:'Gestionar noticias' },
  proyecto: { label:'Proyectos', icon:'🏗️', col: COL_PROYECTOS, sub:'Gestionar proyectos' },
  reporte:  { label:'Reportes',  icon:'⚠️', col: COL_REPORTES,  sub:'Reportes ciudadanos' },
};

window.cntIrNoticias  = function(){ _cntSec='noticia';  _cntFiltro='todas'; _nav('v-cnt-lista'); window.cntCargarLista&&window.cntCargarLista(); };
window.cntIrProyectos = function(){ _cntSec='proyecto'; _cntFiltro='todas'; _nav('v-cnt-lista'); window.cntCargarLista&&window.cntCargarLista(); };
window.cntIrReportes  = function(){ _cntSec='reporte';  _cntFiltro='todas'; _nav('v-cnt-lista'); window.cntCargarLista&&window.cntCargarLista(); };

// ══════════════════════════════════════════════════════════════════════════════
// LISTA GENÉRICA
// ══════════════════════════════════════════════════════════════════════════════
window.cntCargarLista = async function(){
  var m = _secMeta[_cntSec];
  if(!m) return;

  var h = get('cnt-lista-titulo'); if(h) h.textContent = m.label;
  var s = get('cnt-lista-sub');    if(s) s.textContent = m.sub;

  // Tabs activos
  ['todas','en_revision','publicado','programado','borrador','rechazado','pendiente'].forEach(function(f){
    var b = get('cnt-ftab-'+f); if(b) b.classList.toggle('on', f === _cntFiltro);
  });
  // Ocultar tabs irrelevantes para reportes
  ['programado','borrador'].forEach(function(f){
    var b = get('cnt-ftab-'+f); if(b) b.style.display = (_cntSec==='reporte')?'none':'';
  });
  var bp = get('cnt-ftab-pendiente'); if(bp) bp.style.display = (_cntSec==='reporte')?'':'none';

  var listEl = get('cnt-lista-body');
  if(!listEl) return;
  listEl.innerHTML = '<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);font-size:13px;">Cargando...</div>';

  var filtro = (_cntFiltro === 'todas') ? null : _cntFiltro;
  var res = await _cargarCol(m.col, filtro);

  if(res && res.err){
    listEl.innerHTML = '<div style="padding:30px 20px;text-align:center;"><div style="font-size:28px;margin-bottom:10px;">⚠️</div>'
      +'<div style="color:#D63A2A;font-size:12px;font-weight:700;">Error al cargar datos</div>'
      +'<div style="color:rgba(255,255,255,.3);font-size:11px;margin-top:6px;line-height:1.5;">'+_esc(res.err)+'</div></div>';
    return;
  }

  _cntItems = res || [];

  var q = (get('cnt-lista-search')||{}).value || '';
  var items = q
    ? _cntItems.filter(function(it){ return (it.titulo||'').toLowerCase().includes(q.toLowerCase()); })
    : _cntItems;

  if(!items.length){
    listEl.innerHTML = '<div style="padding:40px 20px;text-align:center;">'
      +'<div style="font-size:32px;margin-bottom:12px;">📭</div>'
      +'<div style="color:rgba(255,255,255,.35);font-size:13px;">Sin resultados</div>'
      +'<div style="color:rgba(255,255,255,.2);font-size:11px;margin-top:6px;">Prueba otro filtro</div></div>';
    return;
  }

  listEl.innerHTML = items.map(function(it, i){
    var imgs = it.imagenes || (it.imagen ? [it.imagen] : []);
    var img = imgs[0] || '';
    var imgHtml = img
      ? '<img src="'+img+'" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="this.parentNode.innerHTML=\'<span style=font-size:20px>'+m.icon+'</span>\'">'
      : '<span style="font-size:20px;">'+m.icon+'</span>';
    return '<div class="cnt-item-card" onclick="cntAbrirItem(\''+it._id+'\')">'
      +'<div class="cnt-item-img">'+imgHtml+'</div>'
      +'<div class="cnt-item-info">'
        +'<div class="cnt-item-titulo">'+_esc(it.titulo||'Sin título')+'</div>'
        +'<div class="cnt-item-meta">'+_fmt(it.creadoEn)+'</div>'
        +'<div style="margin-top:4px;">'+_estadoBadge(it.estado||'borrador')+'</div>'
      +'</div>'
      +'<button class="cnt-3dot" onclick="event.stopPropagation();cntMenuItem(\''+it._id+'\','+i+')" title="Opciones">⋮</button>'
    +'</div>';
  }).join('');
};

window.cntFiltrarLista = function(f){
  _cntFiltro = f;
  window.cntCargarLista();
};

window.cntBuscarLista = function(v){
  if(!_cntItems.length){ window.cntCargarLista(); return; }
  var m = _secMeta[_cntSec]||{icon:'📄'};
  var items = v
    ? _cntItems.filter(function(it){ return (it.titulo||'').toLowerCase().includes(v.toLowerCase()); })
    : _cntItems;
  var listEl = get('cnt-lista-body');
  if(!listEl) return;
  if(!items.length){
    listEl.innerHTML = '<div style="padding:40px 20px;text-align:center;color:rgba(255,255,255,.3);font-size:13px;">Sin resultados para "'+_esc(v)+'"</div>';
    return;
  }
  listEl.innerHTML = items.map(function(it,i){
    var imgs = it.imagenes||(it.imagen?[it.imagen]:[]);
    var img = imgs[0]||'';
    var imgHtml = img
      ? '<img src="'+img+'" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="this.parentNode.innerHTML=\'<span style=font-size:20px>'+m.icon+'</span>\'">'
      : '<span style="font-size:20px;">'+m.icon+'</span>';
    return '<div class="cnt-item-card" onclick="cntAbrirItem(\''+it._id+'\')">'
      +'<div class="cnt-item-img">'+imgHtml+'</div>'
      +'<div class="cnt-item-info">'
        +'<div class="cnt-item-titulo">'+_esc(it.titulo||'Sin título')+'</div>'
        +'<div class="cnt-item-meta">'+_fmt(it.creadoEn)+'</div>'
        +'<div style="margin-top:4px;">'+_estadoBadge(it.estado||'borrador')+'</div>'
      +'</div>'
      +'<button class="cnt-3dot" onclick="event.stopPropagation();cntMenuItem(\''+it._id+'\','+i+')" title="Opciones">⋮</button>'
    +'</div>';
  }).join('');
};

// ── Abrir item para editar ────────────────────────────────────────────────────
window.cntAbrirItem = function(id){
  var it = _cntItems.find(function(x){ return x._id === id; });
  if(!it) return;
  _cntEditing = it;
  _renderEdit(it);
  _nav('v-cnt-edit');
};

function _renderEdit(it){
  var m = _secMeta[_cntSec] || {};
  var h = get('cnt-edit-titulo'); if(h) h.textContent = _cntSec==='reporte' ? 'Reporte Ciudadano' : 'Editar '+m.label.slice(0,-1);
  var s = get('cnt-edit-sub');    if(s) s.textContent = (it.titulo||'').slice(0,45)||'—';
  var body = get('cnt-edit-body');
  if(!body) return;

  var imgs = it.imagenes||(it.imagen?[it.imagen]:[]);
  var imgHtml = imgs.length
    ? imgs.map(function(u){ return '<img src="'+u+'" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:.5px solid rgba(255,255,255,.1);" onerror="this.style.display=\'none\'">'; }).join('')
    : '<div style="width:80px;height:80px;border-radius:10px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:28px;">'+(m.icon||'📄')+'</div>';

  var btnsHtml = '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">'
    +(it.estado!=='publicado' ? '<button onclick="cntCambiarEstado(\''+it._id+'\',\'publicado\')" class="cnt-btn-ok">✓ Publicar</button>' : '')
    +((_cntSec!=='reporte'&&it.estado!=='borrador') ? '<button onclick="cntCambiarEstado(\''+it._id+'\',\'borrador\')" class="cnt-btn-neu">◷ Borrador</button>' : '')
    +(it.estado!=='rechazado' ? '<button onclick="cntCambiarEstado(\''+it._id+'\',\'rechazado\')" class="cnt-btn-del">✕ Rechazar</button>' : '')
    +'</div>';

  body.innerHTML =
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">'+imgHtml+'</div>'
    +'<div class="cnt-field-row"><div class="cnt-field-lbl">Estado</div><div class="cnt-field-val" id="cnt-ef-estado-badge">'+_estadoBadge(it.estado||'—')+'</div></div>'
    +'<div class="cnt-field-row"><div class="cnt-field-lbl">Título</div>'
      +'<div class="cnt-field-val cnt-field-edit cnt-field-area" contenteditable="true" id="cnt-ef-titulo">'+_esc(it.titulo||'')+'</div></div>'
    +'<div class="cnt-field-row"><div class="cnt-field-lbl">Descripción</div>'
      +'<div class="cnt-field-val cnt-field-edit cnt-field-area" contenteditable="true" id="cnt-ef-desc">'+_esc(it.descripcion||'')+'</div></div>'
    +(it.ubicacion?'<div class="cnt-field-row"><div class="cnt-field-lbl">Ubicación</div><div class="cnt-field-val">'+_esc(it.ubicacion)+'</div></div>':'')
    +(it.autorNombre?'<div class="cnt-field-row"><div class="cnt-field-lbl">Autor</div><div class="cnt-field-val">'+_esc(it.autorNombre)+'</div></div>':'')
    +'<div class="cnt-field-row"><div class="cnt-field-lbl">Fecha</div><div class="cnt-field-val">'+_fmt(it.creadoEn)+'</div></div>'
    +'<div style="margin-top:16px;"><button onclick="cntGuardarEdicion(\''+it._id+'\')" class="cnt-btn-save">💾 Guardar cambios</button></div>'
    +btnsHtml;
}

window.cntGuardarEdicion = async function(id){
  var db = window._fbDb; if(!db) return;
  var m = _secMeta[_cntSec]; if(!m) return;
  var tEl = get('cnt-ef-titulo'), dEl = get('cnt-ef-desc');
  var upd = {};
  if(tEl) upd.titulo      = tEl.textContent.trim();
  if(dEl) upd.descripcion = dEl.textContent.trim();
  try {
    var F = await import(_FBFS);
    await F.updateDoc(F.doc(db, m.col, id), upd);
    var it = _cntItems.find(function(x){ return x._id===id; });
    if(it) Object.assign(it, upd);
    if(_cntEditing && _cntEditing._id===id) Object.assign(_cntEditing, upd);
    _showToast('✓ Guardado');
  } catch(e){ _showToast('Error: '+e.message); }
};

window.cntCambiarEstado = async function(id, estado){
  var db = window._fbDb; if(!db) return;
  var m = _secMeta[_cntSec]; if(!m) return;
  try {
    var F = await import(_FBFS);
    await F.updateDoc(F.doc(db, m.col, id), {estado:estado});
    var it = _cntItems.find(function(x){ return x._id===id; });
    if(it) it.estado = estado;
    if(_cntEditing && _cntEditing._id===id){ _cntEditing.estado = estado; }
    var badge = get('cnt-ef-estado-badge'); if(badge) badge.innerHTML = _estadoBadge(estado);
    _showToast('Estado → '+estado);
  } catch(e){ _showToast('Error: '+e.message); }
};

// ── Menú contextual 3 puntos ─────────────────────────────────────────────────
window.cntMenuItem = function(id, idx){
  var it = _cntItems[idx] || _cntItems.find(function(x){ return x._id===id; });
  if(!it) return;
  var overlay = get('cnt-menu-overlay'), sheet = get('cnt-menu-sheet');
  if(!overlay||!sheet) return;
  sheet.innerHTML =
    '<div style="text-align:center;padding:10px 0 14px;">'
    +'<div style="width:36px;height:4px;background:rgba(255,255,255,.12);border-radius:4px;margin:0 auto 12px;"></div>'
    +'<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">'+_esc((it.titulo||'').slice(0,40))+'</div>'
    +_estadoBadge(it.estado)+'</div>'
    +'<div class="cnt-menu-row" onclick="cntAbrirItem(\''+id+'\');cntCerrarMenu()">✏️ Ver / Editar</div>'
    +(it.estado!=='publicado'?'<div class="cnt-menu-row ok" onclick="cntCambiarEstadoLista(\''+id+'\',\'publicado\')">✓ Publicar</div>':'')
    +(_cntSec!=='reporte'&&it.estado!=='borrador'?'<div class="cnt-menu-row" onclick="cntCambiarEstadoLista(\''+id+'\',\'borrador\')">◷ Mover a borrador</div>':'')
    +(it.estado!=='rechazado'?'<div class="cnt-menu-row del" onclick="cntCambiarEstadoLista(\''+id+'\',\'rechazado\')">✕ Rechazar</div>':'')
    +'<div class="cnt-menu-row del" onclick="cntEliminarItem(\''+id+'\')">🗑 Eliminar</div>';
  overlay.style.display = 'flex';
  setTimeout(function(){ sheet.style.transform='translateY(0)'; }, 10);
};

window.cntCerrarMenu = function(){
  var sheet = get('cnt-menu-sheet'), overlay = get('cnt-menu-overlay');
  if(!sheet||!overlay) return;
  sheet.style.transform = 'translateY(100%)';
  setTimeout(function(){ overlay.style.display='none'; }, 280);
};

window.cntCambiarEstadoLista = async function(id, estado){
  cntCerrarMenu();
  var it = _cntItems.find(function(x){ return x._id===id; });
  var db = window._fbDb; if(!db) return;
  var m = _secMeta[_cntSec]; if(!m) return;
  try {
    var F = await import(_FBFS);
    await F.updateDoc(F.doc(db, m.col, id), {estado:estado});
    if(it) it.estado = estado;
    _showToast('Estado → '+estado);
    window.cntCargarLista();
  } catch(e){ _showToast('Error'); }
};

window.cntEliminarItem = async function(id){
  cntCerrarMenu();
  if(!confirm('¿Eliminar este elemento? Esta acción no se puede deshacer.')) return;
  var db = window._fbDb; if(!db) return;
  var m = _secMeta[_cntSec]; if(!m) return;
  try {
    var F = await import(_FBFS);
    await F.deleteDoc(F.doc(db, m.col, id));
    _cntItems = _cntItems.filter(function(x){ return x._id!==id; });
    _showToast('Eliminado');
    window.cntCargarLista();
  } catch(e){ _showToast('Error al eliminar'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// EVENTOS
// ══════════════════════════════════════════════════════════════════════════════
window.cntCargarEventos = async function(filtro){
  if(filtro !== undefined) _cntEvFiltro = filtro;
  ['todas','pendiente','publicado','rechazado','finalizado'].forEach(function(f){
    var b = get('cnt-ev-ftab-'+f); if(b) b.classList.toggle('on', f===_cntEvFiltro);
  });
  var listEl = get('cnt-ev-body');
  if(!listEl) return;
  listEl.innerHTML = '<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);font-size:13px;">Cargando...</div>';

  var f2 = (_cntEvFiltro==='todas') ? null : _cntEvFiltro;
  var res = await _cargarCol(COL_EVENTOS, f2);

  if(res && res.err){
    listEl.innerHTML = '<div style="padding:30px 20px;text-align:center;"><div style="font-size:28px;margin-bottom:10px;">⚠️</div>'
      +'<div style="color:#D63A2A;font-size:12px;font-weight:700;">Error al cargar eventos</div>'
      +'<div style="color:rgba(255,255,255,.3);font-size:11px;margin-top:6px;">'+_esc(res.err)+'</div></div>';
    return;
  }
  _cntEvItems = res || [];

  if(!_cntEvItems.length){
    listEl.innerHTML = '<div style="padding:40px 20px;text-align:center;"><div style="font-size:32px;margin-bottom:12px;">📭</div><div style="color:rgba(255,255,255,.35);font-size:13px;">Sin eventos</div></div>';
    return;
  }

  listEl.innerHTML = _cntEvItems.map(function(it, i){
    var imgs = it.imagenes||(it.imagen?[it.imagen]:[]);
    var img = imgs[0]||it.portada||'';
    var imgHtml = img
      ? '<img src="'+img+'" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="this.style.display=\'none\'">'
      : '<span style="font-size:22px;">🎉</span>';
    return '<div class="cnt-item-card" onclick="cntAbrirEvento(\''+it._id+'\')">'
      +'<div class="cnt-item-img">'+imgHtml+'</div>'
      +'<div class="cnt-item-info">'
        +'<div class="cnt-item-titulo">'+_esc(it.nombre||it.titulo||'Sin nombre')+'</div>'
        +'<div class="cnt-item-meta">'+(it.fecha?_fmt(it.fecha):_fmt(it.creadoEn))+'</div>'
        +'<div style="margin-top:4px;">'+_estadoBadge(it.estado||'pendiente')+'</div>'
      +'</div>'
      +'<button class="cnt-3dot" onclick="event.stopPropagation();cntMenuEvento(\''+it._id+'\','+i+')" title="Opciones">⋮</button>'
    +'</div>';
  }).join('');
};

window.cntAbrirEvento = function(id){
  var it = _cntEvItems.find(function(x){ return x._id===id; });
  if(!it) return;
  _cntEditing = it;
  _renderEvEdit(it);
  _nav('v-cnt-ev-edit');
};

function _renderEvEdit(it){
  var h = get('cnt-ev-edit-titulo'); if(h) h.textContent = it.nombre||it.titulo||'Evento';
  var s = get('cnt-ev-edit-sub');    if(s) s.textContent = _fmt(it.creadoEn);
  var body = get('cnt-ev-edit-body'); if(!body) return;
  var imgs = it.imagenes||(it.imagen?[it.imagen]:[]);
  var imgHtml = imgs.length
    ? imgs.map(function(u){ return '<img src="'+u+'" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:.5px solid rgba(255,255,255,.1);" onerror="this.style.display=\'none\'">'; }).join('')
    : '<div style="width:80px;height:80px;border-radius:10px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:28px;">🎉</div>';

  body.innerHTML =
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">'+imgHtml+'</div>'
    +'<div class="cnt-field-row"><div class="cnt-field-lbl">Estado</div><div class="cnt-field-val" id="cnt-ev-estado-badge">'+_estadoBadge(it.estado||'pendiente')+'</div></div>'
    +'<div class="cnt-field-row"><div class="cnt-field-lbl">Nombre</div><div class="cnt-field-val">'+_esc(it.nombre||it.titulo||'—')+'</div></div>'
    +'<div class="cnt-field-row"><div class="cnt-field-lbl">Descripción</div><div class="cnt-field-val" style="white-space:pre-wrap;font-size:12px;line-height:1.5;">'+_esc(it.descripcion||'—')+'</div></div>'
    +(it.fecha?'<div class="cnt-field-row"><div class="cnt-field-lbl">Fecha</div><div class="cnt-field-val">'+_fmt(it.fecha)+'</div></div>':'')
    +((it.lugar||it.ubicacion)?'<div class="cnt-field-row"><div class="cnt-field-lbl">Lugar</div><div class="cnt-field-val">'+_esc(it.lugar||it.ubicacion)+'</div></div>':'')
    +(it.organizadorNombre?'<div class="cnt-field-row"><div class="cnt-field-lbl">Organizador</div><div class="cnt-field-val">'+_esc(it.organizadorNombre)+'</div></div>':'')
    +'<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">'
    +(it.estado!=='publicado'?'<button onclick="cntCambiarEstadoEv(\''+it._id+'\',\'publicado\')" class="cnt-btn-ok">✓ Publicar</button>':'')
    +(it.estado!=='rechazado'?'<button onclick="cntCambiarEstadoEv(\''+it._id+'\',\'rechazado\')" class="cnt-btn-del">✕ Rechazar</button>':'')
    +'</div>';
}

window.cntCambiarEstadoEv = async function(id, estado){
  var db = window._fbDb; if(!db) return;
  try {
    var F = await import(_FBFS);
    await F.updateDoc(F.doc(db, COL_EVENTOS, id), {estado:estado});
    var it = _cntEvItems.find(function(x){ return x._id===id; });
    if(it) it.estado = estado;
    if(_cntEditing && _cntEditing._id===id) _cntEditing.estado = estado;
    var badge = get('cnt-ev-estado-badge'); if(badge) badge.innerHTML = _estadoBadge(estado);
    _showToast('Estado → '+estado);
  } catch(e){ _showToast('Error: '+e.message); }
};

window.cntMenuEvento = function(id, idx){
  var it = _cntEvItems[idx]||_cntEvItems.find(function(x){ return x._id===id; });
  if(!it) return;
  var overlay = get('cnt-menu-overlay'), sheet = get('cnt-menu-sheet');
  if(!overlay||!sheet) return;
  sheet.innerHTML =
    '<div style="text-align:center;padding:10px 0 14px;">'
    +'<div style="width:36px;height:4px;background:rgba(255,255,255,.12);border-radius:4px;margin:0 auto 12px;"></div>'
    +'<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">'+_esc((it.nombre||it.titulo||'').slice(0,40))+'</div>'
    +_estadoBadge(it.estado)+'</div>'
    +'<div class="cnt-menu-row" onclick="cntAbrirEvento(\''+id+'\');cntCerrarMenu()">👁 Ver detalle</div>'
    +(it.estado!=='publicado'?'<div class="cnt-menu-row ok" onclick="cntCambiarEstadoEvLista(\''+id+'\',\'publicado\')">✓ Publicar</div>':'')
    +(it.estado!=='rechazado'?'<div class="cnt-menu-row del" onclick="cntCambiarEstadoEvLista(\''+id+'\',\'rechazado\')">✕ Rechazar</div>':'')
    +'<div class="cnt-menu-row del" onclick="cntEliminarEvento(\''+id+'\')">🗑 Eliminar</div>';
  overlay.style.display = 'flex';
  setTimeout(function(){ sheet.style.transform='translateY(0)'; }, 10);
};

window.cntCambiarEstadoEvLista = async function(id, estado){
  cntCerrarMenu();
  var it = _cntEvItems.find(function(x){ return x._id===id; });
  var db = window._fbDb; if(!db) return;
  try {
    var F = await import(_FBFS);
    await F.updateDoc(F.doc(db, COL_EVENTOS, id), {estado:estado});
    if(it) it.estado = estado;
    _showToast('Estado → '+estado);
    window.cntCargarEventos();
  } catch(e){ _showToast('Error'); }
};

window.cntEliminarEvento = async function(id){
  cntCerrarMenu();
  if(!confirm('¿Eliminar este evento?')) return;
  var db = window._fbDb; if(!db) return;
  try {
    var F = await import(_FBFS);
    await F.deleteDoc(F.doc(db, COL_EVENTOS, id));
    _cntEvItems = _cntEvItems.filter(function(x){ return x._id!==id; });
    _showToast('Eliminado');
    window.cntCargarEventos();
  } catch(e){ _showToast('Error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// EMERGENCIAS
// ══════════════════════════════════════════════════════════════════════════════
window.cntCargarEmergencias = async function(){
  var listEl = get('cnt-emerg-body');
  if(!listEl) return;
  listEl.innerHTML = '<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);font-size:13px;">Cargando...</div>';

  var db = window._fbDb;
  if(!db){ listEl.innerHTML = '<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);">Sin conexión</div>'; return; }

  try {
    var F = await import(_FBFS);
    var snap;
    try {
      var q = F.query(F.collection(db, COL_EMERG), F.orderBy('orden','asc'));
      snap = await F.getDocs(q);
    } catch(_){
      snap = await F.getDocs(F.collection(db, COL_EMERG));
    }
    _cntEmerg = snap.docs.map(function(d){ return Object.assign({_id:d.id}, d.data()); });
    _cntEmerg.sort(function(a,b){ return (a.orden||0)-(b.orden||0); });
  } catch(e){
    listEl.innerHTML = '<div style="padding:30px 20px;text-align:center;"><div style="font-size:28px;margin-bottom:10px;">⚠️</div>'
      +'<div style="color:#D63A2A;font-size:12px;font-weight:700;">Error al cargar</div>'
      +'<div style="color:rgba(255,255,255,.3);font-size:11px;margin-top:6px;">'+_esc(e.message)+'</div></div>';
    return;
  }
  _renderEmergencias();
};

function _renderEmergencias(){
  var listEl = get('cnt-emerg-body');
  if(!listEl) return;
  if(!_cntEmerg.length){
    listEl.innerHTML = '<div style="padding:40px 20px;text-align:center;">'
      +'<div style="font-size:36px;margin-bottom:12px;">🚨</div>'
      +'<div style="color:rgba(255,255,255,.35);font-size:13px;margin-bottom:20px;">Sin contactos de emergencia</div>'
      +'<button onclick="cntNuevaEmergencia()" style="background:#D63A2A;border:none;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;font-family:inherit;">+ Agregar contacto</button>'
      +'</div>';
    return;
  }
  listEl.innerHTML = _cntEmerg.map(function(em, i){
    var activo = em.estado !== 'inactivo';
    return '<div class="cnt-emerg-row">'
      +'<div class="cnt-emerg-num">'+String(i+1).padStart(2,'0')+'</div>'
      +'<div class="cnt-emerg-drag">⠿</div>'
      +'<div class="cnt-emerg-ic">'+_esc(em.icono||'🚨')+'</div>'
      +'<div class="cnt-emerg-info">'
        +'<div class="cnt-emerg-nombre">'+_esc(em.nombre||'Sin nombre')+'</div>'
        +'<div class="cnt-emerg-desc">'+_esc((em.descripcion||em.categoria||'').slice(0,40))+'</div>'
      +'</div>'
      +(activo
        ? '<span class="cnt-emerg-badge">Activo</span>'
        : '<span class="cnt-emerg-badge inactivo">Inactivo</span>')
      +'<button class="cnt-3dot" style="font-size:18px;" onclick="cntEditarEmergencia(\''+em._id+'\')">›</button>'
    +'</div>';
  }).join('');
}

window.cntEditarEmergencia = function(id){
  var em = _cntEmerg.find(function(x){ return x._id===id; });
  if(!em) return;
  _cntEmergEdit = JSON.parse(JSON.stringify(em));
  _renderEmergEdit(false);
  _nav('v-cnt-emerg-edit');
};

window.cntNuevaEmergencia = function(){
  _cntEmergEdit = { icono:'🚨', nombre:'', descripcion:'', categoria:'Emergencias', estado:'activo', acciones:[], orden:_cntEmerg.length };
  _renderEmergEdit(true);
  _nav('v-cnt-emerg-edit');
};

function _tipoIcon(t){
  return {llamada:'📞',whatsapp:'💬',maps:'📍',correo:'✉️',web:'🌐',otro:'⚡'}[t]||'⚡';
}

function _renderEmergEdit(isNew){
  var em = _cntEmergEdit || {};
  var h = get('cnt-emerg-edit-titulo'); if(h) h.textContent = isNew ? 'Nuevo Contacto' : 'Editar Contacto';
  var s = get('cnt-emerg-edit-sub');    if(s) s.textContent = em.nombre||'';
  var body = get('cnt-emerg-edit-body'); if(!body) return;

  var acciones = em.acciones||[];
  var accionesHtml = acciones.map(function(ac, i){
    return '<div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,.04);border-radius:10px;padding:8px 10px;margin-bottom:6px;">'
      +'<select onchange="_cntAcTipo('+i+',this.value)" style="background:#0C1A10;border:.5px solid rgba(255,255,255,.1);border-radius:8px;padding:5px 6px;font-size:11px;color:#fff;outline:none;font-family:inherit;flex-shrink:0;">'
        +['llamada','whatsapp','maps','correo','web','otro'].map(function(t){
          return '<option value="'+t+'"'+(ac.tipo===t?' selected':'')+'>'+_tipoIcon(t)+' '+t+'</option>';
        }).join('')
      +'</select>'
      +'<input placeholder="Etiqueta" value="'+_esc(ac.etiqueta||'')+'" oninput="_cntAcEtiqueta('+i+',this.value)" style="background:rgba(255,255,255,.06);border:.5px solid rgba(255,255,255,.08);border-radius:8px;padding:5px 8px;font-size:12px;color:#fff;outline:none;font-family:inherit;flex:1;min-width:0;">'
      +'<input placeholder="Teléfono / URL..." value="'+_esc(ac.valor||'')+'" oninput="_cntAcValor('+i+',this.value)" style="background:rgba(255,255,255,.06);border:.5px solid rgba(255,255,255,.08);border-radius:8px;padding:5px 8px;font-size:12px;color:#fff;outline:none;font-family:inherit;flex:1;min-width:0;">'
      +'<button onclick="_cntEliminarAccion('+i+')" style="background:none;border:none;color:rgba(255,255,255,.3);font-size:14px;cursor:pointer;padding:0 4px;font-family:inherit;">✕</button>'
    +'</div>';
  }).join('');

  body.innerHTML =
    '<div class="cnt-form-group"><div class="cnt-form-lbl">Ícono</div>'
    +'<input class="cnt-form-input" id="cnt-ef-icono" value="'+_esc(em.icono||'🚨')+'" maxlength="4" style="font-size:22px;text-align:center;width:60px;"></div>'
    +'<div class="cnt-form-group"><div class="cnt-form-lbl">Nombre del servicio</div>'
    +'<input class="cnt-form-input" id="cnt-ef-nombre" value="'+_esc(em.nombre||'')+'" placeholder="Cruz Roja, Bomberos..."></div>'
    +'<div class="cnt-form-group"><div class="cnt-form-lbl">Descripción</div>'
    +'<input class="cnt-form-input" id="cnt-ef-desc" value="'+_esc(em.descripcion||'')+'" placeholder="Descripción corta"></div>'
    +'<div class="cnt-form-group"><div class="cnt-form-lbl">Categoría</div>'
    +'<select class="cnt-form-input" id="cnt-ef-cat">'
      +['Emergencias','Seguridad','Salud','Bomberos','Municipio','Otro'].map(function(c){
        return '<option'+(em.categoria===c?' selected':'')+'>'+c+'</option>';
      }).join('')
    +'</select></div>'
    +'<div class="cnt-form-group"><div class="cnt-form-lbl">Estado</div>'
    +'<select class="cnt-form-input" id="cnt-ef-estado">'
      +'<option value="activo"'+(em.estado!=='inactivo'?' selected':'')+'>Activo</option>'
      +'<option value="inactivo"'+(em.estado==='inactivo'?' selected':'')+'>Inactivo</option>'
    +'</select></div>'
    +'<div style="margin-top:16px;">'
    +'<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Acciones de contacto</div>'
    +'<div id="cnt-acciones-list">'+accionesHtml+'</div>'
    +'<button onclick="cntAgregarAccion()" style="background:rgba(255,255,255,.06);border:.5px solid rgba(255,255,255,.12);border-radius:10px;padding:8px 14px;font-size:12px;color:rgba(255,255,255,.6);cursor:pointer;font-family:inherit;margin-top:6px;">+ Agregar acción</button>'
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-top:20px;">'
    +'<button onclick="cntGuardarEmergencia()" class="cnt-btn-save" style="flex:1;">💾 Guardar</button>'
    +(!isNew?'<button onclick="cntEliminarEmergencia(\''+em._id+'\')" class="cnt-btn-del">🗑</button>':'')
    +'</div>';
}

window._cntAcTipo      = function(i,v){ if(_cntEmergEdit&&_cntEmergEdit.acciones[i]) _cntEmergEdit.acciones[i].tipo=v; };
window._cntAcEtiqueta  = function(i,v){ if(_cntEmergEdit&&_cntEmergEdit.acciones[i]) _cntEmergEdit.acciones[i].etiqueta=v; };
window._cntAcValor     = function(i,v){ if(_cntEmergEdit&&_cntEmergEdit.acciones[i]) _cntEmergEdit.acciones[i].valor=v; };

window.cntAgregarAccion = function(){
  if(!_cntEmergEdit) return;
  if(!_cntEmergEdit.acciones) _cntEmergEdit.acciones = [];
  _cntEmergEdit.acciones.push({tipo:'llamada',etiqueta:'',valor:'',orden:_cntEmergEdit.acciones.length,estado:'activo'});
  _renderEmergEdit(!_cntEmergEdit._id);
};

window._cntEliminarAccion = function(i){
  if(!_cntEmergEdit||!_cntEmergEdit.acciones) return;
  _cntEmergEdit.acciones.splice(i,1);
  _renderEmergEdit(!_cntEmergEdit._id);
};

window.cntGuardarEmergencia = async function(){
  if(!_cntEmergEdit) return;
  var db = window._fbDb; if(!db) return;

  var icono  = (get('cnt-ef-icono')||{}).value  || '🚨';
  var nombre = (get('cnt-ef-nombre')||{}).value || '';
  var desc   = (get('cnt-ef-desc')||{}).value   || '';
  var cat    = (get('cnt-ef-cat')||{}).value     || 'Emergencias';
  var estado = (get('cnt-ef-estado')||{}).value  || 'activo';

  if(!nombre.trim()){ alert('El nombre es obligatorio'); return; }

  var data = {
    icono:icono.trim(), nombre:nombre.trim(), descripcion:desc.trim(),
    categoria:cat, estado:estado, acciones:_cntEmergEdit.acciones||[], orden:_cntEmergEdit.orden||0,
  };

  try {
    var F = await import(_FBFS);
    if(_cntEmergEdit._id){
      await F.updateDoc(F.doc(db, COL_EMERG, _cntEmergEdit._id), data);
      var idx = _cntEmerg.findIndex(function(x){ return x._id===_cntEmergEdit._id; });
      if(idx>=0) _cntEmerg[idx] = Object.assign({_id:_cntEmergEdit._id}, data);
    } else {
      data.creadoEn = F.serverTimestamp();
      var ref = await F.addDoc(F.collection(db, COL_EMERG), data);
      _cntEmerg.push(Object.assign({_id:ref.id}, data));
    }
    _showToast('✓ Guardado');
    if(window._goCore) window._goCore('v-cnt-emergencias','left');
    else if(window.go) window.go('v-cnt-emergencias','left');
    setTimeout(function(){ _renderEmergencias(); }, 320);
  } catch(e){ _showToast('Error: '+e.message); }
};

window.cntEliminarEmergencia = async function(id){
  if(!confirm('¿Eliminar este contacto?')) return;
  var db = window._fbDb; if(!db) return;
  try {
    var F = await import(_FBFS);
    await F.deleteDoc(F.doc(db, COL_EMERG, id));
    _cntEmerg = _cntEmerg.filter(function(x){ return x._id!==id; });
    _showToast('Eliminado');
    if(window._goCore) window._goCore('v-cnt-emergencias','left');
    else if(window.go) window.go('v-cnt-emergencias','left');
    setTimeout(function(){ _renderEmergencias(); }, 320);
  } catch(e){ _showToast('Error'); }
};

// ── Toast ─────────────────────────────────────────────────────────────────────
var _toastTimer = null;
function _showToast(msg){
  var t = get('cnt-toast'); if(!t) return;
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(10px)';
  }, 2500);
}

})();
