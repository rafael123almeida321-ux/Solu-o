import { useRef, useState } from "react";

export function useGravador() {
  const [gravando, setGravando] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const partes = useRef<Blob[]>([]);

  const suportado =
    typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  async function iniciar() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    const tipo = tipos.find((t) => MediaRecorder.isTypeSupported?.(t));
    const r = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    partes.current = [];
    r.ondataavailable = (e) => {
      if (e.data.size) partes.current.push(e.data);
    };
    r.start();
    rec.current = r;
    setGravando(true);
  }

  function parar(): Promise<Blob> {
    return new Promise((resolve) => {
      const r = rec.current;
      if (!r) {
        resolve(new Blob());
        return;
      }
      r.onstop = () => {
        r.stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        rec.current = null;
        resolve(new Blob(partes.current, { type: r.mimeType || "audio/webm" }));
      };
      r.stop();
    });
  }

  return { gravando, iniciar, parar, suportado };
}

export function blobParaBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(new Error("Não consegui ler o áudio."));
    fr.readAsDataURL(b);
  });
}
