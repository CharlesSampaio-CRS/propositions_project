const axios = require("axios");
const mongoose = require("mongoose");
require("dotenv").config();

mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("📦 MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));


const propositionSchema = new mongoose.Schema({
  proposition_id: { type: Number, unique: true },
  siglaTipo: String,
  numero: Number,
  ano: Number,
  ementa: String,
  status: String,
  authors: [Object],
  link: String,
});

const Proposition = mongoose.model("Proposition", propositionSchema);


const baseUrl = "https://dadosabertos.camara.leg.br/api/v2";

async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, { headers: { Accept: "application/json" }, timeout: 60000 });
      return res.data;
    } catch (err) {
      console.warn(`⚠️ Attempt ${i + 1} failed for ${url}: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}


async function fetchPropositions(page = 1, itens = 20) {
  const url = `${baseUrl}/proposicoes?siglaTipo=PEC&siglaTipo=PL&dataApresentacaoInicio=2018-01-01&itens=${itens}&pagina=${page}`;
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

async function processProposition(proposition) {
  try {

    const [details, authors] = await Promise.all([
      fetchPropositionDetails(proposition.id),
      fetchAuthors(proposition.id),
    ]);

    const status =
      details.statusProposicao?.descricaoSituacao ||
      details.statusProposicao?.descricaoTramitacao ||
      null;

    const propositionData = {
      proposition_id: proposition.id,
      siglaTipo: proposition.siglaTipo,
      numero: proposition.numero,
      ano: proposition.ano,
      ementa: proposition.ementa,
      status,
      authors,
      link: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${proposition.id}`,
    };

    await Proposition.findOneAndUpdate(
      { proposition_id: proposition.id },
      propositionData,
      { upsert: true, new: true }
    );

    console.log(`✅ Proposition ${proposition.id} processed - Authors: ${authors.length}`);
  } catch (err) {
    console.error(`❌ Error processing proposition ${proposition.id}:`, err.message);
  }
}

async function runCrawler() {
  let page = 1;
  let fetched = [];

  do {
    fetched = await fetchPropositions(page);

    for (const proposition of fetched) {
      await processProposition(proposition);
    }

    page++;
  } while (fetched.length > 0);

  console.log("🏁 Crawler finished!");
  await mongoose.disconnect();
}

runCrawler();
