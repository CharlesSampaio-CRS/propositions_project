# Base Node 20
FROM node:20

# Diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install --omit=dev

# Copiar todo o código da aplicação
COPY . .

# Expor porta
EXPOSE 3005

# Comando para iniciar
CMD ["node", "index.js"]
