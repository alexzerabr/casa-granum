"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDecimal, type Granularidade, type PontoSerie } from "@/lib/rank";

interface Props {
  pontos: PontoSerie[];
  metrica: "qtd" | "valor";
  unidade: string;
  granularidade: Granularidade;
}

function formatRotulo(iso: string, gran: Granularidade): string {
  const d = new Date(iso + "T00:00:00");
  if (gran === "mes") {
    return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  }
  if (gran === "semana") {
    return `sem ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function RankChart({ pontos, metrica, unidade, granularidade }: Props) {
  if (pontos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-inkdim">
        Nenhuma venda no período selecionado.
      </p>
    );
  }

  const dados = pontos.map((p) => ({
    dia: formatRotulo(p.dia, granularidade),
    valor: metrica === "qtd" ? p.qtd : p.valor,
  }));

  const sufixo = metrica === "qtd" ? ` ${unidade.toLowerCase()}` : "";
  const prefixo = metrica === "valor" ? "R$ " : "";

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D4C4A8" opacity={0.5} />
          <XAxis
            dataKey="dia"
            stroke="#5C5853"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#D4C4A8" }}
          />
          <YAxis
            stroke="#5C5853"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#D4C4A8" }}
            width={60}
            tickFormatter={(v) =>
              metrica === "valor"
                ? `R$${(v / 1).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                : formatDecimal(v as number, 1)
            }
          />
          <Tooltip
            cursor={{ fill: "#EBE3D8" }}
            contentStyle={{
              background: "#F5F0EA",
              border: "1px solid #D4C4A8",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) =>
              `${prefixo}${formatDecimal(v, 2)}${sufixo}`
            }
            labelStyle={{ color: "#1C2120", fontWeight: 600 }}
          />
          <Bar dataKey="valor" fill="#A96132" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
