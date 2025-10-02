import axios from "axios";

const PROPOSITIONS_URL = "http://propositions_service:3000";
const VOTES_URL = "http://votes_service:3001";
const DEPUTIES_URL = "http://deputies_service:3002";

let crawlers = {
  propositions: false,
  votes: false,
  deputies: false,
};

// Start/Stop
export async function startPropositions() {
  crawlers.propositions = true;
  await axios.get(`${PROPOSITIONS_URL}/propositions/start`);
  return { message: "Propositions crawler started" };
}

export async function stopPropositions() {
  crawlers.propositions = false;
  await axios.get(`${PROPOSITIONS_URL}/propositions/stop`);
  return { message: "Propositions crawler stopped" };
}

export async function startVotes() {
  crawlers.votes = true;
  await axios.get(`${VOTES_URL}/votes/start`);
  return { message: "Votes crawler started" };
}

export async function stopVotes() {
  crawlers.votes = false;
  await axios.get(`${VOTES_URL}/votes/stop`);
  return { message: "Votes crawler stopped" };
}

export async function startDeputies() {
  crawlers.deputies = true;
  await axios.get(`${DEPUTIES_URL}/deputies/start`);
  return { message: "Deputies crawler started" };
}

export async function stopDeputies() {
  crawlers.deputies = false;
  await axios.get(`${DEPUTIES_URL}/deputies/stop`);
  return { message: "Deputies crawler stopped" };
}

// Status com contagem real
export async function getPropositionsCount() {
  try {
    const res = await axios.get(`${PROPOSITIONS_URL}/propositions/count`);
    return { running: crawlers.propositions, processedCount: res.data.processedCount };
  } catch {
    return { running: crawlers.propositions, processedCount: 0 };
  }
}

export async function getVotesCount() {
  try {
    const res = await axios.get(`${VOTES_URL}/votes/count`);
    return { running: crawlers.votes, processedCount: res.data.processedCount };
  } catch {
    return { running: crawlers.votes, processedCount: 0 };
  }
}

export async function getDeputiesCount() {
  try {
    const res = await axios.get(`${DEPUTIES_URL}/deputies/count`);
    return { running: crawlers.deputies, processedCount: res.data.processedCount };
  } catch {
    return { running: crawlers.deputies, processedCount: 0 };
  }
}
