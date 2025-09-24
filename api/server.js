const fastify = require("fastify")({ logger: true });
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/propositions_db", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ---------------------- SCHEMAS ----------------------
const deputySchema = new mongoose.Schema({
  deputy_id: { type: Number, index: true },
  name: String,
  party: String,
  state: String,
  type: { type: String, default: "federal" },
  link: String,
  gender: String,
  birthDate: Date,
  email: String,
  officeNumber: String,
  officeBuilding: String,
  phone: String,
  photoUrl: String,
  birthState: String,
  birthCity: String,
  status: String,
  socialLinks: Array,
}, { timestamps: true });

const propositionSchema = new mongoose.Schema({
  proposition_id: { type: Number, index: true },
  type_code: String,
  number: Number,
  title: String,
  year: Number,
  tags: [String],
  scope: { type: String, default: "federal" },
  link: String,
  authors: [{
    deputy_id: Number,
    name: String,
    link: String
  }],
  status: String
}, { timestamps: true });

const voteSchema = new mongoose.Schema({
  vote_id: { type: String, index: true },
  proposition_id: { type: Number, index: true },
  deputy_id: { type: Number, index: true },
  vote: String
}, { timestamps: true });

const Deputy = mongoose.model("Deputy", deputySchema);
const Proposition = mongoose.model("Proposition", propositionSchema);
const Vote = mongoose.model("Vote", voteSchema);

// ---------------------- HELPERS ----------------------
const buildLinks = (path, id) => ({
  self: `${process.env.API_BASE_URL || "http://localhost:3000"}${path}/${id}`
});

// ---------------------- ENDPOINTS ----------------------

// 🔎 GET /propositions
fastify.get("/propositions", async (req, reply) => {
  const { title, author, type_code, year, status, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (title) filter.title = { $regex: title, $options: "i" };
  if (type_code) filter.type_code = type_code;
  if (year) filter.year = parseInt(year);
  if (status) filter.status = status;
  if (author) filter["authors.name"] = { $regex: author, $options: "i" };

  const skip = (page - 1) * limit;
  const propositions = await Proposition.find(filter)
    .sort({ year: -1, number: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Proposition.countDocuments(filter);

  return {
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit)
    },
    data: propositions.map(p => ({
      ...p,
      links: {
        self: buildLinks("/propositions", p.proposition_id).self,
        votes: `${buildLinks("/propositions", p.proposition_id).self}/votes`
      }
    }))
  };
});

// 🗳️ GET /propositions/:id
fastify.get("/propositions/:id", async (req, reply) => {
  const { id } = req.params;
  const proposition = await Proposition.findOne({ proposition_id: parseInt(id) }).lean();

  if (!proposition) return reply.code(404).send({ error: "Proposition not found" });

  const votes = await Vote.aggregate([
    { $match: { proposition_id: parseInt(id) } },
    {
      $lookup: {
        from: "deputies",
        localField: "deputy_id",
        foreignField: "deputy_id",
        as: "deputy"
      }
    },
    { $unwind: "$deputy" },
    {
      $project: {
        deputy_id: 1,
        vote: 1,
        "deputy.name": 1,
        "deputy.party": 1,
        "deputy.state": 1,
        "deputy.link": 1,
        "deputy.photoUrl": 1
      }
    }
  ]);

  return {
    ...proposition,
    votes,
    links: {
      self: buildLinks("/propositions", id).self,
      allPropositions: `${process.env.API_BASE_URL || "http://localhost:3000"}/propositions`
    }
  };
});

// 🧑‍⚖️ GET /deputies
fastify.get("/deputies", async (req, reply) => {
  const { name, party, deputy_id, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (name) filter.name = { $regex: name, $options: "i" };
  if (party) filter.party = party;
  if (deputy_id) filter.deputy_id = parseInt(deputy_id);

  const skip = (page - 1) * limit;
  const deputies = await Deputy.find(filter)
    .sort({ name: 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  const total = await Deputy.countDocuments(filter);

  return {
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit)
    },
    data: deputies.map(d => ({
      ...d,
      links: {
        self: buildLinks("/deputies", d.deputy_id).self,
        propositions: `${buildLinks("/deputies", d.deputy_id).self}/propositions`
      }
    }))
  };
});

// ✍️ GET /deputies/:id/propositions
fastify.get("/deputies/:id/propositions", async (req, reply) => {
  const { id } = req.params;
  const deputyId = parseInt(id);

  const authoredProps = await Proposition.find({ "authors.deputy_id": deputyId }).lean();
  const votedPropsIds = await Vote.distinct("proposition_id", { deputy_id: deputyId });
  const votedProps = await Proposition.find({ proposition_id: { $in: votedPropsIds } }).lean();

  const allProps = [...authoredProps, ...votedProps];

  return {
    deputy_id: deputyId,
    total: allProps.length,
    propositions: allProps.map(p => ({
      ...p,
      authored: p.authors.some(a => a.deputy_id === deputyId),
      voted: votedPropsIds.includes(p.proposition_id),
      links: {
        self: buildLinks("/propositions", p.proposition_id).self
      }
    }))
  };
});

// 🚀 Start API
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    fastify.log.info("🚀 API running on port 3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
