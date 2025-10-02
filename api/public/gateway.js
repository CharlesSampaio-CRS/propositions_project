import Fastify from "fastify";
import fastifyHttpProxy from "@fastify/http-proxy";

const fastify = Fastify();

// proxies
fastify.register(fastifyHttpProxy, {
  upstream: "http://localhost:3000",
  prefix: "/propositions",
  rewritePrefix: "/propositions"
});

fastify.register(fastifyHttpProxy, {
  upstream: "http://localhost:3001",
  prefix: "/votes",
  rewritePrefix: "/votes"
});

fastify.register(fastifyHttpProxy, {
  upstream: "http://localhost:3002",
  prefix: "/deputies",
  rewritePrefix: "/deputies"
});

fastify.listen({ port: 3005, host: "0.0.0.0" }, (err, address) => {
  if (err) throw err;
  console.log(`🚀 Gateway rodando em ${address}`);
});
