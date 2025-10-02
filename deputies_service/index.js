import Fastify from "fastify";
import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// =======================
// MongoDB
// =======================
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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

async function runCrawler() {
  crawling = true;
  let page = 1;
  const today = new Date().toISOString().split("T")[0];

  while (crawling) {
    try {
      const url = `${baseUrl}/deputados?itens=100&pagina=${page}`;
      const data = await fetchWithRetry(url);
      const deputies = data.dados || [];

      if (!deputies.length) break;

      for (const d of deputies) {
        if (!crawling) break;

        try {
          const deputyData = {
            deputy_id: d.id,
            name: d.nome,
            party: d.siglaPartido,
            state: d.siglaUf,
            email: d.email,
            phone: d.telefone,
            photo_url: d.urlFoto,
            mandate: d.ultimoStatus?.mandato
              ? {
                  start: d.ultimoStatus.mandato.dataInicio ? new Date(d.ultimoStatus.mandato.dataInicio) : null,
                  end: d.ultimoStatus.mandato.dataFim ? new Date(d.ultimoStatus.mandato.dataFim) : null,
                  type: d.ultimoStatus.mandato.tipoMandato || null,
                }
              : null,
            office: d.ultimoStatus?.gabinete
              ? {
                  name: d.ultimoStatus.gabinete.nome || null,
                  room: d.ultimoStatus.gabinete.sala || null,
                  phone: d.ultimoStatus.gabinete.telefone || null,
                  email: d.ultimoStatus.gabinete.email || null,
                }
              : null,
            dateProcessed: new Date(),
          };
        
          await Deputy.findOneAndUpdate(
            { deputy_id: d.id }, 
            { $set: deputyData },
            { upsert: true, new: true }
          );
        } catch (err) {
          console.error(`❌ Error saving deputy ${d.id} - ${d.nome}:`, err);
        }
      }

      page++;

    } catch (err) {
      console.error(`❌ Error fetching page ${page}:`, err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  crawling = false;
}

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


fastify.listen({ port: 3002, host: "0.0.0.0" }, (err, address) => {
  if (err) throw err;
  console.log(`🚀 Deputies Service running at ${address}`);
});


