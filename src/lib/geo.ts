export interface Posicao {
  lat: number;
  lng: number;
  precisao: number;
}

export function pegarPosicao(timeoutMs = 12000): Promise<Posicao> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Este aparelho não tem GPS disponível no navegador."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy) }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Permissão de localização negada. Libere nas configurações do navegador."
              : e.code === 3
                ? "O GPS demorou demais. Tente de novo num lugar aberto."
                : "Não consegui pegar sua localização.",
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export interface Endereco {
  endereco: string;
  bairro: string;
  cidade: string;
}

/** Endereço a partir da coordenada (OpenStreetMap / Nominatim, gratuito) */
export async function enderecoDe(lat: number, lng: number): Promise<Endereco | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const a = j.address ?? {};
    const rua = [a.road, a.house_number].filter(Boolean).join(", ");
    const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || "";
    const cidade = a.city || a.town || a.village || a.municipality || "";
    return { endereco: rua || j.display_name?.split(",").slice(0, 2).join(",") || "", bairro, cidade };
  } catch {
    return null;
  }
}

export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** ordena paradas pelo vizinho mais próximo a partir da origem */
export function ordenarRota<T extends { lat: number; lng: number }>(origem: { lat: number; lng: number }, pontos: T[]): T[] {
  const resto = [...pontos];
  const rota: T[] = [];
  let atual = origem;
  while (resto.length) {
    let melhor = 0;
    let melhorDist = Infinity;
    resto.forEach((p, i) => {
      const d = distanciaKm(atual, p);
      if (d < melhorDist) {
        melhorDist = d;
        melhor = i;
      }
    });
    const [prox] = resto.splice(melhor, 1);
    rota.push(prox);
    atual = prox;
  }
  return rota;
}

export function linkRotaGoogle(origem: { lat: number; lng: number }, paradas: { lat: number; lng: number }[], modo: "walking" | "driving" = "walking") {
  if (!paradas.length) return null;
  const fmt = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
  const destino = paradas[paradas.length - 1];
  const meio = paradas.slice(0, -1).slice(0, 8);
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(origem),
    destination: fmt(destino),
    travelmode: modo,
  });
  if (meio.length) params.set("waypoints", meio.map(fmt).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
