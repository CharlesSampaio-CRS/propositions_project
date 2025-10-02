import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const fastify = Fastify({ logger: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

fastify.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

const services = {
  propositions: { baseUrl: "http://propositions_service:3000" },
  votes: { baseUrl: "http://votes_service:3001" },
  deputies: { baseUrl: "http://deputies_service:3002" },
};

async function proxy(type, action) {
  const service = services[type];
  if (!service) throw new Error("Tipo inválido");
  const url = `${service.baseUrl}/${type}/${action}`;
  const res = await axios.get(url);
  return res.data;
}

fastify.get("/:type/:action", async (req, reply) => {
  const { type, action } = req.params;
  try {
    const data = await proxy(type, action);
    reply.send(data);
  } catch (err) {
    console.error(`Erro no proxy ${type}/${action}:`, err.message);
    reply.code(500).send({ error: err.message });
  }
});

fastify.listen({ port: 3005, host: "0.0.0.0" }, (err, address) => {
  if (err) throw err;
  console.log(`🚀 Central API & Front running at ${address}`);
});
