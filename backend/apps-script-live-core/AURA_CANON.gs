// AURA CANON -- ARQUITECTURA APROBADA (CONGELADA)
// Fecha de congelamiento: 2026-09-17
// Autoridad: Director de Marketing, DGL.
//
// Estas reglas son CANONICAS. No se reinterpretan ni se modifican sin
// instruccion explicita del usuario. Cualquier instruccion futura que
// parezca contradecir este canon debe detenerse y senalar el conflicto
// antes de tocar codigo.
//
// 1. Retention/Reactivation y Acquisition/Landing Pages son motores
// completamente independientes entre si.
// 2. Retention trabaja cuentas existentes y campanas de email.
// 3. Acquisition trabaja SEO/GEO, inbound y Landing Pages.
// 4. Las Landing Pages pertenecen exclusivamente a Acquisition/SEO-GEO.
// 5. Las Landing Pages se generan, revisan y publican en un ciclo
// automatico cada 3 meses.
// 6. No se relacionan Landing Pages con campanas de Retention/Reactivation.
// 7. El buzon canonico de Marketing (Script Property AURA_GMAIL_SOURCE_MAILBOX) sigue siendo el remitente de Retention por ahora.
// 8. No se amplia alcance ni se cambian reglas ya aprobadas para
// resolver bugs.
// 9. Los bugs se corrigen localmente, sin redisenar la arquitectura.
// 10. Ante una instruccion que parezca contradecir este canon: detenerse
// y senalar el conflicto antes de modificar codigo.
//
// Este archivo es la fuente de verdad para futuros cambios en el
// proyecto AURA. AURA_CANON_INFO existe solo como referencia legible
// desde el menu Ejecutar.

function AURA_CANON_INFO() {
Logger.log('AURA CANON vigente desde 2026-09-17. Ver comentarios en la parte superior de este archivo.');
}