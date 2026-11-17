import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { Crosshair, ExternalLink, Loader2, Route, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useToast } from "../context/ToastContext";
import { ESTAGIOS_ABERTOS, ESTAGIO_LABEL } from "../lib/constants";
import { distanciaKm, linkRotaGoogle, ordenarRota, pegarPosicao, type Posicao } from "../lib/geo";
import { supabase } from "../lib/supabase";
import type { Lead } from "../lib/types";
import { cls, corTemp, erroMsg, FAIXA_INFO, faixaTemp, statusFollowup, type Faixa } from "../lib/utils";

const SP: [number, number] = [-23.5505, -46.6333];

interface Ponto {
  lead: Lead;
  lat: number;
  lng: number;
  exato: boolean;
}

export default function Mapa() {
  const { user } = useAuth();
  const { leads, teamId, nomeDe } = useTeam();
  const toast = useToast();
  const [exatos, setExatos] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [dono, setDono] = useState<"todos" | "meus">("todos");
  const [faixa, setFaixa] = useState<Faixa | "todas">("todas");
  const [eu, setEu] = useState<Posicao | null>(null);
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [rota, setRota] = useState<(Ponto & { km: number })[] | null>(null);
  const [modo, setModo] = useState<"walking" | "driving">("walking");

  useEffect(() => {
    if (!teamId) return;
    supabase
      .from("lead_contacts")
      .select("lead_id,lat,lng,leads!inner(team_id)")
      .eq("leads.team_id", teamId)
      .not("lat", "is", null)
      .then(({ data }) => {
        const m = new Map<string, { lat: number; lng: number }>();
        ((data ?? []) as unknown as { lead_id: string; lat: number; lng: number }[]).forEach((c) => m.set(c.lead_id, { lat: c.lat, lng: c.lng }));
        setExatos(m);
      });
  }, [teamId, leads.length]);

  const pontos = useMemo<Ponto[]>(() => {
    return leads
      .filter((l) => ESTAGIOS_ABERTOS.includes(l.estagio) || l.estagio === "fechado")
      .filter((l) => dono === "todos" || l.owner_id === user?.id)
      .filter((l) => faixa === "todas" || faixaTemp(l.temperatura) === faixa)
      .map((l) => {
        const e = exatos.get(l.id);
        if (e) return { lead: l, lat: e.lat, lng: e.lng, exato: true };
        if (l.lat_aprox != null && l.lng_aprox != null) return { lead: l, lat: l.lat_aprox, lng: l.lng_aprox, exato: false };
        return null;
      })
      .filter(Boolean) as Ponto[];
  }, [leads, exatos, dono, faixa, user?.id]);

  const centro: [number, number] = useMemo(() => {
    if (eu) return [eu.lat, eu.lng];
    if (pontos.length) return [pontos.reduce((s, p) => s + p.lat, 0) / pontos.length, pontos.reduce((s, p) => s + p.lng, 0) / pontos.length];
    return SP;
  }, [eu, pontos]);

  async function ondeEstou() {
    setBuscandoGps(true);
    try {
      setEu(await pegarPosicao());
    } catch (e) {
      toast(erroMsg(e), "erro");
    } finally {
      setBuscandoGps(false);
    }
  }

  async function montarRota() {
    setBuscandoGps(true);
    let origem = eu;
    try {
      if (!origem) {
        origem = await pegarPosicao();
        setEu(origem);
      }
    } catch (e) {
      setBuscandoGps(false);
      return toast(erroMsg(e), "erro");
    }
    setBuscandoGps(false);
    const candidatos = leads
      .filter((l) => l.owner_id === user?.id && ESTAGIOS_ABERTOS.includes(l.estagio) && exatos.has(l.id))
      .filter((l) => {
        const fu = statusFollowup(l.proximo_followup);
        return fu === "atrasado" || fu === "hoje" || l.estagio === "revisita" || l.temperatura >= 40;
      })
      .map((l) => ({ lead: l, ...exatos.get(l.id)!, exato: true }))
      .map((p) => ({ ...p, km: distanciaKm(origem!, p) }))
      .filter((p) => p.km <= 15)
      .sort((a, b) => a.km - b.km)
      .slice(0, 9);
    if (!candidatos.length) {
      toast("Nenhum lead seu (morno, quente, revisita ou com retorno hoje) com localização num raio de 15 km.", "info");
      return;
    }
    const ordenada = ordenarRota(origem!, candidatos);
    let anterior: { lat: number; lng: number } = origem!;
    setRota(
      ordenada.map((p) => {
        const km = distanciaKm(anterior, p);
        anterior = p;
        return { ...p, km };
      }),
    );
  }

  const linkGoogle = rota && eu ? linkRotaGoogle(eu, rota, modo) : null;

  return (
    <div className="relative h-[calc(100dvh-56px-env(safe-area-inset-top)-74px-env(safe-area-inset-bottom))] min-h-[420px] w-full">
      <MapContainer center={centro} zoom={14} className="mapa-escuro h-full w-full" zoomControl={false} attributionControl>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Voar para={eu ? [eu.lat, eu.lng] : null} />
        <Enquadrar pontos={pontos} />

        {pontos.map((p) =>
          p.exato ? (
            <CircleMarker
              key={p.lead.id}
              center={[p.lat, p.lng]}
              radius={p.lead.owner_id === user?.id ? 9 : 7}
              pathOptions={{
                color: p.lead.owner_id === user?.id ? "#E8EAED" : "#0E0F11",
                weight: 2,
                fillColor: corTemp(p.lead.temperatura),
                fillOpacity: 0.95,
              }}
            >
              <PopupLead p={p} dono={nomeDe(p.lead.owner_id)} />
            </CircleMarker>
          ) : (
            <Circle
              key={p.lead.id}
              center={[p.lat, p.lng]}
              radius={450}
              pathOptions={{ color: corTemp(p.lead.temperatura), weight: 1, dashArray: "4 6", fillOpacity: 0.12 }}
            >
              <PopupLead p={p} dono={nomeDe(p.lead.owner_id)} />
            </Circle>
          ),
        )}

        {eu && (
          <CircleMarker center={[eu.lat, eu.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#4C8DFF", fillOpacity: 1 }}>
            <Tooltip direction="top">Você está aqui</Tooltip>
          </CircleMarker>
        )}

        {rota && eu && (
          <>
            <Polyline positions={[[eu.lat, eu.lng], ...rota.map((p) => [p.lat, p.lng] as [number, number])]} pathOptions={{ color: "#39FF14", weight: 3, dashArray: "6 8" }} />
            {rota.map((p, i) => (
              <CircleMarker key={`r-${p.lead.id}`} center={[p.lat, p.lng]} radius={13} pathOptions={{ color: "#39FF14", weight: 2, fillColor: "#0E0F11", fillOpacity: 1 }}>
                <Tooltip permanent direction="center" className="!border-0 !bg-transparent !p-0 !shadow-none !text-neon font-bold">
                  {i + 1}
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        )}
      </MapContainer>

      {/* filtros */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] space-y-2 p-3">
        <div className="sem-barra pointer-events-auto flex gap-2 overflow-x-auto">
          {(["todos", "meus"] as const).map((d) => (
            <button key={d} onClick={() => setDono(d)} className={cls("chip shrink-0 bg-s1/95 backdrop-blur", dono === d && "chip-on")}>
              {d === "todos" ? "Equipe toda" : "Só os meus"}
            </button>
          ))}
          <span className="w-px shrink-0 bg-line" />
          {(["todas", "quente", "morno", "frio"] as const).map((f) => (
            <button key={f} onClick={() => setFaixa(f)} className={cls("chip shrink-0 bg-s1/95 backdrop-blur", faixa === f && "chip-on")}>
              {f === "todas" ? "Todas" : `${FAIXA_INFO[f].emoji} ${FAIXA_INFO[f].label}`}
            </button>
          ))}
        </div>
        <p className="pointer-events-auto inline-block rounded-lg bg-s1/90 px-2.5 py-1 text-[11px] text-mute backdrop-blur">
          ● ponto = contato que você vê · ◌ círculo = área aproximada de lead protegido
        </p>
      </div>

      {/* botões */}
      <div className="absolute bottom-4 right-3 z-[500] flex flex-col gap-2">
        <button onClick={ondeEstou} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-s1 shadow-xl" aria-label="Onde estou">
          {buscandoGps ? <Loader2 size={20} className="animate-spin" /> : <Crosshair size={20} />}
        </button>
      </div>
      {!rota && (
        <button onClick={montarRota} className="btn-neon absolute bottom-4 left-3 z-[500] shadow-neon">
          <Route size={18} /> Rota do dia
        </button>
      )}

      {rota && (
        <div className="absolute inset-x-0 bottom-0 z-[600] max-h-[55%] overflow-y-auto rounded-t-3xl border-t border-line bg-s1/97 p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-bold">Rota do dia · {rota.length} paradas</p>
              <p className="text-xs text-mute">{rota.reduce((s, p) => s + p.km, 0).toFixed(1)} km no total (em linha reta)</p>
            </div>
            <button onClick={() => setRota(null)} className="rounded-full p-2 text-mute" aria-label="Fechar rota">
              <X size={18} />
            </button>
          </div>
          <ol className="space-y-1.5">
            {rota.map((p, i) => (
              <li key={p.lead.id}>
                <Link to={`/leads/${p.lead.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-s2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neon font-display text-xs font-black text-neon">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.lead.nome_negocio}</span>
                    <span className="block text-xs text-mute">
                      {ESTAGIO_LABEL[p.lead.estagio]} · {p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1)} km`}
                    </span>
                  </span>
                  <span className="font-display text-sm font-extrabold" style={{ color: corTemp(p.lead.temperatura) }}>
                    {p.lead.temperatura}°
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <select className="campo py-2.5" value={modo} onChange={(e) => setModo(e.target.value as "walking" | "driving")} aria-label="Como vai">
              <option value="walking">A pé</option>
              <option value="driving">De carro/moto</option>
            </select>
            {linkGoogle && (
              <a href={linkGoogle} target="_blank" rel="noreferrer" className="btn-neon">
                <ExternalLink size={16} /> Abrir no Google Maps
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Voar({ para }: { para: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (para) map.flyTo(para, Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [para, map]);
  return null;
}

/** na primeira carga, enquadra todos os leads na tela */
function Enquadrar({ pontos }: { pontos: Ponto[] }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || pontos.length === 0) return;
    feito.current = true;
    if (pontos.length === 1) map.setView([pontos[0].lat, pontos[0].lng], 15);
    else map.fitBounds(pontos.map((p) => [p.lat, p.lng] as [number, number]), { padding: [60, 60], maxZoom: 16 });
  }, [pontos, map]);
  return null;
}

function PopupLead({ p, dono }: { p: Ponto; dono: string }) {
  return (
    <Popup>
      <div className="min-w-[180px]">
        <p className="font-semibold text-ink">{p.lead.nome_negocio}</p>
        <p className="text-xs text-mute">
          {[p.lead.nicho, p.lead.bairro].filter(Boolean).join(" · ")} · {ESTAGIO_LABEL[p.lead.estagio]}
        </p>
        <p className="mt-1 text-xs">
          <span style={{ color: corTemp(p.lead.temperatura) }} className="font-bold">
            {p.lead.temperatura}°
          </span>{" "}
          · {dono === "Você" ? "seu lead" : `lead de ${dono}`}
          {!p.exato && " · local aproximado"}
        </p>
        <Link to={`/leads/${p.lead.id}`} className="mt-2 inline-block text-xs font-semibold text-neon">
          Abrir lead →
        </Link>
      </div>
    </Popup>
  );
}
