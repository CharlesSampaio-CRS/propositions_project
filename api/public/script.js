// URLs do central API
const apiUrls = {
  propositions: "http://localhost:3005/propositions",
  votes: "http://localhost:3005/votes",
  deputies: "http://localhost:3005/deputies",
};

async function startCrawler(type) {
  try {
    const res = await fetch(`${apiUrls[type]}/start`);
    const data = await res.json();
    console.log(`Start ${type} response:`, data);
    pollStatus(type);
  } catch (err) {
    console.error(`Erro ao iniciar ${type}:`, err);
  }
}


async function stopCrawler(type) {
  try {
    await fetch(`${apiUrls[type]}/stop`);
  } catch (err) {
    console.error(`Erro ao parar ${type}:`, err);
  }
}

function updateStatus(type, running) {
  const indicator = document.getElementById(`${type}-indicator`);
  const text = document.getElementById(`${type}-status`);
  if (running) {
    indicator.style.backgroundColor = "#28a745";
    text.textContent = "Rodando";
    text.style.color = "#28a745";
  } else {
    indicator.style.backgroundColor = "#dc3545";
    text.textContent = "Parado";
    text.style.color = "#dc3545";
  }
}

function pollStatus(type) {
  const countEl = document.getElementById(`${type}-count`);
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`${apiUrls[type]}/status`);
      const data = await res.json();

      updateStatus(type, data.running);
      countEl.textContent = data.processedCount ?? 0;

      if (!data.running) clearInterval(interval);
    } catch (err) {
      console.error(`Erro ao buscar status de ${type}:`, err);
      clearInterval(interval);
    }
  }, 2000);
}

document.addEventListener("DOMContentLoaded", () => {
  ["propositions", "votes", "deputies"].forEach(pollStatus);
});
