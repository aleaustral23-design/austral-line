// GRUPO JURADO — mails a jurados con Resend: recordatorios antes del evento y agradecimiento + material después.
import Link from "next/link";
import { requireRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { modoPrueba } from "../_resend";
import { cancelarProgramados, enviarPrueba, guardarMaterialPost, programarPostEvento, programarRecordatorios } from "./acciones";
import { armarPostEvento, cargarDatos, estadosActivos, faltantesPostEvento, urlBase, ventanaPostEvento } from "./datos";
import { fechaHora, mailRecordatorio } from "./plantillas";

const nombresTipo: Record<string, string> = {
  recordatorio_24h: "Recordatorio 24 h",
  recordatorio_1h: "Recordatorio 1 h",
  post_evento: "Post-evento",
  prueba: "Prueba",
};

export default async function Comunicaciones({ searchParams }: PageProps<"/jurado/comunicaciones">) {
  await requireRol(); // solo admin
  const { evento: eventoElegido, ok, error } = await searchParams;
  const supabase = await createClient();

  const { data: eventos, error: errorEventos } = await supabase.from("eventos").select("id, nombre, inicio").order("inicio");
  if (errorEventos) throw errorEventos;
  const ahora = new Date().toISOString();
  const ahoraMs = new Date(ahora).getTime();
  const eventoId = typeof eventoElegido === "string" ? eventoElegido : (eventos.find((e) => e.inicio > ahora) ?? eventos.at(-1))?.id;

  const datos = eventoId ? await cargarDatos(supabase, eventoId) : null;
  const { data: envios, error: errorEnvios } = eventoId
    ? await supabase.from("jurado_envios").select("*").eq("evento_id", eventoId).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (errorEnvios) throw errorEnvios;

  const pendientes = (tipos: string[]) =>
    envios.filter((e) => tipos.includes(e.tipo) && ["programado", "simulado"].includes(e.estado) && e.programado_para && e.programado_para > ahora);
  // Jurados que todavía no tienen cada mail (por ejemplo, si se sumaron después de programar).
  const activos = envios.filter((e) => estadosActivos().includes(e.estado));
  const sinMail = (tipos: string[]) =>
    (datos?.jurados ?? []).filter((j) => !activos.some((e) => tipos.includes(e.tipo) && e.persona_id === j.id));
  const yaHayRecordatorios = activos.some((e) => e.tipo.startsWith("recordatorio"));
  const yaHayPost = activos.some((e) => e.tipo === "post_evento");
  const faltanRecordatorio = sinMail(["recordatorio_24h", "recordatorio_1h"]);
  const faltanPost = sinMail(["post_evento"]);
  const nombres = (js: { nombre: string }[]) => js.map((j) => j.nombre).join(", ");
  const ventana = ventanaPostEvento(datos?.evento.inicio ?? ahora);
  const urlMails = await urlBase();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/jurado" className="text-sm text-[#666] hover:text-primary">← Proyectos</Link>
      <h1 className="mt-6 font-serif text-2xl">Mails a jurados</h1>
      <p className="mt-1 mb-8 text-sm text-[#666]">Recordatorios antes del evento y agradecimiento con fotos, video y contactos después.</p>

      {modoPrueba() && (
        <p className="mb-6 border-l-2 border-primary pl-4 text-sm text-[#666]">
          Modo prueba: falta la clave de Resend (<code>RESEND_API_KEY</code>), así que los mails se registran como &quot;simulado&quot; y no sale ninguno.
        </p>
      )}
      {typeof ok === "string" && <p className="mb-6 border-l-2 border-primary pl-4 text-sm">{ok}</p>}
      {typeof error === "string" && <p className="mb-6 border-l-2 border-destructive pl-4 text-sm text-destructive">{error}</p>}

      <form className="mb-10 flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="evento">Evento</Label>
          <select id="evento" name="evento" defaultValue={eventoId} className="h-9 min-w-64 border bg-background px-2 text-sm">
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {fechaHora(e.inicio)}</option>)}
          </select>
        </div>
        <Button type="submit" variant="outline" size="lg">Ver</Button>
      </form>

      {!datos ? (
        <div className="border p-10 text-center text-sm text-[#666]">No hay eventos cargados. Los eventos los carga el grupo Austral.</div>
      ) : (
        <>
          <div className="mb-12 grid gap-1 border bg-card p-6">
            <span className="font-serif text-xl">{datos.evento.nombre}</span>
            <span className="text-sm text-[#666]">{fechaHora(datos.evento.inicio)}{datos.evento.lugar && ` · ${datos.evento.lugar}`}</span>
            <span className="mt-2 text-sm">
              {datos.jurados.length} jurados reciben los mails{datos.jurados.length > 0 && `: ${datos.jurados.map((j) => j.nombre).join(", ")}`}
            </span>
          </div>

          <section className="mb-14">
            <h2 className="mb-1 font-serif text-xl">Antes del evento</h2>
            <p className="mb-6 text-sm text-[#666]">
              Dos recordatorios por jurado: 24 h y 1 h antes del inicio, con fecha, lugar, proyectos, criterios y link a las fichas.
            </p>
            {(() => {
              // Muestra el recordatorio que va a salir: si ya pasó el de 24 h, el de 1 h.
              const tipo = new Date(datos.evento.inicio).getTime() - 24 * 60 * 60 * 1000 > ahoraMs ? "recordatorio_24h" : "recordatorio_1h";
              return (
                <>
                  <p className="mb-2 text-xs text-[#666]">Vista previa: recordatorio {tipo === "recordatorio_24h" ? "de 24 h" : "de 1 h"}</p>
                  <iframe
                    title="Vista previa del recordatorio"
                    sandbox=""
                    srcDoc={mailRecordatorio({ tipo, jurado: datos.jurados[0]?.nombre ?? "Nombre del jurado", ...datos, url: urlMails }).html}
                    className="mb-6 h-[480px] w-full border bg-white"
                  />
                </>
              );
            })()}
            <div className="flex flex-wrap gap-3">
              <form action={programarRecordatorios}>
                <input type="hidden" name="evento_id" value={datos.evento.id} />
                <Button type="submit" size="lg" disabled={yaHayRecordatorios && faltanRecordatorio.length === 0}>
                  {yaHayRecordatorios && faltanRecordatorio.length > 0
                    ? `Programar para ${faltanRecordatorio.length === 1 ? "el jurado que falta" : `los ${faltanRecordatorio.length} jurados que faltan`}`
                    : "Programar recordatorios"}
                </Button>
              </form>
              <form action={enviarPrueba}>
                <input type="hidden" name="evento_id" value={datos.evento.id} />
                <input type="hidden" name="tipo" value="recordatorio" />
                <Button type="submit" variant="outline" size="lg">Mandarme una prueba</Button>
              </form>
              {pendientes(["recordatorio_24h", "recordatorio_1h"]).length > 0 && (
                <form action={cancelarProgramados}>
                  <input type="hidden" name="evento_id" value={datos.evento.id} />
                  <input type="hidden" name="grupo" value="recordatorios" />
                  <Button type="submit" variant="destructive" size="lg">Cancelar recordatorios pendientes</Button>
                </form>
              )}
            </div>
            {yaHayRecordatorios && (
              <p className="mt-3 text-sm text-[#666]">
                {faltanRecordatorio.length > 0
                  ? `Todavía no tienen recordatorio: ${nombres(faltanRecordatorio)}. `
                  : "Todos los jurados tienen sus recordatorios. "}
                Si cambia el horario del evento, cancelá los pendientes y volvé a programarlos.
              </p>
            )}
          </section>

          <section className="mb-14">
            <h2 className="mb-1 font-serif text-xl">Después del evento</h2>
            <p className="mb-6 text-sm text-[#666]">
              Sale el día siguiente a las 9:00 ({fechaHora(ventana.desde.toISOString())}) con 3 fotos destacadas, 1 video resumen y los contactos de cada equipo. Pegá links públicos (Google Drive, Fotos, YouTube…).
            </p>
            {ahoraMs > ventana.hasta.getTime() && !yaHayPost && (
              <p className="mb-6 border-l-2 border-destructive pl-4 text-sm">
                Ya pasó la ventana ideal (día siguiente al evento, de 9 a 12 hs). Si lo programás ahora, sale en el momento para no demorarlo más.
              </p>
            )}
            <form className="grid gap-5">
              <input type="hidden" name="evento_id" value={datos.evento.id} />
              <input type="hidden" name="tipo" value="post_evento" />
              <div className="grid gap-4 md:grid-cols-3">
                {(["foto_1", "foto_2", "foto_3"] as const).map((campo, i) => (
                  <div key={campo} className="grid gap-2">
                    <Label htmlFor={campo}>Foto destacada {i + 1}</Label>
                    <Input id={campo} name={campo} inputMode="url" placeholder="https://" defaultValue={datos.material?.[campo] ?? ""} />
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="video">Video resumen</Label>
                <Input id="video" name="video" inputMode="url" placeholder="https://" defaultValue={datos.material?.video ?? ""} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mensaje">Mensaje (opcional)</Label>
                <textarea
                  id="mensaje"
                  name="mensaje"
                  rows={3}
                  defaultValue={datos.material?.mensaje ?? ""}
                  className="w-full border bg-transparent p-3 text-sm outline-none focus-visible:border-ring"
                />
              </div>

              <div className="border p-4 text-sm">
                <p className="mb-2 font-medium">Contactos que van en el mail</p>
                {datos.proyectos.map((p) => (
                  <p key={p.id} className={p.integrantes.length ? "text-[#666]" : "text-destructive"}>
                    {p.nombre}: {p.integrantes.length ? p.integrantes.map((i) => `${i.nombre} (${i.email})`).join(", ") : "sin integrantes cargados"}
                  </p>
                ))}
              </div>
              {faltantesPostEvento(datos).length > 0 ? (
                <p className="text-sm text-[#666]">Para poder mandarlo falta: {faltantesPostEvento(datos).join("; ")}. Guardá el material para ver la vista previa.</p>
              ) : (
                <div>
                  <p className="mb-2 text-xs text-[#666]">Vista previa del mail post-evento (con el material guardado)</p>
                  <iframe
                    title="Vista previa del mail post-evento"
                    sandbox=""
                    srcDoc={armarPostEvento(datos, datos.jurados[0]?.nombre ?? "Nombre del jurado").html}
                    className="h-[480px] w-full border bg-white"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" size="lg" formAction={programarPostEvento} disabled={yaHayPost && faltanPost.length === 0}>
                  {yaHayPost && faltanPost.length > 0
                    ? `Mandar a ${faltanPost.length === 1 ? "el jurado que falta" : `los ${faltanPost.length} jurados que faltan`}`
                    : ahoraMs > ventana.desde.getTime() ? "Mandar mail post-evento ahora" : "Programar mail post-evento"}
                </Button>
                <Button type="submit" variant="outline" size="lg" formAction={enviarPrueba}>Mandarme una prueba</Button>
                <Button type="submit" variant="ghost" size="lg" formAction={guardarMaterialPost}>Guardar material</Button>
              </div>
            </form>
            {yaHayPost && faltanPost.length > 0 && (
              <p className="mt-3 text-sm text-[#666]">Todavía no lo tienen: {nombres(faltanPost)}.</p>
            )}
            {pendientes(["post_evento"]).length > 0 && (
              <form action={cancelarProgramados} className="mt-3">
                <input type="hidden" name="evento_id" value={datos.evento.id} />
                <input type="hidden" name="grupo" value="post_evento" />
                <Button type="submit" variant="destructive" size="lg">Cancelar mail post-evento pendiente</Button>
              </form>
            )}
          </section>

          <section>
            <h2 className="mb-4 font-serif text-xl">Historial</h2>
            {envios.length === 0 ? (
              <p className="border p-6 text-center text-sm text-[#666]">Todavía no se mandó ningún mail para este evento.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Tipo</TableHead><TableHead>Para</TableHead><TableHead>Sale</TableHead><TableHead>Estado</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {envios.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{nombresTipo[e.tipo] ?? e.tipo}</TableCell>
                      <TableCell className="text-[#666]">{e.email}</TableCell>
                      <TableCell className="text-[#666]">{e.programado_para ? fechaHora(e.programado_para) : fechaHora(e.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={e.estado === "error" ? "destructive" : "outline"} className="capitalize" title={e.error ?? undefined}>{e.estado}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
