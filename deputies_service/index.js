import Fastify from "fastify";
import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// =======================
// MongoDB
// =======================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("📦 MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const deputySchema = new mongoose.Schema({
  deputy_id: { type: Number, unique: true },
  name: String,
  party: String,
  state: String,
  email: String,
  phone: String,
  photo_url: String,
  mandate: { type: mongoose.Schema.Types.Mixed, default: null },
  office: { type: mongoose.Schema.Types.Mixed, default: null },
  dateProcessed: Date,
}, { strict: false });

const Deputy = mongoose.model("Deputy", deputySchema);

const fastify = Fastify({ logger: false });
const baseUrl = "https://dadosabertos.camara.leg.br/api/v2";

let crawling = false;
let crawlPromise = null;

// =======================
// Fetch com retry
// =======================
async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, { headers: { Accept: "application/json" }, timeout: 60000 });
      return res.data;
    } catch (err) {
      console.error(`❌ Fetch error for URL ${url} (attempt ${i + 1}):`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

// =======================
// Crawler
// =======================
async function runCrawler() {
  crawling = true;
  let page = 1;

  while (crawling) {
    try {
      const url = `${baseUrl}/deputados?itens=100&pagina=${page}`;
      const data = await fetchWithRetry(url);
      const deputies = data.dados || [];

      if (!deputies.length) break;

      for (const d of deputies) {
        if (!crawling) break;

        try {
          // 🔹 Buscar detalhes completos
          const details = await fetchWithRetry(`${baseUrl}/deputados/${d.id}`);
          const info = details.dados;

          const deputyData = {
            deputy_id: info.id,
            name: info.ultimoStatus.nome,
            party: info.ultimoStatus.siglaPartido,
            state: info.ultimoStatus.siglaUf,
            email: info.ultimoStatus.gabinete?.email || null,
            phone: info.ultimoStatus.gabinete?.telefone || null,
            photo_url: info.ultimoStatus.urlFoto,
            mandate: info.ultimoStatus.mandato
              ? {
                  start: info.ultimoStatus.mandato.dataInicio ? new Date(info.ultimoStatus.mandato.dataInicio) : null,
                  end: info.ultimoStatus.mandato.dataFim ? new Date(info.ultimoStatus.mandato.dataFim) : null,
                  type: info.ultimoStatus.mandato.tipoMandato || null,
                }
              : null,
            office: info.ultimoStatus.gabinete
              ? {
                  name: info.ultimoStatus.gabinete.nome || null,
                  room: info.ultimoStatus.gabinete.sala || null,
                  phone: info.ultimoStatus.gabinete.telefone || null,
                  email: info.ultimoStatus.gabinete.email || null,
                }
              : null,
            dateProcessed: new Date(),
          };

          await Deputy.findOneAndUpdate(
            { deputy_id: info.id },
            { $set: deputyData },
            { upsert: true, new: true }
          );

          console.log(`✅ Deputy saved: ${info.ultimoStatus.nome} (${info.ultimoStatus.siglaPartido}-${info.ultimoStatus.siglaUf})`);
        } catch (err) {
          console.error(`❌ Error saving deputy ${d.id} - ${d.nome}:`, err.message);
        }
      }

      page++;

    } catch (err) {
      console.error(`❌ Error fetching page ${page}:`, err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  crawling = false;
}

// =======================
// Fastify Routes
// =======================
fastify.get("/deputies/start", async () => {
  if (!crawling) {
    crawlPromise = runCrawler();
    return { message: "Deputies crawler started" };
  }
  return { message: "Deputies crawler is already running" };
});

fastify.get("/deputies/stop", async () => {
  if (crawling) {
    crawling = false;
    await crawlPromise;
    return { message: "Deputies crawler stopped" };
  }
  return { message: "Deputies crawler is not running" };
});

// =======================
// Start server
// =======================
fastify.listen({ port: 3002, host: "0.0.0.0" }, (err, address) => {
  if (err) throw err;
  console.log(`🚀 Deputies Service running at ${address}`);
});
