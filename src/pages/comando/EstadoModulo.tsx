import { Carregando } from "../../components/ui";
import { useFin } from "../../fin/FinContext";

/** carregando / erro / módulo ainda não instalado no banco */
export function EstadoModulo() {
  const { carregando, erro, moduloInstalado, recarregar } = useFin();
  if (carregando) return <Carregando texto="Abrindo seus números…" />;
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="text-lg font-bold">{moduloInstalado ? "Não consegui carregar seus dados" : "Falta instalar o módulo pessoal no banco"}</p>
      <p className="mt-2 text-sm text-mute">
        {moduloInstalado
          ? erro
          : "Rode o arquivo supabase/migrations/001_comando_v1.sql no SQL Editor do Supabase (uma vez) e volte aqui."}
      </p>
      <button onClick={() => recarregar()} className="btn btn-neon mt-6">
        Tentar de novo
      </button>
    </div>
  );
}
