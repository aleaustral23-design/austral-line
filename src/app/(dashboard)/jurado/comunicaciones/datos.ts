// GRUPO JURADO — datos que necesitan los mails de un evento (los usa la pantalla y las acciones).
import { headers } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import { esLinkWeb, estadosEvaluables } from "../_lib";
import { modoPrueba } from "../_resend";
import { diaSiguienteALas9, mailPostEvento } from "./plantillas";

type Cliente = Awaited<ReturnType<typeof createClient>>;

export async function cargarDatos(supabase: Cliente, eventoId: string) {
  const [evento, jurados, proyectos, criterios, material] = await Promise.all([
    supabase.from("eventos").select("id, nombre, inicio, lugar").eq("id", eventoId).maybeSingle(),
    supabase.from("personas").select("id, nombre, email").eq("rol", "jurado").order("nombre"),
    supabase
      .from("proyectos")
      .select("id, nombre, descripcion, proyecto_integrantes(personas(nombre, email))")
      .in("estado", estadosEvaluables)
      .order("nombre"),
    supabase.from("jurado_criterios").select("nombre").order("orden"),
    supabase.from("jurado_material_post").select("*").eq("evento_id", eventoId).maybeSingle(),
  ]);
  if (evento.error?.code === "22P02") return null; // id con formato inválido
  for (const r of [evento, jurados, proyectos, criterios, material]) if (r.error) throw r.error;
  if (!evento.data) return null;

  return {
    evento: evento.data,
    jurados: jurados.data!,
    proyectos: proyectos.data!.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      integrantes: p.proyecto_integrantes.map((i) => i.personas),
    })),
    criterios: criterios.data!.map((c) => c.nombre),
    material: material.data,
  };
}

export type Datos = NonNullable<Awaited<ReturnType<typeof cargarDatos>>>;

// Qué le falta al mail post-evento para poder mandarse (el relevamiento pide frenar si falta material o contactos).
export function faltantesPostEvento({ material, proyectos }: Pick<Datos, "material" | "proyectos">) {
  const faltantes: string[] = [];
  const fotos = [material?.foto_1, material?.foto_2, material?.foto_3].filter((f) => esLinkWeb(f ?? null));
  if (fotos.length < 3) faltantes.push(`${3 - fotos.length} de las 3 fotos destacadas`);
  if (!esLinkWeb(material?.video ?? null)) faltantes.push("el video resumen");
  const sinContacto = proyectos.filter((p) => p.integrantes.length === 0).map((p) => p.nombre);
  if (sinContacto.length) faltantes.push(`los contactos de ${sinContacto.join(", ")} (los integrantes se suman en Miembros/Alumnos)`);
  return faltantes;
}

// Envíos que cuentan como "ya mandado o por salir". Con la clave de Resend cargada, lo simulado en modo prueba no cuenta.
export const estadosActivos = () => (modoPrueba() ? ["programado", "simulado", "enviado"] : ["programado", "enviado"]);

// Ventana ideal del mail post-evento según el relevamiento: el día siguiente, de 9 a 12 hs.
export function ventanaPostEvento(inicio: string) {
  const desde = new Date(diaSiguienteALas9(inicio));
  return { desde, hasta: new Date(desde.getTime() + 3 * 60 * 60 * 1000) };
}

// Solo se llama con el material completo (ver faltantesPostEvento).
export function armarPostEvento(datos: Datos, jurado: string) {
  const m = datos.material!;
  return mailPostEvento({
    jurado,
    evento: datos.evento,
    fotos: [m.foto_1!, m.foto_2!, m.foto_3!],
    video: m.video!,
    mensaje: m.mensaje,
    equipos: datos.proyectos,
  });
}

// Dirección de la app para los links de los mails: en Vercel la de producción, en local la del navegador.
export async function urlBase() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}
