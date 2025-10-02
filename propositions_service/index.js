  import Fastify from "fastify";
  import axios from "axios";
  import mongoose from "mongoose";
  import dotenv from "dotenv";

  dotenv.config();

  // =======================
  // MongoDB Connection
  // =======================
  mongoose
    .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("📦 MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

  // =======================
  // Schema
  // =======================
  const propositionSchema = new mongoose.Schema({
    propositionId: { type: Number, unique: true },
    type: String, // PEC, PL, etc.
    number: Number,
    year: Number,
    summary: String,
    typeDescription: String,
    keywords: [String],
    themes: [String],
    datePresented: Date,
    lastUpdated: Date,
    status: {
      situationDescription: String,
      procedureDescription: String,
      orgaShort: String,
      orgaDescription: String,
      dispatch: String,
      dateTime: Date,
    },
    authors: [Object],
    link: String,
    dateProcessed: Date, // ✅ new field
  }, { strict: false });

  const Proposition = mongoose.model("Proposition", propositionSchema);

  // =======================
  // Helpers
  // =======================
  const baseUrl = "https://dadosabertos.camara.leg.br/api/v2";

  async function fetchWithRetry(url, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.get(url, { headers: { Accept: "application/json" }, timeout: 60000 });
        return res.data;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, delay * (i + 1)));
      }
    }
  }

  async function fetchPropositions(page = 1, items = 20) {
    const url = `${baseUrl}/proposicoes?siglaTipo=PEC&siglaTipo=PL&dataApresentacaoInicio=2018-01-01&itens=${items}&pagina=${page}`;
    const data = await fetchWithRetry(url);
    return data.dados || [];
  }

  async function fetchPropositionDetails(id) {
    const url = `${baseUrl}/proposicoes/${id}`;
    const data = await fetchWithRetry(url);
    return data.dados || {};
  }

  async function fetchAuthors(id) {
    const url = `${baseUrl}/proposicoes/${id}/autores`;
    const data = await fetchWithRetry(url);
    return data.dados || [];
  }

  // =======================
  // Processor
  // =======================
  async function processProposition(proposition) {
    if (!proposition.id) return;
  
    try {
      const [details, authors] = await Promise.all([
        fetchPropositionDetails(proposition.id),
        fetchAuthors(proposition.id),
      ]);
  
      const apiStatusDate = details.statusProposicao?.dataHora
        ? new Date(details.statusProposicao.dataHora)
        : null;
  
      const existing = await Proposition.findOne({ propositionId: proposition.id });
  
      if (existing?.status?.dateTime && apiStatusDate) {
        if (existing.status.dateTime.getTime() === apiStatusDate.getTime()) {
          console.log(`🔹 Proposition ${proposition.id} already processed`);
          return; // nada mudou, pula
        }
      }
  
      const propositionData = {
        propositionId: proposition.id,
        type: proposition.siglaTipo,
        number: proposition.numero,
        year: proposition.ano,
        summary: details.ementa || proposition.ementa,
        typeDescription: details.descricaoTipo,
        keywords: details.keywords ? details.keywords.split(",").map(k => k.trim()) : [],
        themes: details.tema || [],
        datePresented: details.dataApresentacao ? new Date(details.dataApresentacao) : null,
        lastUpdated: details.dataUltimaAtualizacao ? new Date(details.dataUltimaAtualizacao) : null,
        status: {
          situationDescription: details.statusProposicao?.descricaoSituacao || null,
          procedureDescription: details.statusProposicao?.descricaoTramitacao || null,
          orgaShort: details.statusProposicao?.siglaOrgao || null,
          orgaDescription: details.statusProposicao?.descricaoOrgao || null,
          dispatch: details.statusProposicao?.despacho || null,
          dateTime: apiStatusDate,
        },
        authors,
        link: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${proposition.id}`,
        dateProcessed: new Date(),
      };
  
      await Proposition.findOneAndUpdate(
        { propositionId: proposition.id },
        propositionData,
        { upsert: true, new: true }
      );
  
    } catch (err) {
      console.error(`❌ Error processing proposition ${proposition.id}:`, err.message);
    }
  }
  
  // =======================
  // Crawler Controller
  // =======================
  let crawling = false;
  let crawlPromise = null;

  async function runCrawler() {
    let page = 1;
    crawling = true;
    while (crawling) {
      const propositions = await fetchPropositions(page);
      if (!propositions.length) break;

      for (const p of propositions) {
        if (!crawling) break;
        await processProposition(p);
      }
      page++;
    }
    crawling = false;
  }

  // =======================
  // Fastify API
  // =======================
  const fastify = Fastify({ logger: true });

  fastify.get("/propositions/start", async () => {
    if (!crawling) {
      crawlPromise = runCrawler();
      return { message: "Crawler started" };
    } else {
      return { message: "Crawler already running" };
    }
  });

  fastify.get("/propositions/stop", async () => {
    if (crawling) {
      crawling = false;
      await crawlPromise;
      return { message: "Crawler stopped" };
    } else {
      return { message: "Crawler is not running" };
    }
  });

  fastify.listen({ port: 3000, host: "0.0.0.0" }, (err, address) => {
    if (err) throw err;
    console.log(`🚀 Server running at ${address}`);
  });
