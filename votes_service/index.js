import Fastify from "fastify";
import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios";
import { parseStringPromise } from "xml2js";

dotenv.config();

// =======================
// MongoDB Connection
// =======================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("📦 MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// =======================
// Schemas & Models
// =======================
const voteSchema = new mongoose.Schema({
  vote_id: String,
  deputy_id: Number,
  deputy_name: String,
  proposition_id: Number,
  proposition_type: String,
  vote: String // "Sim", "Não", "Outros"
});

voteSchema.index({ vote_id: 1, deputy_id: 1, proposition_id: 1 }, { unique: true });

const propositionSchema = new mongoose.Schema({
  proposition_id: { type: Number, unique: true },
  type: String,
  processed: { type: Boolean, default: false },
  total_yes: { type: Number, default: 0 },
  total_no: { type: Number, default: 0 }
});

const Vote = mongoose.model("Vote", voteSchema);
const Proposition = mongoose.model("Proposition", propositionSchema);

// =======================
// Fastify
// =======================
const fastify = Fastify({ logger: false });
const baseUrl = "https://dadosabertos.camara.leg.br/api/v2";

let crawling = false;
let crawlPromise = null;

// =======================
// Fetch com retry e XML/JSON handling
// =======================
async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        headers: { Accept: "application/json, application/xml" },
        timeout: 60000
      });

      const contentType = res.headers["content-type"] || "";

      if (contentType.includes("application/json")) {
        return res.data;
      }

      if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
        const parsed = await parseStringPromise(res.data, { explicitArray: false, mergeAttrs: true });
        return parsed;
      }

      throw new Error("Unknown response format");
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

// =======================
// Votes crawler ajustado
// =======================
async function runCrawler() {
  console.log("🟢 Votes crawler started");
  crawling = true;

  const propositions = await Proposition.find().lean();
  console.log(`📄 Found ${propositions.length} propositions to process`);

  for (const prop of propositions) {
    if (!crawling) {
      console.log("🛑 Votes crawler stopped by user");
      break;
    }

    let totalYes = 0;
    let totalNo = 0;

    let votacoesData;
    try {
      votacoesData = await fetchWithRetry(`${baseUrl}/proposicoes/${prop.proposition_id}/votacoes`);
    } catch (err) {
      console.error(`❌ Failed to fetch votacoes for proposition ${prop.proposition_id}:`, err.message);
      await Proposition.updateOne({ proposition_id: prop.proposition_id }, { processed: true });
      continue;
    }

    // Normaliza votacoes em array
    let votacoes = [];
    if (votacoesData.dados) votacoes = votacoesData.dados;
    else if (votacoesData.dados?.votacao) votacoes = [].concat(votacoesData.dados.votacao);

    // 🔹 Filtra votacoes que realmente têm votos de deputados
    const votacoesComVotos = [];

    for (const votacao of votacoes) {
      let votosData;
      try {
        votosData = await fetchWithRetry(`${baseUrl}/votacoes/${votacao.id}/votos`);
      } catch (err) {
        console.warn(`⚠️ Failed to fetch votos for votacao ${votacao.id}:`, err.message);
        continue;
      }

      let votos = [];
      if (votosData.dados) votos = votosData.dados;
      else if (votosData.dados?.voto) votos = [].concat(votosData.dados.voto);

      if (votos.length > 0) {
        votacoesComVotos.push({ votacao, votos });
      }
    }

    // Se não houver nenhuma votação com votos, pula a proposição
    if (votacoesComVotos.length === 0) {
      await Proposition.updateOne({ proposition_id: prop.proposition_id }, { processed: true });
      continue;
    }

    // Processa apenas votacoes com votos
    for (const { votacao, votos } of votacoesComVotos) {
      if (!crawling) break;

      const votacaoId = votacao.id;

      for (const v of votos) {
        const deputyId = Number(v.deputado_.id);
        if (isNaN(deputyId)) continue;

        const voteValue =
          v.tipoVoto === "Sim" ? "Sim" :
          v.tipoVoto === "Não" ? "Não" : "Outros";

        if (voteValue === "Sim") totalYes++;
        if (voteValue === "Não") totalNo++;

        await Vote.updateOne(
          { vote_id: votacaoId, deputy_id: deputyId, proposition_id: prop.proposition_id },
          {
            $set: {
              vote_id: votacaoId,
              deputy_id: deputyId,
              deputy_name: v.deputado_.nome,
              proposition_id: prop.proposition_id,
              proposition_type: prop.type,
              vote: voteValue
            }
          },
          { upsert: true }
        );

        console.log(`      ✅ Saved vote for deputy ${v.deputado_.nome} (${voteValue})`);
      }
    }

    await Proposition.updateOne(
      { proposition_id: prop.proposition_id },
      { processed: true, total_yes: totalYes, total_no: totalNo }
    );

    console.log(`✔️ Finished proposition ${prop.proposition_id}: YES=${totalYes}, NO=${totalNo}`);
  }

  crawling = false;
  console.log("🟢 Votes crawler finished");
}

// =======================
// Fastify Routes
// =======================
fastify.get("/votes/start", async () => {
  if (!crawling) {
    console.log("🟢 Votes crawler starting...");
    crawlPromise = runCrawler().catch(err => console.error("❌ Error in votes crawler:", err));
    return { message: "Votes crawler started for all propositions" };
  }
  return { message: "Votes crawler is already running" };
});

fastify.get("/votes/stop", async () => {
  if (crawling) {
    console.log("🛑 Votes crawler stopping...");
    crawling = false;
    try {
      await crawlPromise;
      console.log("✅ Votes crawler stopped");
    } catch (err) {
      console.error("❌ Error while stopping votes crawler:", err);
    }
    return { message: "Votes crawler stopped" };
  }
  return { message: "Votes crawler is not running" };
});

// =======================
// Start Server
// =======================
fastify.listen({ port: 3001, host: "0.0.0.0" }, (err, address) => {
  if (err) throw err;
  console.log(`🚀 Votes Service running at ${address}`);
});
