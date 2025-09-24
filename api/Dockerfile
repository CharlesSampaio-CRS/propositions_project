FROM node:22-alpine

WORKDIR /app

# Copia package.json e package-lock.json primeiro para aproveitar cache do Docker
COPY package*.json ./

# Instala dependências
RUN npm install 

# Copia todo o restante do projeto
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
