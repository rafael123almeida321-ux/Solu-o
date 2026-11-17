import { useTeam } from "../context/TeamContext";
import { Avatar, Sheet } from "./ui";

export default function EscolherMembro({
  aberto,
  titulo,
  excluir = [],
  onFechar,
  onEscolher,
}: {
  aberto: boolean;
  titulo: string;
  excluir?: string[];
  onFechar: () => void;
  onEscolher: (userId: string, nome: string) => void;
}) {
  const { membros } = useTeam();
  const lista = membros.filter((m) => !excluir.includes(m.user_id));
  return (
    <Sheet aberto={aberto} onFechar={onFechar} titulo={titulo}>
      {lista.length ? (
        <div className="space-y-2">
          {lista.map((m) => (
            <button key={m.user_id} onClick={() => onEscolher(m.user_id, m.nome)} className="cartao flex w-full items-center gap-3 p-3 text-left hover:border-mute">
              <Avatar id={m.user_id} nome={m.nome} tamanho={36} />
              <span className="flex-1 font-semibold">{m.nome}</span>
              <span className="text-xs text-mute">{m.papel}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-mute">Ninguém mais na equipe ainda. Convide o time na aba Equipe.</p>
      )}
    </Sheet>
  );
}
