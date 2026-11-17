export default function Configurar() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-10">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-neon font-display text-xl font-black text-fundo">C</div>
      <h1 className="font-display text-2xl font-black">Falta ligar o banco</h1>
      <p className="mt-3 text-mute">
        O app abriu, mas ainda não sabe qual Supabase usar. Na Vercel, vá em <b className="text-ink">Settings → Environment Variables</b> e
        cadastre:
      </p>
      <pre className="cartao mt-4 overflow-x-auto p-4 text-[13px] text-neon">
        VITE_SUPABASE_URL{"\n"}VITE_SUPABASE_ANON_KEY
      </pre>
      <p className="mt-4 text-sm text-mute">
        Depois clique em <b className="text-ink">Deployments → Redeploy</b>. O passo a passo completo está no README.md do projeto.
      </p>
    </div>
  );
}
