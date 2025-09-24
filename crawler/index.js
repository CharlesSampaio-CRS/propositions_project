const axios = require("axios");
const mongoose = require("mongoose");
require("dotenv").config();

// =======================
// Mongo Connection
// =======================
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("📦 MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// =======================
// Models
// =======================
const deputySchema = new mongoose.Schema({
  deputy_id: { type: Number, unique: true },
  name: String,
  party: String,
  email: String,
  link: String,
});

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

const voteSchema = new mongoose.Schema({
  vote_id: { type: String, unique: true },
  proposition_id: Number,
  deputy_id: Number,
  vote: String,
  voting_id: Number,
});

const Deputy = mongoose.model("Deputy", deputySchema);
const Proposition = mongoose.model("Proposition", propositionSchema);
const Vote = mongoose.model("Vote", voteSchema);

// =======================
// Helpers
// =======================
const baseUrl = "https://dadosabertos.camara.leg.br/api/v2";

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, { headers: { Accept: "application/json" } });
      return res.data;
    } catch (err) {
      console.warn(`⚠️ Attempt ${i + 1} failed for ${url}`);
      if (i === retries - 1) throw err;
    }
  }
}

async function saveDeputies(deputies) {
  if (!deputies.length) return;
  const ops = deputies.map((d) => ({
    updateOne: { filter: { deputy_id: d.deputy_id }, update: { $set: d }, upsert: true },
  }));
  await Deputy.bulkWrite(ops, { ordered: false });
}

async function saveVotes(votes) {
  if (!votes.length) return;
  const ops = votes.map((v) => ({
    updateOne: { filter: { vote_id: v.vote_id }, update: { $set: v }, upsert: true },
  }));
  await Vote.bulkWrite(ops, { ordered: false });
}

// =======================
// Fetch Functions
// =======================
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

async function fetchVotings(id) {
  const url = `${baseUrl}/proposicoes/${id}/votacoes`;
  const data = await fetchWithRetry(url);
  return data.dados || [];
}

async function fetchVotes(votingId) {
  const url = `${baseUrl}/votacoes/${votingId}/votos`;
  const data = await fetchWithRetry(url);
  return data.dados || [];
}

// =======================
// Process Proposition
// =======================
async function processProposition(proposition) {
  try {
    const [details, authors, votings] = await Promise.all([
      fetchPropositionDetails(proposition.id),
      fetchAuthors(proposition.id),
      fetchVotings(proposition.id),
    ]);

    // --------- Salvar deputados autores ----------
    const deputies = authors
      .filter((a) => a.idDeputadoAutor)
      .map((a) => ({
        deputy_id: a.idDeputadoAutor,
        name: a.nome,
        party: a.siglaPartido || "S/PARTIDO",
        email: null,
        link: a.idDeputadoAutor ? `https://www.camara.leg.br/deputados/${a.idDeputadoAutor}` : null,
      }));

    await saveDeputies(deputies);

    // --------- Salvar votos ----------
    let votesToSave = [];
    for (const voting of votings) {
      const votingId = String(voting.id);
      const votesRaw = await fetchVotes(votingId);

      for (const vote of votesRaw) {
        if (!vote.idDeputado) continue;
        votesToSave.push({
          vote_id: `${votingId}-${vote.idDeputado}`,
          proposition_id: proposition.id,
          deputy_id: vote.idDeputado,
          vote: vote.voto,
          voting_id: voting.id,
        });

        // também salvar deputados presentes na votação
        const dep = {
          deputy_id: vote.idDeputado,
          name: vote.nomeDeputado,
          party: vote.siglaPartido || "S/PARTIDO",
          email: null,
          link: `https://www.camara.leg.br/deputados/${vote.idDeputado}`,
        };
        await saveDeputies([dep]); // upsert
      }
    }

    await saveVotes(votesToSave);

    // --------- Salvar proposição ----------
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

    console.log(
      `✅ Proposition ${proposition.id} processed - Authors: ${authors.length}, Votes: ${votesToSave.length}`
    );
  } catch (err) {
    console.error(`❌ Error processing proposition ${proposition.id}:`, err.message);
  }
}

// =======================
// Runner
// =======================
async function runCrawler() {
  let page = 1;
  let fetched = [];

  do {
    fetched = await fetchPropositions(page);
    console.log(`📥 Page ${page} - Found ${fetched.length} propositions`);

    for (const proposition of fetched) {
      await processProposition(proposition);
    }

    page++;
  } while (fetched.length > 0);

  console.log("🏁 Crawler finished!");
  await mongoose.disconnect();
}

runCrawler();
